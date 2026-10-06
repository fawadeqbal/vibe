// Smoke test against a real local backend (not part of `flutter test`):
//   flutter test test_smoke/partner_smoke_test.dart
// Needs the API on http://localhost:3000 (dev OTP 1234, PAYMENTS_PROVIDER=dev,
// VERIFICATION_PROVIDER=dev) and DATABASE_URL in the environment
// (backend/.env). The staff side (approve, pay, suspend) is done in the
// database: the dev owner account must change its password before the
// staff API answers, and this test doesn't touch it.
// ignore_for_file: avoid_print
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as img;
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/api_exception.dart';
import 'package:vibe_app/core/api/realtime_client.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/models/partner.dart';
import 'package:vibe_app/models/payments.dart';
import 'package:vibe_app/providers/partner_provider.dart';

const base = 'http://localhost:3000/v1';
final env = Platform.environment;

Future<Map<String, dynamic>> call(String method, String path, {Object? body, String? token, Map<String, String> headers = const {}}) async {
  final req = http.Request(method, Uri.parse('$base$path'))
    ..headers.addAll({'content-type': 'application/json', 'accept': 'application/json', if (token != null) 'authorization': 'Bearer $token', ...headers});
  if (body != null) req.body = jsonEncode(body);
  final res = await http.Response.fromStream(await http.Client().send(req));
  final decoded = res.body.isEmpty ? null : jsonDecode(res.body);
  if (res.statusCode >= 300) throw StateError('$method $path → ${res.statusCode} ${res.body}');
  return decoded is Map ? Map<String, dynamic>.from(decoded) : {'list': decoded};
}

/// Signs up with e-mail + OTP 1234; returns (user, tokens).
Future<(Map<String, dynamic>, Map<String, dynamic>)> signUp(String email, {Map<String, String> invite = const {}}) async {
  await call('POST', '/auth/otp/request', body: {'email': email});
  final r = await call('POST', '/auth/otp/verify', body: {'email': email, 'code': '1234', ...invite});
  return (Map<String, dynamic>.from(r['user'] as Map), Map<String, dynamic>.from(r['tokens'] as Map));
}

