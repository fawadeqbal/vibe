/// Engagement shapes: friend streaks, Vibe Hour, levels and badges,
/// leaderboards, the weekly recap, moments, in-call icebreakers and the
/// wellbeing settings. Plain immutable classes with `fromJson` for the
/// server's JSON, so the offline mock and the API hand screens the same thing.
library;

import 'models.dart';

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
int _i(Object? v) => (v as num?)?.toInt() ?? 0;

/// A friend streak as one side sees it today (`StreakView` on the server).
class StreakView {
  const StreakView({this.count = 0, this.best = 0, this.today = false, this.atRisk = false, this.mineToday = false, this.theirsToday = false, this.restorable = false, this.lostCount = 0, this.restoreCost = 0});

  static const none = StreakView();

  /// Current streak (0 once it has broken).
  final int count;
  final int best;

  /// Today already counted.
  final bool today;

  /// Counted yesterday, not yet today: it ends at midnight unless both talk.
  final bool atRisk;
  final bool mineToday;
  final bool theirsToday;

  /// Broke yesterday; [restoreCost] coins bring [lostCount] back (0 for VIP).
  final bool restorable;
  final int lostCount;
  final int restoreCost;

  bool get visible => count > 0;

  factory StreakView.fromJson(Map<String, dynamic> m) => StreakView(
        count: _i(m['count']),
        best: _i(m['best']),
        today: m['today'] == true,
        atRisk: m['atRisk'] == true,
        mineToday: m['mineToday'] == true,
        theirsToday: m['theirsToday'] == true,
        restorable: m['restorable'] == true,
        lostCount: _i(m['lostCount']),
        restoreCost: _i(m['restoreCost']),
      );

  Map<String, dynamic> toJson() => {
        'count': count,
        'best': best,
        'today': today,
        'atRisk': atRisk,
        'mineToday': mineToday,
        'theirsToday': theirsToday,
        'restorable': restorable,
        'lostCount': lostCount,
        'restoreCost': restoreCost,
      };

  StreakView copyWith({int? count, int? best, bool? today, bool? atRisk, bool? mineToday, bool? theirsToday, bool? restorable, int? lostCount, int? restoreCost}) => StreakView(
        count: count ?? this.count,
        best: best ?? this.best,
        today: today ?? this.today,
        atRisk: atRisk ?? this.atRisk,
        mineToday: mineToday ?? this.mineToday,
        theirsToday: theirsToday ?? this.theirsToday,
        restorable: restorable ?? this.restorable,
        lostCount: lostCount ?? this.lostCount,
        restoreCost: restoreCost ?? this.restoreCost,
      );
}

/// Today's (or the next) Vibe Hour window. Null times = Vibe Hour is off.
class VibeHour {
  const VibeHour({this.active = false, this.startsAt, this.endsAt});
  static const off = VibeHour();

  final bool active;
  final DateTime? startsAt;
  final DateTime? endsAt;

  factory VibeHour.fromJson(Map<String, dynamic> m) => VibeHour(active: m['active'] == true, startsAt: _date(m['startsAt']), endsAt: _date(m['endsAt']));

  /// Active right now (the server's flag, kept honest by the clock).
  bool activeAt(DateTime now) => startsAt != null && endsAt != null && !now.isBefore(startsAt!) && now.isBefore(endsAt!);

  /// Starts within [within] (the lobby shows "starts at 9:00 PM").
  bool startsSoon(DateTime now, {Duration within = const Duration(hours: 2)}) => startsAt != null && now.isBefore(startsAt!) && startsAt!.difference(now) <= within;

  /// The daily window around [now] (port of the server's `vibeHourWindow`):
  /// [startMinute] minutes after business midnight, [lengthMinutes] long.
  static VibeHour window(DateTime now, {int offsetMinutes = Economy.businessTzOffsetMinutes, int? startMinute, int? lengthMinutes}) {
    final start0 = startMinute ?? Economy.vibeHourStart;
    final len = lengthMinutes ?? Economy.vibeHourMinutes;
    if (len <= 0) return off;
    const dayMs = 86400000;
    final offsetMs = offsetMinutes * 60000;
    final nowMs = now.millisecondsSinceEpoch;
    final today = ((nowMs + offsetMs) / dayMs).floor();
    for (final day in [today - 1, today, today + 1]) {
      final start = day * dayMs - offsetMs + start0 * 60000;
      final end = start + len * 60000;
      if (nowMs < end) return VibeHour(active: nowMs >= start, startsAt: DateTime.fromMillisecondsSinceEpoch(start), endsAt: DateTime.fromMillisecondsSinceEpoch(end));
    }
    return off;
  }
}

