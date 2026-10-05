part of 'match_provider.dart';

/// Server mode: the Vibe matching socket pairs you with a real person;
/// chat, likes, gifts and friend requests go through the server; video
/// flows peer-to-peer over WebRTC, signalled through the same socket.
///
/// When the partner has no camera stream (e.g. a dev bot), the match screen
/// falls back to their photo, exactly like the offline mock.
class RemoteMatchProvider extends MatchProvider {
  RemoteMatchProvider(this._api, this._rt, WalletProvider wallet, SocialProvider social, SessionProvider session, {bool cameraEnabled = true})
    : super.base(wallet, social, session, cameraEnabled: cameraEnabled) {
    _subs = [
      _rt.on(Ev.matchSearching).listen((_) => _setState(MatchState.searching)),
      _rt.on(Ev.matchFound).listen(_onFound),
      _rt.on(Ev.matchChat).listen(_onChat),
      _rt.on(Ev.matchLiked).listen(_onLiked),
      _rt.on(Ev.matchGift).listen(_onGift),
      _rt.on(Ev.matchFriendRequest).listen((_) {
        _partnerAskedToBeFriends = true;
        notifyListeners();
      }),
      _rt.on(Ev.matchEnded).listen(_onEnded),
      _rt.on(Ev.matchError).listen((e) => _fail(ApiException(e['code'] as String? ?? 'INTERNAL', e['message'] as String? ?? 'Could not start the match'))),
      _rt.on(Ev.rtcSignal).listen(_onSignal),
      _rt.on(Ev.accountBanned).listen((_) => _fail(ApiException('ACCOUNT_BANNED', 'Your account is paused after reports. Try again later.'))),
    ];
  }

  final ApiClient _api;
  final RealtimeClient _rt;
  late final List<StreamSubscription> _subs;

  String? _matchId;
  String? _lastMatchId;
  RTCPeerConnection? _pc;
  Future<void>? _peerStarting;
  MediaStream? _remoteStream;
  final List<RTCIceCandidate> _pendingIce = [];
  bool _remoteDescriptionSet = false;
  List<Map<String, dynamic>>? _iceServers;
  DateTime? _iceFetchedAt;
  Duration _iceReuse = const Duration(minutes: 30);

  void _setState(MatchState s) {
    _state = s;
    notifyListeners();
  }

  void _fail(ApiException e) {
    _needsCoins = e.isInsufficientCoins;
    _lastError = e.isInsufficientCoins ? 'Not enough coins for these filters.' : e.message;
    if (_state == MatchState.searching) _state = MatchState.idle;
    notifyListeners();
  }

  // ── history ───────────────────────────────────────────────────────────

  @override
  Future<void> load() async {
    if (!_api.hasSession) return;
    try {
      final page = await _api.get('/me/matches', query: {'limit': '50'}) as Map;
      // The base keeps history oldest-first (it reverses for display).
      _history = (page['items'] as List).map((e) => ApiMap.matchRecord(Map<String, dynamic>.from(e as Map))).whereType<MatchRecord>().toList().reversed.toList();
      notifyListeners();
    } on ApiException catch (_) {}
  }

  // ── the loop ──────────────────────────────────────────────────────────

  Map<String, dynamic> get _joinPayload => {
    'gender': switch (_filters.gender) {
      GenderFilter.women => 'WOMEN',
      GenderFilter.men => 'MEN',
      _ => 'ANYONE',
    },
    'countryCode': _filters.countryCode,
    'safeMode': _filters.safeMode,
    'autoBlur': _autoBlur,
  };

  @override
  Future<bool> start() async {
    if (_state == MatchState.searching || _state == MatchState.connected) return true;
    _needsCoins = false;
    _lastError = null;
    _endReason = null;
    _setState(MatchState.searching);
    unawaited(ensureCamera());
    try {
      await _rt.request('match:join', _joinPayload);
      return true;
    } on ApiException catch (e) {
      _fail(e);
      return false;
    }
  }

  @override
  Future<bool> next({bool payToBypass = false}) async {
    if (_state != MatchState.connected) return start();
    try {
      _needsCoins = false;
      await _rt.request('match:next', {'payToBypass': payToBypass});
      _cooldownUntil = null;
      if (_state != MatchState.connected) _state = MatchState.searching;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      if (e.code == 'SKIP_COOLDOWN') {
        final secs = (e.details['seconds'] as num?)?.toInt() ?? 10;
        _cooldownUntil = DateTime.now().add(Duration(seconds: secs));
        notifyListeners();
        return false;
      }
      _fail(e);
      return false;
    }
  }

