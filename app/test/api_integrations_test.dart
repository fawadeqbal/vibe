import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/api_exception.dart';
import 'package:vibe_app/core/api/realtime_client.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/models/payments.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';

Map<String, dynamic> _wallet({int coins = 40}) => {
      'coins': coins,
      'gems': 0,
      'checkIn': {'checkedInToday': false, 'nextDay': 0, 'streakDay': 0},
      'ads': {'perDay': 10, 'leftToday': 9},
      'freeFriendRequestsLeft': 3,
    };

Map<String, dynamic> _me() => {'id': 'u1', 'name': 'Sara', 'age': 25, 'gender': 'female', 'countryCode': 'PK', 'avatarUrl': 'https://cdn/a.jpg', 'onboarded': true, 'verified': false};

void main() {
  late List<http.BaseRequest> sent;
  late List<String> bodies;

  ApiClient client(Future<http.Response> Function(http.Request req) handler, {Map<String, String> headers = const {}}) {
    final mock = MockClient((req) {
      sent.add(req);
      bodies.add(utf8.decode(req.bodyBytes, allowMalformed: true));
      return handler(req);
    });
    return ApiClient(baseUrl: 'https://api.test/v1', httpClient: mock, tokens: MemoryTokenStore(), defaultHeaders: headers);
  }

  http.Response json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

  setUp(() {
    sent = [];
    bodies = [];
  });

  test('store builds send X-App-Store on every request', () async {
    final api = client((_) async => json({'methods': [], 'usdToPkr': 280, 'store': {}}), headers: {'X-App-Store': 'play'});
    await api.setTokens({'accessToken': 'a1', 'refreshToken': 'r1'});
    await api.get('/payments/methods');
    expect(sent.single.headers['X-App-Store'], 'play');
    expect(sent.single.headers['Authorization'], 'Bearer a1');
  });

  test('multipart upload: field, file name, type, auth — and one refresh on 401', () async {
    var calls = 0;
    late http.MultipartRequest? captured;
    final mock = MockClient.streaming((req, body) async {
      calls++;
      if (req.url.path.endsWith('/auth/refresh')) {
        return http.StreamedResponse(Stream.value(utf8.encode(jsonEncode({'tokens': {'accessToken': 'a2', 'refreshToken': 'r2'}}))), 200);
      }
      final bytes = await body.toBytes();
      if (req.headers['Authorization'] == 'Bearer a1') return http.StreamedResponse(Stream.value(utf8.encode('{"error":{"code":"TOKEN_EXPIRED","message":"expired"}}')), 401);
      captured = req is http.MultipartRequest ? req : null;
      final text = latin1.decode(bytes);
      expect(req.headers['content-type'], startsWith('multipart/form-data'));
      expect(text, contains('name="selfie"; filename="selfie.jpg"'));
      expect(text.toLowerCase(), contains('content-type: image/jpeg'));
      return http.StreamedResponse(Stream.value(utf8.encode(jsonEncode({..._me(), 'verification': {'status': 'PENDING', 'reason': null}}))), 200);
    });
    final api = ApiClient(baseUrl: 'https://api.test/v1', httpClient: mock, tokens: MemoryTokenStore());
    await api.setTokens({'accessToken': 'a1', 'refreshToken': 'r1'});
    final res = await api.upload('/me/verification', field: 'selfie', bytes: [0xFF, 0xD8, 0xFF, 1, 2, 3], filename: 'selfie.jpg', contentType: 'image/jpeg') as Map;
    expect(res['verification']['status'], 'PENDING');
    expect(calls, 3, reason: '401 → refresh → retried upload with a rebuilt body');
    expect(captured, isNotNull);
    expect(api.accessToken, 'a2');
  });

  test('rewarded ad: AD_NOT_VERIFIED is retried once after the delay', () async {
    var claims = 0;
    final api = client((req) async {
      if (req.url.path.endsWith('/wallet/rewards/ad')) {
        claims++;
        expect(jsonDecode(req.body), {'adToken': 'nonce-1'});
        expect(req.headers['Idempotency-Key'], isNotEmpty);
        return claims == 1 ? json({'error': {'code': 'AD_NOT_VERIFIED', 'message': 'Ad view could not be verified'}}, 400) : json({'reward': 10, 'leftToday': 8, 'wallet': _wallet(coins: 50)});
      }
      return json(_wallet());
    });
    await api.setTokens({'accessToken': 'a1', 'refreshToken': 'r1'});
    final wallet = RemoteWalletProvider(api, RealtimeClient(api, url: 'https://api.test'), adRetryDelay: Duration.zero);
    expect(await wallet.rewardAd(adToken: 'nonce-1'), 10);
    expect(claims, 2);
    expect(wallet.coins, 50);
    wallet.dispose();
  });

  test('a second AD_NOT_VERIFIED surfaces as an error', () async {
    final api = client((req) async => json({'error': {'code': 'AD_NOT_VERIFIED', 'message': 'Ad view could not be verified'}}, 400));
    final wallet = RemoteWalletProvider(api, RealtimeClient(api, url: 'https://api.test'), adRetryDelay: Duration.zero);
    await expectLater(wallet.rewardAd(adToken: 'n'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'AD_NOT_VERIFIED')));
    wallet.dispose();
  });

  test('checkout calls carry the idempotency key and apply the wallet on success', () async {
    final api = client((req) async {
      expect(req.url.path, '/v1/payments/purchases');
      expect(req.headers['Idempotency-Key'], 'attempt-1');
      expect(jsonDecode(req.body), {'productType': 'COIN_PACK', 'productId': 'starter', 'method': 'GOOGLE_PLAY', 'receipt': 'tok'});
      return json({'id': 'p1', 'status': 'SUCCEEDED', 'productType': 'COIN_PACK', 'productId': 'starter', 'method': 'GOOGLE_PLAY', 'usd': 0.99, 'amount': {'currency': 'USD', 'value': 0.99}, 'action': null, 'wallet': _wallet(coins: 130)});
    });
    final wallet = RemoteWalletProvider(api, RealtimeClient(api, url: 'https://api.test'));
    final p = await wallet.createPurchase(const PurchaseRequest(productType: ProductKind.coinPack, productId: 'starter', method: PaymentMethod.googlePlay, receipt: 'tok'), idempotencyKey: 'attempt-1');
    expect(p.succeeded, isTrue);
    expect(wallet.coins, 130);
    wallet.dispose();
  });

  test('payout accounts + cash-out request', () async {
    final api = client((req) async {
      final path = req.url.path;
      if (req.method == 'POST' && path.endsWith('/payout-accounts')) {
        expect(jsonDecode(req.body), {'method': 'JAZZCASH', 'account': '03001234567', 'holderName': 'Sara'});
        return json({'id': 'a1', 'method': 'JAZZCASH', 'accountMasked': '0300•••567', 'holderName': 'Sara', 'isDefault': true});
      }
      if (path.endsWith('/payout-accounts')) return json({'accounts': [{'id': 'a1', 'method': 'JAZZCASH', 'accountMasked': '0300•••567', 'holderName': 'Sara', 'isDefault': true}], 'methods': ['JAZZCASH', 'BANK']});
      if (path.endsWith('/cashouts') && req.method == 'POST') {
        expect(jsonDecode(req.body), {'gems': 6000, 'payoutAccountId': 'a1'});
        expect(req.headers['Idempotency-Key'], isNotEmpty);
        return json({'cashout': {'id': 'c1', 'gems': 6000, 'usdCents': 3000, 'amountPkr': 8400, 'method': 'JAZZCASH', 'accountMasked': '0300•••567', 'status': 'REQUESTED'}, 'wallet': _wallet()});
      }
      if (path.endsWith('/cashouts')) return json([]);
      return json(_wallet());
    });
    final wallet = RemoteWalletProvider(api, RealtimeClient(api, url: 'https://api.test'));
    await wallet.loadPayouts();
    expect(wallet.payoutMethods, [PaymentMethod.jazzCash, PaymentMethod.bank]);
    await wallet.addPayoutAccount(const NewPayoutAccount(method: PaymentMethod.jazzCash, account: '+92 300 1234567', holderName: 'Sara'));
    expect(wallet.defaultPayoutAccount!.id, 'a1');
    final c = await wallet.requestCashout(gems: 6000, payoutAccountId: 'a1');
    expect(c.amountPkr, 8400);
    expect(wallet.cashouts.single.status, CashoutStatus.requested);
    wallet.dispose();
  });

  test('social sign-in posts the provider token; a rejected selfie keeps its reason', () async {
    final api = client((req) async {
      if (req.url.path.endsWith('/auth/social')) {
        expect(jsonDecode(req.body), {'provider': 'apple', 'idToken': 'jwt', 'authorizationCode': 'code', 'nonce': 'raw', 'name': 'Sara Khan'});
        return json({'tokens': {'accessToken': 'a1', 'refreshToken': 'r1'}, 'user': _me()});
      }
      if (req.url.path.endsWith('/auth/providers')) return json({'providers': ['google', 'apple']});
      if (req.url.path.endsWith('/me/verification/challenge')) return json({'id': 'ch_123456789012', 'steps': ['tiltLeft', 'turnRight', 'somethingNew'], 'frames': 3});
      return json({'error': {'code': 'VALIDATION_FAILED', 'message': 'Your face is not clearly visible.'}}, 400);
    });
    final session = RemoteSessionProvider(api);
    expect(await session.socialProviders(), ['google', 'apple']);
    await session.signInWith(const SocialCredential(provider: 'apple', idToken: 'jwt', authorizationCode: 'code', nonce: 'raw', name: 'Sara Khan'));
    expect(session.signedIn, isTrue);
    expect(api.accessToken, 'a1');

    // The server picks the moves; moves this build doesn't know are left out.
    final challenge = await session.verificationChallenge();
    expect(challenge.id, 'ch_123456789012');
    expect(challenge.steps, [LivenessStep.tiltLeft, LivenessStep.turnRight]);

    final v = await session.verifySelfie(SelfieCheck(challengeId: challenge.id, frames: const [
      [0xFF, 0xD8, 0x01],
      [0xFF, 0xD8, 0x02],
      [0xFF, 0xD8, 0x03],
    ]));
    expect(v.status, VerificationStatus.rejected);
    expect(v.reason, 'Your face is not clearly visible.');
    expect(session.verification.status, VerificationStatus.rejected);
    expect(sent.last.url.path, '/v1/me/verification');
    // One multipart request: the challenge id, then the frames in order under "frames".
    final body = bodies.last;
    expect(body, contains('name="challengeId"'));
    expect(RegExp('name="frames"; filename="frame(\\d).jpg"').allMatches(body).map((m) => m.group(1)).toList(), ['0', '1', '2']);
  });
}
