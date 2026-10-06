// Invite friends screen, "Have an invite code?", share cards.
import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/api/api_exception.dart';
import 'package:vibe_app/core/config/integrations_config.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/partner_provider.dart';
import 'package:vibe_app/providers/referrals_provider.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/invite/invite_banner.dart';
import 'package:vibe_app/screens/invite/invite_code_field.dart';
import 'package:vibe_app/screens/invite/invite_screen.dart';
import 'package:vibe_app/screens/invite/invite_share.dart';
import 'package:vibe_app/screens/invite/share_cards.dart';
import 'package:vibe_app/screens/partner/partner_screen.dart';
import 'package:vibe_app/services/app_services.dart';
import 'package:vibe_app/services/invite/invite_capture.dart';
import 'package:vibe_app/services/share/share_service.dart';

/// The offline mocks plus a share service that records.
class IH {
  late MockBackend backend;
  late WalletProvider wallet;
  late SessionProvider session;
  late ReferralsProvider referrals;
  late InviteCapture invites;
  late PartnerProvider partner;
  final share = RecordingShare();

  Future<void> init({bool seed = true, ReferralsProvider? referrals, String? capturedCode}) async {
    SharedPreferences.setMockInitialValues({});
    backend = MockBackend(fast: true, random: Random(3));
    wallet = WalletProvider(backend);
    invites = InviteCapture(store: MemoryInviteStore(invite: capturedCode == null ? null : CapturedInvite(code: capturedCode, at: DateTime.now()), checked: true));
    session = SessionProvider(backend, invites: invites);
    this.referrals = referrals ?? ReferralsProvider(backend, seed: seed);
    partner = PartnerProvider(verified: () => session.me?.verified == true);
    await wallet.load();
    await session.signIn(method: 'email');
    await session.saveProfile(session.me!.copyWith(name: 'Sana Malik', age: 23, avatarUrl: ''));
  }

  Widget app(Widget home) => MultiProvider(
        providers: [
          Provider<MockBackend>.value(value: backend),
          Provider<AppServices>.value(value: AppServices(config: const IntegrationsConfig(), share: share)),
          ChangeNotifierProvider.value(value: session),
          ChangeNotifierProvider.value(value: wallet),
          ChangeNotifierProvider.value(value: referrals),
          ChangeNotifierProvider.value(value: partner),
          ChangeNotifierProvider.value(value: invites),
        ],
        child: MaterialApp(theme: V.theme(), home: home),
      );
}

Future<IH> pumpInvite(WidgetTester t, Widget Function(IH h) screen, {bool seed = true, ReferralsProvider? referrals, String? capturedCode}) async {
  t.view.physicalSize = const Size(412 * 3, 892 * 3);
  t.view.devicePixelRatio = 3;
  addTearDown(t.view.reset);
  final h = IH();
  await h.init(seed: seed, referrals: referrals, capturedCode: capturedCode);
  await t.pumpWidget(h.app(screen(h)));
  await t.pump();
  await t.pump(const Duration(milliseconds: 50));
  return h;
}

/// A provider whose claim always fails with [code].
class FailingReferrals extends LocalReferralsProvider {
  FailingReferrals(super.backend, this.code);
  final String code;
  @override
  Future<ClaimResult> claim(String c) async => throw ApiException(code, 'raw $code', status: 409);
}

/// A few frames (pumpAndSettle can spin on the list's scroll physics).
Future<void> settle(WidgetTester t) async {
  for (var i = 0; i < 8; i++) {
    await t.pump(const Duration(milliseconds: 150));
  }
}

Future<void> scrollTo(WidgetTester t, Finder f, {double delta = 200}) async {
  await t.scrollUntilVisible(f, delta, scrollable: find.byType(Scrollable).first);
  await t.pump();
}