/// Level from XP: reaching level n takes 25·n·(n−1) XP in total.
class LevelProgress {
  const LevelProgress({this.level = 1, this.xp = 0, this.levelXp = 0, this.nextLevelXp = 50});

  final int level;
  final int xp;

  /// Total XP at which the current level started.
  final int levelXp;

  /// Total XP that reaches the next level.
  final int nextLevelXp;

  int get xpToNext => (nextLevelXp - xp).clamp(0, 1 << 30);
  double get fraction => nextLevelXp <= levelXp ? 1 : ((xp - levelXp) / (nextLevelXp - levelXp)).clamp(0.0, 1.0);

  static int xpForLevel(int level) => 25 * level * (level - 1);

  static int levelOf(int xp) {
    var n = 1;
    while (xpForLevel(n + 1) <= xp) {
      n++;
    }
    return n;
  }

  factory LevelProgress.ofXp(int xp) {
    final l = levelOf(xp);
    return LevelProgress(level: l, xp: xp < 0 ? 0 : xp, levelXp: xpForLevel(l), nextLevelXp: xpForLevel(l + 1));
  }

  factory LevelProgress.fromJson(Map<String, dynamic> m) => LevelProgress(level: _i(m['level']).clamp(1, 1 << 20), xp: _i(m['xp']), levelXp: _i(m['levelXp']), nextLevelXp: _i(m['nextLevelXp']));
}

/// One badge with how close you are (`GET /me/progress`).
class ProgressBadge {
  const ProgressBadge({required this.id, required this.name, required this.emoji, this.earned = false, this.progress = 0, this.target = 1});
  final String id;
  final String name;
  final String emoji;
  final bool earned;
  final int progress;
  final int target;

  double get fraction => target <= 0 ? 1 : (progress / target).clamp(0.0, 1.0);

  factory ProgressBadge.fromJson(Map<String, dynamic> m) {
    final id = m['id'] as String? ?? '';
    final info = Badges.info(id);
    return ProgressBadge(id: id, name: m['name'] as String? ?? info.name, emoji: m['emoji'] as String? ?? info.emoji, earned: m['earned'] == true, progress: _i(m['progress']), target: _i(m['target']));
  }
}

/// The badge catalog (ids are stable on the server). Other people's profiles
/// only carry earned ids, so names/emoji come from here.
class Badges {
  Badges._();

  static const all = <ProgressBadge>[
    ProgressBadge(id: 'verified', name: 'Verified', emoji: '✔️', target: 1),
    ProgressBadge(id: 'first_vibes', name: 'First vibes', emoji: '👋', target: 10),
    ProgressBadge(id: 'social_butterfly', name: 'Social butterfly', emoji: '🦋', target: 100),
    ProgressBadge(id: 'great_talker', name: 'Great talker', emoji: '🎙️', target: 50),
    ProgressBadge(id: 'loved', name: 'Loved', emoji: '💖', target: 50),
    ProgressBadge(id: 'heartthrob', name: 'Heartthrob', emoji: '💘', target: 500),
    ProgressBadge(id: 'generous', name: 'Generous', emoji: '🎁', target: 20),
    ProgressBadge(id: 'streak_7', name: 'On fire', emoji: '🔥', target: 7),
    ProgressBadge(id: 'streak_30', name: 'Unstoppable', emoji: '☄️', target: 30),
    ProgressBadge(id: 'night_owl', name: 'Night owl', emoji: '🦉', target: 20),
    ProgressBadge(id: 'ambassador', name: 'Ambassador', emoji: '🎖️', target: 10),
  ];

  static ProgressBadge info(String id) => all.firstWhere((b) => b.id == id, orElse: () => ProgressBadge(id: id, name: id, emoji: '⭐'));

  /// What each badge is for (the badges sheet).
  static String how(ProgressBadge b) => switch (b.id) {
        'verified' => 'Verify your profile with a selfie',
        'first_vibes' || 'social_butterfly' => '${b.target} matches',
        'great_talker' => '${b.target} calls of a minute or more',
        'loved' || 'heartthrob' => '${b.target} likes received',
        'generous' => '${b.target} gifts sent',
        'streak_7' || 'streak_30' => 'A ${b.target}-day friend streak',
        'night_owl' => '${b.target} calls after midnight',
        'ambassador' => '${b.target} friends active with your invite',
        _ => '',
      };
}

