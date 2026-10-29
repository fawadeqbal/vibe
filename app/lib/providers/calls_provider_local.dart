part of 'calls_provider.dart';

/// The offline demo: the friend says yes to calls after a moment, and
/// answers most calls (some ring out as missed).
class LocalCallsProvider extends CallsProvider {
  LocalCallsProvider(SocialProvider social, MatchProvider match) : super.base(social, match);

  final List<Timer> _timers = [];

  CallState _from(Friend f) => CallState(mine: f.calls.mine, theirs: f.calls.theirs, canAsk: !f.calls.mine && !f.calls.on);

  @override
  Future<CallState?> loadState(String friendId) async {
    final f = _social.friend(friendId);
    if (f == null) return null;
    _states[friendId] = _from(f);
    notifyListeners();
    return _states[friendId];
  }

  @override
  Future<CallState> allow(String friendId) async {
    final f = _social.friend(friendId);
    if (f == null) throw ApiException('NOT_FRIENDS', 'You are not friends', status: 403);
    if (f.calls.theirs) {
      _social.addSystemLine(friendId, 'You both allowed video calls', 'calls_on', fromMe: true);
      return apply(friendId, const CallState(mine: true, theirs: true));
    }
    _social.addSystemLine(friendId, 'You asked to allow video calls', 'calls_asked', fromMe: true);
    final st = apply(friendId, const CallState(mine: true, theirs: false));
    // The friend says yes after a moment.
    _timers.add(Timer(const Duration(seconds: 3), () {
      final now = _social.friend(friendId);
      if (now == null || !now.calls.mine) return;
      _social.addSystemLine(friendId, 'You both allowed video calls', 'calls_on');
      apply(friendId, const CallState(mine: true, theirs: true));
    }));
    return st;
  }

  @override
  Future<CallState> turnOff(String friendId) async {
    final f = _social.friend(friendId);
    if (f != null && f.calls.on) _social.addSystemLine(friendId, 'Video calls were turned off', 'calls_off', fromMe: true);
    if (f != null && f.calls.theirs && !f.calls.mine) _social.addSystemLine(friendId, 'Not now for video calls', 'calls_declined', fromMe: true);
    return apply(friendId, const CallState());
  }

  @override
  Future<void> ring(Profile friend) async {
    final f = _social.friend(friend.id);
    if (f == null || !f.calls.on) {
      _outgoing = OutgoingCall(to: friend, status: OutgoingStatus.error, message: 'You both need to allow video calls first');
      notifyListeners();
      return;
    }
    _outgoing = OutgoingCall(to: friend, callId: 'call${DateTime.now().millisecondsSinceEpoch}');
    notifyListeners();
    final answers = friend.id.hashCode.abs() % 4 != 0;
    _timers.add(Timer(Duration(seconds: answers ? 3 : Economy.callRingSeconds), () {
      if (_outgoing?.to.id != friend.id || _outgoing?.status != OutgoingStatus.ringing) return;
      if (answers) {
        _outgoing = null;
        notifyListeners();
        unawaited(_match.beginFriendCall(friend));
      } else {
        _outgoing = _outgoing!.copyWith(status: OutgoingStatus.noAnswer);
        _social.addSystemLine(friend.id, 'Missed video call', 'call_missed', fromMe: true);
        notifyListeners();
      }
    }));
  }

  @override
  Future<void> accept() async {
    final c = _incoming;
    if (c == null) return;
    _incoming = null;
    notifyListeners();
    await _match.beginFriendCall(c.from);
  }

  @override
  Future<void> decline([String? reply]) async {
    final c = _incoming;
    if (c == null) return;
    _incoming = null;
    if (reply != null) await _social.sendMessage(c.from.id, reply);
    _social.addSystemLine(c.from.id, 'Video call declined', 'call_declined', fromMe: true);
    notifyListeners();
  }

  @override
  Future<void> cancel() async {
    final c = _outgoing;
    _outgoing = null;
    if (c != null && c.status == OutgoingStatus.ringing) _social.addSystemLine(c.to.id, 'Missed video call', 'call_missed', fromMe: true);
    notifyListeners();
  }

  /// Test seam: a friend calls you.
  @visibleForTesting
  void debugIncoming(Profile from) {
    _incoming = IncomingCall(callId: 'in${DateTime.now().millisecondsSinceEpoch}', from: from, expiresAt: DateTime.now().add(Duration(seconds: Economy.callRingSeconds)));
    notifyListeners();
  }

  @override
  void dispose() {
    for (final t in _timers) {
      t.cancel();
    }
    super.dispose();
  }
}
