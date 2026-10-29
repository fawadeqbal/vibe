part of 'calls_provider.dart';

/// Server mode.
class RemoteCallsProvider extends CallsProvider {
  RemoteCallsProvider(this._api, this._rt, SocialProvider social, MatchProvider match) : super.base(social, match) {
    _subs = [
      _rt.on(Ev.callConsent).listen((e) {
        final id = e['friendId'];
        if (id is! String) return;
        _social.setCalls(id, CallsView(mine: e['mine'] == true, theirs: e['theirs'] == true));
        unawaited(loadState(id));
      }),
      _rt.on(Ev.callIncoming).listen((e) {
        if (e['from'] is! Map) return;
        _incoming = IncomingCall(
          callId: '${e['callId']}',
          from: ApiMap.profile(Map<String, dynamic>.from(e['from'] as Map)),
          expiresAt: ApiMap.date(e['expiresAt']) ?? DateTime.now().add(Duration(seconds: Economy.callRingSeconds)),
        );
        notifyListeners();
      }),
      _rt.on(Ev.callRinging).listen((e) {
        final o = _outgoing;
        if (o != null && o.callId == null) {
          _outgoing = o.copyWith(callId: '${e['callId']}');
          notifyListeners();
        }
      }),
      _rt.on(Ev.callEnded).listen(_onEnded),
    ];
  }

  final ApiClient _api;
  final RealtimeClient _rt;
  late final List<StreamSubscription<dynamic>> _subs;

  Map<String, dynamic> _map(Object? r) => Map<String, dynamic>.from(r as Map);

  void _onEnded(Map<String, dynamic> e) {
    final id = '${e['callId']}';
    final reason = e['reason'] as String?;
    if (_incoming?.callId == id) _incoming = null;
    final o = _outgoing;
    if (o != null && (o.callId == id || o.callId == null)) {
      _outgoing = switch (reason) {
        'declined' => o.copyWith(callId: id, status: OutgoingStatus.declined, reply: e['reply'] as String?),
        'no_answer' => o.copyWith(callId: id, status: OutgoingStatus.noAnswer),
        _ => null,
      };
    }
    notifyListeners();
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
  Future<CallState> allow(String friendId) async => apply(friendId, ApiMap.callState(_map(await _api.put('/friends/$friendId/calls', {'allow': true}))));

  @override
  Future<CallState> turnOff(String friendId) async => apply(friendId, ApiMap.callState(_map(await _api.put('/friends/$friendId/calls', {'allow': false}))));

  @override
  Future<void> ring(Profile friend) async {
    _outgoing = OutgoingCall(to: friend);
    notifyListeners();
    try {
      final r = _map(await _api.post('/friends/${friend.id}/call'));
      if (_outgoing?.to.id == friend.id) _outgoing = _outgoing!.copyWith(callId: '${r['callId']}');
    } on ApiException catch (e) {
      final status = switch (e.code) { 'CALL_BUSY' => OutgoingStatus.busy, 'CALL_PAUSED' => OutgoingStatus.paused, _ => OutgoingStatus.error };
      _outgoing = OutgoingCall(to: friend, status: status, message: e.message);
      if (e.code == 'CALLS_NOT_ALLOWED') unawaited(loadState(friend.id));
    }
    notifyListeners();
  }

  @override
  Future<void> accept() async {
    final c = _incoming;
    if (c == null) return;
    _incoming = null;
    notifyListeners();
    try {
      await _api.post('/calls/${c.callId}/accept');
    } on ApiException catch (_) {
      // Already over (they hung up): the chat shows the missed call.
    }
  }

  @override
  Future<void> decline([String? reply]) async {
    final c = _incoming;
    if (c == null) return;
    _incoming = null;
    notifyListeners();
    try {
      await _api.post('/calls/${c.callId}/decline', reply == null ? <String, dynamic>{} : {'reply': reply});
    } on ApiException catch (_) {}
  }

  @override
  Future<void> cancel() async {
    final c = _outgoing;
    _outgoing = null;
    notifyListeners();
    if (c?.callId == null) return;
    try {
      await _api.post('/calls/${c!.callId}/cancel');
    } on ApiException catch (_) {}
  }

  @override
  Future<void> checkIncoming() async {
    if (!_api.hasSession) return;
    try {
      final c = _map(await _api.get('/calls/incoming'))['call'];
      if (c is Map) {
        final m = Map<String, dynamic>.from(c);
        _incoming = IncomingCall(callId: '${m['callId']}', from: ApiMap.profile(_map(m['from'])), expiresAt: ApiMap.date(m['expiresAt']) ?? DateTime.now());
        notifyListeners();
      }
    } on ApiException catch (_) {}
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }
}
