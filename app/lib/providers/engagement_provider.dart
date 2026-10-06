import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../core/mock/mock_backend.dart';
import '../models/models.dart';

part 'engagement_provider_local.dart';
part 'engagement_provider_remote.dart';

/// Vibe Hour, your level and badges, the weekly leaderboards and recap —
/// the reasons to come back that aren't a person.
///
/// [LocalEngagementProvider] makes believable numbers on the device (Vibe
/// Hour from the catalog rules); [RemoteEngagementProvider] reads
/// `GET /engagement` on start/resume and hears Vibe Hour, level-ups and
/// gem goals live.
abstract class EngagementProvider extends ChangeNotifier {
  EngagementProvider.base({DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  factory EngagementProvider(MockBackend backend, {DateTime Function()? clock}) = LocalEngagementProvider;

  final DateTime Function() _clock;
  VibeHour _vibeHour = VibeHour.off;
  LevelProgress _level = const LevelProgress();
  ProgressView? _progress;
  int _streaksAtRisk = 0;
  WeeklyRecap? _recap;
  bool _loaded = false;
  Timer? _flip;
  final _levelUps = StreamController<int>.broadcast();
  final _goals = StreamController<int>.broadcast();

  DateTime get now => _clock();

  /// Today's window (or the next one).
  VibeHour get vibeHour => _vibeHour;
  bool get vibeHourActive => _vibeHour.activeAt(_clock());
  LevelProgress get level => _progress?.level ?? _level;

  /// `GET /me/progress` once loaded (badges, this week's XP).
  ProgressView? get progress => _progress;

  /// Friend streaks that end tonight unless you talk.
  int get streaksAtRisk => _streaksAtRisk;
  WeeklyRecap? get recap => _recap;
  bool get loaded => _loaded;

  /// The recap card shows Monday–Wednesday, when there is something in it.
  bool get showRecap {
    final r = _recap;
    return r != null && !r.isEmpty && _clock().weekday <= DateTime.wednesday;
  }

  /// "Level 8!" — the level you just reached.
  Stream<int> get levelUps => _levelUps.stream;

  /// Gems crossed your wallet goal: the goal.
  Stream<int> get goalsReached => _goals.stream;

  /// Vibe Hour window, level and streaks at risk (app start / resume).
  Future<void> load();

  /// Level, this week's XP and every badge.
  Future<ProgressView> loadProgress();

  /// This week's top 50 by XP or gems received, and your place.
  Future<Leaderboard> leaderboard(Board board);

  /// Last week's numbers (shown on the Wallet screen early in the week).
  Future<WeeklyRecap?> loadRecap();

  /// Sign-out: forget the previous account.
  void clear() {
    _level = const LevelProgress();
    _progress = null;
    _streaksAtRisk = 0;
    _recap = null;
    _loaded = false;
    notifyListeners();
  }

  @protected
  void setVibeHour(VibeHour v) {
    _vibeHour = v;
    final active = v.activeAt(_clock()) || (v.active && v.endsAt != null && v.endsAt!.isAfter(_clock()));
    Economy.freeFiltersUntil = active ? v.endsAt : null;
    _scheduleFlip();
    notifyListeners();
  }

  /// At the next start/end the window is recomputed from the rules, so the
  /// banner and the "Free" chips stay honest even if a broadcast is missed.
  void _scheduleFlip() {
    _flip?.cancel();
    final n = _clock();
    final v = _vibeHour;
    final at = v.activeAt(n) ? v.endsAt : v.startsAt;
    if (at == null || !at.isAfter(n)) return;
    final wait = at.difference(n) + const Duration(milliseconds: 300);
    if (wait > const Duration(hours: 25)) return;
    _flip = Timer(wait, () => setVibeHour(VibeHour.window(_clock())));
  }

  @protected
  void setLevel(LevelProgress l, {bool announce = false}) {
    final before = level.level;
    _level = l;
    if (_progress != null) _progress = ProgressView(level: l, weekXp: _progress!.weekXp, badges: _progress!.badges);
    if (announce && l.level > before && !_levelUps.isClosed) _levelUps.add(l.level);
    notifyListeners();
  }

  @protected
  void announceGoal(int goal) {
    if (!_goals.isClosed) _goals.add(goal);
  }

  @override
  void dispose() {
    _flip?.cancel();
    _levelUps.close();
    _goals.close();
    Economy.freeFiltersUntil = null;
    super.dispose();
  }
}
