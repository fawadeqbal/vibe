import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../core/api/api_client.dart';
import '../core/api/api_config.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../core/mock/mock_backend.dart';
import '../models/models.dart';
import 'session_provider.dart';
import 'social_provider.dart';
import 'wallet_provider.dart';

part 'match_provider_local.dart';
part 'match_provider_remote.dart';

enum MatchState { idle, searching, connected, ended }

/// Why the last match ended — drives the copy on the ended card.
enum EndReason { skipped, partnerLeft, stopped, reported }

/// The match loop: idle → searching → connected → (next) → searching …
///
/// Owns the local camera (WebRTC local stream, no peer yet — the mock
/// partner is a scripted profile), the filters and what they cost, the
/// skip cooldown, likes, gifts and the in-match chat. Everything the
/// partner "does" comes from `MockBackend.scriptFor`, replayed on timers,
/// so swapping in real socket events later touches only `_apply`.
///
/// [LocalMatchProvider] replays scripted partners from [MockBackend];
/// [RemoteMatchProvider] uses the Vibe matching socket and a real WebRTC
/// peer connection. The camera, state and stats live here, shared by both.
abstract class MatchProvider extends ChangeNotifier {
  MatchProvider.base(this._wallet, this._social, this._session, {bool cameraEnabled = true}) : _cameraEnabled = cameraEnabled;

  factory MatchProvider(MockBackend backend, WalletProvider wallet, SocialProvider social, SessionProvider session, {bool cameraEnabled}) = LocalMatchProvider;

  final WalletProvider _wallet;
  final SocialProvider _social;
  final SessionProvider _session;
  final bool _cameraEnabled;

  MatchState _state = MatchState.idle;
  MatchFilters _filters = const MatchFilters();
  Profile? _partner;
  Profile? _lastPartner;
  MatchRecord? _current;
  List<MatchRecord> _history = [];
  EndReason? _endReason;
  final List<ChatMessage> _chat = [];
  bool _likedPartner = false;
  bool _partnerLikedMe = false;
  bool _partnerAskedToBeFriends = false;
  Timer? _ticker;
  Duration _elapsed = Duration.zero;
  DateTime? _cooldownUntil;
  DateTime? _blurUntil;
  bool _autoBlur = true;
  String? _lastError;

  // Local media
  final RTCVideoRenderer localRenderer = RTCVideoRenderer();
  MediaStream? _localStream;
  bool _rendererReady = false;
  bool _micOn = true;
  bool _camOn = true;
  bool _frontCamera = true;

  bool _needsCoins = false;

  // Remote media (server mode)
  final RTCVideoRenderer remoteRenderer = RTCVideoRenderer();
  bool _remoteRendererReady = false;
  bool _hasRemoteVideo = false;

  // ── read side ─────────────────────────────────────────────────────────

  MatchState get state => _state;
  MatchFilters get filters => _filters;
  Profile? get partner => _partner;
  Profile? get lastPartner => _lastPartner;
  MatchRecord? get current => _current;
  List<MatchRecord> get history => List.unmodifiable(_history.reversed);
  EndReason? get endReason => _endReason;
  List<ChatMessage> get chat => List.unmodifiable(_chat);
  bool get likedPartner => _likedPartner;
  bool get partnerLikedMe => _partnerLikedMe;
  bool get mutualLike => _likedPartner && _partnerLikedMe;
  bool get partnerAskedToBeFriends => _partnerAskedToBeFriends;
  Duration get elapsed => _elapsed;
  bool get micOn => _micOn;
  bool get camOn => _camOn;
  bool get frontCamera => _frontCamera;

  /// The open camera stream (lobby / call), for screens that need a frame of it
  /// (the selfie check) without opening the camera a second time.
  MediaStream? get localStream => _localStream;
  bool get hasLocalVideo => _localStream != null && _rendererReady;
  bool get autoBlur => _autoBlur;
  bool get blurred => _blurUntil != null && _blurUntil!.isAfter(DateTime.now());
  String? get lastError => _lastError;

  /// The last failure was "not enough coins" (screens offer the store).
  bool get needsCoins => _needsCoins;

  /// Server mode: the partner's camera is coming through WebRTC.
  bool get hasRemoteVideo => _hasRemoteVideo;
  bool get isSearching => _state == MatchState.searching;
  bool get isConnected => _state == MatchState.connected;

  /// Seconds left of the skip cooldown, 0 when none.
  int get cooldownSeconds {
    final u = _cooldownUntil;
    if (u == null) return 0;
    final left = u.difference(DateTime.now()).inSeconds;
    return left > 0 ? left + 1 : 0;
  }

  bool get inCooldown => cooldownSeconds > 0;
  int get filterCost => _wallet.filterCost(_filters);

  // Session stats for the profile page
  int get matchesToday => _history.where((r) => _sameDay(r.startedAt, DateTime.now())).length;
  Duration get averageLength {
    final done = _history.where((r) => r.endedAt != null).toList();
    if (done.isEmpty) return Duration.zero;
    final total = done.fold<int>(0, (a, r) => a + r.length.inSeconds);
    return Duration(seconds: total ~/ done.length);
  }