  @override
  void stop() {
    if (_state == MatchState.connected) {
      _rt.request('match:end').catchError((_) => null);
    } else if (_state == MatchState.searching) {
      _rt.request('match:leave').catchError((_) => null);
      _setState(MatchState.idle);
    }
  }

  @override
  void like() {
    if (_state != MatchState.connected || _likedPartner) return;
    _likedPartner = true;
    _current = _current?.copyWith(liked: true);
    notifyListeners();
    _rt.request('match:like').catchError((_) => null);
  }

  @override
  void sendMessage(String text) {
    final t = text.trim();
    if (_state != MatchState.connected || t.isEmpty) return;
    _chat.add(ChatMessage(id: 'mm${DateTime.now().microsecondsSinceEpoch}', fromMe: true, text: t, at: DateTime.now()));
    notifyListeners();
    _rt.request('match:chat', {'text': t}).catchError((_) => null);
  }

  @override
  Future<bool> sendGift(Gift g) async {
    if (_state != MatchState.connected) return false;
    try {
      await _rt.request('match:gift', {'giftId': g.id, 'idempotencyKey': ApiClient.newIdempotencyKey()});
    } on ApiException catch (e) {
      if (e.isInsufficientCoins) return false;
      _lastError = e.message;
      notifyListeners();
      return false;
    }
    _chat.add(ChatMessage(id: 'mg${DateTime.now().microsecondsSinceEpoch}', fromMe: true, text: 'Sent a ${g.name}', at: DateTime.now(), gift: g));
    _current = _current?.copyWith(giftsSent: (_current?.giftsSent ?? 0) + 1, coinsSpent: (_current?.coinsSpent ?? 0) + g.coins);
    notifyListeners();
    return true;
  }

  @override
  Future<bool> addFriend() async {
    if (_state != MatchState.connected) return false;
    try {
      await _rt.request('match:friend');
      await _social.load();
      return true;
    } on ApiException catch (e) {
      if (e.isInsufficientCoins) return false;
      _lastError = e.message;
      notifyListeners();
      return true;
    }
  }

  static String _reason(ReportReason r) => switch (r) {
    ReportReason.nudity => 'NUDITY',
    ReportReason.harassment => 'HARASSMENT',
    ReportReason.underage => 'UNDERAGE',
    ReportReason.spam => 'SPAM',
    ReportReason.scam => 'SCAM',
    ReportReason.other => 'OTHER',
  };

  @override
  Future<void> report(ReportReason reason, {String? note, bool block = false}) async {
    if (_state != MatchState.connected) return;
    await _rt.request('match:report', {'reason': _reason(reason), if (note != null) 'note': note, 'block': block});
    if (block) unawaited(_social.load());
  }

  @override
  Future<void> reportLast(ReportReason reason, {String? note, bool block = false}) async {
    final p = _lastPartner;
    if (p == null) return;
    await _api.post('/reports', {'userId': p.id, 'reason': _reason(reason), if (_lastMatchId != null) 'matchId': _lastMatchId, if (note != null) 'note': note, 'block': block});
    _endReason = EndReason.reported;
    notifyListeners();
    if (block) unawaited(_social.load());
  }

  @override
  Future<void> blockPartner() async {
    final p = _partner;
    if (p == null) return;
    await _social.block(p); // the server ends the call and tells us
  }

  @override
  Future<bool> reconnect() async {
    if (_lastPartner == null || _state == MatchState.connected) return false;
    _needsCoins = false;
    unawaited(ensureCamera());
    try {
      await _rt.request('match:reconnect');
      return true;
    } on ApiException catch (e) {
      _needsCoins = e.isInsufficientCoins;
      _lastError = e.isInsufficientCoins ? null : e.message;
      notifyListeners();
      return false;
    }
  }

  // ── server events ─────────────────────────────────────────────────────

