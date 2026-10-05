import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/util/pk_validation.dart';
import '../../models/models.dart';
import '../../models/payments.dart';
import '../../providers/wallet_provider.dart';
import 'payment_links.dart';
import 'store_billing.dart';

/// Where a checkout is. The screen draws one view per stage.
enum CheckoutStage {
  /// Loading the methods.
  loading,

  /// Pick a method.
  methods,

  /// Wallet number (+ CNIC) form.
  details,

  /// Talking to the server / store.
  processing,

  /// Type the code (dev wallets).
  otp,

  /// Approve in the JazzCash / Easypaisa app (or Play "pending").
  approveInApp,

  /// Finishing on a hosted page (card, JazzCash page).
  redirect,

  /// Bank details shown; staff confirm the transfer.
  bankTransfer,
  succeeded,
  failed,
  expired,
}

/// Drives one purchase (a pack or a plan) through the server's states:
/// picks the flow from the method, keeps one idempotency key per attempt,
/// follows `payment:updated` pushes and polls while a pending step is on
/// screen. UI-free, so it is unit-tested with a fake [CheckoutBackend].
class CheckoutController extends ChangeNotifier {
  CheckoutController({
    required this.backend,
    required this.kind,
    required this.productId,
    required this.usd,
    StoreBilling? billing,
    this.android = false,
    this.ios = false,
    this.storeBuild = false,
    this.pollEvery = const Duration(seconds: 3),
    String Function()? newKey,
  })  : billing = billing ?? NoStoreBilling(),
        _newKey = newKey ?? ApiClient.newIdempotencyKey {
    _updates = backend.purchaseUpdates.listen(_onUpdate);
  }

  final CheckoutBackend backend;
  final StoreBilling billing;
  final ProductKind kind;
  final String productId;
  final double usd;
  final bool android;
  final bool ios;
  final bool storeBuild;
  final Duration pollEvery;
  final String Function() _newKey;

  CheckoutStage _stage = CheckoutStage.loading;
  PaymentOptions? _options;
  PaymentMethodOption? _method;
  PurchaseView? _purchase;
  String? _error;
  String? _notice;
  String? _key;
  bool _busy = false;
  bool _bankReferenceSent = false;
  bool _visible = true;
  bool _disposed = false;
  Timer? _poll;
  late final StreamSubscription<PurchaseView> _updates;

  CheckoutStage get stage => _stage;
  PaymentOptions? get options => _options;
  List<PaymentMethodOption> get methods => _options?.methods ?? const [];
  PaymentMethodOption? get method => _method;
  PurchaseView? get purchase => _purchase;

  /// Inline problem on the current stage (bad code, bad number), or the
  /// failure reason on [CheckoutStage.failed].
  String? get error => _error;

  /// Informational line (e.g. Play pending).
  String? get notice => _notice;
  bool get busy => _busy;
  bool get bankReferenceSent => _bankReferenceSent;
  double get usdToPkr => _options?.usdToPkr ?? Economy.pkrPerUsd;

  /// Waiting on something outside the app: watch the server.
  bool get waiting => const {CheckoutStage.approveInApp, CheckoutStage.redirect, CheckoutStage.bankTransfer}.contains(_stage);

  /// PKR for local methods (the server's figure once known), USD for stores.
  ({String currency, double amount}) get price {
    final p = _purchase;
    if (p != null) return (currency: p.currency, amount: p.amount);
    final m = _method;
    if (m != null && m.isLocalCurrency) return (currency: 'PKR', amount: (usd * usdToPkr).roundToDouble());
    return (currency: 'USD', amount: usd);
  }

  void _set(VoidCallback f) {
    if (_disposed) return;
    f();
    notifyListeners();
  }

  // ── steps ─────────────────────────────────────────────────────────────

  Future<void> load() async {
    _set(() {
      _stage = CheckoutStage.loading;
      _error = null;
    });
    try {
      final all = await backend.paymentOptions();
      final opts = all.forPlatform(android: android, ios: ios, storeBuild: storeBuild);
      _set(() => _options = opts);
      if (opts.methods.isEmpty) {
        _fail('No payment method is available right now. Try again later.');
      } else if (opts.onlyStore != null) {
        await choose(opts.onlyStore!);
      } else {
        _set(() => _stage = CheckoutStage.methods);
      }
    } on ApiException catch (e) {
      _fail(e.message);
    }
  }

