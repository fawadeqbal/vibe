// Me: photo, three numbers, name and bio, what's left and recent matches,
// then three shortcuts; ☰ opens Settings and activity, whose rows each push
// their own screen, and Back always steps back exactly one level.
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/config/integrations_config.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/core/theme/vibe_widgets.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/models/partner.dart';
import 'package:vibe_app/providers/catalog_provider.dart';
import 'package:vibe_app/providers/discover_provider.dart';
import 'package:vibe_app/providers/engagement_provider.dart';
import 'package:vibe_app/providers/follows_provider.dart';
import 'package:vibe_app/providers/inbox_provider.dart';
import 'package:vibe_app/providers/match_provider.dart';
import 'package:vibe_app/providers/moments_provider.dart';
import 'package:vibe_app/providers/partner_provider.dart';
import 'package:vibe_app/providers/referrals_provider.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/invite/invite_screen.dart';
import 'package:vibe_app/screens/profile/blocked_people_screen.dart';
import 'package:vibe_app/screens/profile/follow_lists_screen.dart';
import 'package:vibe_app/screens/profile/leaderboard_screen.dart';
import 'package:vibe_app/screens/profile/me_lists.dart';
import 'package:vibe_app/screens/profile/me_overview.dart';
import 'package:vibe_app/screens/profile/me_settings.dart';
import 'package:vibe_app/screens/store/cashout_screen.dart';
import 'package:vibe_app/screens/partner/partner_screen.dart';
import 'package:vibe_app/screens/profile/me_sections.dart';
import 'package:vibe_app/screens/profile/profile_screen.dart';
import 'package:vibe_app/screens/store/vip_screen.dart';
import 'package:vibe_app/screens/store/wallet_screen.dart';
import 'package:vibe_app/services/app_services.dart';
import 'package:vibe_app/services/invite/invite_capture.dart';
import 'package:vibe_app/services/share/share_service.dart';

/// The offline demo providers, wired like `main.dart` without a server.
class MeHarness {
  late MockBackend backend;
  late WalletProvider wallet;
  late SessionProvider session;
  late SocialProvider social;
  late MatchProvider match;
  late FollowsProvider follows;
  late EngagementProvider engagement;
  late MomentsProvider moments;
  late ReferralsProvider referrals;
  late PartnerProvider partner;
  late DiscoverProvider discover;
  late InviteCapture invites;
  final inbox = InboxProvider();
  final catalog = CatalogProvider();
  final share = RecordingShare();

  Future<void> init({PartnerStatus partnerStatus = PartnerStatus.active, bool history = false, int calls = 5}) async {
    SharedPreferences.setMockInitialValues({});
    backend = MockBackend(fast: true, random: Random(3));
    invites = InviteCapture(store: MemoryInviteStore(checked: true));
    session = SessionProvider(backend, invites: invites);
    wallet = WalletProvider(backend);
    social = SocialProvider(backend, wallet);
    match = MatchProvider(backend, wallet, social, session, cameraEnabled: false);
    follows = FollowsProvider(backend, social);
    engagement = EngagementProvider(backend);
    moments = MomentsProvider(backend, session);
    referrals = ReferralsProvider(backend);
    partner = PartnerProvider(verified: () => session.me?.verified == true, status: partnerStatus);
    discover = DiscoverProvider(social, wallet);
    await session.signIn(method: 'email');
    await session.saveProfile(session.me!.copyWith(name: 'Sana Malik', age: 23, avatarUrl: '', bio: 'Coffee first, then calls.', interests: const ['Music', 'Travel', 'Books']));
    if (history) {
      // A few past calls (no photos: tests have no network).
      final now = DateTime.now();
      await backend.saveMatches([
        for (final i in List.generate(calls, (i) => i))
          if (backend.people[i % backend.people.length] case final p)
          MatchRecord(
            id: 'm$i',
            partner: p.copyWith(avatarUrl: ''),
            startedAt: now.subtract(Duration(hours: 3 + i * 20)),
            endedAt: now.subtract(Duration(hours: 3 + i * 20)).add(Duration(seconds: 70 + i * 95)),
            liked: i.isEven,
            likedMe: i == 1,
            giftsReceived: i == 2 ? 2 : 0,
          ),
      ]);
    }
    await wallet.load();
    await social.load();
    await follows.load();
    await match.load();
    await engagement.load();
    // What the app loads at start (app.dart), so the partner row knows the status.
    await partner.load();
  }

