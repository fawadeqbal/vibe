// Creator partners: the /v1/affiliate mappers and helpers (money, chart,
// link builder, apply form), the offline demo provider, and the remote
// provider over a fake HTTP client + fake socket.
import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/api_exception.dart';
import 'package:vibe_app/core/api/realtime_client.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/models/partner.dart';
import 'package:vibe_app/models/payments.dart';
import 'package:vibe_app/providers/partner_provider.dart';

/// A socket whose server events the test pushes by hand.
class FakeRealtime extends RealtimeClient {
  FakeRealtime(super.api);
  final _ctl = StreamController<RealtimeEvent>.broadcast();
  void emit(String name, Map<String, dynamic> data) => _ctl.add(RealtimeEvent(name, data));
  @override
  Stream<Map<String, dynamic>> on(String event) => _ctl.stream.where((e) => e.name == event).map((e) => e.data);
}

// Shapes as the backend sends them (AffiliatesService.overview/payoutView/…).
Map<String, dynamic> overviewJson({String status = 'ACTIVE', int available = 1500, Map<String, dynamic>? openPayout, String? reason}) => {
      'status': status,
      'affiliate': {
        'code': 'ALI',
        'displayName': 'Ali Vlogs',
        'link': 'https://vibe.fawadiqbal.dev/i/ALI',
        'revSharePercent': 20,
        'cpaUsdCents': 10,
        'commissionMonths': 6,
        'holdDays': 14,
        'minPayoutUsdCents': 1000,
        'appliedAt': '2026-10-01T09:00:00.000Z',
        'decisionReason': reason,
      },
      'balance': {'pendingUsdCents': 320, 'availableUsdCents': available, 'requestedUsdCents': 0, 'paidUsdCents': 4000},
      'openPayout': openPayout,
    };

Map<String, dynamic> payoutJson({String id = 'po1', String status = 'REQUESTED', int usd = 1500}) => {
      'id': id,
      'usdCents': usd,
      'amountPkr': 4200,
      'method': 'JAZZCASH',
      'accountMasked': '•••• 4567',
      'status': status,
      'reference': status == 'PAID' ? 'JC-1' : null,
      'failureReason': status == 'REJECTED' ? 'Wrong number' : null,
      'createdAt': '2026-10-05T10:00:00.000Z',
      'decidedAt': null,
    };

Map<String, dynamic> commissionJson(String id, {String kind = 'REVSHARE', int usd = 100, int base = 499, String status = 'PENDING', String name = 'Sara'}) => {
      'id': id,
      'kind': kind,
      'usdCents': usd,
      'baseUsdCents': base,
      'status': status,
      'availableAt': '2026-10-20T10:00:00.000Z',
      'createdAt': '2026-10-06T10:00:00.000Z',
      'adjustment': usd < 0,
      'user': {'name': name},
    };

Map<String, dynamic> statsJson(int days) => {
      'days': days,
      'totals': {'clicks': 120, 'signups': 9, 'qualified': 4, 'payingUsers': 2, 'revenueUsdCents': 1998, 'earnedUsdCents': 440},
      'daily': [
        for (var i = 0; i < days; i++) {'day': '2026-09-${(i % 28 + 1).toString().padLeft(2, '0')}', 'clicks': i, 'signups': 0, 'qualified': 0, 'revenueUsdCents': 0, 'earnedUsdCents': 10},
      ],
      'byChannel': [
        {'channel': 'tiktok', 'clicks': 100, 'signups': 8, 'qualified': 4, 'earnedUsdCents': 400},
        {'channel': 'direct', 'clicks': 20, 'signups': 1, 'qualified': 0, 'earnedUsdCents': 40},
      ],
    };

PayoutAccount account([String id = 'pa1']) => PayoutAccount(id: id, method: PaymentMethod.easypaisa, accountMasked: '•••• 1234', holderName: 'Sana Malik', isDefault: true);