void main() {
  test('partner flow against the local backend', () async {
    final stamp = DateTime.now().millisecondsSinceEpoch.toRadixString(36).toUpperCase();
    final code = 'SMK$stamp';

    // The staff side, straight in the database.
    final db = env['DATABASE_URL']!.replaceFirst(RegExp(r'\?.*$'), '');
    Future<void> sql(String q) async {
      final r = await Process.run('psql', [db, '-v', 'ON_ERROR_STOP=1', '-c', q]);
      expect(r.exitCode, 0, reason: '${r.stderr}');
    }

    // The partner: sign up, profile, not verified yet.
    final (user, tokens) = await signUp('partner-$stamp@vibe.test'.toLowerCase());
    await call('PATCH', '/me', body: {'name': 'Smoke Partner', 'age': 25, 'gender': 'female', 'countryCode': 'PK'}, token: tokens['accessToken'] as String);
    final api = ApiClient(baseUrl: base, tokens: MemoryTokenStore());
    await api.setTokens(tokens);
    final p = RemotePartnerProvider(api, RealtimeClient(api, url: 'http://localhost:3000'));

    await p.refreshAll();
    expect(p.status, PartnerStatus.none, reason: 'GET /affiliate → none');
    print('overview(none): ok');

    final free = await p.codeAvailable(code.toLowerCase());
    expect(free.available, isTrue);
    expect(free.code, code);
    final bad = await p.codeAvailable('a!');
    expect(bad.available, isFalse);
    expect(bad.reason, 'invalid');
    print('code-available: ${free.code} free, "a!" → ${bad.reason}');

    final app = PartnerApplication(displayName: 'Smoke Creates', code: code.toLowerCase(), channels: const [PartnerChannelInput(platform: 'tiktok', url: 'tiktok.com/@smoke', followers: '25k')], note: 'Smoke test');
    await expectLater(p.apply(app), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'VERIFICATION_REQUIRED')));
    print('apply unverified → VERIFICATION_REQUIRED');

    // Verify the dev way: a profile photo, then the selfie check (the dev provider approves anyone with a photo).
    final photo = img.encodeJpg(img.fill(img.Image(width: 320, height: 320), color: img.ColorRgb8(200, 120, 160)));
    await api.upload('/me/avatar', field: 'file', bytes: photo, filename: 'avatar.jpg', contentType: 'image/jpeg');
    final verified = Map<String, dynamic>.from(await api.uploadFiles('/me/verification', const []) as Map);
    expect(verified['verified'], isTrue, reason: '$verified');
    print('dev selfie verification → verified');
    await p.apply(app);
    expect(p.status, PartnerStatus.pending);
    expect(p.overview!.terms!.code, code);
    expect(p.overview!.terms!.displayName, 'Smoke Creates');
    expect(p.overview!.terms!.appliedAt, isNotNull);
    await expectLater(p.apply(app), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'AFFILIATE_EXISTS')));
    final taken = await p.codeAvailable(code);
    expect(taken.reason, 'taken');
    print('apply → PENDING (code $code); again → AFFILIATE_EXISTS');

    // Staff approve.
    await sql('UPDATE "Affiliate" SET status = \'ACTIVE\', "decidedAt" = now() WHERE code = \'$code\';');
    await p.refreshAll();
    final ov = p.overview!;
    expect(ov.status, PartnerStatus.active);
    expect(ov.terms!.link, endsWith('/i/$code'));
    expect(ov.terms!.revSharePercent, greaterThan(0));
    expect(ov.terms!.minPayoutUsdCents, 1000);
    expect(ov.balance!.availableUsdCents, 0);
    expect(p.stats!.days, 30);
    expect(p.stats!.daily, hasLength(30));
    expect(p.commissionsLoaded, isTrue);
    expect(p.commissions, isEmpty);
    expect(p.payoutsLoaded, isTrue);
    expect(p.payouts, isEmpty);
    print('approved → ACTIVE; link ${ov.terms!.link}; ${ov.terms!.revSharePercent}% / ${formatUsd(ov.terms!.cpaUsdCents)}; block: ${ov.payoutBlock}');

    // Someone clicks the TikTok link and signs up with it, then buys the biggest pack by bank transfer.
    await call('GET', '/referrals/preview/$code?s=tiktok');
    final (fan, fanTokens) = await signUp('fan-$stamp@vibe.test'.toLowerCase(), invite: {'inviteCode': code, 'inviteSource': 'tiktok', 'inviteVia': 'link'});
    await call('PATCH', '/me', body: {'name': 'Fatima Fan', 'age': 22, 'gender': 'female', 'countryCode': 'PK'}, token: fanTokens['accessToken'] as String);
    final ft = fanTokens['accessToken'] as String;
    // Twice: 20 % of $49.99 is $9.99, under the $10 minimum.
    for (var i = 0; i < 2; i++) {
      final purchase = await call('POST', '/payments/purchases', body: {'productType': 'COIN_PACK', 'productId': 'whale', 'method': 'JAZZCASH', 'phone': '03001234567', 'cnicLast6': '123456'}, token: ft, headers: {'Idempotency-Key': ApiClient.newIdempotencyKey()});
      final paid = await call('POST', '/payments/purchases/${purchase['id']}/confirm', body: {'otp': '1234'}, token: ft);
      expect(paid['state'] ?? paid['status'], anyOf('succeeded', 'SUCCEEDED'), reason: '$paid');
    }
    await Future<void>.delayed(const Duration(milliseconds: 800)); // the commission is written on the purchase event
    await p.refreshAll();
    expect(p.commissions, hasLength(2));
    final c = p.commissions.first;
    final earned = p.commissions.fold<int>(0, (t, x) => t + x.usdCents);
    expect(c.kind, PartnerCommissionKind.revshare);
    expect(c.status, PartnerCommissionStatus.pending);
    expect(c.userName, 'Fatima');
    expect(c.baseUsdCents, 4999);
    expect(c.usdCents, 4999 * ov.terms!.revSharePercent ~/ 100);
    expect(c.availableAt, isNotNull);
    expect(p.overview!.balance!.pendingUsdCents, earned);
    final s = p.stats!;
    expect(s.totals.clicks, greaterThanOrEqualTo(1));
    expect(s.totals.signups, 1);
    expect(s.totals.payingUsers, 1);
    expect(s.totals.revenueUsdCents, 9998);
    expect(s.totals.earnedUsdCents, earned);
    expect(s.byChannel.map((x) => x.channel), contains('tiktok'));
    expect(partnerChartBars(s.daily, PartnerMetric.earned, 30).last.value, earned);
    print('fan ${fan['id']} bought whale ×2 → commission ${c.what} ${formatUsd(c.usdCents)} ${c.status.label}; stats clicks=${s.totals.clicks} signups=${s.totals.signups} revenue=${formatUsd(s.totals.revenueUsdCents)} channels=${s.byChannel.map((x) => x.channel).toList()}');
    await p.setRangeAndWait(7);
    expect(p.stats!.days, 7);

    // Payout: a saved account, below the minimum while the commission waits out the hold.
    final acc = PayoutAccount.fromJson(await call('POST', '/wallet/payout-accounts', body: {'method': 'JAZZCASH', 'account': '03001234567', 'holderName': 'Smoke Partner', 'makeDefault': true}, token: api.accessToken));
    await expectLater(
      p.requestPayout(acc),
      throwsA(isA<ApiException>().having((e) => e.code, 'code', 'AFFILIATE_BELOW_MINIMUM').having((e) => e.details['minimumUsdCents'], 'min', 1000)),
    );
    print('payout during the hold → AFFILIATE_BELOW_MINIMUM (min ${formatUsd(1000)})');

    // Fast-forward the hold in the database, then cash out.
    await sql('UPDATE "AffiliateCommission" SET "availableAt" = now() - interval \'1 day\' WHERE "affiliateId" = (SELECT id FROM "Affiliate" WHERE code = \'$code\');');
    await p.load();
    expect(p.overview!.balance!.availableUsdCents, earned);
    expect(p.overview!.payoutBlock, isNull);
    final payout = await p.requestPayout(acc);
    expect(payout.usdCents, earned);
    expect(payout.method, PaymentMethod.jazzCash);
    expect(payout.status, PartnerPayoutStatus.requested);
    expect(payout.amountPkr, greaterThan(0));
    expect(payout.accountMasked, isNotEmpty);
    await Future<void>.delayed(const Duration(milliseconds: 300));
    expect(p.overview!.openPayout?.id, payout.id);
    expect(p.overview!.balance!.requestedUsdCents, payout.usdCents);
    expect(p.commissions.every((x) => x.status == PartnerCommissionStatus.paid), isTrue);
    await expectLater(p.requestPayout(acc), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'AFFILIATE_PAYOUT_OPEN')));
    print('payout ${formatUsd(payout.usdCents)} (Rs ${payout.amountPkr}) → ${payout.destination} ${payout.status.label}; again → AFFILIATE_PAYOUT_OPEN');

    // Staff pay it.
    await sql('UPDATE "AffiliatePayout" SET status = \'PAID\', reference = \'JC-SMOKE\', "decidedAt" = now() WHERE id = \'${payout.id}\';');
    await p.refreshAll();
    expect(p.payouts.first.status, PartnerPayoutStatus.paid);
    expect(p.payouts.first.reference, 'JC-SMOKE');
    expect(p.payouts.first.decidedAt, isNotNull);
    expect(p.overview!.openPayout, isNull);
    expect(p.overview!.balance!.paidUsdCents, payout.usdCents);
    print('staff paid → ${p.payouts.first.status.label} ref ${p.payouts.first.reference}; paid ${formatUsd(p.overview!.balance!.paidUsdCents)}');

    // Suspend: read-only dashboard.
    await sql('UPDATE "Affiliate" SET status = \'SUSPENDED\', "decisionReason" = \'Smoke test pause\' WHERE code = \'$code\';');
    await p.refreshAll();
    expect(p.status, PartnerStatus.suspended);
    expect(p.overview!.terms!.decisionReason, 'Smoke test pause');
    expect(p.overview!.hasDashboard, isTrue);
    expect(p.overview!.payoutBlock, contains('suspended'));
    print('suspended → reason "${p.overview!.terms!.decisionReason}"');
    p.dispose();
  }, timeout: const Timeout(Duration(minutes: 2)));
}

extension on PartnerProvider {
  Future<void> setRangeAndWait(int days) async {
    setRange(days);
    for (var i = 0; i < 50 && stats == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
  }
}