  Widget app(Widget home) => MultiProvider(
        providers: [
          Provider<MockBackend>.value(value: backend),
          Provider<AppServices>.value(value: AppServices(config: const IntegrationsConfig(), share: share)),
          ChangeNotifierProvider.value(value: session),
          ChangeNotifierProvider<WalletProvider>.value(value: wallet),
          ChangeNotifierProvider<SocialProvider>.value(value: social),
          ChangeNotifierProvider<FollowsProvider>.value(value: follows),
          ChangeNotifierProvider<MatchProvider>.value(value: match),
          ChangeNotifierProvider<InboxProvider>.value(value: inbox),
          ChangeNotifierProvider.value(value: catalog),
          ChangeNotifierProvider<EngagementProvider>.value(value: engagement),
          ChangeNotifierProvider<MomentsProvider>.value(value: moments),
          ChangeNotifierProvider<ReferralsProvider>.value(value: referrals),
          ChangeNotifierProvider<PartnerProvider>.value(value: partner),
          ChangeNotifierProvider<DiscoverProvider>.value(value: discover),
          ChangeNotifierProvider.value(value: invites),
        ],
        child: MaterialApp(theme: V.theme(), home: home),
      );
}

/// A 412×892 phone with Me on it.
Future<MeHarness> pumpMe(WidgetTester t, {PartnerStatus partnerStatus = PartnerStatus.active, bool history = false, int calls = 5}) async {
  t.view.physicalSize = const Size(412 * 3, 892 * 3);
  t.view.devicePixelRatio = 3;
  addTearDown(t.view.reset);
  final h = MeHarness();
  // Real async: the demo engagement provider arms an hours-long Vibe Hour
  // timer that fake time would report as pending.
  await t.runAsync(() => h.init(partnerStatus: partnerStatus, history: history, calls: calls));
  await t.pumpWidget(h.app(ProfileScreen(onOpenStore: () {})));
  await t.pump();
  await t.pump(const Duration(milliseconds: 50));
  return h;
}

/// Me, where the settings groups sit under your matches.
Future<MeHarness> pumpSettings(WidgetTester t, {PartnerStatus partnerStatus = PartnerStatus.active, bool history = false}) async {
  final h = await pumpMe(t, partnerStatus: partnerStatus, history: history);
  expect(find.byType(SettingsButtons), findsOneWidget);
  return h;
}

/// Me → one of the five settings group buttons.
Future<void> openGroup(WidgetTester t, String group) async {
  await scrollToRow(t, group);
  await t.tap(find.text(group).last);
  await t.pumpAndSettle();
  expect(find.descendant(of: find.byType(AppBar), matching: find.text(group)), findsOneWidget, reason: group);
}

Future<void> scrollToRow(WidgetTester t, String title) async {
  await t.scrollUntilVisible(find.text(title), 200, scrollable: find.descendant(of: find.byType(ListView), matching: find.byType(Scrollable)).first);
  await t.pump();
}

/// Taps the row [title], checks the pushed screen, and Back lands on [backTo] again.
Future<void> opens(WidgetTester t, String title, Type screen, {String? appBar, Type backTo = SettingsGroupScreen}) async {
  await scrollToRow(t, title);
  await t.tap(find.text(title).last);
  await t.pumpAndSettle();
  expect(find.byType(screen), findsOneWidget, reason: '$title → $screen');
  if (appBar != null) expect(find.descendant(of: find.byType(AppBar), matching: find.text(appBar)), findsOneWidget, reason: '$title → "$appBar"');
  await t.pageBack();
  await t.pumpAndSettle();
  expect(find.byType(screen), findsNothing);
  expect(find.byType(backTo), findsOneWidget, reason: 'Back from $title goes one level up');
}

