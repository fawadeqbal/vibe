part of 'engagement_provider.dart';

/// Server mode: `GET /engagement` on start and resume; Vibe Hour, level-ups
/// and reached gem goals arrive over the socket.
class RemoteEngagementProvider extends EngagementProvider {
  RemoteEngagementProvider(this._api, this._rt, {super.clock}) : super.base() {
    _subs = [
      _rt.on(Ev.vibeHour).listen((v) => setVibeHour(VibeHour.fromJson(v))),
      _rt.on(Ev.levelUp).listen((e) {
        final l = (e['level'] as num?)?.toInt();
        if (l == null) return;
        // The exact XP comes with the next read; announce now.
        setLevel(LevelProgress(level: l, xp: LevelProgress.xpForLevel(l), levelXp: LevelProgress.xpForLevel(l), nextLevelXp: LevelProgress.xpForLevel(l + 1)), announce: true);
        unawaited(load());
        if (_progress != null) unawaited(loadProgress().then((_) {}, onError: (_) {}));
      }),
      _rt.on(Ev.goalReached).listen((e) {
        final g = (e['goal'] as num?)?.toInt();
        if (g != null) announceGoal(g);
      }),
    ];
  }

  final ApiClient _api;
  final RealtimeClient _rt;
  late final List<StreamSubscription<Map<String, dynamic>>> _subs;

  @override
  Future<void> load() async {
    if (!_api.hasSession) return;
    try {
      final r = Map<String, dynamic>.from(await _api.get('/engagement') as Map);
      if (r['vibeHour'] is Map) setVibeHour(VibeHour.fromJson(Map<String, dynamic>.from(r['vibeHour'] as Map)));
      if (r['progress'] is Map) setLevel(LevelProgress.fromJson(Map<String, dynamic>.from(r['progress'] as Map)));
      _streaksAtRisk = ApiMap.i(r['streaksAtRisk']);
      _loaded = true;
      notifyListeners();
    } on ApiException catch (_) {
      // Offline: the rules still give a window.
      if (_vibeHour.startsAt == null) setVibeHour(VibeHour.window(_clock()));
    }
  }

  @override
  Future<ProgressView> loadProgress() async {
    final p = ProgressView.fromJson(Map<String, dynamic>.from(await _api.get('/me/progress') as Map));
    _progress = p;
    _level = p.level;
    notifyListeners();
    return p;
  }

  @override
  Future<Leaderboard> leaderboard(Board board) async => ApiMap.leaderboard(Map<String, dynamic>.from(await _api.get('/leaderboards', query: {'board': board.name}) as Map));

  @override
  Future<WeeklyRecap?> loadRecap() async {
    try {
      _recap = WeeklyRecap.fromJson(Map<String, dynamic>.from(await _api.get('/me/recap') as Map));
      notifyListeners();
    } on ApiException catch (_) {}
    return _recap;
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }
}