  Future<void> choose(PaymentMethodOption m) async {
    _set(() {
      _method = m;
      _error = null;
      _notice = null;
      _purchase = null;
      _key = null; // a new attempt
    });
    switch (m.flow) {
      case PaymentFlow.store:
        await _buyFromStore(m);
      case PaymentFlow.wallet:
        _set(() => _stage = CheckoutStage.details);
      case PaymentFlow.redirect:
      case PaymentFlow.manual:
        await _start();
    }
  }

  /// The wallet form. JazzCash also wants the last 6 digits of the CNIC.
  Future<void> submitDetails({required String phone, String cnicLast6 = ''}) async {
    final m = _method;
    if (m == null) return;
    final mobile = PkValidation.localMobile(phone);
    if (mobile == null) return _set(() => _error = 'Enter your ${m.label} number like 03001234567.');
    final needsCnic = m.needs.contains('cnicLast6');
    if (needsCnic && !PkValidation.cnicLast6(cnicLast6)) return _set(() => _error = 'Enter the last 6 digits of your CNIC.');
    await _start(phone: mobile, cnicLast6: needsCnic ? cnicLast6.trim() : null);
  }

  /// JazzCash without the wallet API: pay on JazzCash's own page instead.
  Future<void> payOnProviderPage() => _start();

  Future<void> _start({String? phone, String? cnicLast6, String? receipt}) async {
    final m = _method!;
    _key ??= _newKey();
    _set(() {
      _stage = CheckoutStage.processing;
      _error = null;
    });
    try {
      final p = await backend.createPurchase(
        PurchaseRequest(productType: kind, productId: productId, method: m.method, phone: phone, cnicLast6: cnicLast6, receipt: receipt, returnUrl: m.flow == PaymentFlow.redirect || m.method == PaymentMethod.jazzCash ? kPaymentReturnUrl : null),
        idempotencyKey: _key!,
      );
      _apply(p);
    } on ApiException catch (e) {
      // A declined charge closes this attempt; the next try gets a new key.
      _key = null;
      if (e.code == 'VALIDATION_FAILED' && m.flow == PaymentFlow.wallet) {
        _set(() {
          _stage = CheckoutStage.details;
          _error = e.message;
        });
      } else {
        _fail(e.message);
      }
    }
  }

  Future<void> _buyFromStore(PaymentMethodOption m) async {
    _set(() => _stage = CheckoutStage.processing);
    final opts = _options!;
    if (!m.live) {
      // The server runs this store in dev mode: it doesn't verify with Google
      // or Apple, nor consume/acknowledge. A stand-in receipt exercises the
      // whole server flow without a real (never-finished) store purchase.
      await _start(receipt: 'dev-${_newKey()}');
      return;
    }
    if (billing.supported && await billing.isAvailable()) {
      final r = await billing.buy(options: opts, kind: kind, productId: productId);
      switch (r.status) {
        case StoreBuyStatus.answered:
          if (r.purchase != null) _apply(r.purchase!);
        case StoreBuyStatus.pending:
          _set(() {
            _purchase = r.purchase ?? _purchase;
            _notice = r.message;
            _stage = CheckoutStage.approveInApp;
          });
          if (r.purchase != null) _watch();
        case StoreBuyStatus.cancelled:
          if (methods.length > 1) {
            _set(() => _stage = CheckoutStage.methods);
          } else {
            _fail('Purchase cancelled. Nothing was charged.');
          }
        case StoreBuyStatus.failed:
        case StoreBuyStatus.unavailable:
          _fail(r.message ?? 'The purchase did not go through.');
      }
      return;
    }
    _fail('${m.label} billing is not available on this device.');
  }

  Future<void> confirmOtp(String code) async {
    final p = _purchase;
    if (p == null) return;
    if (!RegExp(r'^\d{4,6}$').hasMatch(code.trim())) return _set(() => _error = 'Enter the code you received.');
    await _call(() => backend.confirmPurchase(p.id, code.trim()), inlineErrors: true);
  }

  /// "I've approved": asks the provider now.
  Future<void> checkNow() async {
    final p = _purchase;
    if (p != null) await _call(() => backend.checkPurchase(p.id));
  }

  /// Re-reads the purchase (polling, app resumed, back from a hosted page).
  Future<void> refresh() async {
    final p = _purchase;
    if (p == null || _busy) return;
    try {
      _apply(await backend.purchase(p.id), quiet: true);
    } on ApiException catch (_) {
      // Polling is best effort.
    }
  }