  double get skipRate {
    if (_history.isEmpty) return 0;
    final quick = _history.where((r) => r.endedAt != null && r.length.inSeconds < 10).length;
    return quick / _history.length;
  }

  Future<void> load();

  // ── camera ────────────────────────────────────────────────────────────
  //
  // The camera is the biggest battery drain in the app, so it is only open
  // while someone is actually using it:
  //  • searching or in a call → on (the match needs it);
  //  • the lobby → off until you tap "Turn on preview", and only while the
  //    Match tab is on screen, the app is in the foreground and you have
  //    touched the screen in the last [previewIdleTimeout];
  //  • another tab, a page on top (store, chat, profile…), the app in the
  //    background, the screen locked → off (hardware released, no green dot);
  //  • a search/call that ends → off again (the preview is not reopened).
  // In the background a search is left at once and a call ends after
  // [backgroundGrace] (your video pauses meanwhile).

  /// The lobby preview turns itself off after this long without a touch.
  static const previewIdleTimeout = Duration(seconds: 60);

  /// A call survives this long with the app in the background (a quick look
  /// at a notification), then ends.
  static const backgroundGrace = Duration(seconds: 30);

  Future<void>? _cameraOpening;
  int _cameraGen = 0;
  int _openingGen = -1;
  bool _previewOn = false;
  bool _lobbyVisible = false;
  bool _inBackground = false;
  int _cameraPins = 0;
  Timer? _idleTimer;
  Timer? _backgroundTimer;
  MatchState _syncedState = MatchState.idle;

  /// You asked for the lobby preview (it may still be paused, e.g. on another tab).
  bool get previewOn => _previewOn;

  /// The camera hardware is open, or opening.
  bool get cameraActive => _localStream != null || _cameraOpening != null;

  /// The app is in the background (the call's video is paused).
  bool get inBackground => _inBackground;

  bool get _live => _state == MatchState.searching || _state == MatchState.connected;

  /// Whether the camera should be open right now (see the rules above).
  bool get cameraWanted => _cameraEnabled && (_live || _cameraPins > 0 || (_previewOn && _lobbyVisible && !_inBackground));

  /// "Turn on preview" in the lobby.
  void startPreview() {
    _previewOn = true;
    _armIdleTimer();
    _syncCamera();
    notifyListeners();
  }

  /// Turns the lobby preview off (the camera closes unless a match needs it).
  void stopPreview() {
    if (!_previewOn) return;
    _previewOn = false;
    _idleTimer?.cancel();
    _syncCamera();
    notifyListeners();
  }

  /// Any touch on the Match tab: keeps the preview alive.
  void touchPreview() {
    if (_previewOn && _lobbyVisible && !_live) _armIdleTimer();
  }

  /// The Match tab is (or isn't) what the user is looking at: right tab,
  /// no page pushed on top, app in the foreground.
  void setLobbyVisible(bool visible) {
    if (visible == _lobbyVisible) return;
    _lobbyVisible = visible;
    if (visible) {
      _armIdleTimer();
    } else {
      _idleTimer?.cancel();
    }
    _syncCamera();
    notifyListeners();
  }

  /// The app went to (or came back from) the background / lock screen.
  void setAppInBackground(bool background) {
    if (background == _inBackground) return;
    _inBackground = background;
    _backgroundTimer?.cancel();
    _backgroundTimer = null;
    if (background) {
      // Coming back should not silently switch the camera on again.
      _previewOn = false;
      _idleTimer?.cancel();
      if (_state == MatchState.searching) {
        stop(); // nobody is watching: don't get matched
      } else if (_state == MatchState.connected) {
        _backgroundTimer = Timer(backgroundGrace, () {
          if (_inBackground && _state == MatchState.connected) stop();
        });
      }
    }
    _applyTracks();
    _syncCamera();
    notifyListeners();
  }

  /// Keeps the camera open while a screen borrows it (the selfie check reuses
  /// the lobby's stream). Call the returned function when done.
  VoidCallback pinCamera() {
    _cameraPins++;
    var done = false;
    return () {
      if (done) return;
      done = true;
      _cameraPins--;
      _syncCamera();
    };
  }

  void _armIdleTimer() {
    _idleTimer?.cancel();
    if (!_previewOn) return;
    _idleTimer = Timer(previewIdleTimeout, () {
      if (_live || _cameraPins > 0) return;
      _previewOn = false;
      _syncCamera();
      notifyListeners();
    });
  }

  /// Opens or closes the camera to match [cameraWanted].
  void _syncCamera() {
    if (cameraWanted) {
      unawaited(ensureCamera());
    } else if (cameraActive) {
      unawaited(releaseCamera());
    }
  }

  /// Every state change re-checks the camera. Leaving a search or a call
  /// turns the preview off, so the camera closes when the match is over.
  bool _disposed = false;

  @override
  void notifyListeners() {
    if (_disposed) return;
    final was = _syncedState;
    if (was != _state) {
      _syncedState = _state;
      final wasLive = was == MatchState.searching || was == MatchState.connected;
      if (wasLive && !_live) {
        _previewOn = false;
        _backgroundTimer?.cancel();
        _backgroundTimer = null;
      }
      _syncCamera();
    }
    super.notifyListeners();
  }

