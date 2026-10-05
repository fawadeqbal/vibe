import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:vibe_app/core/config/integrations_config.dart';
import 'package:vibe_app/core/util/pk_validation.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/models/payments.dart';
import 'package:vibe_app/screens/store/hosted_payment.dart';
import 'package:vibe_app/services/auth/nonce.dart';
import 'package:vibe_app/services/auth/social_sign_in.dart';
import 'package:vibe_app/services/media/image_prep.dart';
import 'package:vibe_app/services/payments/payment_links.dart';
import 'package:vibe_app/services/payments/store_decisions.dart';
import 'package:vibe_app/services/push/push_route.dart';

void main() {
  group('IntegrationsConfig', () {
    test('nothing configured: everything off, no store header', () {
      const c = IntegrationsConfig();
      for (final p in [TargetPlatform.android, TargetPlatform.iOS]) {
        expect(c.google.isConfigured(p), isFalse);
        expect(c.facebook.isConfigured(p), isFalse);
        expect(c.firebase.isConfigured(p), isFalse);
        expect(c.rewardedUnit(p), isNull, reason: 'release build without units: ads off');
      }
      expect(c.apple.isConfigured(TargetPlatform.android), isFalse);
      expect(c.appStoreHeader, isNull);
      expect(c.isStoreBuild, isFalse);
    });

    test('debug builds fall back to Google test ad units', () {
      const c = IntegrationsConfig(debug: true);
      expect(c.rewardedUnit(TargetPlatform.android), AdsConfig.testRewardedAndroid);
      expect(c.rewardedUnit(TargetPlatform.iOS), AdsConfig.testRewardedIos);
      const live = IntegrationsConfig(debug: true, ads: AdsConfig(rewardedAndroid: 'ca-app-pub-1/2'));
      expect(live.rewardedUnit(TargetPlatform.android), 'ca-app-pub-1/2');
    });

    test('per-provider rules', () {
      const c = IntegrationsConfig(
        storeBuild: 'play',
        google: GoogleSignInConfig(serverClientId: 'web.apps.googleusercontent.com'),
        apple: AppleSignInConfig(serviceId: 'com.vibe.signin', redirectUri: 'https://api.vibe/v1/auth/apple/callback'),
        facebook: FacebookConfig(appId: '123', clientToken: 'abc'),
        firebase: FirebaseConfig(apiKey: 'k', projectId: 'p', messagingSenderId: '1', androidAppId: '1:1:android:1'),
      );
      expect(c.appStoreHeader, 'play');
      expect(c.google.isConfigured(TargetPlatform.android), isTrue);
      expect(c.google.isConfigured(TargetPlatform.iOS), isFalse, reason: 'iOS also needs its own client id');
      expect(c.apple.isConfigured(TargetPlatform.android), isTrue);
      expect(const AppleSignInConfig().isConfigured(TargetPlatform.iOS), isTrue, reason: 'native sheet, no keys');
      expect(c.socialConfigured('facebook', TargetPlatform.iOS), isTrue);
      expect(c.firebase.isConfigured(TargetPlatform.android), isTrue);
      expect(c.firebase.isConfigured(TargetPlatform.iOS), isFalse);
      expect(const IntegrationsConfig(storeBuild: 'web').appStoreHeader, isNull);
    });
  });

  group('payment views', () {
    test('PaymentOptions: methods, store tokens, SKUs, platform filter', () {
      final o = PaymentOptions.fromJson({
        'methods': [
          {'method': 'GOOGLE_PLAY', 'flow': 'store', 'label': 'Google Play', 'mode': 'dev', 'currency': 'USD', 'needs': ['receipt']},
          {'method': 'APP_STORE', 'flow': 'store', 'label': 'App Store', 'mode': 'live', 'currency': 'USD', 'needs': ['receipt']},
          {'method': 'JAZZCASH', 'flow': 'wallet', 'label': 'JazzCash', 'mode': 'live', 'currency': 'PKR', 'needs': ['phone', 'cnicLast6']},
          {'method': 'CRYPTO', 'flow': 'redirect', 'label': 'Future method'},
        ],
        'usdToPkr': 281.5,
        'store': {
          'playAccountId': 'abc123',
          'appleAccountToken': '0b1c-uuid',
          'skus': {
            'coinPacks': [{'id': 'starter', 'sku': 'coins_starter', 'usd': 0.99}],
            'vipPlans': [{'id': 'vip_month', 'sku': 'vip_vip_month', 'usd': 9.99}],
          },
        },
      });
      expect(o.methods.length, 3, reason: 'unknown methods are skipped');
      expect(o.usdToPkr, 281.5);
      expect(o.option(PaymentMethod.jazzCash)!.needs, {'phone', 'cnicLast6'});
      expect(o.option(PaymentMethod.googlePlay)!.live, isFalse);
      expect(o.skuFor(ProductKind.vipPlan, 'vip_month'), 'vip_vip_month');
      expect(o.skuFor(ProductKind.coinPack, 'Mega'), 'coins_mega', reason: 'falls back to the server naming rule');
      expect(o.productForSku('coins_starter'), (ProductKind.coinPack, 'starter'));
      expect(o.productForSku('vip_year'), (ProductKind.vipPlan, 'year'));
      final android = o.forPlatform(android: true, ios: false);
      expect(android.methods.map((m) => m.method), [PaymentMethod.googlePlay, PaymentMethod.jazzCash]);
      final store = o.forPlatform(android: true, ios: false, storeBuild: true);
      expect(store.onlyStore?.method, PaymentMethod.googlePlay);
      expect(android.onlyStore, isNull);
    });

    test('PurchaseView: wallet approval, hosted POST form, bank transfer', () {
      final wallet = PurchaseView.fromJson({
        'id': 'p1',
        'status': 'REQUIRES_ACTION',
        'productType': 'COIN_PACK',
        'productId': 'starter',
        'method': 'JAZZCASH',
        'usd': 4.99,
        'amount': {'currency': 'PKR', 'value': 1397},
        'nextAction': 'approve_in_app',
        'action': {'type': 'approve_in_app', 'instructions': 'Approve in JazzCash'},
        'expiresAt': '2026-10-05T10:00:00.000Z',
      });
      expect(wallet.isOpen, isTrue);
      expect(wallet.method, PaymentMethod.jazzCash);
      expect(wallet.currency, 'PKR');
      expect(wallet.amount, 1397);
      expect(wallet.action!.type, PaymentActionType.approveInApp);
      expect(wallet.expiresAt, isNotNull);

      final hosted = PurchaseView.fromJson({
        'id': 'p2',
        'status': 'REQUIRES_ACTION',
        'productType': 'VIP_PLAN',
        'productId': 'vip_month',
        'method': 'JAZZCASH',
        'usd': 9.99,
        'amount': {'currency': 'PKR', 'value': 2797},
        'action': {'type': 'redirect', 'url': 'https://sandbox.jazzcash.com.pk/x', 'method': 'POST', 'fields': {'pp_Amount': 279700, 'pp_TxnRefNo': 'T1'}},
      });
      expect(hosted.productType, ProductKind.vipPlan);
      expect(hosted.action!.post, isTrue);
      expect(hosted.action!.fields, {'pp_Amount': '279700', 'pp_TxnRefNo': 'T1'});

      final bank = PurchaseView.fromJson({
        'id': 'p3',
        'status': 'REQUIRES_ACTION',
        'productType': 'COIN_PACK',
        'productId': 'starter',
        'method': 'BANK',
        'usd': 4.99,
        'amount': {'currency': 'PKR', 'value': 1397},
        'action': {
          'type': 'bank_transfer',
          'bank': {'bankName': 'Meezan Bank', 'accountTitle': 'Vibe Pvt Ltd', 'iban': 'PK36SCBL0000001123456702', 'reference': 'VB9X2K', 'amount': 'PKR 1397.00'},
        },
      });
      expect(bank.action!.bank!.reference, 'VB9X2K');

      final done = PurchaseView.fromJson({'id': 'p4', 'status': 'SUCCEEDED', 'usd': 4.99, 'method': 'GOOGLE_PLAY', 'action': null, 'wallet': {'coins': 135}});
      expect(done.succeeded, isTrue);
      expect(done.isFinal, isTrue);
      expect(done.currency, 'USD');
      expect(done.wallet!['coins'], 135);
    });

    test('PurchaseRequest JSON', () {
      const r = PurchaseRequest(productType: ProductKind.vipPlan, productId: 'vip_month', method: PaymentMethod.easypaisa, phone: '+92 300-1234567', returnUrl: kPaymentReturnUrl);
      expect(r.toJson(), {'productType': 'VIP_PLAN', 'productId': 'vip_month', 'method': 'EASYPAISA', 'phone': '+923001234567', 'returnUrl': 'vibe://payment-return'});
    });

    test('payouts and cash-outs', () {
      final c = Cashout.fromJson({'id': 'c1', 'gems': 5000, 'usdCents': 2500, 'amountPkr': 7000, 'method': 'EASYPAISA', 'accountMasked': '0300•••567', 'status': 'PROCESSING', 'createdAt': '2026-10-01T10:00:00Z'});
      expect(c.usd, 25);
      expect(c.status, CashoutStatus.processing);
      expect(c.copyWith(status: CashoutStatus.paid).status.label, 'Paid');
      final a = PayoutAccount.fromJson({'id': 'a1', 'method': 'BANK', 'accountMasked': 'PK36 •••• 6702', 'holderName': 'Sara', 'bankName': 'Meezan', 'isDefault': true});
      expect(a.method, PaymentMethod.bank);
      expect(const NewPayoutAccount(method: PaymentMethod.bank, account: 'PK36SCBL0000001123456702', holderName: ' Sara ', bankName: 'Meezan').toJson(),
          {'method': 'BANK', 'account': 'PK36SCBL0000001123456702', 'holderName': 'Sara', 'bankName': 'Meezan'});
    });

    test('identities and VIP status', () {
      final v = IdentitiesView.fromJson({
        'email': 'sara@gmail.com',
        'identities': [{'provider': 'GOOGLE', 'email': 'sara@gmail.com', 'linkedAt': '2026-10-01T10:00:00Z', 'lastUsedAt': null}],
        'available': ['GOOGLE', 'APPLE'],
      });
      expect(v.isLinked('google'), isTrue);
      expect(v.available, ['google', 'apple']);
      final s = VipStatus.fromJson({'active': true, 'method': 'GOOGLE_PLAY', 'manageUrl': 'https://play.google.com/store/account/subscriptions?sku=vip_x'});
      expect(s.managedByStore, isTrue);
      expect(VipStatus.fromJson({'active': true, 'method': 'JAZZCASH', 'manageUrl': null}).managedByStore, isFalse);
      expect(VerificationState.fromJson({'status': 'REJECTED', 'reason': 'Face not visible'}).status, VerificationStatus.rejected);
    });
  });

  group('deep links and hosted forms', () {
    test('payment return links', () {
      expect(PaymentReturn.parse(Uri.parse('vibe://payment-return?purchase=p1&status=done')), const PaymentReturn(purchaseId: 'p1', status: 'done'));
      expect(PaymentReturn.parse(Uri.parse('vibe://payment-return?purchase=p1&status=cancelled'))!.cancelled, isTrue);
      expect(PaymentReturn.parse(Uri.parse('vibe://payment-return?status=error')), const PaymentReturn(status: 'error'));
      expect(PaymentReturn.parse(Uri.parse('vibe://other?purchase=p1')), isNull);
      expect(PaymentReturn.parse(Uri.parse('https://payment-return/?purchase=p1')), isNull);
    });

    test('auto-submitting form escapes values', () {
      final html = autoSubmitFormHtml('https://pay.example/checkout?a=1&b=2', {'pp_Description': 'Vibe "Mega" <pack>', 'x': "it's"});
      expect(html, contains('action="https://pay.example/checkout?a=1&amp;b=2"'));
      expect(html, contains('value="Vibe &quot;Mega&quot; &lt;pack&gt;"'));
      expect(html, contains('value="it&#39;s"'));
      expect(html, contains('method="post"'));
      expect(html, contains('.submit()'));
    });
  });

  group('store billing rules', () {
    test('when to finish a store purchase', () {
      for (final android in [true, false]) {
        expect(StoreRules.shouldComplete(android: android, answer: ServerAnswer.succeeded), isTrue);
        expect(StoreRules.shouldComplete(android: android, answer: ServerAnswer.alreadyRedeemed), isTrue);
        expect(StoreRules.shouldComplete(android: android, answer: ServerAnswer.open), isFalse);
        expect(StoreRules.shouldComplete(android: android, answer: ServerAnswer.error), isFalse);
      }
      expect(StoreRules.shouldComplete(android: true, answer: ServerAnswer.declined), isFalse, reason: 'Play refunds unacknowledged purchases');
      expect(StoreRules.shouldComplete(android: false, answer: ServerAnswer.declined), isTrue, reason: 'StoreKit redelivers unfinished transactions forever');
    });

    test('which store events to verify, and a stable key per receipt', () {
      expect(StoreRules.shouldVerify(purchased: true, restored: false, pendingComplete: false), isTrue);
      expect(StoreRules.shouldVerify(purchased: false, restored: true, pendingComplete: true), isTrue);
      expect(StoreRules.shouldVerify(purchased: false, restored: true, pendingComplete: false), isFalse);
      final k = StoreRules.idempotencyKey('token-abc');
      expect(k, StoreRules.idempotencyKey('token-abc'));
      expect(k, isNot(StoreRules.idempotencyKey('token-abd')));
      expect(k.length, lessThanOrEqualTo(100));
    });
  });

  group('Pakistani numbers and IBANs', () {
    test('mobile numbers normalise to 03XXXXXXXXX', () {
      for (final raw in ['03001234567', '0300 1234567', '+92 300 1234567', '923001234567', '00923001234567', '3001234567']) {
        expect(PkValidation.localMobile(raw), '03001234567', reason: raw);
      }
      for (final raw in ['0300123456', '04001234567', '+1 300 1234567', '', 'abc']) {
        expect(PkValidation.localMobile(raw), isNull, reason: raw);
      }
    });

    test('IBAN mod-97 and the Pakistani shape', () {
      expect(PkValidation.iban('pk36 scbl 0000 0011 2345 6702'), 'PK36SCBL0000001123456702');
      expect(PkValidation.iban('PK36SCBL0000001123456703'), isNull, reason: 'checksum');
      expect(PkValidation.iban('PK36SCBL00000011234567'), isNull, reason: 'too short for PK');
      expect(PkValidation.iban('GB82WEST12345698765432'), 'GB82WEST12345698765432');
    });

    test('payout account form rules', () {
      expect(PkValidation.payoutAccount(method: PaymentMethod.jazzCash, account: '03001234567', holderName: 'Sara Khan'), isEmpty);
      expect(PkValidation.payoutAccount(method: PaymentMethod.easypaisa, account: '123', holderName: 'S').keys, containsAll(['account', 'holderName']));
      expect(PkValidation.payoutAccount(method: PaymentMethod.bank, account: 'PK36SCBL0000001123456702', holderName: 'Sara', bankName: '').keys, ['bankName']);
      expect(PkValidation.payoutAccount(method: PaymentMethod.card, account: 'x', holderName: 'Sara').keys, ['account']);
      expect(PkValidation.payoutAccount(method: PaymentMethod.jazzCash, account: '03001234567', holderName: 'Sara', cnic: '123').keys, ['cnic']);
      expect(PkValidation.cnicLast6('123456'), isTrue);
      expect(PkValidation.cnicLast6('12345'), isFalse);
      expect(PkValidation.normaliseAccount(PaymentMethod.bank, 'pk36scbl0000001123456702'), 'PK36SCBL0000001123456702');
    });
  });

  group('sign-in', () {
    test('nonce hashing', () {
      expect(Nonce.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      final n = Nonce.generate();
      expect(n.length, 32);
      expect(RegExp(r'^[0-9A-Za-z\-._]+$').hasMatch(n), isTrue);
      expect(Nonce.generate(), isNot(n));
    });

    test('buttons: server providers this build can run, or fake in debug', () {
      final configured = PlatformSocialSignIn(const IntegrationsConfig(google: GoogleSignInConfig(serverClientId: 'web')), platform: TargetPlatform.android, allowDev: false);
      expect(visibleProviders(server: ['google', 'apple', 'facebook'], social: configured), ['google']);
      final debug = PlatformSocialSignIn(const IntegrationsConfig(), platform: TargetPlatform.android, allowDev: true);
      expect(visibleProviders(server: ['apple', 'facebook'], social: debug), ['apple', 'facebook']);
      expect(visibleProviders(server: const [], social: debug), isEmpty);
      final dev = debug.devCredential('facebook');
      expect(dev.idToken, matches(RegExp(r'^dev:facebook-[0-9a-f]{12}:Dev Facebook user$')));
      expect(dev.toJson(), {'provider': 'facebook', 'idToken': dev.idToken});
      expect(() => configured.devCredential('google'), throwsUnsupportedError);
    });

    test('Apple credential JSON carries the raw nonce and first-sign-in name', () {
      const c = SocialCredential(provider: 'apple', idToken: 'jwt', authorizationCode: 'code', nonce: 'raw', name: ' Sara Khan ');
      expect(c.toJson(), {'provider': 'apple', 'idToken': 'jwt', 'authorizationCode': 'code', 'nonce': 'raw', 'name': 'Sara Khan'});
    });
  });

  group('push routes', () {
    test('notification data → where to go', () {
      expect(PushRoute.fromData({'route': 'chat', 'friendId': 'u1', 'category': 'messages'}), const PushRoute(PushTarget.chat, friendId: 'u1'));
      expect(PushRoute.fromData({'route': 'chat'}), const PushRoute(PushTarget.friends));
      expect(PushRoute.fromData({'route': 'friends', 'userId': 'u2'}), const PushRoute(PushTarget.friends));
      expect(PushRoute.fromData({'route': 'inbox'})!.target, PushTarget.inbox);
      expect(PushRoute.fromData({'route': 'wallet', 'cashoutId': 'c1'}), const PushRoute(PushTarget.wallet, cashoutId: 'c1'));
      expect(PushRoute.fromData({'route': 'store', 'purchaseId': 'p1'})!.purchaseId, 'p1');
      expect(PushRoute.fromData({'route': 'somewhere-new'}), isNull);
      expect(PushRoute.fromData(const {}), isNull);
      expect(pushChannels.keys, ['messages', 'social', 'payments', 'inbox']);
    });
  });

  group('photos', () {
    test('sniffs types and leaves fitting JPEGs alone', () {
      final jpeg = Uint8List.fromList(img.encodeJpg(img.Image(width: 10, height: 10)));
      expect(ImagePrep.sniff(jpeg), 'image/jpeg');
      expect(ImagePrep.sniff(Uint8List.fromList(img.encodePng(img.Image(width: 2, height: 2)))), 'image/png');
      expect(ImagePrep.sniff(Uint8List.fromList([1, 2, 3, 4])), isNull);
      expect(identical(ImagePrep.prepare(jpeg).bytes, jpeg), isTrue);
    });

    test('re-encodes PNG selfies and oversized photos as JPEG ≤ 1600 px', () {
      final png = Uint8List.fromList(img.encodePng(img.Image(width: 2400, height: 1200)));
      final selfie = ImagePrep.prepare(png, jpegOnly: true);
      expect(selfie.contentType, 'image/jpeg');
      final decoded = img.decodeJpg(selfie.bytes)!;
      expect(decoded.width, 1600);
      expect(decoded.height, 800);
      expect(ImagePrep.prepare(png).contentType, 'image/png', reason: 'avatars may stay PNG when small enough');
      expect(() => ImagePrep.prepare(Uint8List.fromList([1, 2, 3, 4, 5])), throwsFormatException);
    });
  });
}
