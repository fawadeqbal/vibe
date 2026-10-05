part of 'follows_provider.dart';

/// Server mode: follows on the Vibe API; new followers, requests and
/// acceptances arrive over the socket.
class RemoteFollowsProvider extends FollowsProvider {
  RemoteFollowsProvider(this._api, this._rt) : super.base() {
    _subs = [
      _rt.on(Ev.followNew).listen((m) => _onNotice(FollowNoticeKind.newFollower, m['from'])),
      _rt.on(Ev.followRequest).listen((m) => _onNotice(FollowNoticeKind.request, m['from'])),
      _rt.on(Ev.followAccepted).listen((m) => _onNotice(FollowNoticeKind.accepted, m['by'])),
      _rt.on(Ev.followRemoved).listen((_) => _reloadSettings()),
    ];
  }

  final ApiClient _api;
  final RealtimeClient _rt;
  late final List<StreamSubscription> _subs;

  @override
  Future<void> load() async {
    if (!_api.hasSession) return;
    await _reloadSettings();
  }

  Future<void> _reloadSettings() async {
    try {
      _settings = ApiMap.followSettings(Map<String, dynamic>.from(await _api.get('/me') as Map));
      notifyListeners();
    } on ApiException catch (_) {}
  }

  void _onNotice(FollowNoticeKind kind, Object? who) {
    if (who is Map) {
      final p = ApiMap.profile(Map<String, dynamic>.from(who));
      if (kind == FollowNoticeKind.accepted) remember(p.id, FollowState.following);
      announce(FollowNotice(kind, p));
    }
    _reloadSettings();
  }

  @override
  Future<ProfileView?> view(String userId) async {
    try {
      final v = ApiMap.profileView(Map<String, dynamic>.from(await _api.get('/users/$userId/view') as Map));
      remember(userId, v.follow);
      return v;
    } on ApiException catch (e) {
      if (e.status == 404) return null;
      rethrow;
    }
  }

  @override
  Future<FollowState> follow(String userId) async {
    final r = Map<String, dynamic>.from(await _api.post('/follows/$userId') as Map);
    final s = ApiMap.followState(r['state']);
    remember(userId, s);
    unawaited(_reloadSettings());
    return s;
  }

  @override
  Future<void> unfollow(String userId) async {
    await _api.delete('/follows/$userId');
    remember(userId, FollowState.none);
    unawaited(_reloadSettings());
  }

  @override
  Future<FollowPage> list(FollowList which, {String? cursor}) async {
    final path = switch (which) {
      FollowList.followers => '/me/followers',
      FollowList.following => '/me/following',
      FollowList.requests => '/me/follow-requests',
    };
    final r = Map<String, dynamic>.from(await _api.get(path, query: {'limit': '50', if (cursor != null) 'cursor': cursor}) as Map);
    return FollowPage([for (final e in r['items'] as List) ApiMap.followEntry(Map<String, dynamic>.from(e as Map))], r['nextCursor'] as String?);
  }

  @override
  Future<void> accept(String userId) async {
    await _api.post('/me/follow-requests/$userId/accept');
    unawaited(_reloadSettings());
  }

  @override
  Future<void> decline(String userId) async {
    await _api.post('/me/follow-requests/$userId/decline');
  }

  @override
  Future<void> removeFollower(String userId) async {
    await _api.delete('/me/followers/$userId');
    unawaited(_reloadSettings());
  }

  @override
  Future<void> report(String userId, ReportReason reason, {String? note, bool block = true}) async {
    await _api.post('/reports', {'userId': userId, 'reason': ApiMap.reportReasonOut(reason), if (note != null && note.isNotEmpty) 'note': note, 'block': block});
  }

  @override
  Future<bool> setPrivacy({bool? privateAccount, bool? hideStats}) async {
    final before = _settings;
    _settings = _settings.copyWith(privateAccount: privateAccount, hideStats: hideStats);
    notifyListeners();
    try {
      final me = await _api.patch('/me', {if (privateAccount != null) 'privateAccount': privateAccount, if (hideStats != null) 'hideStats': hideStats});
      _settings = ApiMap.followSettings(Map<String, dynamic>.from(me as Map));
      notifyListeners();
      return true;
    } on ApiException catch (_) {
      _settings = before;
      notifyListeners();
      return false;
    }
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }
}
