import 'dart:async';

import 'package:vibe_app/core/api/api_exception.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/models/payments.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/services/payments/store_billing.dart';

PurchaseView view(String id, PurchaseState state, {PaymentMethod method = PaymentMethod.jazzCash, PaymentAction? action, String? reason, String currency = 'PKR', double amount = 1400}) => PurchaseView(
      id: id,
      state: state,
      productType: ProductKind.coinPack,
      productId: 'starter',
      method: method,
      usd: 4.99,
      currency: currency,
      amount: amount,
      action: action,
      failureReason: reason,
      receipt: state == PurchaseState.succeeded ? 'R-1' : null,
    );

PaymentMethodOption option(PaymentMethod m, PaymentFlow flow, {bool live = true, Set<String> needs = const {}}) =>
    PaymentMethodOption(method: m, flow: flow, label: m.label, live: live, currency: flow == PaymentFlow.store ? 'USD' : 'PKR', needs: needs);

/// A scripted [CheckoutBackend]: tests set the answers and read the calls.
class FakeCheckout implements CheckoutBackend {
  FakeCheckout({List<PaymentMethodOption>? methods})
      : methods = methods ??
            [
              option(PaymentMethod.googlePlay, PaymentFlow.store),
              option(PaymentMethod.jazzCash, PaymentFlow.wallet, needs: {'phone', 'cnicLast6'}),
              option(PaymentMethod.easypaisa, PaymentFlow.wallet, needs: {'phone'}),
              option(PaymentMethod.card, PaymentFlow.redirect),
              option(PaymentMethod.bank, PaymentFlow.manual),
            ];

  List<PaymentMethodOption> methods;
  final calls = <String>[];
  final keys = <String>[];
  final requests = <PurchaseRequest>[];
  final _updates = StreamController<PurchaseView>.broadcast();

  /// Answer for createPurchase (a view, or an exception to throw).
  Object Function(PurchaseRequest r) onCreate = (r) => view('p1', PurchaseState.requiresAction, action: const PaymentAction(type: PaymentActionType.approveInApp, instructions: 'Approve the PKR 1400 payment request in your JazzCash app.'));
  Object Function() onGet = () => view('p1', PurchaseState.requiresAction, action: const PaymentAction(type: PaymentActionType.approveInApp));
  Object Function() onCheck = () => view('p1', PurchaseState.succeeded);
  Object Function(String otp) onConfirm = (otp) => view('p1', PurchaseState.succeeded);
  Object Function() onCancel = () => view('p1', PurchaseState.expired, reason: 'Cancelled');

  void push(PurchaseView p) => _updates.add(p);

  Future<PurchaseView> _answer(Object o) async {
    if (o is Exception) throw o;
    return o as PurchaseView;
  }

  @override
  Future<PaymentOptions> paymentOptions() async {
    calls.add('options');
    return PaymentOptions(methods: methods, usdToPkr: 280, playAccountId: 'acc', appleAccountToken: 'uuid');
  }

  @override
  Future<PurchaseView> createPurchase(PurchaseRequest request, {required String idempotencyKey}) {
    calls.add('create');
    keys.add(idempotencyKey);
    requests.add(request);
    return _answer(onCreate(request));
  }

  @override
  Future<PurchaseView> purchase(String id) {
    calls.add('get');
    return _answer(onGet());
  }

  @override
  Future<PurchaseView> confirmPurchase(String id, String otp) {
    calls.add('confirm:$otp');
    return _answer(onConfirm(otp));
  }

  @override
  Future<PurchaseView> checkPurchase(String id) {
    calls.add('check');
    return _answer(onCheck());
  }

  @override
  Future<PurchaseView> cancelPurchase(String id) {
    calls.add('cancel');
    return _answer(onCancel());
  }

  @override
  Future<PurchaseView> sendBankReference(String id, String reference) {
    calls.add('bank-ref:$reference');
    return _answer(onGet());
  }

  @override
  Stream<PurchaseView> get purchaseUpdates => _updates.stream;
}

ApiException declined([String message = 'The wallet declined the payment.']) => ApiException('PAYMENT_DECLINED', message, status: 402, details: const {'purchaseId': 'p1'});

/// Store billing that answers from a script.
class FakeBilling implements StoreBilling {
  FakeBilling(this.result, {this.available = true});
  StoreBuyResult result;
  bool available;
  int buys = 0;

  @override
  bool get supported => true;
  @override
  Future<bool> isAvailable() async => available;
  @override
  Future<StoreBuyResult> buy({required PaymentOptions options, required ProductKind kind, required String productId}) async {
    buys++;
    return result;
  }

  @override
  Stream<StoreDelivery> get deliveries => const Stream.empty();
  @override
  Future<void> restore() async {}
  @override
  void setSignedIn(bool signedIn) {}
  @override
  void dispose() {}
}