/// `GET /me/progress`.
class ProgressView {
  const ProgressView({this.level = const LevelProgress(), this.weekXp = 0, this.badges = const []});
  final LevelProgress level;
  final int weekXp;
  final List<ProgressBadge> badges;

  List<ProgressBadge> get earned => badges.where((b) => b.earned).toList();

  factory ProgressView.fromJson(Map<String, dynamic> m) => ProgressView(
        level: LevelProgress.fromJson(m),
        weekXp: _i(m['weekXp']),
        badges: [for (final b in (m['badges'] as List? ?? const [])) ProgressBadge.fromJson(Map<String, dynamic>.from(b as Map))],
      );
}

enum Board { xp, gems }

class LeaderRow {
  const LeaderRow({required this.rank, required this.profile, required this.score});
  final int rank;
  final Profile profile;
  final int score;
}

/// This week's top 50 and your own place (`GET /leaderboards`).
class Leaderboard {
  const Leaderboard({required this.board, required this.top, this.weekStart, this.weekEnd, this.myRank, this.myScore = 0});
  final Board board;
  final List<LeaderRow> top;
  final DateTime? weekStart;
  final DateTime? weekEnd;
  final int? myRank;
  final int myScore;
}

/// Last week's numbers (`GET /me/recap`).
class WeeklyRecap {
  const WeeklyRecap({this.weekStart, this.weekEnd, this.gemsEarned = 0, this.giftsReceived = 0, this.likesReceived = 0, this.newFollowers = 0, this.matches = 0, this.bestStreak = 0});
  final DateTime? weekStart;
  final DateTime? weekEnd;
  final int gemsEarned;
  final int giftsReceived;
  final int likesReceived;
  final int newFollowers;
  final int matches;
  final int bestStreak;

  bool get isEmpty => gemsEarned == 0 && giftsReceived == 0 && likesReceived == 0 && newFollowers == 0 && matches == 0;

  factory WeeklyRecap.fromJson(Map<String, dynamic> m) => WeeklyRecap(
        weekStart: _date(m['weekStart']),
        weekEnd: _date(m['weekEnd']),
        gemsEarned: _i(m['gemsEarned']),
        giftsReceived: _i(m['giftsReceived']),
        likesReceived: _i(m['likesReceived']),
        newFollowers: _i(m['newFollowers']),
        matches: _i(m['matches']),
        bestStreak: _i(m['bestStreak']),
      );
}

// ── moments ─────────────────────────────────────────────────────────────

/// A 24-hour photo.
class Moment {
  const Moment({required this.id, required this.mediaUrl, required this.createdAt, required this.expiresAt, this.caption = '', this.seen = false, this.viewsCount});
  final String id;
  final String mediaUrl;
  final String caption;
  final DateTime createdAt;
  final DateTime expiresAt;
  final bool seen;

  /// Own moments only.
  final int? viewsCount;

  Moment copyWith({bool? seen, int? viewsCount}) => Moment(id: id, mediaUrl: mediaUrl, caption: caption, createdAt: createdAt, expiresAt: expiresAt, seen: seen ?? this.seen, viewsCount: viewsCount ?? this.viewsCount);

  factory Moment.fromJson(Map<String, dynamic> m) => Moment(
        id: m['id'] as String,
        mediaUrl: m['mediaUrl'] as String? ?? '',
        caption: m['caption'] as String? ?? '',
        createdAt: _date(m['createdAt']) ?? DateTime.now(),
        expiresAt: _date(m['expiresAt']) ?? DateTime.now().add(const Duration(hours: 24)),
        seen: m['seen'] == true,
        viewsCount: (m['viewsCount'] as num?)?.toInt(),
      );
}

/// Someone's live moments, oldest → newest (story order).
class MomentGroup {
  const MomentGroup({required this.author, required this.moments, this.mine = false});
  final Profile author;
  final List<Moment> moments;
  final bool mine;

  bool get allSeen => moments.every((m) => m.seen);

  /// Where the viewer opens: the first unseen one (or the start).
  int get firstUnseen {
    final i = moments.indexWhere((m) => !m.seen);
    return i < 0 ? 0 : i;
  }

  MomentGroup withMoments(List<Moment> list) => MomentGroup(author: author, moments: list, mine: mine);
}

