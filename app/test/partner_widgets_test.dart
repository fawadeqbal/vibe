// The creator partner screen: apply (verify gate, code check, errors,
// send), the review states, and the active dashboard with its sub-screens
// (stats chart, links per channel, commissions, payouts + cash-out sheet).
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/config/integrations_config.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/models/partner.dart';
import 'package:vibe_app/models/payments.dart';
import 'package:vibe_app/providers/partner_provider.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/partner/partner_commissions_screen.dart';
import 'package:vibe_app/screens/partner/partner_payouts_screen.dart';
import 'package:vibe_app/screens/partner/partner_screen.dart';
import 'package:vibe_app/screens/partner/partner_stats_chart.dart';
import 'package:vibe_app/services/app_services.dart';
import 'package:vibe_app/services/share/share_service.dart';

class PH {
  late MockBackend backend;
  late WalletProvider wallet;
  late SessionProvider session;
  late LocalPartnerProvider partner;
  final share = RecordingShare();

  Future<void> init({bool verified = true, PartnerStatus status = PartnerStatus.none}) async {
    SharedPreferences.setMockInitialValues({});
    backend = MockBackend(fast: true, random: Random(3));
    wallet = WalletProvider(backend);
    session = SessionProvider(backend);
    partner = LocalPartnerProvider(verified: () => session.me?.verified == true, status: status);
    await wallet.load();
    await session.signIn(method: 'email');
    await session.saveProfile(session.me!.copyWith(name: 'Sana Malik', age: 23, avatarUrl: '', verified: verified));
  }

  Widget app(Widget home) => MultiProvider(
        providers: [
          Provider<MockBackend>.value(value: backend),
          Provider<AppServices>.value(value: AppServices(config: const IntegrationsConfig(), share: share)),
          ChangeNotifierProvider.value(value: session),
          ChangeNotifierProvider<WalletProvider>.value(value: wallet),
          ChangeNotifierProvider<PartnerProvider>.value(value: partner),
        ],
        child: MaterialApp(theme: V.theme(), home: home),
      );
}

Future<PH> pumpPartner(WidgetTester t, {bool verified = true, PartnerStatus status = PartnerStatus.none, Future<void> Function(PH h)? before}) async {
  t.view.physicalSize = const Size(412 * 3, 892 * 3);
  t.view.devicePixelRatio = 3;
  addTearDown(t.view.reset);
  final h = PH();
  await h.init(verified: verified, status: status);
  if (before != null) await before(h);
  await t.pumpWidget(h.app(const PartnerScreen()));
  await t.pump();
  await t.pump(const Duration(milliseconds: 50));
  return h;
}

Finder rich(String text) => find.textContaining(text, findRichText: true);

Future<void> scrollTo(WidgetTester t, Finder f) async {
  await t.scrollUntilVisible(f, 200, scrollable: find.byType(Scrollable).first);
  await t.pump();
}

