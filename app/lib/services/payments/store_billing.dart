import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:in_app_purchase/in_app_purchase.dart';

import '../../core/api/api_exception.dart';
import '../../models/models.dart';
import '../../models/payments.dart';
import '../../providers/wallet_provider.dart';
import 'store_decisions.dart';

/// How a store purchase attempt ended, from the app's point of view.
enum StoreBuyStatus {
  /// The server answered (see [StoreBuyResult.purchase]: usually SUCCEEDED).
  answered,

  /// The store is still waiting for the money (Play "pending" payments).
  pending,
  cancelled,
  failed,

  /// No store billing on this device / build.
  unavailable,
}

@immutable
class StoreBuyResult {
  const StoreBuyResult(this.status, {this.purchase, this.message});
  final StoreBuyStatus status;
  final PurchaseView? purchase;
  final String? message;
}

/// A store purchase delivered without anyone waiting for it (redelivered at
/// launch, approved later), so the app can say "coins added".
@immutable
class StoreDelivery {
  const StoreDelivery(this.purchase);
  final PurchaseView purchase;
}

/// Google Play / App Store billing. Long-lived: it listens to the store from
/// app start, so purchases redelivered after a crash, approved later, or
/// left unfinished are verified with the Vibe server and finished properly.
abstract class StoreBilling {
  /// Whether this platform has a store (Android / iOS).
  bool get supported;

  /// The store app is reachable (false on emulators without Play, etc.).
  Future<bool> isAvailable();

  /// Buys a pack (consumable) or plan (subscription). Completes once the
  /// Vibe server has answered, the person cancelled, or it failed.
  Future<StoreBuyResult> buy({required PaymentOptions options, required ProductKind kind, required String productId});

  /// Deliveries nobody was waiting for.
  Stream<StoreDelivery> get deliveries;

  /// "Restore purchases" (required by App Store review for subscriptions):
  /// re-sends this store account's purchases to the server, which delivers
  /// what belongs to this Vibe account. Results arrive on [deliveries].
  Future<void> restore();

  /// Purchases are only sent to the server while someone is signed in.
  void setSignedIn(bool signedIn);

  void dispose();
}

/// No store (offline mock, desktop, tests).
class NoStoreBilling implements StoreBilling {
  @override
  bool get supported => false;
  @override
  Future<bool> isAvailable() async => false;
  @override
  Future<StoreBuyResult> buy({required PaymentOptions options, required ProductKind kind, required String productId}) async => const StoreBuyResult(StoreBuyStatus.unavailable);
  @override
  Stream<StoreDelivery> get deliveries => const Stream.empty();
  @override
  Future<void> restore() async {}
  @override
  void setSignedIn(bool signedIn) {}
  @override
  void dispose() {}
}

/// `in_app_purchase` against the Vibe API ([CheckoutBackend]).
class InAppStoreBilling implements StoreBilling {
  InAppStoreBilling(this._backend, {required this.android, InAppPurchase? iap}) : _iapOverride = iap;

  final CheckoutBackend _backend;

  /// Google Play (true) or the App Store (false).
  final bool android;
  final InAppPurchase? _iapOverride;
  InAppPurchase get _iap => _iapOverride ?? InAppPurchase.instance;

  StreamSubscription<List<PurchaseDetails>>? _sub;
  final _deliveries = StreamController<StoreDelivery>.broadcast();
  final _waiting = <String, Completer<StoreBuyResult>>{}; // by SKU
  final _queued = <PurchaseDetails>[]; // arrived while signed out
  final _inFlight = <String>{}; // receipts being verified
  PaymentOptions? _options;
  bool _signedIn = false;
  bool _restoredThisSession = false;

  /// While an explicit restore runs, finished (restored) purchases are
  /// re-verified too — e.g. a subscription bought before a reinstall.
  DateTime? _restoringUntil;

  PaymentMethod get _method => android ? PaymentMethod.googlePlay : PaymentMethod.appStore;

  @override
  bool get supported => true;

