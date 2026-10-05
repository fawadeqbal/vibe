import 'dart:math';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/providers/match_provider.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';

/// The lobby, start() and the peer setup all call ensureCamera(), often
/// before the first getUserMedia has returned. The camera must be opened
/// once: a second open on Android evicts the first and leaves a dead track.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('FlutterWebRTC.Method');
  var getUserMediaCalls = 0;
  var streamDisposes = 0;

  setUp(() {
    getUserMediaCalls = 0;
    streamDisposes = 0;
    SharedPreferences.setMockInitialValues({});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
      switch (call.method) {
        case 'createVideoRenderer':
          return {'textureId': 1};
        case 'getUserMedia':
          getUserMediaCalls++;
          await Future<void>.delayed(const Duration(milliseconds: 50)); // camera takes a moment
          return {'streamId': 's$getUserMediaCalls', 'audioTracks': [], 'videoTracks': []};
        case 'streamDispose':
          streamDisposes++;
      }
      return null;
    });
  });

  test('concurrent ensureCamera() opens the camera once', () async {
    final backend = MockBackend(fast: true, random: Random(1));
    final wallet = WalletProvider(backend);
    final social = SocialProvider(backend, wallet);
    final match = MatchProvider(backend, wallet, social, SessionProvider(backend));
    await Future.wait([match.ensureCamera(), match.ensureCamera(), match.ensureCamera()]);
    expect(getUserMediaCalls, 1);
    expect(match.hasLocalVideo, isTrue);
    await match.ensureCamera();
    expect(getUserMediaCalls, 1, reason: 'already open');
  });

  // ── battery: the camera is only open while it is actually used ──────────

  MatchProvider newMatch({bool fast = true}) {
    final backend = MockBackend(fast: fast, random: Random(1));
    final wallet = WalletProvider(backend);
    final social = SocialProvider(backend, wallet);
    return MatchProvider(backend, wallet, social, SessionProvider(backend));
  }

  testWidgets('opening the app (lobby on screen) does not open the camera', (tester) async {
    final m = newMatch();
    m.setLobbyVisible(true);
    await tester.pump(const Duration(seconds: 5));
    expect(getUserMediaCalls, 0);
    expect(m.cameraActive, isFalse);
    m.dispose();
  });

  testWidgets('preview opens on tap and closes on another tab / page; comes back on return', (tester) async {
    final m = newMatch();
    m.setLobbyVisible(true);
    m.startPreview();
    await tester.pump(const Duration(milliseconds: 100));
    expect(getUserMediaCalls, 1);
    expect(m.hasLocalVideo, isTrue);

    m.setLobbyVisible(false); // Chats tab, or the store pushed on top
    await tester.pump(const Duration(milliseconds: 100));
    expect(m.localStream, isNull);
    expect(streamDisposes, 1, reason: 'hardware released');

    m.setLobbyVisible(true); // back on Match: the preview you asked for resumes
    await tester.pump(const Duration(milliseconds: 100));
    expect(getUserMediaCalls, 2);
    expect(m.hasLocalVideo, isTrue);
    m.dispose();
    await tester.pump(const Duration(milliseconds: 100));
  });

  testWidgets('leaving while the camera is still opening closes it when it arrives', (tester) async {
    final m = newMatch();
    m.setLobbyVisible(true);
    m.startPreview();
    await tester.pump(const Duration(milliseconds: 10)); // getUserMedia in flight
    m.setLobbyVisible(false);
    await tester.pump(const Duration(milliseconds: 100));
    expect(getUserMediaCalls, 1);
    expect(m.localStream, isNull);
    expect(streamDisposes, 1, reason: 'the late stream was stopped, not kept');
    m.dispose();
  });

  testWidgets('the preview times out when nobody touches the screen', (tester) async {
    final m = newMatch();
    m.setLobbyVisible(true);
    m.startPreview();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(MatchProvider.previewIdleTimeout - const Duration(seconds: 10));
    m.touchPreview(); // a touch resets the clock
    await tester.pump(MatchProvider.previewIdleTimeout - const Duration(seconds: 10));
    expect(m.hasLocalVideo, isTrue);
    await tester.pump(const Duration(seconds: 11));
    expect(m.previewOn, isFalse);
    expect(m.localStream, isNull);
    m.dispose();
  });

  testWidgets('background closes the camera and does not reopen it on return', (tester) async {
    final m = newMatch();
    m.setLobbyVisible(true);
    m.startPreview();
    await tester.pump(const Duration(milliseconds: 100));
    m.setAppInBackground(true);
    await tester.pump(const Duration(milliseconds: 100));
    expect(m.localStream, isNull);
    m.setAppInBackground(false);
    await tester.pump(const Duration(seconds: 1));
    expect(getUserMediaCalls, 1, reason: 'no surprise camera after unlocking the phone');
    expect(m.previewOn, isFalse);
    m.dispose();
  });

  testWidgets('a search keeps the camera on another tab; it closes when the search is stopped', (tester) async {
    final m = newMatch();
    m.setLobbyVisible(true);
    await m.start();
    await tester.pump(const Duration(milliseconds: 20));
    m.setLobbyVisible(false);
    await tester.pump(const Duration(milliseconds: 100));
    expect(m.isSearching || m.isConnected, isTrue);
    expect(m.hasLocalVideo, isTrue, reason: 'the match needs the camera');
    m.stop();
    await tester.pump(const Duration(milliseconds: 100));
    expect(m.localStream, isNull);
    m.dispose();
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('background: a search is left at once', (tester) async {
    final m = newMatch(fast: false); // a real search takes a moment
    m.setLobbyVisible(true);
    final started = m.start(); // don't wait for the mock to find someone
    await tester.pump(const Duration(milliseconds: 20)); // camera opening
    expect(m.isSearching, isTrue);
    m.setAppInBackground(true);
    await tester.pump(const Duration(seconds: 10)); // the mock search finishes (and is ignored)
    expect(await started, isTrue);
    expect(m.isSearching || m.isConnected, isFalse, reason: 'left the queue');
    expect(m.localStream, isNull);
    m.dispose();
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('background: a call ends after the grace period and the camera closes', (tester) async {
    final m = newMatch();
    m.setLobbyVisible(true);
    await m.start();
    for (var i = 0; i < 100 && !m.isConnected; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(m.isConnected, isTrue);
    m.setAppInBackground(true);
    await tester.pump(MatchProvider.backgroundGrace - const Duration(seconds: 1));
    expect(m.isConnected, isTrue, reason: 'a quick look away does not end the call');
    await tester.pump(const Duration(seconds: 2));
    expect(m.isConnected, isFalse);
    await tester.pump(const Duration(milliseconds: 100));
    expect(m.localStream, isNull);
    m.dispose();
    await tester.pump(const Duration(seconds: 5));
  });
}