  Future<void> cancel() async {
    final p = _purchase;
    if (p == null) return _set(() => _stage = CheckoutStage.methods);
    await _call(() => backend.cancelPurchase(p.id));
  }

  Future<void> sendBankReference(String reference) async {
    final p = _purchase;
    if (p == null) return;
    if (reference.trim().length < 3) return _set(() => _error = 'Enter the reference from your bank app.');
    await _call(() => backend.sendBankReference(p.id, reference), inlineErrors: true);
    if (_error == null) _set(() => _bankReferenceSent = true);
  }

  /// Back from a hosted page (deep link or the in-app web page closing).
  Future<void> onReturn(PaymentReturn r) async {
    final p = _purchase;
    if (p == null || (r.purchaseId != null && r.purchaseId != p.id)) return;
    if (r.cancelled && p.isOpen) {
      await cancel(); // the server checks once more before closing it
    } else {
      await refresh();
    }
  }

  /// Try the same method again (a new attempt, new idempotency key).
  Future<void> retry() async {
    final m = _method;
    if (m == null) return load();
    await choose(m);
  }

  void chooseAnother() {
    _stopWatching();
    _set(() {
      _purchase = null;
      _key = null;
      _error = null;
      _notice = null;
      _stage = _options == null ? CheckoutStage.loading : CheckoutStage.methods;
    });
    if (_options == null) unawaited(load());
  }

  /// The screen is (in)visible: polling only runs while someone looks.
  void setVisible(bool visible) {
    _visible = visible;
    if (visible && waiting) {
      unawaited(refresh());
      _watch();
    } else if (!visible) {
      _poll?.cancel();
      _poll = null;
    }
  }

  // ── internals ─────────────────────────────────────────────────────────

  Future<void> _call(Future<PurchaseView> Function() fn, {bool inlineErrors = false}) async {
    _set(() {
      _busy = true;
      _error = null;
    });
    try {
      _apply(await fn());
    } on ApiException catch (e) {
      if (e.code == 'PAYMENT_DECLINED') {
        _fail(e.message);
      } else {
        _set(() => _error = e.message);
      }
    } finally {
      _set(() => _busy = false);
    }
  }

  void _onUpdate(PurchaseView p) {
    if (_purchase?.id == p.id) _apply(p, quiet: true);
  }

  /// Maps the server's view of the purchase to a stage.
  void _apply(PurchaseView p, {bool quiet = false}) {
    if (_disposed) return;
    // Pushes and polls can arrive out of order: never reopen a closed purchase.
    if (_purchase != null && _purchase!.id == p.id && _purchase!.isFinal && p.isOpen) return;
    final next = switch (p.state) {
      PurchaseState.succeeded => CheckoutStage.succeeded,
      PurchaseState.failed || PurchaseState.refunded => CheckoutStage.failed,
      PurchaseState.expired => CheckoutStage.expired,
      PurchaseState.pending || PurchaseState.requiresAction => switch (p.action?.type) {
          PaymentActionType.otp => CheckoutStage.otp,
          PaymentActionType.redirect => CheckoutStage.redirect,
          PaymentActionType.bankTransfer => CheckoutStage.bankTransfer,
          _ => CheckoutStage.approveInApp,
        },
    };
    // A quiet refresh must not throw people out of the code field they are typing in.
    if (quiet && next == _stage && _purchase?.state == p.state) {
      _purchase = p;
      return;
    }
    _set(() {
      _purchase = p;
      _stage = next;
      if (next == CheckoutStage.failed) _error = p.failureReason ?? 'The payment did not go through.';
      if (next == CheckoutStage.expired) _error = p.failureReason ?? 'The payment was not completed in time.';
    });
    if (waiting) {
      _watch();
    } else {
      _stopWatching();
    }
  }

  void _fail(String message) {
    _stopWatching();
    _set(() {
      _error = message;
      _stage = CheckoutStage.failed;
    });
  }

  void _watch() {
    if (!_visible || _poll != null || _purchase == null) return;
    _poll = Timer.periodic(pollEvery, (_) => refresh());
  }

  void _stopWatching() {
    _poll?.cancel();
    _poll = null;
  }

  @override
  void dispose() {
    _disposed = true;
    _stopWatching();
    _updates.cancel();
    super.dispose();
  }
}