  /// Call once at app start (server mode): StoreKit redelivers unfinished
  /// transactions as soon as someone listens.
  void start() {
    _sub ??= _iap.purchaseStream.listen(_onPurchases, onError: (Object e) => debugPrint('store: $e'));
  }

  @override
  Future<bool> isAvailable() async {
    try {
      return await _iap.isAvailable();
    } catch (_) {
      return false;
    }
  }

  @override
  Stream<StoreDelivery> get deliveries => _deliveries.stream;

  @override
  void setSignedIn(bool signedIn) {
    _signedIn = signedIn;
    if (!signedIn) {
      _options = null;
      _restoredThisSession = false;
      return;
    }
    final queued = List<PurchaseDetails>.of(_queued);
    _queued.clear();
    for (final p in queued) {
      unawaited(_verify(p));
    }
    // Play does not push old purchases on its own: ask for unfinished ones
    // (unconsumed packs, unacknowledged subscriptions) once per sign-in.
    if (android && !_restoredThisSession) {
      _restoredThisSession = true;
      unawaited(_iap.restorePurchases().catchError((Object _) {}));
    }
  }

  @override
  Future<void> restore() async {
    start();
    if (!await isAvailable()) return;
    final options = _options ??= await _backend.paymentOptions();
    _restoringUntil = DateTime.now().add(const Duration(minutes: 1));
    await _iap.restorePurchases(applicationUserName: android ? null : options.appleAccountToken);
  }

  @override
  Future<StoreBuyResult> buy({required PaymentOptions options, required ProductKind kind, required String productId}) async {
    _options = options;
    start();
    if (!await isAvailable()) return StoreBuyResult(StoreBuyStatus.unavailable, message: '${_method.label} billing is not available on this device.');
    final sku = options.skuFor(kind, productId);
    final ProductDetailsResponse found;
    try {
      found = await _iap.queryProductDetails({sku});
    } catch (e) {
      return StoreBuyResult(StoreBuyStatus.failed, message: 'Could not reach ${_method.label}. Try again.');
    }
    if (found.productDetails.isEmpty) {
      return StoreBuyResult(StoreBuyStatus.failed, message: found.error?.message ?? 'This item is not available in ${_method.label} yet.');
    }
    // Play lists one entry per subscription offer; the first is the base/default offer.
    final details = found.productDetails.first;
    final param = PurchaseParam(productDetails: details, applicationUserName: android ? options.playAccountId : options.appleAccountToken);
    final waiter = _waiting[sku] = Completer<StoreBuyResult>();
    try {
      final launched = kind == ProductKind.coinPack
          // Never auto-consume on Play: the server consumes after delivering.
          ? await _iap.buyConsumable(purchaseParam: param, autoConsume: !android)
          : await _iap.buyNonConsumable(purchaseParam: param);
      if (!launched) _finish(sku, const StoreBuyResult(StoreBuyStatus.failed, message: 'The store could not start the purchase.'));
    } on PlatformException catch (e) {
      _finish(sku, StoreBuyResult(StoreBuyStatus.failed, message: e.message ?? 'The store could not start the purchase.'));
    } catch (e) {
      // e.g. "a purchase for this item is already pending": let the stream settle it.
      _finish(sku, StoreBuyResult(StoreBuyStatus.failed, message: '$e'.replaceFirst(RegExp(r'^[A-Za-z]*Exception:?\s*'), '')));
    }
    return waiter.future;
  }

  void _finish(String sku, StoreBuyResult r) {
    final w = _waiting.remove(sku);
    if (w != null && !w.isCompleted) w.complete(r);
  }