void main() {
  testWidgets('invite screen: hero from the rules, empty list, milestones track', (t) async {
    final h = await pumpInvite(t, (_) => const InviteScreen(), seed: false);
    expect(find.byWidgetPredicate((w) => w is Semantics && w.properties.label == 'Give 50, get 100 coins'), findsOneWidget);
    expect(find.text('VIBE4U'), findsOneWidget);
    expect(find.text('Share on WhatsApp'), findsOneWidget);
    expect(find.text('1. Share your link'), findsOneWidget);
    expect(find.text('2. They verify and have 3 calls'), findsOneWidget);
    await scrollTo(t, find.text('No one yet'));
    expect(find.text('No one yet'), findsOneWidget);
    expect(find.text('3 friends'), findsOneWidget);
    expect(find.text('7 days of VIP'), findsOneWidget);
    expect(find.text('1,000 coins'), findsOneWidget);
    expect(find.text('3 more active friends to 7 days of VIP'), findsOneWidget);
    // WhatsApp first, with the link tagged for the channel.
    await scrollTo(t, find.text('Share on WhatsApp'), delta: -200);
    await t.tap(find.text('Share on WhatsApp'));
    await t.pump();
    expect(h.share.whatsApps.single, contains('https://vibe.fawadiqbal.dev/i/VIBE4U?s=whatsapp'));
    expect(h.share.whatsApps.single, contains('50 free coins'));
    // No WhatsApp: the system share sheet instead.
    h.share.whatsAppInstalled = false;
    await t.tap(find.text('Share on WhatsApp'));
    await t.pump();
    expect(h.share.texts.single, contains('?s=whatsapp'));
    await t.tap(find.text('More apps'));
    await t.pump();
    expect(h.share.texts.last, contains('?s=share'));
  });

  testWidgets('invite screen: people with progress chips, totals, live milestone', (t) async {
    final h = await pumpInvite(t, (_) => const InviteScreen());
    final local = h.referrals as LocalReferralsProvider;
    final first = local.view!.people.first.firstName;
    await scrollTo(t, find.text('Coins earned'));
    expect(find.text('200'), findsOneWidget);
    await scrollTo(t, find.text('YOUR INVITES · 6'));
    await scrollTo(t, find.text(first));
    expect(find.text('Verified ✓ · 2/3 calls'), findsOneWidget);
    expect(find.text('Not verified yet · 0/3 calls'), findsOneWidget);
    expect(find.text('Pending'), findsOneWidget);
    expect(find.text('Rewarded +100'), findsNWidgets(2));
    expect(find.text('Not eligible'), findsOneWidget);
    expect(find.text('Joined on the same phone as you'), findsOneWidget);
    // A friend gets paid live → the row, the totals and the track move; the
    // milestone is announced.
    final reached = <MilestoneReached>[];
    final sub = h.referrals.milestonesReached.listen(reached.add);
    local.advanceDemo();
    await t.pump();
    expect(find.text('Rewarded +100'), findsNWidgets(3));
    expect(find.text('Pending'), findsNothing);
    expect(reached.single.reward.amount, 7);
    // Not awaited: the cancel future belongs to the root zone and would
    // step outside the test's fake clock.
    unawaited(sub.cancel());
    // The celebration sheet.
    final ctx = t.element(find.byType(InviteScreen));
    showMilestoneSheet(ctx, reached.single);
    await settle(t);
    expect(find.text('You unlocked 7 days of VIP 👑 — free filters, no ads, see who liked you.'), findsOneWidget);
    await t.tap(find.text('Keep inviting'));
    await settle(t);
    expect(find.text('Keep inviting'), findsNothing);
  });

  testWidgets('have an invite code: friendly errors, then success hides the field', (t) async {
    final h = await pumpInvite(t, (_) => const Scaffold(body: Padding(padding: EdgeInsets.all(20), child: InviteCodeField())));
    expect(h.session.referralClaimable, isTrue);
    await t.tap(find.text('Have an invite code?'));
    await t.pumpAndSettle();
    final field = find.byType(TextField);
    Future<String?> attempt(String code) async {
      await t.enterText(field, code);
      await t.tap(find.text('Apply'));
      await t.pumpAndSettle();
      final err = find.byKey(const ValueKey('invite-error'));
      return err.evaluate().isEmpty ? null : t.widget<Text>(err).data;
    }

    expect(await attempt('NOPE99'), contains("couldn't find that code"));
    expect(await attempt('VIBE4U'), contains('your own code'));
    expect(await attempt('AB'), contains('3–20 letters'));
    expect(await attempt('ALI123'), isNull);
    expect(find.textContaining("You joined with Ali's invite 🎉"), findsOneWidget);
    expect(find.textContaining('verify your selfie and have 3 calls'), findsOneWidget);
    expect(h.session.referralClaimable, isFalse);
    expect(h.session.invitedBy?.name, 'Ali');
  });

  testWidgets('have an invite code: too late and already used read clearly', (t) async {
    for (final (code, text) in [('INVITE_TOO_LATE', 'can only be added in your first 48 hours'), ('INVITE_ALREADY_USED', 'already joined')]) {
      final backend = MockBackend(fast: true);
      await pumpInvite(t, (_) => const Scaffold(body: InviteCodeField(initialCode: 'ALI123')), referrals: FailingReferrals(backend, code));
      // Pre-filled: already open.
      expect(find.byType(TextField), findsOneWidget);
      await t.tap(find.text('Apply'));
      await t.pump();
      await t.pump();
      expect(find.textContaining(text), findsOneWidget);
      await t.pumpWidget(const SizedBox());
    }
  });

  testWidgets('no claim field once invited or after 48 h', (t) async {
    final h = await pumpInvite(t, (_) => const Scaffold(body: InviteCodeField()), capturedCode: 'ALI123');
    expect(h.session.invitedBy?.name, 'Ali');
    expect(find.text('Have an invite code?'), findsNothing);
  });

  testWidgets('share card renders to a 1080×1350 PNG and shares with the invite link', (t) async {
    final h = await pumpInvite(t, (_) => const Scaffold(body: SizedBox()));
    final ctx = t.element(find.byType(Scaffold));
    showShareCardSheet(ctx, const ShareCardData.streak(30, friend: 'Ali Khan'));
    await t.pumpAndSettle();
    expect(find.byType(ShareCard), findsOneWidget);
    expect(find.text('streak'), findsNothing, reason: 'the title is one rich text');
    expect(find.text('Me & Ali · every single day.'), findsOneWidget);
    expect(find.text('Join me · get 50 free coins'), findsOneWidget);
    await t.runAsync(() async {
      await t.tap(find.text('Share'));
      for (var i = 0; i < 50 && h.share.images.isEmpty && h.share.texts.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    });
    await t.pumpAndSettle();
    expect(h.share.images, hasLength(1));
    final (png, text) = h.share.images.single;
    expect(png.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47], reason: 'PNG signature');
    final header = ByteData.sublistView(png, 16, 24);
    expect((header.getUint32(0), header.getUint32(4)), (1080, 1350));
    expect(text, contains('Our 30-day streak on Vibe 🔥 Me & Ali'));
    expect(text, contains('https://vibe.fawadiqbal.dev/i/VIBE4U?s=card_streak'));
    expect(find.byType(ShareCard), findsNothing, reason: 'the sheet closes');
  });

  testWidgets('share card: text only when the image cannot be shared', (t) async {
    final h = await pumpInvite(t, (_) => const Scaffold(body: SizedBox()));
    h.share.imageResult = false; // the image can't be shared → text + link
    final ctx = t.element(find.byType(Scaffold));
    showShareCardSheet(ctx, const ShareCardData.level(12));
    await t.pumpAndSettle();
    expect(find.text('LEVEL'), findsOneWidget);
    await t.runAsync(() async {
      await t.tap(find.text('Share'));
      for (var i = 0; i < 50 && h.share.texts.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    });
    await t.pumpAndSettle();
    expect(h.share.images, hasLength(1), reason: 'tried the image first');
    expect(h.share.texts.single, startsWith("I'm Level 12 on Vibe"));
    expect(h.share.texts.single, contains('?s=card_level'));
  });

  testWidgets('match card: both initials, no photos', (t) async {
    await pumpInvite(t, (_) => const Scaffold(body: Center(child: ShareCard(data: ShareCardData.match(friend: 'Zara', me: 'Sana'), link: 'https://vibe.fawadiqbal.dev/i/VIBE4U', coins: 50))));
    expect(find.text('Z'), findsOneWidget);
    expect(find.text('S'), findsOneWidget);
    expect(find.byType(Image), findsNothing);
    expect(find.text('vibe.fawadiqbal.dev/i/VIBE4U'), findsOneWidget);
  });

  testWidgets('welcome banner: a captured code shows who invited you', (t) async {
    final h = await pumpInvite(t, (_) => const Scaffold(body: InviteWelcomeBanner()));
    expect(find.byType(InviteBannerRow), findsNothing);
    // The install referrer / a link arrives after the screen is up.
    await h.invites.handleLink(Uri.parse('vibe://invite?code=ali123&s=tiktok'));
    await t.pump();
    await t.pump();
    expect(find.textContaining('Ali invited you', findRichText: true), findsOneWidget);
    expect(find.textContaining('50 coins', findRichText: true), findsOneWidget);
    // Unknown codes say nothing.
    await h.invites.handleLink(Uri.parse('vibe://invite?code=UNKNOWN9'));
    await t.pump();
    await t.pump();
    expect(find.byType(InviteBannerRow), findsNothing);
  });

  testWidgets('creator partner program opens the native partner screen', (t) async {
    final h = await pumpInvite(t, (_) => Scaffold(body: Builder(builder: (c) => TextButton(onPressed: () => openPartnerPage(c), child: const Text('Partner')))));
    await t.tap(find.text('Partner'));
    await t.pumpAndSettle();
    expect(find.byType(PartnerScreen), findsOneWidget);
    expect(find.text('Creator partners'), findsOneWidget);
    expect(h.share.urls, isEmpty, reason: 'no browser any more');
  });
}
