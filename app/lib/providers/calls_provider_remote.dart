part of 'calls_provider.dart';

/// Server mode: every call screen is drawn from the server's snapshot.
class RemoteCallsProvider extends CallsProvider {
  RemoteCallsProvider(this._api, this._rt, SocialProvider social, MatchProvider match, this._session) : super.base(social, match) {
    _subs = [
      _rt.on(Ev.callConsent).listen((e) {
        final id = e['friendId'];
        if (id is! String) return;
        _social.setCalls(id, ApiMap.callsView(e));
        unawaited(loadState(id));
      }),
      _rt.on(Ev.callState).listen(_take),
      // Back online: ask where the call is (a missed event can't leave a screen stuck).
      _rt.connection.listen((on) {
        if (on) unawaited(reconcile());
      }),
    ];
    // While a call rings or connects, check every 10 s.
    _poll = Timer.periodic(const Duration(seconds: 10), (_) {
      if (_call?.active ?? false) unawaited(reconcile());
    });
    _match.addListener(_mediaUp);
  }

  final ApiClient _api;
  final RealtimeClient _rt;
  final SessionProvider _session;
  late final List<StreamSubscription<dynamic>> _subs;
  Timer? _poll;

  /// This device, for "Answered on your other device".
  static final String deviceId = 'app-${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}';

  CallSnap? _call;
  String? _acceptTried;
  bool _cancelWanted = false;
  String? _dismissed;
  final Set<String> _acked = {};
  final Set<String> _upSent = {};

  /// The newest snapshot of your call (any state).
  CallSnap? get call => _call;

  Map<String, dynamic> _map(Object? r) => Map<String, dynamic>.from(r as Map);

  /// A snapshot from the server (an event or a reply): kept if it's newer, then every screen redraws.
  void _take(Object? raw) {
    if (raw is! Map) return;
    final c = CallSnap.parse(_map(raw), ApiMap.profile);
    if (c == null || !CallSnap.isNewer(_call, c)) return;
    _call = c;
    final v = callViewOf(c, _session.me?.id ?? '', deviceId, acceptTried: _acceptTried == c.callId);
    final wasRinging = _incoming?.callId == c.callId;
    setIncoming(v.incoming, full: wasRinging && incomingFull);
    _outgoing = v.outgoing != null && _dismissed != '${c.callId}:out' ? v.outgoing : null;
    _notice = v.notice != null && _dismissed != '${c.callId}:${v.notice!.kind.name}' ? v.notice : null;
    // Their screen is showing it: the caller's "Calling…" becomes "Ringing…".
    if (v.incoming != null && !c.reached && _acked.add(c.callId)) {
      unawaited(_api.post('/calls/${c.callId}/ringing').then(_take, onError: (_) {}));
    }
    notifyListeners();
  }

  /// Your media is flowing in this friend call: tell the server (both up → live).
  void _mediaUp() {
    final c = _call;
    if (c == null || c.state != CallStatus.connecting || !_match.friendCall || !_match.hasRemoteVideo) return;
    if (c.matchId != null && _match.current?.id != null && _match.current!.id != c.matchId) return;
    if (!_upSent.add(c.callId)) return;
    unawaited(_api.post('/calls/${c.callId}/up').then(_take, onError: (_) => _upSent.remove(c.callId)));
  }

  @override
  Future<void> reconcile() async {
    if (!_api.hasSession) return;
    try {
      final cur = _map(await _api.get('/calls/current'))['call'];
      if (cur is Map) return _take(cur);
      // Nothing going on: if we still think a call is, ask about that one.
      final c = _call;
      if (c != null && c.state != CallStatus.ended) _take(await _api.get('/calls/${c.callId}'));
    } on ApiException catch (_) {}
  }

  @override
  void dismissOutgoing() {
    final c = _call;
    if (c != null) _dismissed = '${c.callId}:out';
    super.dismissOutgoing();
  }

  @override
  void dismissNotice() {
    final n = _notice;
    if (n != null) _dismissed = '${n.callId}:${n.kind.name}';
    super.dismissNotice();
  }

  @override
  Future<CallState?> loadState(String friendId) async {
    try {
      return apply(friendId, ApiMap.callState(_map(await _api.get('/friends/$friendId/calls'))));
    } on ApiException catch (_) {
      return null;
    }
  }

  @override
  Future<CallState> allow(String friendId, {bool video = true}) async => apply(friendId, ApiMap.callState(_map(await _api.put('/friends/$friendId/calls', {'allow': true, 'video': video}))));

  @override
  Future<CallState> turnOff(String friendId) async => apply(friendId, ApiMap.callState(_map(await _api.put('/friends/$friendId/calls', {'allow': false}))));

  @override
  Future<void> ring(Profile friend, [CallMedia media = CallMedia.video]) async {
    // "Calling…" at once; the server's snapshot takes over when it answers.
    _cancelWanted = false;
    _dismissed = null;
    _outgoing = OutgoingCall(to: friend, media: media);
    notifyListeners();
    try {
      _take(await _api.post('/friends/${friend.id}/call', {'media': media.name}));
      final c = _call;
      if (_cancelWanted && c != null && c.state == CallStatus.ringing) _take(await _api.post('/calls/${c.callId}/cancel'));
    } on ApiException catch (e) {
      final status = e.code == 'CALL_PAUSED' ? OutgoingStatus.paused : OutgoingStatus.error;
      _outgoing = _cancelWanted ? null : OutgoingCall(to: friend, status: status, message: e.message, media: media);
      if (e.code == 'CALLS_NOT_ALLOWED') unawaited(loadState(friend.id));
      notifyListeners();
    }
  }

  @override
  Future<void> accept([CallMedia? media]) async {
    final c = _incoming;
    if (c == null) return;
    _acceptTried = c.callId;
    setIncoming(null);
    notifyListeners();
    try {
      _take(await _api.post('/calls/${c.callId}/accept', {'deviceId': deviceId, if (media == CallMedia.voice) 'media': 'voice'}));
    } on ApiException catch (_) {
      // Too late (they hung up, or another device answered): ask where it is.
      try {
        _take(await _api.get('/calls/${c.callId}'));
      } on ApiException catch (_) {}
    }
  }

  @override
  Future<void> decline([String? reply]) async {
    final c = _incoming;
    if (c == null) return;
    setIncoming(null);
    notifyListeners();
    try {
      _take(await _api.post('/calls/${c.callId}/decline', reply == null ? <String, dynamic>{} : {'reply': reply}));
    } on ApiException catch (_) {}
  }

  @override
  Future<void> cancel() async {
    final c = _outgoing;
    _outgoing = null;
    notifyListeners();
    if (c?.callId == null) {
      _cancelWanted = true; // still being placed: cancel it once it is
      return;
    }
    try {
      _take(await _api.post('/calls/${c!.callId}/cancel'));
    } on ApiException catch (_) {}
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _poll?.cancel();
    _match.removeListener(_mediaUp);
    super.dispose();
  }
}
