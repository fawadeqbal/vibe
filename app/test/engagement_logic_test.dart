import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/api/mappers.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/catalog_provider.dart';
import 'package:vibe_app/providers/engagement_provider.dart';
import 'package:vibe_app/providers/moments_provider.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/match/lobby_extras.dart';
import 'package:vibe_app/screens/profile/wellbeing_section.dart';
import 'package:vibe_app/services/wellbeing/break_reminder.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  tearDown(() => Economy.freeFiltersUntil = null);

  group('levels', () {
    test('25·n·(n−1) XP per level, like the server', () {
      expect([1, 2, 3, 4].map(LevelProgress.xpForLevel), [0, 50, 150, 300]);
      expect(LevelProgress.levelOf(0), 1);
      expect(LevelProgress.levelOf(49), 1);
      expect(LevelProgress.levelOf(50), 2);
      expect(LevelProgress.levelOf(299), 3);
      final p = LevelProgress.ofXp(230);
      expect((p.level, p.levelXp, p.nextLevelXp, p.xpToNext), (3, 150, 300, 70));
      expect(p.fraction, closeTo(80 / 150, 1e-9));
    });
  });

  group('Vibe Hour window', () {
    // 2026-10-06 15:00 UTC = 20:00 in Pakistan (UTC+5).
    final at20 = DateTime.utc(2026, 10, 6, 15);

    test('before it starts: today 21:00–22:00 business time', () {
      final v = VibeHour.window(at20, startMinute: 1260, lengthMinutes: 60);
      expect(v.active, isFalse);
      expect(v.startsAt!.toUtc(), DateTime.utc(2026, 10, 6, 16));
      expect(v.endsAt!.toUtc(), DateTime.utc(2026, 10, 6, 17));
      expect(v.startsSoon(at20), isTrue);
      expect(v.startsSoon(at20.subtract(const Duration(hours: 3))), isFalse);
    });

    test('during it, after it, across midnight, and off', () {
      final during = VibeHour.window(DateTime.utc(2026, 10, 6, 16, 30), startMinute: 1260, lengthMinutes: 60);
      expect(during.active, isTrue);
      expect(during.activeAt(DateTime.utc(2026, 10, 6, 16, 30)), isTrue);
      final after = VibeHour.window(DateTime.utc(2026, 10, 6, 17, 1), startMinute: 1260, lengthMinutes: 60);
      expect(after.active, isFalse);
      expect(after.startsAt!.toUtc(), DateTime.utc(2026, 10, 7, 16));
      // 23:30 + 60 min runs past business midnight.
      final late = VibeHour.window(DateTime.utc(2026, 10, 6, 19, 10), startMinute: 1410, lengthMinutes: 60);
      expect(late.active, isTrue);
      expect(late.endsAt!.toUtc(), DateTime.utc(2026, 10, 6, 19, 30));
      expect(VibeHour.window(at20, lengthMinutes: 0).startsAt, isNull);
    });

    test('from the API, and filters are free while it runs', () {
      final now = DateTime.now();
      final v = VibeHour.fromJson({'active': true, 'startsAt': now.subtract(const Duration(minutes: 5)).toUtc().toIso8601String(), 'endsAt': now.add(const Duration(minutes: 55)).toUtc().toIso8601String()});
      expect(v.activeAt(now), isTrue);
      const paid = MatchFilters(gender: GenderFilter.women, countryCode: 'TR');
      expect(paid.costFor(vip: false), Economy.genderFilterCost + Economy.regionFilterCost);
      Economy.freeFiltersUntil = v.endsAt;
      expect(paid.costFor(vip: false), 0);
      Economy.freeFiltersUntil = now.subtract(const Duration(seconds: 1));
      expect(paid.costFor(vip: false), greaterThan(0));
    });

    test('local provider follows the catalog rules and sets free filters', () async {
      final now = DateTime.utc(2026, 10, 6, 16, 20); // 21:20 business time
      final e = EngagementProvider(MockBackend(fast: true), clock: () => now);
      await e.load();
      expect(e.vibeHour.active, isTrue);
      expect(e.vibeHourActive, isTrue);
      expect(Economy.freeFiltersUntil!.toUtc(), DateTime.utc(2026, 10, 6, 17));
      e.dispose();
      expect(Economy.freeFiltersUntil, isNull);
    });

    test('countdown and clock labels', () {
      expect(countdown(const Duration(minutes: 42, seconds: 10)), '42:10');
      expect(countdown(const Duration(seconds: 9)), '0:09');
      expect(countdown(const Duration(hours: 1, minutes: 2, seconds: 3)), '1:02:03');
      expect(countdown(const Duration(seconds: -4)), '0:00');
      expect(clockLabel(1260), '9:00 PM');
      expect(clockLabel(0), '12:00 AM');
      expect(clockLabel(8 * 60 + 5), '8:05 AM');
      expect(clockLabel(12 * 60), '12:00 PM');
    });
  });

  group('API shapes', () {
    test('friends carry a streak; profiles a level; views badges', () {
      final f = ApiMap.friend({
        'profile': {'id': 'u2', 'name': 'Ali', 'level': 7},
        'state': 'friends',
        'streak': {'count': 12, 'best': 30, 'today': false, 'atRisk': true, 'mineToday': true, 'theirsToday': false, 'restorable': false, 'lostCount': 0, 'restoreCost': 30},
      });
      expect(f.profile.level, 7);
      expect((f.streak.count, f.streak.best, f.streak.atRisk, f.streak.mineToday, f.streak.restoreCost), (12, 30, true, true, 30));
      expect(ApiMap.friend({'profile': {'id': 'u3'}, 'state': 'requested'}).streak.count, 0);
      final v = ApiMap.profileView({'profile': {'id': 'u2', 'name': 'Ali'}, 'tier': 'matched', 'level': 4, 'badges': ['verified', 'streak_7']});
      expect(v.level, 4);
      expect(v.badges, ['verified', 'streak_7']);
      expect(Badges.info('streak_7').name, 'On fire');
    });

    test('wallet gem goal and free boosts', () {
      final w = ApiMap.wallet({'coins': 10, 'gems': 600, 'gemGoal': 1000, 'freeBoosts': 1});
      expect((w.gemGoal, w.freeBoosts), (1000, 1));
      expect(ApiMap.wallet({'coins': 1}).gemGoal, isNull);
    });

    test('leaderboard, moments feed, progress, recap, game prompts', () {
      final lb = ApiMap.leaderboard({
        'board': 'gems',
        'weekStart': '2026-10-04T19:00:00.000Z',
        'top': [
          {'rank': 1, 'profile': {'id': 'a', 'name': 'Ayesha'}, 'score': 900},
        ],
        'me': {'rank': null, 'score': 0},
      });
      expect(lb.board, Board.gems);
      expect(lb.top.single.profile.name, 'Ayesha');
      expect(lb.myRank, isNull);

      const me = Profile(id: 'me', name: 'Me', age: 20, gender: Gender.other, country: Country('PK', 'Pakistan', ''), avatarUrl: '');
      final feed = ApiMap.momentFeed({
        'mine': [
          {'id': 'm1', 'mediaUrl': 'u', 'caption': '', 'createdAt': '2026-10-06T10:00:00Z', 'expiresAt': '2026-10-07T10:00:00Z', 'seen': false, 'viewsCount': 3},
        ],
        'people': [
          {
            'author': {'id': 'b', 'name': 'Bilal'},
            'moments': [
              {'id': 'x', 'mediaUrl': 'u', 'caption': 'hi', 'createdAt': '2026-10-06T10:00:00Z', 'expiresAt': '2026-10-07T10:00:00Z', 'seen': true},
            ],
            'allSeen': true,
          },
        ],
      }, me);
      expect(feed.first.mine, isTrue);
      expect(feed.first.moments.single.viewsCount, 3);
      expect(feed.last.author.name, 'Bilal');
      expect(feed.last.allSeen, isTrue);

      final p = ProgressView.fromJson({
        'level': 3, 'xp': 200, 'levelXp': 150, 'nextLevelXp': 300, 'weekXp': 40,
        'badges': [
          {'id': 'verified', 'name': 'Verified', 'emoji': '✔️', 'earned': true, 'progress': 1, 'target': 1},
          {'id': 'loved', 'name': 'Loved', 'emoji': '💖', 'earned': false, 'progress': 10, 'target': 50},
        ],
      });
      expect(p.level.xpToNext, 100);
      expect(p.earned.map((b) => b.id), ['verified']);
      expect(p.badges.last.fraction, closeTo(0.2, 1e-9));

      expect(WeeklyRecap.fromJson({'gemsEarned': 0}).isEmpty, isTrue);

      final g = GameRound.fromJson({'matchId': 'm', 'game': 'wyr', 'round': 2, 'prompt': {'text': 'Would you rather…', 'options': ['Tea', 'Coffee']}, 'by': 'partner'})!;
      expect((g.game, g.round, g.byMe), (IcebreakerGame.wyr, 2, false));
      expect(g.options, ['Tea', 'Coffee']);
      final q = GameRound.fromJson({'game': 'questions', 'round': 1, 'prompt': {'text': 'Why?'}, 'by': 'me'})!;
      expect(q.hasOptions, isFalse);
      expect(GameRound.fromJson({'game': 'chess', 'prompt': {}}), isNull);
      expect(IcebreakerGame.thisOrThat.wire, 'this_or_that');
    });

    test('catalog carries the engagement rules', () {
      final before = (Economy.streakRestoreCost, Economy.vibeHourStart, Economy.freeReconnectMinutes);
      CatalogProvider().apply({
        'economy': {'streakRestoreCost': 45, 'vibeHourStart': 1200, 'vibeHourMinutes': 30, 'freeReconnectMinutes': 5, 'xpPerGoodCall': 12, 'maxEngagementPushesPerDay': 2},
      });
      expect((Economy.streakRestoreCost, Economy.vibeHourStart, Economy.vibeHourMinutes, Economy.freeReconnectMinutes, Economy.xpPerGoodCall, Economy.maxEngagementPushesPerDay), (45, 1200, 30, 5, 12, 2));
      Economy.streakRestoreCost = before.$1;
      Economy.vibeHourStart = before.$2;
      Economy.freeReconnectMinutes = before.$3;
      Economy.vibeHourMinutes = 60;
      Economy.xpPerGoodCall = 10;
      Economy.maxEngagementPushesPerDay = 3;
    });
  });

  group('break reminder', () {
    test('counts foreground search/call time, fires at the threshold, resets after 10 min away', () {
      var now = DateTime(2026, 10, 6, 20);
      final r = BreakReminder(clock: () => now)..minutes = 60;
      r.setActive(true);
      now = now.add(const Duration(minutes: 40));
      expect(r.due, isFalse);
      // Idle in the lobby doesn't count.
      r.setActive(false);
      now = now.add(const Duration(minutes: 30));
      r.setActive(true);
      now = now.add(const Duration(minutes: 19));
      expect(r.due, isFalse);
      now = now.add(const Duration(minutes: 1));
      expect(r.due, isTrue);
      r.reset();
      expect(r.due, isFalse);
      // A short trip to the background keeps the count; a long one clears it.
      now = now.add(const Duration(minutes: 50));
      r.setForeground(false);
      now = now.add(const Duration(minutes: 5));
      r.setForeground(true);
      expect(r.vibing, const Duration(minutes: 50));
      r.setForeground(false);
      now = now.add(const Duration(minutes: 10));
      r.setForeground(true);
      expect(r.vibing, Duration.zero);
      r.minutes = null;
      now = now.add(const Duration(hours: 3));
      expect(r.due, isFalse, reason: 'off');
    });
  });

  group('local mocks', () {
    late MockBackend backend;
    late WalletProvider wallet;
    late SocialProvider social;
    late SessionProvider session;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      backend = MockBackend(fast: true);
      wallet = WalletProvider(backend);
      social = SocialProvider(backend, wallet);
      session = SessionProvider(backend);
      await wallet.load();
      await social.load();
      await session.signIn(method: 'email');
    });

    test('engagement: progress, leaderboard with you in it, recap, level-ups', () async {
      final e = EngagementProvider(backend) as LocalEngagementProvider;
      await e.load();
      final p = await e.loadProgress();
      expect(p.badges, hasLength(10));
      expect(p.earned, isNotEmpty);
      final lb = await e.leaderboard(Board.xp);
      expect(lb.top.first.rank, 1);
      expect(lb.top.map((r) => r.score), orderedEquals([...lb.top.map((r) => r.score)]..sort((a, b) => b.compareTo(a))));
      expect(lb.myRank, isNotNull);
      expect((await e.loadRecap())!.isEmpty, isFalse);
      final ups = <int>[];
      final sub = e.levelUps.listen(ups.add);
      e.award(100); // 230 → 330 XP: level 3 → 4
      await Future<void>.delayed(Duration.zero);
      expect(ups, [4]);
      await sub.cancel();
      e.dispose();
    });

    test('moments: feed order, posting, seen, viewers, delete, report', () async {
      final m = MomentsProvider(backend, session);
      await m.load();
      expect(m.people, isNotEmpty);
      expect(m.people.first.allSeen, isFalse, reason: 'unseen first');
      expect(m.people.last.allSeen, isTrue);
      expect(m.mine!.moments, isEmpty);
      await m.post(const [1, 2, 3], caption: '  sunset  ');
      expect(m.mine!.moments.single.caption, 'sunset');
      final id = m.mine!.moments.single.id;
      expect(await m.viewers(id), isNotEmpty);
      final first = m.people.first.moments.first;
      await m.markSeen(first);
      expect(m.people.first.moments.first.seen, isTrue);
      await m.delete(id);
      expect(m.mine!.moments, isEmpty);
      final author = m.people.first.author.id;
      await m.report(m.people.first.moments.first.id, ReportReason.spam);
      expect(m.people.any((g) => g.author.id == author), isFalse, reason: 'reported and blocked');
    });

    test('free boost credits are used before coins', () async {
      wallet.debugSet(wallet.wallet.copyWith(coins: 0, freeBoosts: 1));
      expect(await wallet.boost(), isTrue);
      expect(wallet.freeBoosts, 0);
      expect(wallet.isBoosted, isTrue);
      expect(wallet.coins, 0);
    });

    test('gem goal set and cleared', () async {
      await wallet.setGemGoal(5000);
      expect(wallet.gemGoal, 5000);
      await wallet.setGemGoal(null);
      expect(wallet.gemGoal, isNull);
    });

    test('wellbeing settings save', () async {
      expect(await session.saveWellbeing(const WellbeingSettings(quietHoursStart: 1380, quietHoursEnd: 480, breakReminderMinutes: 90)), isTrue);
      expect(session.wellbeing.quietHoursOn, isTrue);
      expect(session.wellbeing.breakReminderMinutes, 90);
      expect(SessionProvider.deviceTzOffsetMinutes(DateTime(2026)), inInclusiveRange(-720, 840));
    });
  });
}
