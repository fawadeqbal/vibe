part of 'engagement_provider.dart';

/// The offline mock: Vibe Hour from the catalog rules on the device's clock,
/// a believable level and badge progress, and a leaderboard of the demo
/// people with you somewhere in the middle.
class LocalEngagementProvider extends EngagementProvider {
  LocalEngagementProvider(this._backend, {super.clock}) : super.base();

  final MockBackend _backend;
  int _xp = 230;
  int _weekXp = 85;

  @override
  Future<void> load() async {
    setVibeHour(VibeHour.window(_clock()));
    _level = LevelProgress.ofXp(_xp);
    _loaded = true;
    notifyListeners();
  }

  @override
  Future<ProgressView> loadProgress() async {
    ProgressBadge b(String id, int progress) {
      final info = Badges.info(id);
      final p = progress.clamp(0, info.target);
      return ProgressBadge(id: id, name: info.name, emoji: info.emoji, target: info.target, progress: p, earned: p >= info.target);
    }

    final p = ProgressView(
      level: LevelProgress.ofXp(_xp),
      weekXp: _weekXp,
      badges: [b('verified', 0), b('first_vibes', 14), b('social_butterfly', 14), b('great_talker', 9), b('loved', 23), b('heartthrob', 23), b('generous', 4), b('streak_7', 7), b('streak_30', 7), b('night_owl', 3), b('ambassador', 2)],
    );
    _progress = p;
    notifyListeners();
    return p;
  }

  /// Mock XP (tests and the demo): crossing a level announces it.
  void award(int xp) {
    _xp += xp;
    _weekXp += xp;
    // setLevel moves the level (and announces a new one).
    if (_progress != null) _progress = ProgressView(level: _progress!.level, weekXp: _weekXp, badges: _progress!.badges);
    setLevel(LevelProgress.ofXp(_xp), announce: true);
  }

  @override
  Future<Leaderboard> leaderboard(Board board) async {
    final people = _backend.people.take(20).toList();
    final rows = <LeaderRow>[];
    for (var i = 0; i < people.length; i++) {
      final base = board == Board.xp ? 1400 : 9000;
      final score = (base * (1 - i / 22)).round() - (people[i].id.hashCode.abs() % 37);
      rows.add(LeaderRow(rank: i + 1, profile: people[i], score: score));
    }
    final n = _clock();
    final monday = DateTime(n.year, n.month, n.day).subtract(Duration(days: n.weekday - 1));
    return Leaderboard(
      board: board,
      top: rows,
      weekStart: monday,
      weekEnd: monday.add(const Duration(days: 7)),
      myRank: board == Board.xp ? 128 : null,
      myScore: board == Board.xp ? _weekXp : 0,
    );
  }

  @override
  Future<WeeklyRecap?> loadRecap() async {
    final n = _clock();
    final monday = DateTime(n.year, n.month, n.day).subtract(Duration(days: n.weekday - 1));
    _recap = WeeklyRecap(weekStart: monday.subtract(const Duration(days: 7)), weekEnd: monday, gemsEarned: 340, giftsReceived: 6, likesReceived: 23, newFollowers: 4, matches: 41, bestStreak: 7);
    notifyListeners();
    return _recap;
  }
}
