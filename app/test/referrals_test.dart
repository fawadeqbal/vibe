// Invites and creator partners: install-referrer / link parsing, the
// capture store, the sign-up fields, the API mappers, the providers (local
// mock and remote over a fake HTTP client + fake socket).
import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/api_exception.dart';
import 'package:vibe_app/core/api/mappers.dart';
import 'package:vibe_app/core/api/realtime_client.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/models/payments.dart';
import 'package:vibe_app/providers/catalog_provider.dart';
import 'package:vibe_app/providers/referrals_provider.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/screens/invite/invite_code_field.dart';
import 'package:vibe_app/screens/invite/share_cards.dart';
import 'package:vibe_app/services/invite/invite_capture.dart';
import 'package:vibe_app/services/push/push_route.dart';

/// A socket whose server events the test pushes by hand.
class FakeRealtime extends RealtimeClient {
  FakeRealtime(super.api);
  final _ctl = StreamController<RealtimeEvent>.broadcast();
  void emit(String name, Map<String, dynamic> data) => _ctl.add(RealtimeEvent(name, data));
  @override
  Stream<Map<String, dynamic>> on(String event) => _ctl.stream.where((e) => e.name == event).map((e) => e.data);
}

Map<String, dynamic> _person(String id, String name, {String status = 'PENDING', bool verified = true, int calls = 2, int coins = 0, String? reason}) => {
      'id': id,
      'profile': {'id': 'u-$id', 'name': name, 'age': 24, 'gender': 'female', 'countryCode': 'PK', 'avatarUrl': ''},
      'status': status,
      'rejectReason': reason,
      'steps': {'verified': verified, 'verifyNeeded': true, 'calls': calls, 'callsNeeded': 3},
      'coins': coins,
      'createdAt': '2026-10-05T10:00:00.000Z',
      'qualifiedAt': null,
      'rewardedAt': status == 'REWARDED' ? '2026-10-06T10:00:00.000Z' : null,
    };

Map<String, dynamic> _overview({List<Map<String, dynamic>>? people, Map<String, dynamic>? affiliate}) => {
      'code': 'SARA7K',
      'link': 'https://vibe.fawadiqbal.dev/i/SARA7K',
      'rewards': {'inviterCoins': 100, 'inviteeCoins': 50, 'activationCalls': 3, 'requireVerified': true, 'holdHours': 24},
      'stats': {'joined': 3, 'pending': 1, 'rewarded': 1, 'rejected': 1, 'coinsEarned': 100},
      'milestones': [
        {'count': 3, 'reward': {'kind': 'vip', 'amount': 7}, 'reached': false},
        {'count': 10, 'reward': {'kind': 'vip', 'amount': 30}, 'reached': false},
        {'count': 25, 'reward': {'kind': 'coins', 'amount': 1000}, 'reached': false},
      ],
      'next': {'count': 3, 'remaining': 2},
      'people': people ?? [_person('r1', 'Ali Khan'), _person('r2', 'Sana', status: 'REWARDED', calls: 3, coins: 100), _person('r3', 'Bot', status: 'REJECTED', reason: 'same_device')],
      'affiliate': affiliate,
    };

