part of 'calls_provider.dart';

/// The offline demo: the friend says yes to calls after a moment, and
/// answers most calls (some ring out as missed).
class LocalCallsProvider extends CallsProvider {
  LocalCallsProvider(SocialProvider social, MatchProvider match) : super.base(social, match);

  final List<Timer> _timers = [];

  CallState _from(Friend f) => CallState(mine: f.calls.mine, theirs: f.calls.theirs, mineVideo: f.calls.mineVideo, theirsVideo: f.calls.theirsVideo, canAsk: !f.calls.mine && !f.calls.on);

  @override
  Future<CallState?> loadState(String friendId) async {
    final f = _social.friend(friendId);
    if (f == null) return null;
    _states[friendId] = _from(f);
    notifyListeners();
    return _states[friendId];
  }

  @override
  Future<CallState> allow(String friendId, {bool video = true}) async {
    final f = _social.friend(friendId);
    if (f == null) throw ApiException('NOT_FRIENDS', 'You are not friends', status: 403);
    String level(bool v) => v ? 'voice and video' : 'voice';
    if (f.calls.mine) {
      // Changing your level.
      if (f.calls.on && !video && f.calls.mineVideo) _social.addSystemLine(friendId, 'Video was turned off · voice calls only', 'calls_voice_only', fromMe: true);
      if (f.calls.on && video && f.calls.theirsVideo) _social.addSystemLine(friendId, 'You both allowed voice and video calls', 'calls_on', fromMe: true, extra: {'video': true});
      return apply(friendId, CallState(mine: true, theirs: f.calls.theirs, mineVideo: video, theirsVideo: f.calls.theirsVideo));
    }
    if (f.calls.theirs) {
      final both = video && f.calls.theirsVideo;
      _social.addSystemLine(friendId, 'You both allowed ${level(both)} calls', 'calls_on', fromMe: true, extra: {'video': both});
      return apply(friendId, CallState(mine: true, theirs: true, mineVideo: video, theirsVideo: f.calls.theirsVideo));
    }
    _social.addSystemLine(friendId, 'You asked to allow ${level(video)} calls', 'calls_asked', fromMe: true, extra: {'video': video});
    final st = apply(friendId, CallState(mine: true, mineVideo: video));
    // The friend says yes after a moment, at the same level.
    _timers.add(Timer(const Duration(seconds: 3), () {
      final now = _social.friend(friendId);
      if (now == null || !now.calls.mine) return;
      _social.addSystemLine(friendId, 'You both allowed ${level(now.calls.mineVideo)} calls', 'calls_on', extra: {'video': now.calls.mineVideo});
      apply(friendId, CallState(mine: true, theirs: true, mineVideo: now.calls.mineVideo, theirsVideo: now.calls.mineVideo));
    }));
    return st;
  }

  @override
  Future<CallState> turnOff(String friendId) async {
    final f = _social.friend(friendId);
    if (f != null && f.calls.on) _social.addSystemLine(friendId, 'Calls were turned off', 'calls_off', fromMe: true);
    if (f != null && f.calls.theirs && !f.calls.mine) _social.addSystemLine(friendId, 'Not now for calls', 'calls_declined', fromMe: true);
    return apply(friendId, const CallState());
  }

  @override
  Future<void> ring(Profile friend, [CallMedia media = CallMedia.video]) async {
    final f = _social.friend(friend.id);
    if (f == null || !f.calls.on || (media == CallMedia.video && !f.calls.video)) {
      _outgoing = OutgoingCall(to: friend, status: OutgoingStatus.error, message: f != null && f.calls.on ? 'Video calls aren’t allowed in this chat — try a voice call' : 'You both need to allow calls first', media: media);
      notifyListeners();
      return;
    }
    _outgoing = OutgoingCall(to: friend, callId: 'call${DateTime.now().millisecondsSinceEpoch}', media: media);
    notifyListeners();
    final answers = friend.id.hashCode.abs() % 4 != 0;
    _timers.add(Timer(Duration(seconds: answers ? 3 : Economy.callRingSeconds), () {
      if (_outgoing?.to.id != friend.id || _outgoing?.status != OutgoingStatus.ringing) return;
      if (answers) {
        _outgoing = null;
        notifyListeners();
        unawaited(_match.beginFriendCall(friend, voice: media == CallMedia.voice));
      } else {
        _outgoing = _outgoing!.copyWith(status: OutgoingStatus.noAnswer);
        _social.addSystemLine(friend.id, 'Missed ${media.name} call', 'call_missed', fromMe: true, extra: {'video': media == CallMedia.video});
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
    await _match.beginFriendCall(c.from, voice: c.media == CallMedia.voice);
  }

  @override
  Future<void> decline([String? reply]) async {
    final c = _incoming;
    if (c == null) return;
    _incoming = null;
    if (reply != null) await _social.sendMessage(c.from.id, reply);
    _social.addSystemLine(c.from.id, '${c.media == CallMedia.voice ? 'Voice' : 'Video'} call declined', 'call_declined', fromMe: true, extra: {'video': c.media == CallMedia.video});
    notifyListeners();
  }

  @override
  Future<void> cancel() async {
    final c = _outgoing;
    _outgoing = null;
    if (c != null && c.status == OutgoingStatus.ringing) _social.addSystemLine(c.to.id, 'Missed ${c.media.name} call', 'call_missed', fromMe: true, extra: {'video': c.media == CallMedia.video});
    notifyListeners();
  }

  /// Test seam: a friend calls you.
  @visibleForTesting
  void debugIncoming(Profile from, {CallMedia media = CallMedia.video}) {
    _incoming = IncomingCall(callId: 'in${DateTime.now().millisecondsSinceEpoch}', from: from, expiresAt: DateTime.now().add(Duration(seconds: Economy.callRingSeconds)), media: media);
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
