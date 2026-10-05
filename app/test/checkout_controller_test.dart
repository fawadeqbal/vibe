import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/core/api/api_exception.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/models/payments.dart';
import 'package:vibe_app/services/payments/checkout_controller.dart';
import 'package:vibe_app/services/payments/payment_links.dart';
import 'package:vibe_app/services/payments/store_billing.dart';

import 'fakes.dart';

void main() {
  late FakeCheckout backend;
  var n = 0;

  CheckoutController controller({FakeBilling? billing, bool android = true, bool storeBuild = false, Duration poll = const Duration(seconds: 30)}) =>
      CheckoutController(backend: backend, billing: billing, kind: ProductKind.coinPack, productId: 'starter', usd: 4.99, android: android, storeBuild: storeBuild, pollEvery: poll, newKey: () => 'key${++n}');

  PaymentMethodOption method(PaymentMethod m) => backend.methods.firstWhere((o) => o.method == m);

  setUp(() {
    backend = FakeCheckout();
    n = 0;
  });

  test('methods are filtered for the platform: no App Store on Android', () async {
    backend.methods = [option(PaymentMethod.appStore, PaymentFlow.store), ...backend.methods];
    final c = controller();
    await c.load();
    expect(c.stage, CheckoutStage.methods);
    expect(c.methods.map((m) => m.method), isNot(contains(PaymentMethod.appStore)));
    expect(c.methods.first.method, PaymentMethod.googlePlay);
  });

  test('a store build goes straight to store billing', () async {
    final billing = FakeBilling(StoreBuyResult(StoreBuyStatus.answered, purchase: view('s1', PurchaseState.succeeded, method: PaymentMethod.googlePlay, currency: 'USD', amount: 4.99)));
    final c = controller(billing: billing, storeBuild: true);
    await c.load();
    expect(billing.buys, 1);
    expect(c.stage, CheckoutStage.succeeded);
    expect(c.price, (currency: 'USD', amount: 4.99));
  });

  test('store cancelled returns to the method list; Play "pending" waits', () async {
    final billing = FakeBilling(const StoreBuyResult(StoreBuyStatus.cancelled));
    final c = controller(billing: billing);
    await c.load();
    await c.choose(method(PaymentMethod.googlePlay));
    expect(c.stage, CheckoutStage.methods);
    billing.result = const StoreBuyResult(StoreBuyStatus.pending, message: 'Google Play is waiting for your payment.');
    await c.choose(method(PaymentMethod.googlePlay));
    expect(c.stage, CheckoutStage.approveInApp);
    expect(c.notice, contains('waiting'));
  });

  test('a dev-mode store gets a stand-in receipt (never real billing); live without a store is an error', () async {
    backend.methods = [option(PaymentMethod.googlePlay, PaymentFlow.store, live: false), option(PaymentMethod.bank, PaymentFlow.manual)];
    backend.onCreate = (r) => view('d1', PurchaseState.succeeded, method: PaymentMethod.googlePlay);
    final billing = FakeBilling(const StoreBuyResult(StoreBuyStatus.failed));
    final c = controller(billing: billing);
    await c.load();
    await c.choose(c.methods.first);
    expect(billing.buys, 0, reason: 'a dev server never verifies or consumes a real store purchase');
    expect(backend.requests.single.receipt, startsWith('dev-'));
    expect(backend.requests.single.method, PaymentMethod.googlePlay);
    expect(c.stage, CheckoutStage.succeeded);

    backend.methods = [option(PaymentMethod.googlePlay, PaymentFlow.store), option(PaymentMethod.bank, PaymentFlow.manual)];
    final live = controller(billing: FakeBilling(const StoreBuyResult(StoreBuyStatus.unavailable), available: false));
    await live.load();
    await live.choose(live.methods.first);
    expect(live.stage, CheckoutStage.failed);
    expect(live.error, contains('not available'));
  });

  test('wallet: validates the number and CNIC before calling the server', () async {
    final c = controller();
    await c.load();
    await c.choose(method(PaymentMethod.jazzCash));
    expect(c.stage, CheckoutStage.details);
    expect(c.price.currency, 'PKR');
    await c.submitDetails(phone: '12345');
    expect(c.error, contains('number'));
    await c.submitDetails(phone: '0300 1234567', cnicLast6: '12');
    expect(c.error, contains('CNIC'));
    expect(backend.calls, isNot(contains('create')));
  });

  test('wallet approve-in-app: live update finishes it; one idempotency key per attempt', () async {
    final c = controller();
    await c.load();
    await c.choose(method(PaymentMethod.jazzCash));
    await c.submitDetails(phone: '+92 300 1234567', cnicLast6: '123456');
    expect(c.stage, CheckoutStage.approveInApp);
    final req = backend.requests.single;
    expect(req.phone, '03001234567');
    expect(req.cnicLast6, '123456');
    expect(req.returnUrl, kPaymentReturnUrl);
    expect(c.waiting, isTrue);

    backend.push(view('other', PurchaseState.succeeded)); // someone else's purchase
    await Future<void>.delayed(Duration.zero);
    expect(c.stage, CheckoutStage.approveInApp);

    backend.push(view('p1', PurchaseState.succeeded));
    await Future<void>.delayed(Duration.zero);
    expect(c.stage, CheckoutStage.succeeded);
    expect(c.waiting, isFalse);
    expect(backend.keys, ['key1']);
    c.dispose();
  });

  test('polls while waiting and visible, stops when hidden', () async {
    final c = controller(poll: const Duration(milliseconds: 20));
    await c.load();
    await c.choose(method(PaymentMethod.easypaisa));
    await c.submitDetails(phone: '03001234567');
    await Future<void>.delayed(const Duration(milliseconds: 70));
    final polls = backend.calls.where((x) => x == 'get').length;
    expect(polls, greaterThanOrEqualTo(2));
    c.setVisible(false);
    final before = backend.calls.length;
    await Future<void>.delayed(const Duration(milliseconds: 70));
    expect(backend.calls.length, before);
    backend.onGet = () => view('p1', PurchaseState.succeeded);
    c.setVisible(true); // refreshes at once
    await Future<void>.delayed(const Duration(milliseconds: 10));
    expect(c.stage, CheckoutStage.succeeded);
    c.dispose();
  });

  test('"I\'ve approved" asks the provider; cancel closes the purchase', () async {
    final c = controller();
    await c.load();
    await c.choose(method(PaymentMethod.easypaisa));
    await c.submitDetails(phone: '03001234567');
    backend.onCheck = () => view('p1', PurchaseState.requiresAction, action: const PaymentAction(type: PaymentActionType.approveInApp));
    await c.checkNow();
    expect(backend.calls, contains('check'));
    expect(c.stage, CheckoutStage.approveInApp);
    await c.cancel();
    expect(c.stage, CheckoutStage.expired);
    c.dispose();
  });

  test('a late "pending" poll never reopens a finished purchase', () async {
    final c = controller();
    await c.load();
    await c.choose(method(PaymentMethod.easypaisa));
    await c.submitDetails(phone: '03001234567');
    backend.push(view('p1', PurchaseState.succeeded));
    await Future<void>.delayed(Duration.zero);
    backend.push(view('p1', PurchaseState.requiresAction, action: const PaymentAction(type: PaymentActionType.approveInApp)));
    await Future<void>.delayed(Duration.zero);
    expect(c.stage, CheckoutStage.succeeded);
    c.dispose();
  });

  test('dev OTP: wrong code stays inline; a decline fails; retry uses a new key', () async {
    backend.onCreate = (r) => view('p1', PurchaseState.requiresAction, action: const PaymentAction(type: PaymentActionType.otp));
    final c = controller();
    await c.load();
    await c.choose(method(PaymentMethod.easypaisa));
    await c.submitDetails(phone: '03001234567');
    expect(c.stage, CheckoutStage.otp);
    await c.confirmOtp('12');
    expect(c.error, isNotNull);
    expect(c.stage, CheckoutStage.otp);
    backend.onConfirm = (otp) => ApiException('VALIDATION_FAILED', 'The code is 4 digits', status: 400);
    await c.confirmOtp('1234');
    expect(c.stage, CheckoutStage.otp);
    expect(c.error, 'The code is 4 digits');
    backend.onConfirm = (otp) => declined('Your balance is too low.');
    await c.confirmOtp('1234');
    expect(c.stage, CheckoutStage.failed);
    expect(c.error, 'Your balance is too low.');
    await c.retry();
    expect(c.stage, CheckoutStage.details);
    await c.submitDetails(phone: '03001234567');
    expect(backend.keys, ['key1', 'key2']);
    c.dispose();
  });

  test('a declined charge (402) fails the attempt with the server message', () async {
    backend.onCreate = (r) => declined('Your bank declined the card.');
    final c = controller();
    await c.load();
    await c.choose(method(PaymentMethod.card));
    expect(c.stage, CheckoutStage.failed);
    expect(c.error, 'Your bank declined the card.');
  });

  test('redirect: back from the hosted page refreshes; "cancelled" cancels', () async {
    backend.onCreate = (r) => view('p1', PurchaseState.requiresAction, method: PaymentMethod.card, action: const PaymentAction(type: PaymentActionType.redirect, url: 'https://pay.example/x'));
    final c = controller();
    await c.load();
    await c.choose(method(PaymentMethod.card));
    expect(c.stage, CheckoutStage.redirect);
    expect(backend.requests.single.returnUrl, kPaymentReturnUrl);
    await c.onReturn(const PaymentReturn(purchaseId: 'nope', status: 'done'));
    expect(backend.calls.where((x) => x == 'get'), isEmpty, reason: 'another purchase: ignored');
    backend.onGet = () => view('p1', PurchaseState.succeeded, method: PaymentMethod.card);
    await c.onReturn(const PaymentReturn(purchaseId: 'p1', status: 'done'));
    expect(c.stage, CheckoutStage.succeeded);

    final d = controller();
    await d.load();
    await d.choose(method(PaymentMethod.card));
    await d.onReturn(const PaymentReturn(purchaseId: 'p1', status: 'cancelled'));
    expect(backend.calls.last, 'cancel');
    expect(d.stage, CheckoutStage.expired);
    c.dispose();
    d.dispose();
  });

  test('bank transfer shows details and takes a reference', () async {
    backend.onCreate = (r) => view('p1', PurchaseState.requiresAction,
        method: PaymentMethod.bank,
        action: const PaymentAction(type: PaymentActionType.bankTransfer, bank: BankDetails(bankName: 'Meezan', accountTitle: 'Vibe', iban: 'PK36SCBL0000001123456702', reference: 'VB123', amount: 'PKR 1400.00')));
    backend.onGet = () => view('p1', PurchaseState.requiresAction, method: PaymentMethod.bank, action: const PaymentAction(type: PaymentActionType.bankTransfer));
    final c = controller();
    await c.load();
    await c.choose(method(PaymentMethod.bank));
    expect(c.stage, CheckoutStage.bankTransfer);
    expect(c.purchase!.action!.bank!.reference, 'VB123');
    await c.sendBankReference('x');
    expect(c.error, isNotNull);
    await c.sendBankReference('FT24123ABC');
    expect(backend.calls.last, 'bank-ref:FT24123ABC');
    expect(c.bankReferenceSent, isTrue);
    c.dispose();
  });
}
