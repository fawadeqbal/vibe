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

  setUp(() {
    getUserMediaCalls = 0;
    SharedPreferences.setMockInitialValues({});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
      switch (call.method) {
        case 'createVideoRenderer':
          return {'textureId': 1};
        case 'getUserMedia':
          getUserMediaCalls++;
          await Future<void>.delayed(const Duration(milliseconds: 50)); // camera takes a moment
          return {'streamId': 's$getUserMediaCalls', 'audioTracks': [], 'videoTracks': []};
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
}
