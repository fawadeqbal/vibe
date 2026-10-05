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

  Future<void>? _cameraOpening;

  /// Opens the camera once. The lobby, `start()` and the peer setup all ask
  /// for it, often at the same moment (a match can be found before the first
  /// getUserMedia returns): they share the one in-flight request, so the
  /// camera is never opened twice (on Android the second open evicts the
  /// first, leaving a dead track on the call or in the preview).
  Future<void> ensureCamera() {
    if (!_cameraEnabled || _localStream != null) return Future.value();
    return _cameraOpening ??= _openCamera().whenComplete(() => _cameraOpening = null);
  }

  Future<void> _openCamera() async {
    try {
      if (!_rendererReady) {
        await localRenderer.initialize();
        _rendererReady = true;
      }
      final stream = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': {'facingMode': 'user', 'width': 720, 'height': 1280},
      });
      _localStream = stream;
      localRenderer.srcObject = stream;
      _applyTracks();
      notifyListeners();
    } catch (e) {
      _lastError = 'Camera unavailable: $e';
      notifyListeners();
    }
  }

  Future<void> releaseCamera() async {
    final s = _localStream;
    _localStream = null;
    if (_rendererReady) localRenderer.srcObject = null;
    if (s != null) {
      for (final t in s.getTracks()) {
        await t.stop();
      }
      await s.dispose();
    }
    notifyListeners();
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
      t.enabled = _camOn;
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
    _ticker?.cancel();
    releaseCamera();
    if (_rendererReady) localRenderer.dispose();
    if (_remoteRendererReady) remoteRenderer.dispose();
    super.dispose();
  }
}