void main() {
  group('mappers', () {
    test('overview: none, active with an open payout, suspended with a reason', () {
      final none = PartnerOverview.fromJson({'status': 'none'});
      expect(none.status, PartnerStatus.none);
      expect(none.terms, isNull);
      expect(none.hasDashboard, isFalse);

      final ov = PartnerOverview.fromJson(overviewJson(openPayout: payoutJson()));
      expect(ov.status, PartnerStatus.active);
      expect(ov.terms!.code, 'ALI');
      expect(ov.terms!.displayName, 'Ali Vlogs');
      expect(ov.terms!.minPayoutUsdCents, 1000);
      expect(ov.terms!.appliedAt, DateTime.utc(2026, 10, 1, 9).toLocal());
      expect(ov.balance!.availableUsdCents, 1500);
      expect(ov.balance!.paidUsdCents, 4000);
      expect(ov.openPayout!.method, PaymentMethod.jazzCash);
      expect(ov.openPayout!.destination, 'JazzCash •••• 4567');
      expect(ov.hasDashboard, isTrue);

      final s = PartnerOverview.fromJson(overviewJson(status: 'SUSPENDED', reason: 'Fake clicks'));
      expect(s.status, PartnerStatus.suspended);
      expect(s.terms!.decisionReason, 'Fake clicks');
      expect(s.hasDashboard, isTrue);
      expect(PartnerOverview.fromJson(overviewJson(status: 'PENDING')).hasDashboard, isFalse);
    });

    test('payouts, commissions, a cursor page and the code check', () {
      final p = PartnerPayout.fromJson(payoutJson(status: 'REJECTED'));
      expect(p.status, PartnerPayoutStatus.rejected);
      expect(p.status.label, 'Returned');
      expect(p.failureReason, 'Wrong number');
      expect(p.amountPkr, 4200);
      expect(PartnerPayout.fromJson({...payoutJson(), 'method': 'BANK'}).destination, 'Bank •••• 4567');

      final page = PartnerCommissionPage.fromJson({
        'items': [commissionJson('c1', kind: 'CPA', usd: 10, base: 10, status: 'AVAILABLE'), commissionJson('c2', usd: -100, status: 'AVAILABLE'), commissionJson('c3', status: 'REVERSED')],
        'nextCursor': 'c3',
      });
      expect(page.nextCursor, 'c3');
      expect(page.items.first.kind, PartnerCommissionKind.cpa);
      expect(page.items.first.what, 'Active user bonus');
      expect(page.items.first.userName, 'Sara');
      expect(page.items[1].adjustment, isTrue);
      expect(page.items[1].what, 'Refund adjustment');
      expect(page.items[1].negative, isTrue);
      expect(page.items[2].what, r'$4.99 purchase');
      expect(page.items[2].negative, isTrue);
      expect(PartnerCommission.fromJson({...commissionJson('x'), 'user': {'name': ''}}).userName, 'Someone');
      expect(PartnerCommissionPage.fromJson({'items': [], 'nextCursor': null}).nextCursor, isNull);

      final ok = PartnerCodeCheck.fromJson({'code': 'ALI', 'available': true, 'reason': null}, 'ali');
      expect(ok.available, isTrue);
      final bad = PartnerCodeCheck.fromJson({'code': null, 'available': false, 'reason': 'invalid'}, 'a!');
      expect(bad.code, isNull);
      expect(partnerCodeReasonLabel(bad.reason), '3–20 letters, digits or _.');
      expect(partnerCodeReasonLabel('taken'), 'That code is taken.');
    });

    test('stats', () {
      final s = PartnerStats.fromJson(statsJson(7));
      expect(s.days, 7);
      expect(s.totals.payingUsers, 2);
      expect(s.totals.earnedUsdCents, 440);
      expect(s.daily, hasLength(7));
      expect(s.byChannel.first.channel, 'tiktok');
      expect(PartnerStats.fromJson({'byChannel': [{'channel': null}]}).byChannel.single.channel, 'direct');
    });
  });

  group('money, chart and link builder', () {
    test('formats cents as dollars', () {
      expect(formatUsd(0), r'$0.00');
      expect(formatUsd(7), r'$0.07');
      expect(formatUsd(1234), r'$12.34');
      expect(formatUsd(123456789), r'$1,234,567.89');
      expect(formatUsd(-120), r'−$1.20');
      expect(formatUsdShort(0), r'$0');
      expect(formatUsdShort(50), r'$0.50');
      expect(formatUsdShort(4000), r'$40');
      expect(formatUsdShort(120000), r'$1.2k');
      expect(formatUsdShort(2500000), r'$25k');
      expect(countShort(950), '950');
      expect(countShort(1200), '1.2k');
    });

    test('says when a payout is possible', () {
      PartnerOverview ov(int available, {Map<String, dynamic>? open, String status = 'ACTIVE'}) => PartnerOverview.fromJson(overviewJson(available: available, openPayout: open, status: status));
      expect(ov(1500).payoutBlock, isNull);
      expect(ov(400).payoutBlock, contains(r'$10.00'));
      expect(ov(400).payoutBlock, contains(r'$6.00 to go'));
      expect(ov(-50).payoutBlock, startsWith('Nothing available'));
      expect(ov(5000, open: payoutJson()).payoutBlock, contains('on its way'));
      expect(ov(5000, status: 'SUSPENDED').payoutBlock, contains('suspended'));
    });

    test('keeps days for 7/30 and groups 90 into weeks ending today', () {
      List<PartnerStatsDay> days(int n) => [for (var i = 0; i < n; i++) PartnerStatsDay(day: '2026-09-${(i % 28 + 1).toString().padLeft(2, '0')}', clicks: i + 1, earnedUsdCents: 10)];
      expect(partnerChartBars(days(7), PartnerMetric.clicks, 7), hasLength(7));
      final weekly = partnerChartBars(days(90), PartnerMetric.earned, 90);
      expect(weekly, hasLength(13));
      expect(weekly.last.value, 70);
      expect(weekly.first.value, 60); // 90 = 12 × 7 + 6
      expect(weekly.last.from == weekly.last.to, isFalse);
      expect(niceMax(0), 1);
      expect(niceMax(3), 5);
      expect(niceMax(17), 20);
      expect(niceMax(4100), 5000);
      expect(niceMax(0, 100), 100);
      expect(niceMax(250, 100), 500);
      expect(dayLabel('2026-10-06'), '6 Oct');
      expect(PartnerMetric.earned.format(1234), r'$12.34');
      expect(PartnerMetric.clicks.format(1234), '1,234');
    });

    test('tags the partner link per channel', () {
      expect(partnerLink('https://vibe.test/i/ALI', 'tiktok'), 'https://vibe.test/i/ALI?s=tiktok');
      expect(partnerLink('https://vibe.test/i/ALI?s=tiktok', 'YouTube'), 'https://vibe.test/i/ALI?s=youtube');
      expect(partnerLink('https://vibe.test/i/ALI?s=tiktok', null), 'https://vibe.test/i/ALI');
      expect(partnerLink('https://vibe.test/i/ALI', 'bad source!'), 'https://vibe.test/i/ALI');
      expect(bareLink('https://vibe.test/i/ALI'), 'vibe.test/i/ALI');
      expect(partnerSourceLabel('youtube'), 'YouTube');
      expect(partnerSourceLabel('podcast'), 'podcast');
    });
  });

  group('apply form', () {
    const good = PartnerApplication(displayName: 'Ali Vlogs', code: 'ali', channels: [PartnerChannelInput(platform: 'tiktok', url: 'tiktok.com/@ali', followers: '25k')]);

    test('reads follower counts', () {
      expect(parseFollowers('25k'), 25000);
      expect(parseFollowers('1.2M'), 1200000);
      expect(parseFollowers('12,500'), 12500);
      expect(parseFollowers('lots'), isNull);
      expect(parseFollowers('2000m'), isNull);
    });

    test('validates before sending', () {
      expect(good.errors(), isEmpty);
      final e = const PartnerApplication(displayName: 'A', code: 'a!', channels: [PartnerChannelInput(platform: 'youtube', url: 'not a url', followers: 'x')]).errors();
      expect(e.keys.toList()..sort(), ['channels.0.followers', 'channels.0.url', 'code', 'displayName']);
      expect(const PartnerApplication(displayName: 'Ali', code: 'ALI', channels: []).errors()['channels'], isNotNull);
      expect(PartnerApplication(displayName: 'Ali', code: 'ALI', channels: good.channels, note: 'x' * 1001).errors()['note'], isNotNull);
    });

    test('builds the request body', () {
      expect(good.toJson(), {
        'displayName': 'Ali Vlogs',
        'code': 'ALI',
        'channels': [
          {'platform': 'tiktok', 'url': 'https://tiktok.com/@ali', 'followers': 25000},
        ],
      });
      expect(PartnerApplication(displayName: 'Ali', code: 'ALI', channels: good.channels, note: '  hi ').toJson()['note'], 'hi');
    });
  });

  group('offline demo provider', () {
    test('apply needs a verified profile and a free code, then waits for review', () async {
      var verified = false;
      final p = LocalPartnerProvider(verified: () => verified);
      await p.refreshAll();
      expect(p.status, PartnerStatus.none);
      expect(p.commissionsLoaded, isFalse);
      const app = PartnerApplication(displayName: 'Sana Creates', code: 'sana_c', channels: [PartnerChannelInput(url: 'https://tiktok.com/@sana', followers: '12k')]);
      await expectLater(p.apply(app), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'VERIFICATION_REQUIRED')));
      verified = true;
      expect((await p.codeAvailable('vibe')).reason, 'reserved');
      expect((await p.codeAvailable('ali')).reason, 'taken');
      expect((await p.codeAvailable('a')).reason, 'invalid');
      expect((await p.codeAvailable('sana_c')).available, isTrue);
      await expectLater(
        p.apply(const PartnerApplication(displayName: 'Sana', code: 'ZARA', channels: [PartnerChannelInput(url: 'https://x.com/s', followers: '1')])),
        throwsA(isA<ApiException>().having((e) => e.details['reason'], 'reason', 'taken')),
      );
      await expectLater(p.apply(const PartnerApplication(displayName: 'S', code: 'x', channels: [])), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'VALIDATION_FAILED')));
      await p.apply(app);
      expect(p.status, PartnerStatus.pending);
      expect(p.overview!.terms!.code, 'SANA_C');
      await expectLater(p.apply(app), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'AFFILIATE_EXISTS')));
      expect(p.demoAction, contains('approve'));
      expect(await p.advanceDemo(), contains('creator partner'));
      expect(p.status, PartnerStatus.active);
      expect(p.stats, isNotNull);
      expect(p.commissions, hasLength(PartnerProvider.commissionsPageSize));
    });

    test('active: a plausible dashboard, paging, the payout flow', () async {
      final p = LocalPartnerProvider(status: PartnerStatus.active);
      await p.refreshAll();
      final ov = p.overview!;
      expect(ov.isActive, isTrue);
      expect(ov.balance!.availableUsdCents, greaterThanOrEqualTo(ov.terms!.minPayoutUsdCents));
      expect(ov.balance!.pendingUsdCents, greaterThan(0));
      expect(ov.balance!.paidUsdCents, greaterThan(0));
      expect(ov.payoutBlock, isNull);

      expect(p.range, 30);
      expect(p.stats!.daily, hasLength(30));
      expect(p.stats!.totals.clicks, p.stats!.daily.fold<int>(0, (s, d) => s + d.clicks));
      expect(p.stats!.byChannel.fold<int>(0, (s, c) => s + c.clicks), p.stats!.totals.clicks);
      p.setRange(90);
      await Future<void>.delayed(Duration.zero);
      expect(p.statsFor(90)!.daily, hasLength(90));
      p.setRange(7);
      await Future<void>.delayed(Duration.zero);
      expect(p.stats!.days, 7);

      expect(p.commissions, hasLength(20));
      expect(p.hasMoreCommissions, isTrue);
      await p.loadCommissions(more: true);
      expect(p.commissions, hasLength(23));
      expect(p.hasMoreCommissions, isFalse);
      expect(p.commissions.any((c) => c.status == PartnerCommissionStatus.reversed), isTrue);
      expect(p.payouts.single.status, PartnerPayoutStatus.paid);

      final available = ov.balance!.availableUsdCents;
      final payout = await p.requestPayout(account());
      expect(payout.usdCents, available);
      expect(payout.method, PaymentMethod.easypaisa);
      expect(payout.amountPkr, (available / 100 * Economy.pkrPerUsd).round());
      await pumpEventQueue();
      expect(p.payouts.first.id, payout.id);
      expect(p.overview!.openPayout?.id, payout.id);
      expect(p.overview!.balance!.availableUsdCents, 0);
      expect(p.overview!.balance!.requestedUsdCents, available);
      expect(p.overview!.payoutBlock, contains('on its way'));
      await expectLater(p.requestPayout(account()), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'AFFILIATE_PAYOUT_OPEN')));

      expect(await p.advanceDemo(), 'Partner payout sent 💸');
      expect(p.overview!.openPayout, isNull);
      expect(p.payouts.first.status, PartnerPayoutStatus.paid);
      await expectLater(
        p.requestPayout(account()),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'AFFILIATE_BELOW_MINIMUM').having((e) => e.details['minimumUsdCents'], 'min', 1000)),
      );
    });

    test('suspended: read-only dashboard, held commissions, no payouts', () async {
      final p = LocalPartnerProvider(status: PartnerStatus.suspended);
      await p.refreshAll();
      expect(p.overview!.hasDashboard, isTrue);
      expect(p.overview!.terms!.decisionReason, isNotNull);
      expect(p.commissions.any((c) => c.status == PartnerCommissionStatus.held), isTrue);
      await expectLater(p.requestPayout(account()), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'AFFILIATE_NOT_ACTIVE')));
      p.clear();
      expect(p.overview, isNull);
      expect(p.commissions, isEmpty);
    });
  });

  group('remote provider', () {
    late List<http.Request> sent;
    ApiClient client(Future<http.Response> Function(http.Request r) handler) {
      sent = [];
      return ApiClient(baseUrl: 'http://test/v1', httpClient: MockClient((r) async {
        sent.add(r);
        return handler(r);
      }), tokens: MemoryTokenStore());
    }

    http.Response json(Object? body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

    Future<http.Response> server(http.Request r) async {
      final path = r.url.path;
      if (r.method == 'GET' && path == '/v1/affiliate') return json(overviewJson());
      if (path == '/v1/affiliate/code-available') return json({'code': r.url.queryParameters['code']!.toUpperCase(), 'available': r.url.queryParameters['code'] != 'taken1', 'reason': r.url.queryParameters['code'] == 'taken1' ? 'taken' : null});
      if (path == '/v1/affiliate/apply') return json({'status': 'PENDING', ...overviewJson(status: 'PENDING')});
      if (path == '/v1/affiliate/stats') return json(statsJson(int.parse(r.url.queryParameters['days']!)));
      if (path == '/v1/affiliate/commissions') {
        final more = r.url.queryParameters['cursor'] != null;
        return json({'items': more ? [commissionJson('c3')] : [commissionJson('c1'), commissionJson('c2')], 'nextCursor': more ? null : 'c2'});
      }
      if (r.method == 'GET' && path == '/v1/affiliate/payouts') return json([payoutJson(id: 'old', status: 'PAID', usd: 4000)]);
      if (r.method == 'POST' && path == '/v1/affiliate/payouts') {
        final id = (jsonDecode(r.body) as Map)['payoutAccountId'];
        if (id == 'busy') return json({'error': {'code': 'AFFILIATE_PAYOUT_OPEN', 'message': 'Your last payout is still being processed'}}, 409);
        if (id == 'low') return json({'error': {'code': 'AFFILIATE_BELOW_MINIMUM', 'message': r'Payouts start at $10.00', 'details': {'minimumUsdCents': 1000, 'availableUsdCents': 400}}}, 400);
        return json(payoutJson());
      }
      return json({'error': {'code': 'NOT_FOUND', 'message': 'nope'}}, 404);
    }

    test('reads the dashboard: overview, stats (days=), commissions (cursor), payouts', () async {
      final api = client(server);
      await api.setTokens({'accessToken': 'a', 'refreshToken': 'r'});
      final p = RemotePartnerProvider(api, FakeRealtime(api));
      expect(p.isRemote, isTrue);
      await p.refreshAll();
      expect(p.overview!.terms!.code, 'ALI');
      expect(p.stats!.days, 30);
      expect(sent.firstWhere((r) => r.url.path == '/v1/affiliate/stats').url.queryParameters['days'], '30');
      expect(p.commissions.map((c) => c.id), ['c1', 'c2']);
      expect(sent.firstWhere((r) => r.url.path == '/v1/affiliate/commissions').url.queryParameters, {'limit': '20'});
      expect(p.payouts.single.id, 'old');

      await p.loadCommissions(more: true);
      expect(sent.last.url.queryParameters, {'limit': '20', 'cursor': 'c2'});
      expect(p.commissions.map((c) => c.id), ['c1', 'c2', 'c3']);
      expect(p.hasMoreCommissions, isFalse);

      p.setRange(7);
      await pumpEventQueue();
      expect(sent.last.url.queryParameters['days'], '7');
      expect(p.stats!.days, 7);
      p.dispose();
    });

    test('code check and apply send what the web sends', () async {
      final api = client(server);
      await api.setTokens({'accessToken': 'a', 'refreshToken': 'r'});
      final p = RemotePartnerProvider(api, FakeRealtime(api));
      final c = await p.codeAvailable(' taken1 ');
      expect(c.available, isFalse);
      expect(c.reason, 'taken');
      expect(sent.last.url.queryParameters['code'], 'taken1');
      await p.apply(const PartnerApplication(displayName: ' Ali Vlogs ', code: 'ali', channels: [PartnerChannelInput(platform: 'youtube', url: 'youtube.com/@ali', followers: '1.5k')], note: 'Hi'));
      final apply = sent.last;
      expect(apply.method, 'POST');
      expect(apply.url.path, '/v1/affiliate/apply');
      expect(jsonDecode(apply.body), {
        'displayName': 'Ali Vlogs',
        'code': 'ALI',
        'channels': [
          {'platform': 'youtube', 'url': 'https://youtube.com/@ali', 'followers': 1500},
        ],
        'note': 'Hi',
      });
      expect(p.status, PartnerStatus.pending);
      p.dispose();
    });

    test('payout request: idempotency key, the list and overview follow; errors keep their codes', () async {
      final api = client(server);
      await api.setTokens({'accessToken': 'a', 'refreshToken': 'r'});
      final p = RemotePartnerProvider(api, FakeRealtime(api));
      await p.refreshAll();
      final payout = await p.requestPayout(account());
      final post = sent.firstWhere((r) => r.method == 'POST' && r.url.path == '/v1/affiliate/payouts');
      expect(jsonDecode(post.body), {'payoutAccountId': 'pa1'});
      expect(post.headers['Idempotency-Key'], hasLength(32));
      expect(payout.status, PartnerPayoutStatus.requested);
      expect(p.payouts.map((x) => x.id), ['po1', 'old']);
      await pumpEventQueue();
      expect(sent.where((r) => r.method == 'GET' && r.url.path == '/v1/affiliate').length, 2, reason: 'balance re-read after the request');
      await expectLater(p.requestPayout(account('busy')), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'AFFILIATE_PAYOUT_OPEN')));
      await expectLater(p.requestPayout(account('low')), throwsA(isA<ApiException>().having((e) => e.details['minimumUsdCents'], 'min', 1000)));
      p.dispose();
    });

    test('affiliate:updated re-reads what is loaded (and nothing before the screen opened)', () async {
      final api = client(server);
      await api.setTokens({'accessToken': 'a', 'refreshToken': 'r'});
      final rt = FakeRealtime(api);
      final p = RemotePartnerProvider(api, rt);
      rt.emit(Ev.affiliateUpdated, {'status': 'ACTIVE', 'event': 'approved'});
      await pumpEventQueue();
      expect(sent, isEmpty);
      await p.refreshAll();
      final before = sent.length;
      rt.emit(Ev.affiliateUpdated, {'status': 'ACTIVE', 'event': 'payout_paid', 'payout': payoutJson(status: 'PAID')});
      await pumpEventQueue();
      final again = sent.skip(before).map((r) => r.url.path).toSet();
      expect(again, containsAll(['/v1/affiliate', '/v1/affiliate/stats', '/v1/affiliate/commissions', '/v1/affiliate/payouts']));
      p.dispose();
    });

    test('no session: status none without a request; a failed read is an error', () async {
      final api = client(server);
      final p = RemotePartnerProvider(api, FakeRealtime(api));
      await p.load();
      expect(p.status, PartnerStatus.none);
      expect(sent, isEmpty);
      final down = client((_) async => throw const SocketLikeException());
      await down.setTokens({'accessToken': 'a', 'refreshToken': 'r'});
      final q = RemotePartnerProvider(down, FakeRealtime(down));
      await q.load();
      expect(q.overview, isNull);
      expect(q.error?.code, 'NETWORK');
      p.dispose();
      q.dispose();
    });
  });
}

class SocketLikeException implements Exception {
  const SocketLikeException();
}