  /// Opens the camera once. The lobby, `start()` and the peer setup all ask
  /// for it, often at the same moment (a match can be found before the first
  /// getUserMedia returns): they share the one in-flight request, so the
  /// camera is never opened twice (on Android the second open evicts the
  /// first, leaving a dead track on the call or in the preview). An open that
  /// was cancelled by [releaseCamera] finishes (and is closed) before the
  /// next one starts.
  Future<void> ensureCamera() {
    if (!_cameraEnabled || _localStream != null) return Future.value();
    final inFlight = _cameraOpening;
    if (inFlight != null && _openingGen == _cameraGen) return inFlight;
    final gen = _openingGen = _cameraGen;
    late final Future<void> opening;
    opening = (inFlight ?? Future<void>.value()).then((_) => _openCamera(gen)).whenComplete(() {
      if (identical(_cameraOpening, opening)) _cameraOpening = null;
    });
    return _cameraOpening = opening;
  }

  Future<void> _openCamera(int gen) async {
    if (gen != _cameraGen || _localStream != null) return;
    try {
      if (!_rendererReady) {
        await localRenderer.initialize();
        _rendererReady = true;
      }
      final stream = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': {
          'facingMode': _frontCamera ? 'user' : 'environment',
          'width': 720,
          'height': 1280,
          'frameRate': 24,
        },
      });
      if (gen != _cameraGen) {
        // Released while it was opening (tab switched, app backgrounded…).
        await _stopStream(stream);
        return;
      }
      _localStream = stream;
      localRenderer.srcObject = stream;
      _applyTracks();
      notifyListeners();
    } catch (e) {
      _lastError = 'Camera unavailable: $e';
      notifyListeners();
    }
  }

  /// Closes the camera hardware (and cancels an open in flight).
  Future<void> releaseCamera() async {
    _cameraGen++;
    final s = _localStream;
    _localStream = null;
    if (_rendererReady) localRenderer.srcObject = null;
    if (s != null) await _stopStream(s);
    notifyListeners();
  }

  static Future<void> _stopStream(MediaStream s) async {
    for (final t in s.getTracks()) {
      try {
        await t.stop();
      } catch (_) {}
    }
    try {
      await s.dispose();
    } catch (_) {}
  }

  void toggleMic() {
    _micOn = !_micOn;
    _applyTracks();
    notifyListeners();
  }

  void toggleCam() {
    _camOn = !_camOn;
    _applyTracks();
    notifyListeners();
  }

  Future<void> switchCamera() async {
    final s = _localStream;
    if (s == null) return;
    final tracks = s.getVideoTracks();
    if (tracks.isEmpty) return;
    try {
      await Helper.switchCamera(tracks.first);
      _frontCamera = !_frontCamera;
      notifyListeners();
    } catch (_) {}
  }

  void setAutoBlur(bool v) {
    _autoBlur = v;
    notifyListeners();
  }

  void _applyTracks() {
    final s = _localStream;
    if (s == null) return;
    for (final t in s.getAudioTracks()) {
      t.enabled = _micOn;
    }
    for (final t in s.getVideoTracks()) {
      // Paused in the background: the partner sees "camera off", not a frozen frame.
      t.enabled = _camOn && !_inBackground;
    }
  }

  // ── filters ───────────────────────────────────────────────────────────

  void setFilters(MatchFilters f) {
    _filters = f;
    notifyListeners();
  }

  // ── the loop (implemented by local / remote) ──────────────────────────

  /// Starts searching. False — and idle — when the filters can't be paid for.
  Future<bool> start();

  /// Skip to the next person (enforces the skip cooldown).
  Future<bool> next({bool payToBypass = false});

  /// Pays to skip the cooldown; returns false when unaffordable.
  Future<bool> bypassCooldown() => next(payToBypass: true);

  void stop();
  void like();
  void sendMessage(String text);
  Future<bool> sendGift(Gift g);

  /// Friend request during the match. False when it could not be paid for.
  Future<bool> addFriend();
  Future<void> report(ReportReason reason, {String? note, bool block = false});

  /// Report the person from the call that just ended (the recap card's link).
  Future<void> reportLast(ReportReason reason, {String? note, bool block = false});
  Future<void> blockPartner();

  /// Call the last person again (paid). False when unaffordable or unavailable.
  Future<bool> reconnect();

  /// Back to idle from the ended card.
  void dismissEnded() {
    if (_state == MatchState.ended) {
      _state = MatchState.idle;
      _partner = null;
      notifyListeners();
    }
  }

  FriendState get friendState => _partner == null ? FriendState.none : _social.stateOf(_partner!.id);

  void clearError() {
    _lastError = null;
    _needsCoins = false;
    notifyListeners();
  }

  static bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

  @override
  void dispose() {
    _disposed = true;
    _ticker?.cancel();
    _idleTimer?.cancel();
    _backgroundTimer?.cancel();
    releaseCamera();
    if (_rendererReady) localRenderer.dispose();
    if (_remoteRendererReady) remoteRenderer.dispose();
    super.dispose();
  }
}
