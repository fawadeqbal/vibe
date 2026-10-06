// ignore_for_file: invalid_use_of_visible_for_testing_member
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/engagement_provider.dart';
import 'package:vibe_app/providers/follows_provider.dart';
import 'package:vibe_app/providers/inbox_provider.dart';
import 'package:vibe_app/providers/match_provider.dart';
import 'package:vibe_app/providers/moments_provider.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/match/icebreakers.dart';
import 'package:vibe_app/screens/match/lobby_extras.dart';
import 'package:vibe_app/screens/match/match_screen.dart';
import 'package:vibe_app/screens/profile/leaderboard_screen.dart';
import 'package:vibe_app/screens/profile/progress.dart';
import 'package:vibe_app/screens/profile/wellbeing_section.dart';
import 'package:vibe_app/screens/social/chats_screen.dart';
import 'package:vibe_app/screens/social/moments.dart';
import 'package:vibe_app/screens/social/streaks.dart';
import 'package:vibe_app/screens/store/wallet_cards.dart';
import 'package:vibe_app/services/app_services.dart';

Profile _p(String id, String name) => Profile(id: id, name: name, age: 24, gender: Gender.female, country: const Country('PK', 'Pakistan', ''), avatarUrl: '');

/// Every provider on the offline mocks, like the demo build.
class H {
  late MockBackend backend;
  late WalletProvider wallet;
  late SocialProvider social;
  late SessionProvider session;
  late MatchProvider match;
  late FollowsProvider follows;
  late InboxProvider inbox;
  late EngagementProvider engagement;
  late MomentsProvider moments;
  DateTime now = DateTime.utc(2026, 10, 6, 16, 20); // 21:20 in Pakistan: Vibe Hour

  Future<void> init({List<Friend> friends = const []}) async {
    SharedPreferences.setMockInitialValues({});
    backend = MockBackend(fast: true, random: Random(3));
    if (friends.isNotEmpty) await backend.saveFriends(friends);
    wallet = WalletProvider(backend);
    social = SocialProvider(backend, wallet);
    session = SessionProvider(backend);
    match = MatchProvider(backend, wallet, social, session, cameraEnabled: false);
    follows = FollowsProvider(backend, social);
    inbox = InboxProvider();
    engagement = EngagementProvider(backend, clock: () => now);
    moments = MomentsProvider(backend, session);
    await wallet.load();
    await social.load();
    await session.signIn(method: 'email');
    await session.saveProfile(session.me!.copyWith(name: 'Sana', age: 23, avatarUrl: ''));
  }

  Widget app(Widget home) => MultiProvider(
        providers: [
          Provider<MockBackend>.value(value: backend),
          Provider<AppServices>.value(value: AppServices.none()),
          ChangeNotifierProvider.value(value: session),
          ChangeNotifierProvider.value(value: wallet),
          ChangeNotifierProvider.value(value: social),
          ChangeNotifierProvider.value(value: match),
          ChangeNotifierProvider.value(value: inbox),
          ChangeNotifierProvider.value(value: follows),
          ChangeNotifierProvider.value(value: engagement),
          ChangeNotifierProvider.value(value: moments),
        ],
        child: MaterialApp(theme: V.theme(), home: home),
      );

  void dispose() {
    match.stop();
    match.dismissEnded();
    engagement.dispose();
  }
}

Future<H> pump(WidgetTester t, Widget Function(H h) screen, {List<Friend> friends = const []}) async {
  t.view.physicalSize = const Size(412 * 3, 892 * 3);
  t.view.devicePixelRatio = 3;
  addTearDown(t.view.reset);
  final h = H();
  await h.init(friends: friends);
  await t.pumpWidget(h.app(screen(h)));
  await t.pump();
  return h;
}

/// pumpAndSettle for screens with something that never settles (a pulsing
/// streak chip, a ticking countdown).
Future<void> settle(WidgetTester t) async {
  for (var i = 0; i < 6; i++) {
    await t.pump(const Duration(milliseconds: 250));
  }
}

/// Drops the tree and lets every pending timer run out.
Future<void> finish(WidgetTester t, H h) async {
  h.dispose();
  await t.pumpWidget(const SizedBox());
  await t.pump(const Duration(minutes: 5));
}

