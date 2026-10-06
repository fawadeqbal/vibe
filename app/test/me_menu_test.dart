// Me: the profile card and numbers, then one menu row per area; each row
// pushes its own screen (me_sections.dart, wallet, VIP, invite, partner).
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
  late InviteCapture invites;
  final inbox = InboxProvider();
  final catalog = CatalogProvider();
  final share = RecordingShare();

  Future<void> init({PartnerStatus partnerStatus = PartnerStatus.active, bool history = false}) async {
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
    await session.signIn(method: 'email');
    await session.saveProfile(session.me!.copyWith(name: 'Sana Malik', age: 23, avatarUrl: '', bio: 'Coffee first, then calls.', interests: const ['Music', 'Travel', 'Books']));
    if (history) {
      // A few past calls (no photos: tests have no network).
      final now = DateTime.now();
      await backend.saveMatches([
        for (final (i, p) in backend.people.take(5).indexed)
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
          ChangeNotifierProvider.value(value: invites),
        ],
        child: MaterialApp(theme: V.theme(), home: home),
      );
}

/// A 412×892 phone with Me on it.
Future<MeHarness> pumpMe(WidgetTester t, {PartnerStatus partnerStatus = PartnerStatus.active, bool history = false}) async {
  t.view.physicalSize = const Size(412 * 3, 892 * 3);
  t.view.devicePixelRatio = 3;
  addTearDown(t.view.reset);
  final h = MeHarness();
  // Real async: the demo engagement provider arms an hours-long Vibe Hour
  // timer that fake time would report as pending.
  await t.runAsync(() => h.init(partnerStatus: partnerStatus, history: history));
  await t.pumpWidget(h.app(ProfileScreen(onOpenStore: () {})));
  await t.pump();
  await t.pump(const Duration(milliseconds: 50));
  return h;
}

Future<void> scrollToRow(WidgetTester t, String title) async {
  await t.scrollUntilVisible(find.text(title), 200, scrollable: find.byType(Scrollable).first);
  await t.pump();
}

/// Taps the row [title], checks the pushed screen, and comes back to Me.
Future<void> opens(WidgetTester t, String title, Type screen, {String? appBar}) async {
  await scrollToRow(t, title);
  await t.tap(find.text(title));
  await t.pumpAndSettle();
  expect(find.byType(screen), findsOneWidget, reason: '$title → $screen');
  if (appBar != null) expect(find.descendant(of: find.byType(AppBar), matching: find.text(appBar)), findsOneWidget, reason: '$title → "$appBar"');
  await t.pageBack();
  await t.pumpAndSettle();
  expect(find.byType(screen), findsNothing);
}

void main() {
  testWidgets('Me: card, numbers and one row per area', (t) async {
    await pumpMe(t);
    expect(find.text('Me'), findsOneWidget);
    expect(find.text('Sana Malik, 23'), findsOneWidget);
    expect(find.text('How others see you'), findsOneWidget);
    expect(find.text('Matches'), findsOneWidget);
    for (final title in [
      'Progress & badges',
      'Followers & privacy',
      'Recent matches',
      'Safety & trust',
      'Wallet',
      'Get VIP',
      'Invite friends',
      'Creator partner program',
      'Notifications & wellbeing',
      'Account',
    ]) {
      await scrollToRow(t, title);
      expect(find.text(title), findsOneWidget, reason: title);
    }
    // The partner row says where you are in the program.
    expect(find.text('Your stats, links and payouts'), findsOneWidget);
  });

  // One test per row, so a broken screen names itself.
  const rows = <(String, Type, String?)>[
    ('Progress & badges', ProgressSectionScreen, 'Progress & badges'),
    ('Followers & privacy', FollowersSectionScreen, 'Followers & privacy'),
    ('Recent matches', RecentMatchesScreen, 'Recent matches'),
    ('Safety & trust', SafetySectionScreen, 'Safety & trust'),
    ('Wallet', WalletScreen, 'Wallet'),
    ('Get VIP', VipScreen, null),
    ('Invite friends', InviteScreen, 'Invite friends'),
    ('Notifications & wellbeing', WellbeingSectionScreen, 'Notifications & wellbeing'),
    ('Account', AccountSectionScreen, 'Account'),
  ];
  for (final (title, screen, appBar) in rows) {
    testWidgets('"$title" pushes $screen', (t) async {
      await pumpMe(t);
      await opens(t, title, screen, appBar: appBar);
    });
  }

  testWidgets('the partner row opens the native partner screen', (t) async {
    final h = await pumpMe(t);
    await opens(t, 'Creator partner program', PartnerScreen, appBar: 'Creator partners');
    // Opened once more: the active dashboard is there.
    await scrollToRow(t, 'Creator partner program');
    await t.tap(find.text('Creator partner program'));
    await t.pumpAndSettle();
    expect(h.partner.status, PartnerStatus.active);
    expect(find.text('YOUR LINK'), findsOneWidget);
    expect(find.text('EARNINGS'), findsOneWidget);
  });

  testWidgets('recent matches: the row counts them, the screen lists them', (t) async {
    await pumpMe(t, history: true);
    await scrollToRow(t, 'Recent matches');
    expect(find.text('5 recent calls'), findsOneWidget);
    await t.tap(find.text('Recent matches'));
    await t.pumpAndSettle();
    expect(find.byType(VAvatar), findsNWidgets(5));
  });

  testWidgets('the partner row before applying', (t) async {
    await pumpMe(t, partnerStatus: PartnerStatus.none);
    await scrollToRow(t, 'Creator partner program');
    expect(find.text('Earn money for the people you bring'), findsOneWidget);
  });
}