void main() {
  testWidgets('Me: header, numbers, actions, settings groups and Log out', (t) async {
    await pumpMe(t);
    expect(find.text('Me'), findsOneWidget);
    expect(find.text('Sana Malik, 23'), findsOneWidget);
    for (final label in ['Friends', 'Followers', 'Likes', 'Edit profile', 'Share profile', 'Not verified']) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
    expect(find.byTooltip('Settings and activity'), findsNothing);
    // No photo yet: the first card asks for one, verification comes after.
    expect(find.text('Add a photo'), findsOneWidget);
    for (final title in ['Account', 'Your activity', 'Privacy & safety', 'Wallet & invites', 'Help & about', 'Log out and reset the demo']) {
      await scrollToRow(t, title);
      expect(find.text(title), findsOneWidget, reason: title);
    }
    // The rows themselves are one level down; the old shortcuts are gone.
    expect(find.text('Account & sign-in'), findsNothing);
    expect(find.text('Get VIP'), findsNothing);
  });

  testWidgets('the eye shows the card others see', (t) async {
    await pumpMe(t);
    await t.tap(find.bySemanticsLabel('See how others see you').last);
    await t.pumpAndSettle();
    expect(find.byType(ProfileCard), findsOneWidget);
    expect(find.text('How others see you'), findsOneWidget);
  });

  testWidgets('each group opens its page from Me and comes back to Me', (t) async {
    await pumpMe(t);
    for (final g in ['Account', 'Your activity', 'Privacy & safety', 'Wallet & invites', 'Help & about']) {
      await opens(t, g, SettingsGroupScreen, appBar: g, backTo: ProfileScreen);
    }
  });

  testWidgets('settings groups: every row inside them', (t) async {
    await pumpSettings(t);
    const groups = <String, List<String>>{
      'Account': ['Account & sign-in', 'Devices', 'Notifications', 'Time & wellbeing', 'Data saver'],
      'Your activity': ['Recent matches', 'Followers & friends', 'Progress & badges', 'Leaderboard'],
      'Privacy & safety': ['Get verified', 'Private account', 'Show my numbers', 'Blur the first 3 seconds', 'Show me in Discover', 'Blocked'],
      'Wallet & invites': ['Wallet', 'Get VIP', 'Cash out gems', 'Invite friends', 'Creator partner program'],
      'Help & about': ['Help & safety centre', 'Terms & policies'],
    };
    for (final MapEntry(key: g, value: rows) in groups.entries) {
      await openGroup(t, g);
      for (final title in rows) {
        await scrollToRow(t, title);
        expect(find.text(title), findsOneWidget, reason: '$g → $title');
      }
      if (g == 'Wallet & invites') expect(find.text('Your stats, links and payouts'), findsOneWidget);
      await t.pageBack();
      await t.pumpAndSettle();
      expect(find.byType(ProfileScreen), findsOneWidget);
    }
  });

  testWidgets('"Show my numbers" is the opposite of hide stats', (t) async {
    final h = await pumpSettings(t);
    await openGroup(t, 'Privacy & safety');
    await scrollToRow(t, 'Show my numbers');
    final before = h.follows.settings.hideStats;
    final row = find.ancestor(of: find.text('Show my numbers'), matching: find.byType(GroupRow));
    await t.tap(find.descendant(of: row, matching: find.byType(Switch)));
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await t.pumpAndSettle();
    expect(h.follows.settings.hideStats, !before);
  });

  // One test per row, so a broken screen names itself; Back returns to the menu.
  const rows = <(String, String, Type, String?)>[
    ('Account', 'Account & sign-in', AccountSectionScreen, 'Account & sign-in'),
    ('Account', 'Notifications', NotificationsSectionScreen, 'Notifications'),
    ('Account', 'Time & wellbeing', WellbeingSectionScreen, 'Time & wellbeing'),
    ('Your activity', 'Recent matches', RecentMatchesScreen, 'Matches'),
    ('Your activity', 'Followers & friends', FollowListsScreen, null),
    ('Your activity', 'Progress & badges', ProgressSectionScreen, 'Progress & badges'),
    ('Your activity', 'Leaderboard', LeaderboardScreen, null),
    ('Privacy & safety', 'Blocked', BlockedPeopleScreen, null),
    ('Wallet & invites', 'Wallet', WalletScreen, 'Wallet'),
    ('Wallet & invites', 'Get VIP', VipScreen, null),
    ('Wallet & invites', 'Cash out gems', CashoutScreen, null),
    ('Wallet & invites', 'Invite friends', InviteScreen, 'Invite friends'),
    ('Help & about', 'Help & safety centre', HelpSectionScreen, 'Help & safety centre'),
    ('Help & about', 'Terms & policies', LegalSectionScreen, 'Terms & policies'),
  ];
  for (final (group, title, screen, appBar) in rows) {
    testWidgets('$group → "$title" pushes $screen', (t) async {
      await pumpSettings(t);
      await openGroup(t, group);
      await opens(t, title, screen, appBar: appBar);
    });
  }

  testWidgets('account page keeps log out and delete in the danger zone', (t) async {
    await pumpSettings(t);
    await openGroup(t, 'Account');
    await scrollToRow(t, 'Account & sign-in');
    await t.tap(find.text('Account & sign-in'));
    await t.pumpAndSettle();
    expect(find.text('DANGER ZONE'), findsOneWidget);
    expect(find.textContaining('Log out'), findsOneWidget);
  });

  testWidgets('the partner row opens the native partner screen', (t) async {
    final h = await pumpSettings(t);
    await openGroup(t, 'Wallet & invites');
    await opens(t, 'Creator partner program', PartnerScreen, appBar: 'Creator partners');
    // Opened once more: the active dashboard is there.
    await scrollToRow(t, 'Creator partner program');
    await t.tap(find.text('Creator partner program'));
    await t.pumpAndSettle();
    expect(h.partner.status, PartnerStatus.active);
    expect(find.text('YOUR LINK'), findsOneWidget);
    expect(find.text('EARNINGS'), findsOneWidget);
  });

  testWidgets('recent matches: a row of faces on Me, counted in the menu, listed on their screen', (t) async {
    await pumpMe(t, history: true);
    await scrollToRow(t, 'See all');
    expect(find.byType(RecentMatches), findsOneWidget);
    expect(find.descendant(of: find.byType(RecentMatches), matching: find.byType(VAvatar)), findsNWidgets(5));
    await t.tap(find.text('See all'));
    await t.pumpAndSettle();
    expect(find.byType(RecentMatchesScreen), findsOneWidget);
    expect(find.byType(VAvatar), findsNWidgets(5));
    await t.pageBack();
    await t.pumpAndSettle();
    await openGroup(t, 'Your activity');
    expect(find.text('5 recent calls'), findsOneWidget);
  });

  testWidgets('the partner row before applying', (t) async {
    await pumpSettings(t, partnerStatus: PartnerStatus.none);
    await openGroup(t, 'Wallet & invites');
    await scrollToRow(t, 'Creator partner program');
    expect(find.text('Earn money for the people you bring'), findsOneWidget);
  });

  testWidgets('your three numbers open their lists, and Back returns to Me', (t) async {
    await pumpMe(t, history: true);
    await opens(t, 'Friends', FriendsListScreen, appBar: 'Friends', backTo: ProfileScreen);
    await opens(t, 'Followers', FollowListsScreen, backTo: ProfileScreen);
    await opens(t, 'Likes', LikesScreen, appBar: 'Likes', backTo: ProfileScreen);
  });

  testWidgets('likes: everyone who liked you on a call', (t) async {
    await pumpMe(t, history: true);
    await t.tap(find.text('Likes'));
    await t.pumpAndSettle();
    // In the demo history only the second call liked you.
    expect(find.descendant(of: find.byType(LikesScreen), matching: find.byType(PersonRow)), findsOneWidget);
    expect(find.textContaining('Liked you'), findsOneWidget);
  });

  testWidgets('friends: each one has a Message button', (t) async {
    final h = await pumpMe(t);
    await t.tap(find.text('Friends'));
    await t.pumpAndSettle();
    final n = h.social.friends.length;
    expect(find.widgetWithText(GhostButton, 'Message'), n == 0 ? findsNothing : findsNWidgets(n));
  });

  testWidgets('matches load the next page as you scroll', (t) async {
    final h = await pumpMe(t, history: true, calls: 45);
    await scrollToRow(t, 'See all');
    await t.tap(find.text('See all'));
    await t.pumpAndSettle();
    expect(find.byType(RecentMatchesScreen), findsOneWidget);
    final list = find.descendant(of: find.byType(RecentMatchesScreen), matching: find.byType(Scrollable)).first;
    for (var i = 0; i < 12; i++) {
      await t.drag(list, const Offset(0, -900));
      await t.pumpAndSettle();
    }
    // 45 calls in pages of 30: the oldest arrived without a "load more" tap.
    expect(h.match.history, hasLength(45));
    expect(find.byKey(ValueKey(h.match.history.last.id)), findsOneWidget);
  });
}