class MomentViewer {
  const MomentViewer({required this.profile, required this.at});
  final Profile profile;
  final DateTime at;
}

// ── in-call icebreakers ─────────────────────────────────────────────────

enum IcebreakerGame { wyr, thisOrThat, questions }

extension IcebreakerGameInfo on IcebreakerGame {
  String get wire => switch (this) { IcebreakerGame.wyr => 'wyr', IcebreakerGame.thisOrThat => 'this_or_that', IcebreakerGame.questions => 'questions' };
  String get label => switch (this) { IcebreakerGame.wyr => 'Would you rather', IcebreakerGame.thisOrThat => 'This or that', IcebreakerGame.questions => 'Deep & fun questions' };
  String get emoji => switch (this) { IcebreakerGame.wyr => '🤔', IcebreakerGame.thisOrThat => '⚡', IcebreakerGame.questions => '💬' };
  String get blurb => switch (this) {
        IcebreakerGame.wyr => 'Pick one of two. See if you match.',
        IcebreakerGame.thisOrThat => 'Quick-fire choices, no overthinking.',
        IcebreakerGame.questions => 'Something to actually talk about.',
      };

  static IcebreakerGame? parse(Object? s) => switch (s) { 'wyr' => IcebreakerGame.wyr, 'this_or_that' => IcebreakerGame.thisOrThat, 'questions' => IcebreakerGame.questions, _ => null };
}

/// The prompt on screen and where both answers are.
class GameRound {
  const GameRound({required this.game, required this.round, required this.text, this.options, this.byMe = true, this.mine, this.theirs, this.iAnswered = false, this.partnerAnswered = false, this.revealed = false});
  final IcebreakerGame game;
  final int round;
  final String text;

  /// Two choices, or null for an open question.
  final List<String>? options;

  /// Who started this round.
  final bool byMe;
  final int? mine;
  final int? theirs;
  final bool iAnswered;
  final bool partnerAnswered;
  final bool revealed;

  bool get hasOptions => options != null && options!.length == 2;
  bool get same => revealed && hasOptions && mine != null && mine == theirs;

  GameRound answered({int? mine, int? theirs, bool? iAnswered, bool? partnerAnswered, bool? revealed}) => GameRound(
        game: game,
        round: round,
        text: text,
        options: options,
        byMe: byMe,
        mine: mine ?? this.mine,
        theirs: theirs ?? this.theirs,
        iAnswered: iAnswered ?? this.iAnswered,
        partnerAnswered: partnerAnswered ?? this.partnerAnswered,
        revealed: revealed ?? this.revealed,
      );

  /// `match:game` event / start ack.
  static GameRound? fromJson(Map<String, dynamic> m) {
    final game = IcebreakerGameInfo.parse(m['game']);
    final prompt = m['prompt'];
    if (game == null || prompt is! Map) return null;
    final opts = prompt['options'];
    return GameRound(game: game, round: _i(m['round']), text: prompt['text'] as String? ?? '', options: opts is List && opts.length == 2 ? [for (final o in opts) '$o'] : null, byMe: m['by'] != 'partner');
  }
}

/// Quiet hours and break reminders (`GET/PATCH /me`).
class WellbeingSettings {
  const WellbeingSettings({this.quietHoursStart, this.quietHoursEnd, this.breakReminderMinutes, this.tzOffsetMinutes = 300});

  /// Minutes after local midnight; quiet hours are on when both are set and differ.
  final int? quietHoursStart;
  final int? quietHoursEnd;

  /// 30, 60, 90 or 120; null = off.
  final int? breakReminderMinutes;
  final int tzOffsetMinutes;

  static const breakChoices = [30, 60, 90, 120];
  static const defaultQuietStart = 23 * 60;
  static const defaultQuietEnd = 8 * 60;

  bool get quietHoursOn => quietHoursStart != null && quietHoursEnd != null && quietHoursStart != quietHoursEnd;

  factory WellbeingSettings.fromJson(Map<String, dynamic> m) => WellbeingSettings(
        quietHoursStart: (m['quietHoursStart'] as num?)?.toInt(),
        quietHoursEnd: (m['quietHoursEnd'] as num?)?.toInt(),
        breakReminderMinutes: (m['breakReminderMinutes'] as num?)?.toInt(),
        tzOffsetMinutes: (m['tzOffsetMinutes'] as num?)?.toInt() ?? 300,
      );
}