void main() {
  testWidgets('apply: pitch, live code check, field errors, send → in review', (t) async {
    final h = await pumpPartner(t);
    expect(find.text('Creator partners'), findsOneWidget);
    expect(rich('Get paid for the people'), findsOneWidget);
    expect(rich('${Economy.affiliateRevSharePercent}% of what the people you bring spend'), findsOneWidget);
    expect(find.text('Verify your profile first'), findsNothing);

    // The code is checked 400 ms after typing.
    await t.enterText(find.byKey(const ValueKey('partner-code')), 'vibe');
    await t.pump(const Duration(milliseconds: 450));
    await t.pump();
    expect(find.text('That code is reserved.'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('partner-code')), 'sana_c');
    await t.pump();
    expect(find.text('Checking…'), findsOneWidget);
    await t.pump(const Duration(milliseconds: 450));
    await t.pump();
    expect(rich('Available'), findsOneWidget);
    expect(rich('/i/SANA_C'), findsOneWidget);

    // Missing link and followers: errors under the fields, nothing sent.
    await scrollTo(t, find.text('Send application'));
    await t.tap(find.text('Send application'));
    await t.pump();
    expect(find.text('The full link to your profile (https://…).'), findsOneWidget);
    expect(find.text('A number, e.g. 25000 or 25k.'), findsOneWidget);
    expect(h.partner.status, PartnerStatus.none);

    // A second channel, then remove it again.
    await scrollTo(t, find.text('Add another channel'));
    await t.tap(find.text('Add another channel'));
    await t.pump();
    expect(find.text('WHERE YOU POST (2/5)'), findsOneWidget);
    await t.tap(find.byTooltip('Remove channel 2'));
    await t.pump();
    expect(find.text('WHERE YOU POST (1/5)'), findsOneWidget);

    await t.enterText(find.byKey(const ValueKey('partner-url-0')), 'tiktok.com/@sana');
    await t.enterText(find.byKey(const ValueKey('partner-followers-0')), '25k');
    await scrollTo(t, find.text('Send application'));
    await t.tap(find.text('Send application'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 50));
    expect(h.partner.status, PartnerStatus.pending);
    expect(find.text("We're reviewing your application"), findsOneWidget);
    expect(rich('SANA_C'), findsOneWidget);
    expect(find.text("Application sent. We'll let you know soon."), findsOneWidget);

    // Offline demo: staff approve → the dashboard.
    await scrollTo(t, find.text('Offline demo: approve my application'));
    await t.tap(find.text('Offline demo: approve my application'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 50));
    expect(find.text('YOUR CODE'), findsOneWidget);
    expect(h.partner.status, PartnerStatus.active);
  });

  testWidgets('apply: unverified accounts see the verify step, not the form', (t) async {
    await pumpPartner(t, verified: false);
    expect(rich('Get paid for the people'), findsOneWidget);
    expect(find.text('Verify your profile first'), findsOneWidget);
    expect(find.text('Send application'), findsNothing);
  });

  testWidgets('review states: pending, rejected (with reason), suspended (read-only dashboard)', (t) async {
    final h = await pumpPartner(t, status: PartnerStatus.pending);
    expect(find.text("We're reviewing your application"), findsOneWidget);
    expect(find.text('Earnings'.toUpperCase()), findsNothing);

    await t.pumpWidget(const SizedBox());
    h.partner = LocalPartnerProvider(status: PartnerStatus.rejected);
    await t.pumpWidget(h.app(const PartnerScreen()));
    await t.pump();
    await t.pump();
    expect(find.text('Not this time'), findsOneWidget);
    expect(rich("couldn't confirm"), findsOneWidget);
    expect(find.text('Invite friends instead'), findsOneWidget);

    await t.pumpWidget(const SizedBox());
    h.partner = LocalPartnerProvider(status: PartnerStatus.suspended);
    await t.pumpWidget(h.app(const PartnerScreen()));
    await t.pump();
    await t.pump();
    expect(find.text('Your partner account is paused'), findsOneWidget);
    expect(find.text('YOUR LINK'), findsNothing, reason: 'no link while paused');
    expect(find.text('EARNINGS'), findsOneWidget);
    await scrollTo(t, find.text('Payouts are paused while your partner account is suspended.'));
    expect(find.text('Links per channel'), findsNothing);
  });

  testWidgets('active: link, earnings, cash out, menu rows into nested screens', (t) async {
    final h = await pumpPartner(t, status: PartnerStatus.active, before: (h) async {
      await h.wallet.loadPayouts();
      await h.wallet.addPayoutAccount(const NewPayoutAccount(method: PaymentMethod.easypaisa, account: '03001234567', holderName: 'Sana Malik', makeDefault: true));
    });
    final ov = h.partner.overview!;
    final available = formatUsd(ov.balance!.availableUsdCents);
    expect(find.text('Sana Creates'), findsOneWidget);
    expect(find.text('Active'), findsOneWidget);
    expect(find.text('SANACREATES'), findsOneWidget);
    expect(find.text('vibe.fawadiqbal.dev/i/SANACREATES'), findsOneWidget);
    expect(find.text('Cash out $available'), findsOneWidget);

    // Share the plain link.
    await t.tap(find.text('Share').first);
    await t.pump();
    expect(h.share.texts.single, contains('https://vibe.fawadiqbal.dev/i/SANACREATES'));

    // Stats → chart, period and measure.
    await scrollTo(t, find.text('Stats'));
    expect(rich('Last 30 days'), findsOneWidget);
    await t.tap(find.text('Stats'));
    await t.pumpAndSettle();
    expect(find.text('You earned'), findsOneWidget);
    expect(find.byWidgetPredicate((w) => w is CustomPaint && w.painter is PartnerBarsPainter), findsOneWidget);
    await t.ensureVisible(find.text('Earnings'));
    await t.pumpAndSettle();
    await t.tap(find.text('Earnings'));
    await t.pump();
    final painter = t.widget<CustomPaint>(find.byWidgetPredicate((w) => w is CustomPaint && w.painter is PartnerBarsPainter)).painter! as PartnerBarsPainter;
    expect(painter.metric, PartnerMetric.earned);
    expect(painter.bars, hasLength(30));
    await t.tap(find.text('90 days'));
    await t.pump();
    await t.pump();
    expect((t.widget<CustomPaint>(find.byWidgetPredicate((w) => w is CustomPaint && w.painter is PartnerBarsPainter)).painter! as PartnerBarsPainter).bars, hasLength(13));
    // Tap a column: its value shows.
    await t.tapAt(t.getBottomRight(find.byType(PartnerStatsChart)) - const Offset(6, 40));
    await t.pump();
    expect((t.widget<CustomPaint>(find.byWidgetPredicate((w) => w is CustomPaint && w.painter is PartnerBarsPainter)).painter! as PartnerBarsPainter).hover, 12);
    expect(find.text('TikTok'), findsOneWidget, reason: 'by channel');
    await t.pageBack();
    await t.pumpAndSettle();

    // Links per channel → TikTok link, copy and share.
    await scrollTo(t, find.text('Links per channel'));
    await t.tap(find.text('Links per channel'));
    await t.pumpAndSettle();
    await t.tap(find.text('TikTok'));
    await t.pump();
    expect(find.text('vibe.fawadiqbal.dev/i/SANACREATES?s=tiktok'), findsOneWidget);
    await t.tap(find.text('Share'));
    await t.pump();
    expect(h.share.texts.last, contains('/i/SANACREATES?s=tiktok'));
    await t.pageBack();
    await t.pumpAndSettle();

    // Commissions: 20, then the rest.
    await scrollTo(t, find.text('Commissions'));
    await t.tap(find.text('Commissions'));
    await t.pumpAndSettle();
    expect(find.byType(PartnerCommissionRow), findsNWidgets(20));
    await scrollTo(t, find.text('Show more'));
    await t.tap(find.text('Show more'));
    await t.pump();
    await t.pump();
    expect(find.byType(PartnerCommissionRow), findsNWidgets(23));
    expect(find.text('Reversed'), findsOneWidget);
    await t.pageBack();
    await t.pumpAndSettle();

    // Payouts → cash out to the saved account.
    await scrollTo(t, find.text('Payouts'));
    await t.tap(find.text('Payouts'));
    await t.pumpAndSettle();
    expect(find.byType(PartnerPayoutRow), findsOneWidget);
    await t.tap(find.text('Cash out $available'));
    await t.pumpAndSettle();
    expect(find.byType(PartnerPayoutSheet), findsOneWidget);
    expect(rich('Easypaisa'), findsWidgets);
    await t.tap(find.descendant(of: find.byType(PartnerPayoutSheet), matching: find.text('Cash out $available')).last);
    await t.pump();
    await t.pumpAndSettle();
    expect(find.byType(PartnerPayoutSheet), findsNothing);
    expect(find.text('$available on its way to Easypaisa 0300•••567'), findsOneWidget);
    expect(find.byType(PartnerPayoutRow), findsNWidgets(2));
    expect(find.text('On its way'), findsOneWidget);
    expect(find.text("You have a payout on its way. You can ask for the next one when it's done."), findsOneWidget);
  });

  testWidgets('your terms open in a sheet', (t) async {
    final h = await pumpPartner(t, status: PartnerStatus.active);
    await scrollTo(t, find.text('Your terms'));
    await t.tap(find.text('Your terms'));
    await t.pumpAndSettle();
    final terms = h.partner.overview!.terms!;
    expect(find.text('${terms.revSharePercent}% of what your users spend'), findsOneWidget);
    expect(find.text('${terms.holdDays}-day hold · ${formatUsd(terms.minPayoutUsdCents)} minimum'), findsOneWidget);
  });
}