void main() {
  final t0 = DateTime.utc(2026, 10, 6, 12);

  group('install referrer parsing', () {
    test('vibe_ref + utm_source', () {
      final c = InviteLinks.parseInstallReferrer('vibe_ref=ali123&utm_source=TikTok', now: t0)!;
      expect(c.code, 'ALI123');
      expect(c.source, 'tiktok');
      expect(c.via, InviteVia.install);
      expect(c.toSignUp(), {'inviteCode': 'ALI123', 'inviteSource': 'tiktok', 'inviteVia': 'install'});
    });

    test('URL-encoded once or twice, a leading ?', () {
      expect(InviteLinks.parseInstallReferrer('vibe_ref%3DZARA_CREATES%26utm_source%3Dyoutube')!.code, 'ZARA_CREATES');
      expect(InviteLinks.parseInstallReferrer('vibe_ref%253DAB12C%2526utm_source%253Dwhatsapp')!.source, 'whatsapp');
      expect(InviteLinks.parseInstallReferrer('?vibe_ref=XYZ123')!.code, 'XYZ123');
    });

    test('organic installs and bad codes give nothing; a bad source is dropped', () {
      expect(InviteLinks.parseInstallReferrer('utm_source=google-play&utm_medium=organic'), isNull);
      expect(InviteLinks.parseInstallReferrer(''), isNull);
      expect(InviteLinks.parseInstallReferrer(null), isNull);
      expect(InviteLinks.parseInstallReferrer('vibe_ref=ab'), isNull, reason: 'too short');
      expect(InviteLinks.parseInstallReferrer('vibe_ref=has space'), isNull);
      expect(InviteLinks.parseInstallReferrer('vibe_ref=${'A' * 21}'), isNull, reason: 'too long');
      final c = InviteLinks.parseInstallReferrer('vibe_ref=GOOD99&utm_source=not valid!')!;
      expect(c.code, 'GOOD99');
      expect(c.source, isNull);
      expect(c.toSignUp().containsKey('inviteSource'), isFalse);
    });
  });

  group('invite links', () {
    test('vibe://invite?code=', () {
      final c = InviteLinks.parseLink(Uri.parse('vibe://invite?code=ali123&s=WhatsApp'))!;
      expect((c.code, c.source, c.via), ('ALI123', 'whatsapp', InviteVia.link));
      expect(InviteLinks.parseLink(Uri.parse('vibe://payment-return?purchase=p1')), isNull);
      expect(InviteLinks.parseLink(Uri.parse('vibe://invite')), isNull);
    });

    test('https://<site>/i/<code>, with or without www', () {
      expect(InviteLinks.parseLink(Uri.parse('https://vibe.fawadiqbal.dev/i/sana77?s=tiktok'))!.source, 'tiktok');
      expect(InviteLinks.parseLink(Uri.parse('https://www.vibe.fawadiqbal.dev/i/SANA77'))!.code, 'SANA77');
      expect(InviteLinks.parseLink(Uri.parse('https://vibe.fawadiqbal.dev/i/SANA77/'))!.code, 'SANA77');
      expect(InviteLinks.parseLink(Uri.parse('https://evil.example/i/SANA77')), isNull);
      expect(InviteLinks.parseLink(Uri.parse('https://vibe.fawadiqbal.dev/terms')), isNull);
      expect(InviteLinks.parseLink(Uri.parse('https://vibe.fawadiqbal.dev/i/a/b')), isNull);
    });

    test('a channel on the share link', () {
      expect(inviteLinkWithChannel('https://vibe.fawadiqbal.dev/i/SARA7K', 'whatsapp'), 'https://vibe.fawadiqbal.dev/i/SARA7K?s=whatsapp');
      expect(inviteLinkWithChannel('https://vibe.fawadiqbal.dev/i/SARA7K?s=x', 'copy'), 'https://vibe.fawadiqbal.dev/i/SARA7K?s=copy');
      expect(inviteLinkWithChannel('https://vibe.fawadiqbal.dev/i/SARA7K', null), 'https://vibe.fawadiqbal.dev/i/SARA7K');
    });
  });

  group('capture', () {
    test('the install referrer is read once; the code waits for sign-up', () async {
      final store = MemoryInviteStore();
      var reads = 0;
      final c = InviteCapture(store: store, referrer: _CountingReferrer('vibe_ref=ALI123&utm_source=tiktok', () => reads++), clock: () => t0);
      await c.start();
      expect(c.captured?.code, 'ALI123');
      expect(store.checked, isTrue);
      // Next launch: no second read.
      final again = InviteCapture(store: store, referrer: _CountingReferrer('vibe_ref=OTHER1', () => reads++), clock: () => t0);
      await again.start();
      expect(reads, 1);
      expect(again.captured?.code, 'ALI123');
    });

    test('a tapped link wins over the referrer; links while signed in are not stored', () async {
      final links = ManualInviteSource(Uri.parse('vibe://invite?code=SANA77&s=whatsapp'));
      var signedIn = false;
      final c = InviteCapture(store: MemoryInviteStore(), referrer: const NoInstallReferrer('vibe_ref=ALI123'), links: links, clock: () => t0, signedIn: () => signedIn);
      await c.start();
      expect(c.captured, CapturedInvite(code: 'SANA77', source: 'whatsapp', at: t0));
      signedIn = true;
      final seen = <CapturedInvite>[];
      final sub = c.signedInLinks.listen(seen.add);
      links.add(Uri.parse('https://vibe.fawadiqbal.dev/i/ZARACREATES'));
      await Future<void>.delayed(Duration.zero);
      expect(seen.single.code, 'ZARACREATES');
      expect(c.captured?.code, 'SANA77');
      await sub.cancel();
    });

    test('sign-up fields: code + source + via + a stable device id; cleared once used', () async {
      final store = MemoryInviteStore(invite: CapturedInvite(code: 'ALI123', source: 'tiktok', via: InviteVia.install, at: t0), checked: true);
      final c = InviteCapture(store: store, clock: () => t0);
      final f = await c.signUpFields();
      expect(f['inviteCode'], 'ALI123');
      expect(f['inviteSource'], 'tiktok');
      expect(f['inviteVia'], 'install');
      expect(InviteLinks.validDeviceId(f['deviceId']), isTrue);
      expect((await c.signUpFields())['deviceId'], f['deviceId'], reason: 'generated once');
      await c.consumed();
      expect(store.invite, isNull);
      expect(c.lastUsedCode, 'ALI123');
      expect(await c.signUpFields(), {'deviceId': f['deviceId']});
    });

    test('codes older than 30 days are dropped', () async {
      final store = MemoryInviteStore(invite: CapturedInvite(code: 'OLD123', at: t0.subtract(const Duration(days: 31))), checked: true);
      final c = InviteCapture(store: store, clock: () => t0);
      await c.start();
      expect(c.captured, isNull);
      expect(store.invite, isNull);
    });
  });

  group('server mode', () {
    late List<http.Request> sent;
    ApiClient client(Future<http.Response> Function(http.Request r) handler) {
      sent = [];
      return ApiClient(baseUrl: 'https://api.test/v1', httpClient: MockClient((r) {
        sent.add(r);
        return handler(r);
      }), tokens: MemoryTokenStore());
    }

    http.Response json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});
    Map<String, dynamic> signedIn({Map<String, dynamic>? invitedBy, bool claimable = false}) => {
          'tokens': {'accessToken': 'a1', 'refreshToken': 'r1'},
          'isNew': true,
          'user': {'id': 'u1', 'name': '', 'age': 0, 'onboarded': false, 'inviteCode': 'NEWBIE1', 'invitedBy': invitedBy, 'referralClaimable': claimable},
        };

    test('OTP sign-up sends inviteCode, inviteSource, inviteVia and deviceId, then forgets the code', () async {
      final api = client((r) async => r.url.path.endsWith('/auth/otp/verify') ? json(signedIn(invitedBy: {'name': 'Ali', 'status': 'PENDING'})) : json({}));
      final store = MemoryInviteStore(invite: CapturedInvite(code: 'ALI123', source: 'tiktok', via: InviteVia.install, at: DateTime.now()), checked: true);
      final invites = InviteCapture(store: store);
      final session = RemoteSessionProvider(api, invites: invites);
      await session.signIn(method: 'email', email: 'New@Vibe.test', code: '1234');
      final body = jsonDecode(sent.firstWhere((r) => r.url.path.endsWith('/auth/otp/verify')).body) as Map;
      expect(body['email'], 'new@vibe.test');
      expect(body['inviteCode'], 'ALI123');
      expect(body['inviteSource'], 'tiktok');
      expect(body['inviteVia'], 'install');
      expect(InviteLinks.validDeviceId(body['deviceId'] as String?), isTrue);
      expect(store.invite, isNull, reason: 'cleared after sign-up');
      expect(session.invitedBy?.name, 'Ali');
      expect(session.referralClaimable, isFalse);
    });

    test('social sign-in carries the same fields; no code → only deviceId; claimable is read', () async {
      final api = client((r) async => r.url.path.endsWith('/auth/social') ? json(signedIn(claimable: true)) : json({}));
      final store = MemoryInviteStore(deviceId: 'device-1234-abcd', checked: true);
      final session = RemoteSessionProvider(api, invites: InviteCapture(store: store));
      await session.signInWith(const SocialCredential(provider: 'google', idToken: 'tok'));
      final body = jsonDecode(sent.firstWhere((r) => r.url.path.endsWith('/auth/social')).body) as Map;
      expect(body['provider'], 'google');
      expect(body['deviceId'], 'device-1234-abcd');
      expect(body.containsKey('inviteCode'), isFalse);
      expect(session.referralClaimable, isTrue);
      session.applyClaim(const ClaimResult(status: ReferralStatus.pending, inviterName: 'Sana'));
      expect(session.referralClaimable, isFalse);
      expect(session.invitedBy?.name, 'Sana');
    });

    test('a bad reply to the background time-zone sync never escapes as an error (any runner time zone)', () async {
      // The server's offset differs from this device's, so sign-in fires the
      // unawaited PATCH /me; the reply is malformed on purpose.
      final serverTz = SessionProvider.deviceTzOffsetMinutes() == 300 ? 0 : 300;
      final api = client((r) async {
        if (r.url.path.endsWith('/auth/otp/verify')) return json({...signedIn(), 'user': {...signedIn()['user'] as Map, 'tzOffsetMinutes': serverTz}});
        return json({});
      });
      final session = RemoteSessionProvider(api, invites: InviteCapture(store: MemoryInviteStore(checked: true)));
      await session.signIn(method: 'email', email: 'tz@vibe.test', code: '1234');
      await pumpEventQueue();
      expect(sent.where((r) => r.method == 'PATCH' && r.url.path.endsWith('/me')), hasLength(1));
    });

    test('GET /referrals maps people, steps, milestones and the partner link', () {
      final v = ApiMap.referrals(_overview(affiliate: {'code': 'ZARA', 'link': 'https://vibe.fawadiqbal.dev/i/ZARA'}));
      expect(v.code, 'SARA7K');
      expect(v.rewards.inviteeCoins, 50);
      expect(v.people, hasLength(3));
      expect(v.people.first.firstName, 'Ali');
      expect(v.people.first.steps.calls, 2);
      expect(v.people[1].status, ReferralStatus.rewarded);
      expect(v.people[2].rejectText, 'Joined on the same phone as you');
      expect(v.milestones.map((m) => m.rewardLabel), ['7 days of VIP', '30 days of VIP', '1,000 coins']);
      expect(v.next?.remaining, 2);
      expect(v.affiliate?.code, 'ZARA');
      expect(v.linkFor('whatsapp'), 'https://vibe.fawadiqbal.dev/i/SARA7K?s=whatsapp');
    });

    test('preview, claim and its errors', () async {
      final api = client((r) async {
        if (r.url.path.contains('/referrals/preview/')) return json({'valid': true, 'kind': 'affiliate', 'name': 'Zara Creates', 'avatarUrl': null, 'inviteeCoins': 50});
        if (r.url.path.endsWith('/referrals/claim')) {
          final code = (jsonDecode(r.body) as Map)['code'];
          if (code == 'LATE01') return json({'error': {'code': 'INVITE_TOO_LATE', 'message': 'too late'}}, 409);
          return json({'id': 'x', 'status': 'PENDING', 'rejectReason': null, 'inviter': {'name': 'Ali'}, 'kind': 'user', 'inviteeCoins': 50});
        }
        return json(_overview());
      });
      await api.setTokens({'accessToken': 'a', 'refreshToken': 'r'});
      final p = RemoteReferralsProvider(api, FakeRealtime(api));
      final pv = await p.preview('zaracreates', source: 'TikTok');
      expect(pv.partner, isTrue);
      expect(pv.name, 'Zara Creates');
      expect(sent.last.url.path, '/v1/referrals/preview/ZARACREATES');
      expect(sent.last.url.queryParameters['s'], 'tiktok');
      final r = await p.claim('ali123');
      expect(r.inviterName, 'Ali');
      expect(jsonDecode(sent.firstWhere((x) => x.url.path.endsWith('/claim')).body), {'code': 'ALI123'});
      await expectLater(p.claim('LATE01'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'INVITE_TOO_LATE')));
      await expectLater(p.claim('a!'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'VALIDATION_FAILED')));
      p.dispose();
    });

    test('referral:updated moves a row and toasts; referral:milestone celebrates', () async {
      final api = client((r) async => json(_overview()));
      await api.setTokens({'accessToken': 'a', 'refreshToken': 'r'});
      final rt = FakeRealtime(api);
      final p = RemoteReferralsProvider(api, rt);
      await p.load();
      final updates = <ReferralUpdate>[];
      final milestones = <MilestoneReached>[];
      final s1 = p.updates.listen(updates.add);
      final s2 = p.milestonesReached.listen(milestones.add);
      rt.emit(Ev.referralUpdated, {'referral': _person('r1', 'Ali Khan', status: 'REWARDED', calls: 3, coins: 100), 'event': 'rewarded', 'coins': 100});
      rt.emit(Ev.referralMilestone, {'index': 1, 'count': 3, 'reward': {'kind': 'vip', 'amount': 7}});
      await Future<void>.delayed(const Duration(milliseconds: 10));
      expect(updates.single.notice, '+100 coins — Ali is now active');
      expect(milestones.single.reward.rewardLabel, '7 days of VIP');
      expect(sent.where((r) => r.url.path == '/v1/referrals').length, greaterThanOrEqualTo(2), reason: 'reloads after a live change');
      await s1.cancel();
      await s2.cancel();
      p.dispose();
    });
  });

  group('offline mock', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    test('friends at every stage; the demo walks one to a milestone', () async {
      final backend = MockBackend(fast: true);
      final p = ReferralsProvider(backend) as LocalReferralsProvider;
      await p.load();
      final v = p.view!;
      expect(v.people, hasLength(6));
      expect(v.stats.rewarded, 2);
      expect(v.stats.rejected, 1);
      expect(v.stats.coinsEarned, 200);
      expect(v.next?.remaining, 1);
      final reached = <MilestoneReached>[];
      final sub = p.milestonesReached.listen(reached.add);
      // The qualified friend gets paid → 3 active → 7 days of VIP.
      final u = p.advanceDemo()!;
      expect(u.event, ReferralEvent.rewarded);
      await Future<void>.delayed(Duration.zero);
      expect(p.view!.stats.rewarded, 3);
      expect(reached.single.reward.kind, MilestoneReward.vip);
      expect(p.view!.milestones.first.reached, isTrue);
      await sub.cancel();
    });

    test('claim: unknown, own, used, malformed', () async {
      final p = ReferralsProvider(MockBackend(fast: true));
      Future<String> code(String c) async {
        try {
          await p.claim(c);
          return 'ok';
        } on ApiException catch (e) {
          return e.code;
        }
      }

      expect(await code('NOPE99'), 'INVITE_CODE_INVALID');
      expect(await code('vibe4u'), 'INVITE_SELF');
      expect(await code('x'), 'VALIDATION_FAILED');
      expect(await code('ALI123'), 'ok');
      expect(await code('SANA77'), 'INVITE_ALREADY_USED');
    });

    test('local sign-in: a known code makes the referral, none leaves the claim open', () async {
      final backend = MockBackend(fast: true);
      final withCode = SessionProvider(backend, invites: InviteCapture(store: MemoryInviteStore(invite: CapturedInvite(code: 'ALI123', at: DateTime.now()), checked: true)));
      await withCode.signIn(method: 'email');
      expect(withCode.invitedBy?.name, 'Ali');
      expect(withCode.referralClaimable, isFalse);
      final without = SessionProvider(MockBackend(fast: true), invites: InviteCapture(store: MemoryInviteStore(checked: true)));
      await without.signIn(method: 'email');
      expect(without.referralClaimable, isTrue);
    });
  });

  test('catalog rules feed the invite numbers', () {
    final before = (Economy.inviteeRewardCoins, Economy.referralActivationCalls, Economy.referralRequireVerified, Economy.referralMilestones);
    addTearDown(() {
      Economy.inviteeRewardCoins = before.$1;
      Economy.referralActivationCalls = before.$2;
      Economy.referralRequireVerified = before.$3;
      Economy.referralMilestones = before.$4;
    });
    CatalogProvider().apply({
      'economy': {'inviteeRewardCoins': 60, 'referralActivationCalls': 5, 'referralRequireVerified': 0, 'referralMilestone1': 4, 'referralMilestone1VipDays': 14, 'referralMilestone3Coins': 2000},
    });
    expect(Economy.inviteeRewardCoins, 60);
    expect(Economy.referralActivationCalls, 5);
    expect(Economy.referralRequireVerified, isFalse);
    expect(Economy.referralMilestones.first.count, 4);
    expect(Economy.referralMilestones.first.amount, 14);
    expect(Economy.referralMilestones[1].count, 10);
    expect(Economy.referralMilestones.last.amount, 2000);
    expect(ReferralRewards.fromEconomy().requireVerified, isFalse);
  });

  test('claim errors read like a person wrote them', () {
    String t(String code) => claimErrorText(ApiException(code, 'raw'));
    expect(t('INVITE_CODE_INVALID'), contains("couldn't find that code"));
    expect(t('INVITE_TOO_LATE'), contains('48 hours'));
    expect(t('INVITE_ALREADY_USED'), contains('already joined'));
    expect(t('INVITE_SELF'), contains('your own code'));
    expect(t('VALIDATION_FAILED'), contains('3–20'));
    expect(claimErrorText(ApiException.network()), contains("Can't reach Vibe"));
    expect(t('SOMETHING_ELSE'), 'raw');
  });

  test('push routes: invite and partner', () {
    expect(PushRoute.fromData({'route': 'invite', 'referralId': 'r1', 'category': 'social'}), const PushRoute(PushTarget.invite));
    expect(PushRoute.fromData({'route': 'partner', 'payoutId': 'p1'}), const PushRoute(PushTarget.partner));
  });

  test('badges: 11, ambassador last', () {
    expect(Badges.all, hasLength(11));
    expect(Badges.all.last.id, 'ambassador');
    expect(Badges.info('ambassador').emoji, '🎖️');
    expect(Badges.how(Badges.info('ambassador')), '10 friends active with your invite');
  });

  test('share card text: first names only, the link with its channel', () {
    const link = 'https://vibe.fawadiqbal.dev/i/SARA7K?s=card_streak';
    const streak = ShareCardData.streak(30, friend: 'Ali Khan');
    expect(streak.headline, 'Our 30-day streak 🔥');
    expect(streak.channel, 'card_streak');
    expect(streak.message(link, 50), allOf(contains('Me & Ali '), contains(link), isNot(contains('Khan'))));
    expect(const ShareCardData.level(12).message(link, 50), startsWith("I'm Level 12 on Vibe"));
    expect(const ShareCardData.match(friend: 'Sana').headline, 'We vibed 💞');
  });
}

class _CountingReferrer implements InstallReferrer {
  _CountingReferrer(this.value, this.onRead);
  final String? value;
  final void Function() onRead;
  @override
  Future<String?> read() async {
    onRead();
    return value;
  }
}