  Future<void> _onPurchases(List<PurchaseDetails> list) async {
    for (final p in list) {
      switch (p.status) {
        case PurchaseStatus.pending:
          _finish(p.productID, StoreBuyResult(StoreBuyStatus.pending, message: '${_method.label} is waiting for your payment. Your purchase arrives as soon as it completes.'));
        case PurchaseStatus.canceled:
          await _completeQuietly(p);
          _finish(p.productID, const StoreBuyResult(StoreBuyStatus.cancelled));
        case PurchaseStatus.error:
          await _completeQuietly(p);
          _finish(p.productID, StoreBuyResult(StoreBuyStatus.failed, message: p.error?.message ?? 'The purchase did not go through.'));
        case PurchaseStatus.purchased:
        case PurchaseStatus.restored:
          final restoring = _restoringUntil?.isAfter(DateTime.now()) ?? false;
          if (!restoring && !StoreRules.shouldVerify(purchased: p.status == PurchaseStatus.purchased, restored: p.status == PurchaseStatus.restored, pendingComplete: p.pendingCompletePurchase)) continue;
          if (!_signedIn) {
            _queued.add(p);
            continue;
          }
          unawaited(_verify(p));
      }
    }
  }

  /// iOS: cancelled/failed transactions must still be finished.
  Future<void> _completeQuietly(PurchaseDetails p) async {
    if (android || !p.pendingCompletePurchase) return;
    try {
      await _iap.completePurchase(p);
    } catch (_) {}
  }

  /// Play: the purchase token. App Store: the transaction id.
  String _receipt(PurchaseDetails p) => android ? p.verificationData.serverVerificationData : (p.purchaseID ?? p.verificationData.serverVerificationData);

  Future<void> _verify(PurchaseDetails p) async {
    final receipt = _receipt(p);
    if (receipt.isEmpty || !_inFlight.add(receipt)) return;
    try {
      final options = _options ??= await _backend.paymentOptions();
      final product = options.productForSku(p.productID);
      if (product == null) {
        _finish(p.productID, const StoreBuyResult(StoreBuyStatus.failed, message: 'Unknown store product.'));
        return;
      }
      ServerAnswer answer;
      PurchaseView? view;
      String? message;
      try {
        view = await _backend.createPurchase(PurchaseRequest(productType: product.$1, productId: product.$2, method: _method, receipt: receipt), idempotencyKey: StoreRules.idempotencyKey(receipt));
        // Seen before while Play still said "pending": ask again now it's paid.
        if (view.isOpen && p.status == PurchaseStatus.purchased) view = await _backend.checkPurchase(view.id);
        answer = view.succeeded ? ServerAnswer.succeeded : (view.isOpen ? ServerAnswer.open : ServerAnswer.declined);
        message = view.failureReason;
      } on ApiException catch (e) {
        message = e.message;
        answer = e.code == 'PAYMENT_DECLINED' ? (e.status == 409 ? ServerAnswer.alreadyRedeemed : ServerAnswer.declined) : ServerAnswer.error;
      }
      if (StoreRules.shouldComplete(android: android, answer: answer)) {
        try {
          await _iap.completePurchase(p);
        } catch (e) {
          debugPrint('store: completePurchase failed: $e');
        }
      }
      final waiting = _waiting.containsKey(p.productID);
      final result = switch (answer) {
        ServerAnswer.succeeded => StoreBuyResult(StoreBuyStatus.answered, purchase: view),
        ServerAnswer.open => StoreBuyResult(StoreBuyStatus.pending, purchase: view, message: '${_method.label} is still processing your payment. Your purchase arrives as soon as it completes.'),
        ServerAnswer.alreadyRedeemed => StoreBuyResult(StoreBuyStatus.failed, message: message ?? 'This purchase was already redeemed.'),
        ServerAnswer.declined => StoreBuyResult(StoreBuyStatus.failed, purchase: view, message: message ?? 'The store purchase could not be verified.'),
        ServerAnswer.error => StoreBuyResult(StoreBuyStatus.failed, message: '${message ?? 'Could not reach Vibe.'} Your purchase is safe: we will finish it next time you open the app.'),
      };
      _finish(p.productID, result);
      if (!waiting && answer == ServerAnswer.succeeded && view != null) _deliveries.add(StoreDelivery(view));
    } catch (e) {
      _finish(p.productID, StoreBuyResult(StoreBuyStatus.failed, message: 'Could not verify the purchase. We will retry next time you open the app.'));
    } finally {
      _inFlight.remove(receipt);
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    _deliveries.close();
  }
}