void main() {
  testWidgets('streak chip: grey until today counts, orange once it does, amber when it ends tonight', (t) async {
    final h = await pump(
      t,
      (_) => const Scaffold(
        body: Column(children: [
          StreakChip(key: ValueKey('grey'), streak: StreakView(count: 2, mineToday: true)),
          StreakChip(key: ValueKey('orange'), streak: StreakView(count: 12, today: true)),
          StreakChip(key: ValueKey('amber'), streak: StreakView(count: 5, atRisk: true)),
          StreakChip(key: ValueKey('none'), streak: StreakView.none),
        ]),
      ),
    );
    Color flameOf(String key) => t.widget<Icon>(find.descendant(of: find.byKey(ValueKey(key)), matching: find.byIcon(Icons.local_fire_department_rounded))).color!;
    expect(flameOf('grey'), V.muted);
    expect(flameOf('orange'), V.flame);
    expect(flameOf('amber'), V.warn);
    expect(find.text('5 · ends tonight'), findsOneWidget);
    expect(find.text('12'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const ValueKey('none')), matching: find.byType(Icon)), findsNothing);
    expect(find.bySemanticsLabel('5-day streak, ends tonight'), findsOneWidget);
    await finish(t, h);
  });

  testWidgets('chats: streak chips on rows; a broken streak restores for coins', (t) async {
    final now = DateTime.now();
    final h = await pump(
      t,
      (h) => ChatsScreen(onFindPeople: () {}),
      friends: [
        Friend(profile: _p('f1', 'Priya'), state: FriendState.friends, since: now, lastMessage: 'hey', streak: const StreakView(count: 12, best: 12, today: true)),
        Friend(profile: _p('f2', 'Omar'), state: FriendState.friends, since: now, lastMessage: 'ok', streak: const StreakView(best: 9, restorable: true, lostCount: 9, restoreCost: 30)),
      ],
    );
    expect(find.text('12'), findsOneWidget);
    expect(find.text('Streak lost · '), findsOneWidget);
    expect(h.wallet.coins, Economy.welcomeCoins); // 30
    await t.tap(find.text('Restore '));
    await t.pumpAndSettle();
    expect(find.text('Restore your 9-day streak?'), findsOneWidget);
    await t.tap(find.text('Restore · ${Economy.streakRestoreCost}'));
    await settle(t);
    expect(h.wallet.coins, Economy.welcomeCoins - Economy.streakRestoreCost);
    expect(h.social.friend('f2')!.streak.count, 9);
    expect(h.social.friend('f2')!.streak.atRisk, isTrue, reason: 'back, but talk today');
    expect(find.text('9 · ends tonight'), findsOneWidget);
    expect(find.textContaining('Streak restored'), findsOneWidget);
    await finish(t, h);
  });

  testWidgets('restore without the coins offers the store', (t) async {
    final h = await pump(
      t,
      (h) => ChatsScreen(onFindPeople: () {}),
      friends: [Friend(profile: _p('f2', 'Omar'), state: FriendState.friends, since: DateTime.now(), streak: const StreakView(best: 9, restorable: true, lostCount: 9, restoreCost: 30))],
    );
    h.wallet.debugSet(h.wallet.wallet.copyWith(coins: 3));
    await t.pump();
    await t.tap(find.text('Restore '));
    await t.pumpAndSettle();
    await t.tap(find.text('Restore · 30'));
    await t.pumpAndSettle();
    expect(find.text('Not enough coins'), findsOneWidget);
    expect(h.social.friend('f2')!.streak.restorable, isTrue);
    await t.tap(find.text('Not now'));
    await t.pumpAndSettle();
    await finish(t, h);
  });

  testWidgets('local streak: both of you message today → it counts', (t) async {
    final h = await pump(t, (h) => const SizedBox(), friends: [Friend(profile: _p('f1', 'Priya'), state: FriendState.friends, since: DateTime.now())]);
    await h.social.sendMessage('f1', 'hi');
    expect(h.social.friend('f1')!.streak.mineToday, isTrue);
    expect(h.social.friend('f1')!.streak.count, 0);
    await t.pump(const Duration(seconds: 8)); // the mock replies
    final s = h.social.friend('f1')!.streak;
    expect((s.count, s.today, s.theirsToday), (1, true, true));
    await finish(t, h);
  });

  testWidgets('icebreaker: Play → pick a game → answer → both picks revealed → next → close', (t) async {
    final h = await pump(t, (h) => MatchScreen(onOpenStore: () {}, onOpenChats: () {}));
    await h.match.start();
    await t.pump();
    expect(h.match.isConnected, isTrue);
    await t.tap(find.text('Play'));
    await t.pumpAndSettle();
    expect(find.text('Break the '), findsNothing); // Headline is rich text
    expect(find.textContaining('Break the', findRichText: true), findsOneWidget);
    await t.tap(find.text('This or that'));
    await t.pumpAndSettle();
    expect(find.text('This or that?'), findsOneWidget);
    final round = h.match.game!;
    expect(round.hasOptions, isTrue);
    await t.tap(find.text(round.options!.first));
    await t.pump();
    expect(h.match.game!.iAnswered, isTrue);
    await t.pump(const Duration(seconds: 4)); // the partner answers
    expect(h.match.game!.revealed, isTrue);
    expect(find.textContaining(RegExp(r'You both picked|Different picks')), findsOneWidget);
    expect(find.text('You'), findsOneWidget);
    await t.tap(find.descendant(of: find.byType(GameCard), matching: find.text('Next')));
    await t.pump();
    expect(h.match.game!.round, 2);
    expect(h.match.game!.iAnswered, isFalse);
    await t.tap(find.bySemanticsLabel('Close game'));
    await t.pump();
    expect(h.match.game, isNull);
    expect(find.text('This or that?'), findsNothing);
    await finish(t, h);
  });

  testWidgets("mutual like: \"It's a vibe!\" with Add friend, then the recap line and a free reconnect", (t) async {
    final h = await pump(t, (h) => MatchScreen(onOpenStore: () {}, onOpenChats: () {}));
    await h.match.start();
    await t.pump();
    h.match.like();
    await t.pump();
    expect(find.textContaining("It's a", findRichText: true), findsNothing);
    (h.match as LocalMatchProvider).debugPartnerAction(PartnerAction.like);
    await t.pump();
    await t.pump();
    expect(find.textContaining("It's a", findRichText: true), findsOneWidget);
    expect(find.text('Add friend'), findsOneWidget);
    await t.tap(find.text('Add friend'));
    await t.pump();
    await t.pump();
    expect(h.match.friendState, FriendState.requested);
    expect(find.text('Add friend'), findsNothing);
    h.match.stop();
    await t.pump();
    expect(find.text('You liked each other 💞'), findsOneWidget);
    expect(h.match.reconnectFree, isTrue);
    expect(find.text('Free for '), findsOneWidget);
    final coins = h.wallet.coins;
    final reconnecting = h.match.reconnect();
    await t.pump(const Duration(seconds: 2)); // the mock rings them back
    expect(await reconnecting, isTrue);
    expect(h.wallet.coins, coins, reason: 'free inside the window');
    expect(h.match.isConnected, isTrue);
    await finish(t, h);
  });

  testWidgets('celebration only once per call and gone after a few seconds', (t) async {
    final h = await pump(t, (h) => MatchScreen(onOpenStore: () {}, onOpenChats: () {}));
    await h.match.start();
    await t.pump();
    (h.match as LocalMatchProvider).debugPartnerAction(PartnerAction.like);
    h.match.like();
    await t.pump();
    await t.pump();
    expect(find.textContaining("It's a", findRichText: true), findsOneWidget);
    await t.pump(const Duration(seconds: 4));
    expect(find.textContaining("It's a", findRichText: true), findsNothing);
    expect(h.match.mutualSeq, 1);
    await finish(t, h);
  });

  testWidgets('progress card: level, XP to next, badges sheet', (t) async {
    final h = await pump(t, (h) => const Scaffold(body: SingleChildScrollView(child: ProgressCard())));
    await h.engagement.load();
    await t.pumpAndSettle();
    expect(find.text('Level 3'), findsOneWidget);
    expect(find.text('70 XP to Level 4'), findsOneWidget);
    expect(find.text("This week's top"), findsOneWidget);
    expect(find.text('You earned 85 XP this week'), findsOneWidget);
    await t.tap(find.text('See all'));
    await t.pumpAndSettle();
    expect(find.text('Badges · 2/10'), findsOneWidget);
    expect(find.text('Night owl'), findsOneWidget);
    await finish(t, h);
  });

  testWidgets('leaderboard: podium, list, your row; tabs switch boards', (t) async {
    final h = await pump(t, (h) => const LeaderboardScreen());
    await t.pumpAndSettle();
    final people = h.backend.people;
    expect(find.text('Top talkers'), findsOneWidget);
    expect(find.text(people[0].name), findsWidgets); // #1 on the podium
    expect(find.text('#128'), findsOneWidget);
    expect(find.text('85 XP'), findsWidgets);
    await t.drag(find.byType(ListView), const Offset(0, -3000));
    await t.pumpAndSettle();
    expect(find.textContaining('Resets Monday'), findsOneWidget);
    await t.tap(find.text('Most gifted'));
    await t.pumpAndSettle();
    expect(find.text('Not ranked yet this week'), findsOneWidget);
    await finish(t, h);
  });

  testWidgets('moments bar: your moment first, then people; the viewer marks seen and closes at the end', (t) async {
    final h = await pump(t, (h) => const Scaffold(body: Column(children: [MomentsBar()])));
    await h.moments.load();
    await t.pump();
    expect(find.text('Your moment'), findsOneWidget);
    final first = h.moments.people.first;
    expect(first.allSeen, isFalse);
    expect(find.text(first.author.name), findsOneWidget);
    await t.tap(find.text(first.author.name));
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
    expect(find.byType(MomentViewerScreen), findsOneWidget);
    expect(find.text(first.moments.first.caption.isEmpty ? first.author.name : first.moments.first.caption), findsWidgets);
    expect(h.moments.people.firstWhere((g) => g.author.id == first.author.id).moments.first.seen, isTrue);
    await t.tap(find.byTooltip('Close'));
    await t.pumpAndSettle();
    expect(find.byType(MomentViewerScreen), findsNothing);
    await finish(t, h);
  });

  testWidgets('moments: post one (no picker on this device → stock photo), then see views', (t) async {
    final h = await pump(t, (h) => const Scaffold(body: Column(children: [MomentsBar()])));
    await h.moments.load();
    await t.pump();
    await t.tap(find.text('Your moment'));
    await t.pumpAndSettle();
    expect(find.textContaining('Share a', findRichText: true), findsOneWidget);
    await t.enterText(find.byType(TextField), 'chai time');
    await t.tap(find.text('Post'));
    await t.pumpAndSettle();
    expect(h.moments.mine!.moments.single.caption, 'chai time');
    await t.pump(const Duration(seconds: 3)); // the "posted" toast goes
    await t.tap(find.text('Your moment'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
    expect(find.text('chai time'), findsOneWidget);
    expect(find.text('3 views'), findsOneWidget);
    await t.tap(find.text('3 views'));
    await t.pumpAndSettle();
    expect(find.text('Seen by 3'), findsOneWidget);
    await finish(t, h);
  });

  testWidgets('wellbeing: quiet hours switch with times, break reminder choice', (t) async {
    final h = await pump(t, (h) => const Scaffold(body: SingleChildScrollView(child: WellbeingSection())));
    expect(find.text('From'), findsNothing);
    await t.tap(find.byType(Switch));
    await t.pumpAndSettle();
    expect(h.session.wellbeing.quietHoursOn, isTrue);
    expect(find.text('11:00 PM'), findsOneWidget);
    expect(find.text('8:00 AM'), findsOneWidget);
    await t.tap(find.bySemanticsLabel('Break reminder after 60 minutes'));
    await t.pumpAndSettle();
    expect(h.session.wellbeing.breakReminderMinutes, 60);
    expect(h.session.wellbeing.quietHoursOn, isTrue, reason: 'kept');
    await t.tap(find.bySemanticsLabel('Break reminder off'));
    await t.pumpAndSettle();
    expect(h.session.wellbeing.breakReminderMinutes, isNull);
    await t.tap(find.byType(Switch));
    await t.pumpAndSettle();
    expect(h.session.wellbeing.quietHoursOn, isFalse);
    await finish(t, h);
  });

  testWidgets('Vibe Hour banner counts down while it runs, and says when it starts', (t) async {
    final h = await pump(t, (h) => const Scaffold(body: Center(child: VibeHourBanner())));
    await h.engagement.load();
    await t.pump();
    expect(find.text('Vibe Hour · free filters · '), findsOneWidget);
    expect(find.text('40:00'), findsOneWidget); // 21:20 → ends 22:00
    h.now = h.now.add(const Duration(seconds: 1));
    await t.pump(const Duration(seconds: 1));
    expect(find.text('39:59'), findsOneWidget);
    // An hour and a half before the next one.
    h.now = DateTime.utc(2026, 10, 7, 14, 30);
    await h.engagement.load();
    await t.pump(const Duration(seconds: 1));
    final starts = h.engagement.vibeHour.startsAt!;
    expect(find.text('Vibe Hour starts at ${clockLabel(starts.hour * 60 + starts.minute)} · free filters'), findsOneWidget);
    // Far away: nothing.
    h.now = DateTime.utc(2026, 10, 7, 5);
    await h.engagement.load();
    await t.pump(const Duration(seconds: 1));
    expect(find.textContaining('Vibe Hour'), findsNothing);
    await finish(t, h);
  });

  testWidgets('friends online row: faces and a count, hidden when nobody is on', (t) async {
    final now = DateTime.now();
    final h = await pump(
      t,
      (h) => const Scaffold(body: Center(child: FriendsOnlineRow())),
      friends: [
        Friend(profile: _p('a', 'Ali'), state: FriendState.friends, since: now, online: true),
        Friend(profile: _p('b', 'Bea'), state: FriendState.friends, since: now, online: true),
        Friend(profile: _p('c', 'Cal'), state: FriendState.friends, since: now),
      ],
    );
    expect(find.text('2 friends online'), findsOneWidget);
    expect(find.bySemanticsLabel('Chat with Ali'), findsOneWidget);
    await h.social.remove('a');
    await h.social.remove('b');
    await t.pump();
    expect(find.textContaining('online'), findsNothing);
    await finish(t, h);
  });

  testWidgets('gem goal: set one, see the bar', (t) async {
    final h = await pump(t, (h) => const Scaffold(body: GemGoalCard()));
    h.wallet.debugSet(h.wallet.wallet.copyWith(gems: 1250));
    await t.pump();
    await t.tap(find.text('Set a goal'));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField), '50');
    await t.tap(find.text('Save'));
    await t.pumpAndSettle();
    expect(find.textContaining('Between 100'), findsOneWidget);
    await t.enterText(find.byType(TextField), '5000');
    await t.tap(find.text('Save'));
    await t.pumpAndSettle();
    expect(h.wallet.gemGoal, 5000);
    expect(find.text('1,250 / 5,000'), findsOneWidget);
    expect(find.text('3,750 to go'), findsOneWidget);
    await finish(t, h);
  });

  testWidgets('lobby: Vibe Hour makes filters free, a free boost shows as such, trophy opens the leaderboard', (t) async {
    final h = await pump(t, (h) => MatchScreen(onOpenStore: () {}, onOpenChats: () {}));
    h.match.setFilters(const MatchFilters(gender: GenderFilter.women));
    h.wallet.debugSet(h.wallet.wallet.copyWith(freeBoosts: 1));
    await h.engagement.load();
    await t.pump();
    expect(find.text('Free'), findsNWidgets(2));
    expect(h.match.filterCost, 0);
    expect(find.text('Free boost'), findsOneWidget);
    await t.tap(find.byTooltip("This week's top"));
    await t.pumpAndSettle();
    expect(find.byType(LeaderboardScreen), findsOneWidget);
    await finish(t, h);
  });
}