  void _onFound(Map<String, dynamic> e) {
    final p = ApiMap.profile(Map<String, dynamic>.from(e['partner'] as Map));
    _matchId = e['matchId'] as String;
    _partner = p;
    _chat.clear();
    _likedPartner = false;
    _partnerLikedMe = false;
    _partnerAskedToBeFriends = false;
    _elapsed = Duration.zero;
    _hasRemoteVideo = false;
    _current = MatchRecord(id: _matchId!, partner: p, startedAt: DateTime.now(), coinsSpent: (e['coinsSpent'] as num?)?.toInt() ?? 0);
    _blurUntil = e['blur'] == true ? DateTime.now().add(const Duration(seconds: 3)) : null;
    _state = MatchState.connected;
    _lastError = null;
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      _elapsed += const Duration(seconds: 1);
      notifyListeners();
    });
    notifyListeners();
    // ICE from the partner can arrive while the peer is still being set up;
    // it waits in _pendingIce, so only clear it when a new match begins.
    _pendingIce.clear();
    final starting = _peerStarting = _startPeer(caller: e['role'] == 'caller');
    unawaited(starting.whenComplete(() {
      if (identical(_peerStarting, starting)) _peerStarting = null;
    }));
  }

  void _onChat(Map<String, dynamic> e) {
    if (e['matchId'] != _matchId) return;
    _chat.add(ChatMessage(id: 'pm${DateTime.now().microsecondsSinceEpoch}', fromMe: false, text: e['text'] as String? ?? '', at: DateTime.now()));
    notifyListeners();
  }

  void _onLiked(Map<String, dynamic> e) {
    if (e['matchId'] != _matchId) return;
    _partnerLikedMe = true;
    _current = _current?.copyWith(likedMe: true);
    notifyListeners();
  }

  void _onGift(Map<String, dynamic> e) {
    if (e['matchId'] != _matchId || e['fromMe'] == true) return;
    final g = ApiMap.gift((e['gift'] as Map?)?['id']);
    if (g == null) return;
    _chat.add(ChatMessage(id: 'pg${DateTime.now().microsecondsSinceEpoch}', fromMe: false, text: 'Sent you a ${g.name}', at: DateTime.now(), gift: g));
    _current = _current?.copyWith(giftsReceived: (_current?.giftsReceived ?? 0) + 1);
    notifyListeners();
  }

  void _onEnded(Map<String, dynamic> e) {
    if (e['matchId'] != _matchId) return;
    _ticker?.cancel();
    _ticker = null;
    _peerStarting = null;
    _pendingIce.clear();
    unawaited(_closePeer());
    final byMe = e['byMe'] == true;
    final reason = e['reason'] as String?;
    final rec = (_current ?? MatchRecord(id: _matchId!, partner: _partner!, startedAt: DateTime.now())).copyWith(
      endedAt: DateTime.now(),
      liked: e['liked'] as bool?,
      likedMe: e['likedMe'] as bool?,
      giftsReceived: (e['giftsReceived'] as num?)?.toInt(),
    );
    _history.add(rec);
    _current = null;
    _lastPartner = _partner;
    _lastMatchId = _matchId;
    _matchId = null;
    _endReason = switch (reason) {
      'skipped' => EndReason.skipped,
      'stopped' || 'disconnected' => EndReason.stopped,
      'reported' || 'blocked' || 'banned' => EndReason.reported,
      _ => EndReason.partnerLeft,
    };
    // Skipping puts you straight back in the queue; anything else ends here.
    final keepGoing = byMe && reason == 'skipped';
    _state = keepGoing ? MatchState.searching : MatchState.ended;
    if (!keepGoing) unawaited(releaseCamera());
    notifyListeners();
    _session.refreshMe();
  }

  // ── WebRTC ────────────────────────────────────────────────────────────

  /// STUN + TURN servers with a short-lived TURN login. Reused for up to
  /// 30 minutes, and never past half its lifetime, so a call that starts
  /// with a cached login can't outlive it (coturn re-checks it mid-call).
  Future<List<Map<String, dynamic>>> _ice() async {
    final fresh = _iceFetchedAt != null && DateTime.now().difference(_iceFetchedAt!) < _iceReuse;
    if (_iceServers != null && fresh) return _iceServers!;
    try {
      final r = await _api.get('/rtc/ice-servers') as Map;
      _iceServers = (r['iceServers'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      _iceFetchedAt = DateTime.now();
      final ttl = (r['ttlSeconds'] as num?)?.toInt();
      _iceReuse = ttl == null ? const Duration(minutes: 30) : Duration(seconds: math.min(30 * 60, ttl ~/ 2));
    } on ApiException catch (_) {
      _iceServers ??= [
        {
          'urls': ['stun:stun.l.google.com:19302'],
        },
      ];
    }
    return _iceServers!;
  }

  Future<void> _startPeer({required bool caller}) async {
    final matchId = _matchId;
    await _closePeer();
    if (!_cameraEnabled) return;
    await ensureCamera();
    final local = _localStream;
    if (local == null) return;
    if (!_remoteRendererReady) {
      await remoteRenderer.initialize();
      _remoteRendererReady = true;
    }
    final iceServers = await _ice();
    // The match may have ended (or a new one begun) during the awaits above.
    if (_matchId != matchId || matchId == null) return;
    final pc = await createPeerConnection({
      'iceServers': iceServers,
      'sdpSemantics': 'unified-plan',
      if (ApiConfig.forceRelay) 'iceTransportPolicy': 'relay',
    });
    if (_matchId != matchId || _pc != null) {
      await pc.close();
      return;
    }
    _pc = pc;
    for (final t in local.getTracks()) {
      await pc.addTrack(t, local);
    }
    pc.onIceCandidate = (c) {
      if (c.candidate == null) return;
      _rt.request('rtc:signal', {'type': 'ice', 'data': c.toMap()}).catchError((_) => null);
    };
    pc.onTrack = (event) {
      if (_pc != pc || event.streams.isEmpty) return;
      _remoteStream = event.streams.first;
      remoteRenderer.srcObject = _remoteStream;
      _hasRemoteVideo = true;
      notifyListeners();
    };
    pc.onConnectionState = (s) {
      if (_pc != pc) return;
      debugPrint('rtc connection: $s');
      // "disconnected" is usually a short network blip that recovers on its
      // own: keep the video up and only fall back to the photo on "failed".
      final up = switch (s) {
        RTCPeerConnectionState.RTCPeerConnectionStateConnected => _remoteStream != null,
        RTCPeerConnectionState.RTCPeerConnectionStateFailed || RTCPeerConnectionState.RTCPeerConnectionStateClosed => false,
        _ => _hasRemoteVideo,
      };
      if (up != _hasRemoteVideo) {
        _hasRemoteVideo = up;
        notifyListeners();
      }
    };
    if (caller) {
      final offer = await pc.createOffer({'offerToReceiveAudio': true, 'offerToReceiveVideo': true});
      await pc.setLocalDescription(offer);
      await _rt.request('rtc:signal', {'type': 'offer', 'data': offer.toMap()}).catchError((_) => null);
    }
  }

  Future<void> _onSignal(Map<String, dynamic> e) async {
    if (e['matchId'] != _matchId) return;
    final data = e['data'] is Map ? Map<String, dynamic>.from(e['data'] as Map) : const <String, dynamic>{};
    try {
      switch (e['type']) {
        case 'offer':
          // Usually the peer from match:found is still being set up: wait for
          // it instead of building a second one (which leaked the first and
          // dropped the ICE candidates queued meanwhile).
          if (_pc == null) await (_peerStarting ?? _startPeer(caller: false));
          final pc = _pc;
          if (pc == null) return;
          await pc.setRemoteDescription(RTCSessionDescription(data['sdp'] as String?, data['type'] as String?));
          await _flushIce();
          final answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await _rt.request('rtc:signal', {'type': 'answer', 'data': answer.toMap()});
        case 'answer':
          await _pc?.setRemoteDescription(RTCSessionDescription(data['sdp'] as String?, data['type'] as String?));
          await _flushIce();
        case 'ice':
          final c = RTCIceCandidate(data['candidate'] as String?, data['sdpMid'] as String?, (data['sdpMLineIndex'] as num?)?.toInt());
          if (_remoteDescriptionSet && _pc != null) {
            await _pc!.addCandidate(c);
          } else {
            _pendingIce.add(c);
          }
        case 'hangup':
          await _closePeer();
      }
    } catch (err) {
      debugPrint('rtc signal ${e['type']} failed: $err');
    }
  }

  Future<void> _flushIce() async {
    _remoteDescriptionSet = true;
    for (final c in _pendingIce) {
      await _pc?.addCandidate(c);
    }
    _pendingIce.clear();
  }

  Future<void> _closePeer() async {
    final pc = _pc;
    _pc = null;
    _remoteDescriptionSet = false;
    _remoteStream = null;
    _hasRemoteVideo = false;
    if (_remoteRendererReady) remoteRenderer.srcObject = null;
    await pc?.close();
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _closePeer();
    super.dispose();
  }
}
