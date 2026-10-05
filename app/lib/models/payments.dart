/// Payments, payouts and sign-in identities as the Vibe API describes them.
/// Plain immutable classes with `fromJson`, so the checkout and cash-out
/// screens (and their tests) never touch raw maps.
library;

import 'models.dart';

// ── helpers ──────────────────────────────────────────────────────────────

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
double _num(Object? v) => (v as num?)?.toDouble() ?? 0;
Map<String, dynamic> _map(Object? v) => v is Map ? Map<String, dynamic>.from(v) : const {};

PaymentMethod? paymentMethodFromApi(Object? m) => switch (m) {
      'GOOGLE_PLAY' => PaymentMethod.googlePlay,
      'APP_STORE' => PaymentMethod.appStore,
      'JAZZCASH' => PaymentMethod.jazzCash,
      'EASYPAISA' => PaymentMethod.easypaisa,
      'CARD' => PaymentMethod.card,
      'BANK' => PaymentMethod.bank,
      _ => null,
    };

String paymentMethodToApi(PaymentMethod m) => switch (m) {
      PaymentMethod.googlePlay => 'GOOGLE_PLAY',
      PaymentMethod.appStore => 'APP_STORE',
      PaymentMethod.jazzCash => 'JAZZCASH',
      PaymentMethod.easypaisa => 'EASYPAISA',
      PaymentMethod.card => 'CARD',
      PaymentMethod.bank => 'BANK',
    };

// ── what can be paid with ────────────────────────────────────────────────

/// How a method collects money (drives the checkout UI).
enum PaymentFlow { store, wallet, redirect, manual }

/// One method the server offers right now.
class PaymentMethodOption {
  const PaymentMethodOption({required this.method, required this.flow, required this.label, this.live = false, this.currency = 'USD', this.needs = const {}});

  final PaymentMethod method;
  final PaymentFlow flow;
  final String label;

  /// False while the server runs this method's dev stand-in.
  final bool live;

  /// 'USD' (stores) or 'PKR' (local methods).
  final String currency;

  /// Fields to collect first: 'receipt', 'phone', 'cnicLast6'.
  final Set<String> needs;

  bool get isStore => flow == PaymentFlow.store;
  bool get isLocalCurrency => currency == 'PKR';

  static PaymentMethodOption? fromJson(Map<String, dynamic> m) {
    final method = paymentMethodFromApi(m['method']);
    if (method == null) return null; // a method this app version doesn't know
    return PaymentMethodOption(
      method: method,
      flow: switch (m['flow']) {
        'store' => PaymentFlow.store,
        'wallet' => PaymentFlow.wallet,
        'redirect' => PaymentFlow.redirect,
        _ => PaymentFlow.manual,
      },
      label: m['label'] as String? ?? method.label,
      live: m['mode'] == 'live',
      currency: m['currency'] as String? ?? 'USD',
      needs: {...?(m['needs'] as List?)?.cast<String>()},
    );
  }
}

/// A store product id for one pack or plan (`coins_<id>`, `vip_<id>`).
class StoreSku {
  const StoreSku({required this.productType, required this.productId, required this.sku, required this.usd});
  final ProductKind productType;
  final String productId;
  final String sku;
  final double usd;
}

enum ProductKind { coinPack, vipPlan }

String productKindToApi(ProductKind t) => t == ProductKind.coinPack ? 'COIN_PACK' : 'VIP_PLAN';
ProductKind productKindFromApi(Object? t) => t == 'VIP_PLAN' ? ProductKind.vipPlan : ProductKind.coinPack;

/// Everything checkout needs: methods, the PKR rate, and what to tell the stores.
class PaymentOptions {
  const PaymentOptions({required this.methods, required this.usdToPkr, this.playAccountId = '', this.appleAccountToken = '', this.skus = const []});

  final List<PaymentMethodOption> methods;
  final double usdToPkr;

  /// Passed to Google Play as `obfuscatedAccountId`.
  final String playAccountId;

  /// Passed to the App Store as `appAccountToken` (a UUID).
  final String appleAccountToken;
  final List<StoreSku> skus;

  factory PaymentOptions.fromJson(Map<String, dynamic> m) {
    final store = _map(m['store']);
    final skus = _map(store['skus']);
    List<StoreSku> list(Object? v, ProductKind t) => [
          for (final e in (v as List?) ?? const [])
            if (e is Map) StoreSku(productType: t, productId: '${e['id']}', sku: '${e['sku']}', usd: _num(e['usd'])),
        ];
    return PaymentOptions(
      methods: [for (final e in (m['methods'] as List?) ?? const []) if (e is Map) PaymentMethodOption.fromJson(Map<String, dynamic>.from(e))].whereType<PaymentMethodOption>().toList(),
      usdToPkr: _num(m['usdToPkr']) > 0 ? _num(m['usdToPkr']) : Economy.pkrPerUsd,
      playAccountId: store['playAccountId'] as String? ?? '',
      appleAccountToken: store['appleAccountToken'] as String? ?? '',
      skus: [...list(skus['coinPacks'], ProductKind.coinPack), ...list(skus['vipPlans'], ProductKind.vipPlan)],
    );
  }

  PaymentMethodOption? option(PaymentMethod m) {
    for (final o in methods) {
      if (o.method == m) return o;
    }
    return null;
  }

  /// The store SKU for a pack/plan (server list first, then the naming rule).
  String skuFor(ProductKind type, String productId) {
    for (final s in skus) {
      if (s.productType == type && s.productId == productId) return s.sku;
    }
    return storeSkuFor(type, productId);
  }

  /// The pack/plan a store SKU sells.
  (ProductKind, String)? productForSku(String sku) {
    for (final s in skus) {
      if (s.sku == sku) return (s.productType, s.productId);
    }
    if (sku.startsWith('coins_')) return (ProductKind.coinPack, sku.substring(6));
    if (sku.startsWith('vip_')) return (ProductKind.vipPlan, sku.substring(4));
    return null;
  }

  /// Only the methods this device can use: no App Store on Android and
  /// vice versa, and nothing but store billing in a store build.
  PaymentOptions forPlatform({required bool android, required bool ios, bool storeBuild = false}) {
    final keep = methods.where((o) {
      if (o.method == PaymentMethod.googlePlay && !android) return false;
      if (o.method == PaymentMethod.appStore && !ios) return false;
      if (storeBuild && !o.isStore) return false;
      return true;
    }).toList();
    return PaymentOptions(methods: keep, usdToPkr: usdToPkr, playAccountId: playAccountId, appleAccountToken: appleAccountToken, skus: skus);
  }

  /// A store build (or a server that only offers the store) skips the picker.
  PaymentMethodOption? get onlyStore => methods.length == 1 && methods.single.isStore ? methods.single : null;
}

/// The backend's SKU rule (`storeSku()` in payment-adapter.ts).
String storeSkuFor(ProductKind type, String productId) => '${type == ProductKind.coinPack ? 'coins' : 'vip'}_$productId'.toLowerCase();

// ── a purchase ───────────────────────────────────────────────────────────

enum PurchaseState { pending, requiresAction, succeeded, failed, refunded, expired }

PurchaseState purchaseStateFromApi(Object? s) => switch (s) {
      'REQUIRES_ACTION' => PurchaseState.requiresAction,
      'SUCCEEDED' => PurchaseState.succeeded,
      'FAILED' => PurchaseState.failed,
      'REFUNDED' => PurchaseState.refunded,
      'EXPIRED' => PurchaseState.expired,
      _ => PurchaseState.pending,
    };

enum PaymentActionType { otp, approveInApp, redirect, bankTransfer, unknown }

class BankDetails {
  const BankDetails({required this.bankName, required this.accountTitle, required this.iban, required this.reference, required this.amount});
  final String bankName;
  final String accountTitle;
  final String iban;
  final String reference;
  final String amount;

  factory BankDetails.fromJson(Map<String, dynamic> m) => BankDetails(
        bankName: '${m['bankName'] ?? ''}',
        accountTitle: '${m['accountTitle'] ?? ''}',
        iban: '${m['iban'] ?? ''}',
        reference: '${m['reference'] ?? ''}',
        amount: '${m['amount'] ?? ''}',
      );
}

/// What the person must do to finish a pending payment.
class PaymentAction {
  const PaymentAction({required this.type, this.url, this.post = false, this.fields = const {}, this.instructions, this.bank});
  final PaymentActionType type;

  /// redirect: where to go; [post] = form-POST [fields] there (JazzCash hosted page).
  final String? url;
  final bool post;
  final Map<String, String> fields;
  final String? instructions;
  final BankDetails? bank;

  static PaymentAction? fromJson(Object? v) {
    if (v is! Map) return null;
    final m = Map<String, dynamic>.from(v);
    return PaymentAction(
      type: switch (m['type']) {
        'otp' => PaymentActionType.otp,
        'approve_in_app' => PaymentActionType.approveInApp,
        'redirect' => PaymentActionType.redirect,
        'bank_transfer' => PaymentActionType.bankTransfer,
        _ => PaymentActionType.unknown,
      },
      url: m['url'] as String?,
      post: m['method'] == 'POST',
      fields: _map(m['fields']).map((k, v) => MapEntry(k, '$v')),
      instructions: m['instructions'] as String?,
      bank: m['bank'] is Map ? BankDetails.fromJson(_map(m['bank'])) : null,
    );
  }
}

/// `PurchaseView` from the API (also the `payment:updated` payload).
class PurchaseView {
  const PurchaseView({
    required this.id,
    required this.state,
    required this.productType,
    required this.productId,
    required this.method,
    required this.usd,
    required this.currency,
    required this.amount,
    this.receipt,
    this.action,
    this.expiresAt,
    this.failureReason,
    this.createdAt,
    this.completedAt,
    this.wallet,
  });

  final String id;
  final PurchaseState state;
  final ProductKind productType;
  final String productId;
  final PaymentMethod? method;
  final double usd;

  /// What is charged: USD for stores, PKR for local methods.
  final String currency;
  final double amount;
  final String? receipt;
  final PaymentAction? action;
  final DateTime? expiresAt;
  final String? failureReason;
  final DateTime? createdAt;
  final DateTime? completedAt;

  /// The wallet view (raw) when the purchase succeeded in this response.
  final Map<String, dynamic>? wallet;

  bool get isOpen => state == PurchaseState.pending || state == PurchaseState.requiresAction;
  bool get succeeded => state == PurchaseState.succeeded;
  bool get isFinal => !isOpen;

  factory PurchaseView.fromJson(Map<String, dynamic> m) {
    final amount = _map(m['amount']);
    return PurchaseView(
      id: '${m['id']}',
      state: purchaseStateFromApi(m['status']),
      productType: productKindFromApi(m['productType']),
      productId: '${m['productId'] ?? ''}',
      method: paymentMethodFromApi(m['method']),
      usd: _num(m['usd']),
      currency: amount['currency'] as String? ?? 'USD',
      amount: amount.isEmpty ? _num(m['usd']) : _num(amount['value']),
      receipt: m['receipt'] as String?,
      action: PaymentAction.fromJson(m['action']),
      expiresAt: _date(m['expiresAt']),
      failureReason: m['failureReason'] as String?,
      createdAt: _date(m['createdAt']),
      completedAt: _date(m['completedAt']),
      wallet: m['wallet'] is Map ? _map(m['wallet']) : null,
    );
  }

  PurchaseView copyWith({PurchaseState? state, PaymentAction? action, bool clearAction = false, String? failureReason, String? receipt}) => PurchaseView(
        id: id,
        state: state ?? this.state,
        productType: productType,
        productId: productId,
        method: method,
        usd: usd,
        currency: currency,
        amount: amount,
        receipt: receipt ?? this.receipt,
        action: clearAction ? null : (action ?? this.action),
        expiresAt: expiresAt,
        failureReason: failureReason ?? this.failureReason,
        createdAt: createdAt,
        completedAt: completedAt,
      );
}

/// One checkout attempt as sent to `POST /payments/purchases`.
class PurchaseRequest {
  const PurchaseRequest({required this.productType, required this.productId, required this.method, this.receipt, this.phone, this.cnicLast6, this.returnUrl});
  final ProductKind productType;
  final String productId;
  final PaymentMethod method;
  final String? receipt;
  final String? phone;
  final String? cnicLast6;
  final String? returnUrl;

  Map<String, dynamic> toJson() => {
        'productType': productKindToApi(productType),
        'productId': productId,
        'method': paymentMethodToApi(method),
        if (receipt != null) 'receipt': receipt,
        if (phone != null && phone!.isNotEmpty) 'phone': phone!.replaceAll(RegExp(r'[^0-9+]'), ''),
        if (cnicLast6 != null && cnicLast6!.isNotEmpty) 'cnicLast6': cnicLast6,
        if (returnUrl != null) 'returnUrl': returnUrl,
      };
}

// ── payouts (gems → money) ───────────────────────────────────────────────

class PayoutAccount {
  const PayoutAccount({required this.id, required this.method, required this.accountMasked, required this.holderName, this.bankName, this.isDefault = false, this.createdAt});
  final String id;
  final PaymentMethod method;
  final String accountMasked;
  final String holderName;
  final String? bankName;
  final bool isDefault;
  final DateTime? createdAt;

  factory PayoutAccount.fromJson(Map<String, dynamic> m) => PayoutAccount(
        id: '${m['id']}',
        method: paymentMethodFromApi(m['method']) ?? PaymentMethod.bank,
        accountMasked: '${m['accountMasked'] ?? ''}',
        holderName: '${m['holderName'] ?? ''}',
        bankName: m['bankName'] as String?,
        isDefault: m['isDefault'] as bool? ?? false,
        createdAt: _date(m['createdAt']),
      );

  PayoutAccount copyWith({bool? isDefault}) => PayoutAccount(id: id, method: method, accountMasked: accountMasked, holderName: holderName, bankName: bankName, isDefault: isDefault ?? this.isDefault, createdAt: createdAt);
}

class NewPayoutAccount {
  const NewPayoutAccount({required this.method, required this.account, required this.holderName, this.bankName, this.cnic, this.makeDefault = false});
  final PaymentMethod method;
  final String account;
  final String holderName;
  final String? bankName;
  final String? cnic;
  final bool makeDefault;

  Map<String, dynamic> toJson() => {
        'method': paymentMethodToApi(method),
        'account': account,
        'holderName': holderName.trim(),
        if (bankName != null && bankName!.trim().isNotEmpty) 'bankName': bankName!.trim(),
        if (cnic != null && cnic!.trim().isNotEmpty) 'cnic': cnic!.trim(),
        if (makeDefault) 'makeDefault': true,
      };
}

enum CashoutStatus { review, requested, processing, paid, rejected }

CashoutStatus cashoutStatusFromApi(Object? s) => switch (s) {
      'REVIEW' => CashoutStatus.review,
      'PROCESSING' => CashoutStatus.processing,
      'PAID' => CashoutStatus.paid,
      'REJECTED' => CashoutStatus.rejected,
      _ => CashoutStatus.requested,
    };

extension CashoutStatusLabel on CashoutStatus {
  String get label => switch (this) {
        CashoutStatus.review => 'In review',
        CashoutStatus.requested => 'Requested',
        CashoutStatus.processing => 'Sending',
        CashoutStatus.paid => 'Paid',
        CashoutStatus.rejected => 'Returned',
      };
}

class Cashout {
  const Cashout({required this.id, required this.gems, required this.usd, required this.method, required this.accountMasked, required this.status, this.amountPkr, this.failureReason, this.createdAt});
  final String id;
  final int gems;
  final double usd;
  final int? amountPkr;
  final PaymentMethod method;
  final String accountMasked;
  final CashoutStatus status;
  final String? failureReason;
  final DateTime? createdAt;

  factory Cashout.fromJson(Map<String, dynamic> m) => Cashout(
        id: '${m['id']}',
        gems: (m['gems'] as num?)?.toInt() ?? 0,
        usd: _num(m['usdCents']) / 100,
        amountPkr: (m['amountPkr'] as num?)?.toInt(),
        method: paymentMethodFromApi(m['method']) ?? PaymentMethod.bank,
        accountMasked: '${m['accountMasked'] ?? ''}',
        status: cashoutStatusFromApi(m['status']),
        failureReason: m['failureReason'] as String?,
        createdAt: _date(m['createdAt']),
      );

  Cashout copyWith({CashoutStatus? status, String? failureReason}) =>
      Cashout(id: id, gems: gems, usd: usd, amountPkr: amountPkr, method: method, accountMasked: accountMasked, status: status ?? this.status, failureReason: failureReason ?? this.failureReason, createdAt: createdAt);
}

// ── sign-in identities ───────────────────────────────────────────────────

/// A credential from a platform SDK, as `POST /auth/social` takes it.
class SocialCredential {
  const SocialCredential({required this.provider, this.idToken, this.accessToken, this.authorizationCode, this.nonce, this.name});

  /// 'google' | 'apple' | 'facebook'.
  final String provider;
  final String? idToken;
  final String? accessToken;
  final String? authorizationCode;

  /// The RAW nonce (the SDK request carried its SHA-256).
  final String? nonce;
  final String? name;

  Map<String, dynamic> toJson() => {
        'provider': provider,
        if (idToken != null) 'idToken': idToken,
        if (accessToken != null) 'accessToken': accessToken,
        if (authorizationCode != null) 'authorizationCode': authorizationCode,
        if (nonce != null) 'nonce': nonce,
        if (name != null && name!.trim().isNotEmpty) 'name': name!.trim(),
      };
}

class LinkedIdentity {
  const LinkedIdentity({required this.provider, this.email, this.linkedAt, this.lastUsedAt});

  /// Lower-case: 'google' | 'apple' | 'facebook'.
  final String provider;
  final String? email;
  final DateTime? linkedAt;
  final DateTime? lastUsedAt;

  factory LinkedIdentity.fromJson(Map<String, dynamic> m) =>
      LinkedIdentity(provider: '${m['provider']}'.toLowerCase(), email: m['email'] as String?, linkedAt: _date(m['linkedAt']), lastUsedAt: _date(m['lastUsedAt']));
}

class IdentitiesView {
  const IdentitiesView({this.email, this.identities = const [], this.available = const []});

  /// The e-mail the account signs in with by code (null for social-only accounts).
  final String? email;
  final List<LinkedIdentity> identities;

  /// Providers the server can link now (lower-case).
  final List<String> available;

  factory IdentitiesView.fromJson(Map<String, dynamic> m) => IdentitiesView(
        email: m['email'] as String?,
        identities: [for (final e in (m['identities'] as List?) ?? const []) if (e is Map) LinkedIdentity.fromJson(Map<String, dynamic>.from(e))],
        available: [for (final p in (m['available'] as List?) ?? const []) '$p'.toLowerCase()],
      );

  bool isLinked(String provider) => identities.any((i) => i.provider == provider);
}

String socialProviderLabel(String p) => switch (p) {
      'google' => 'Google',
      'apple' => 'Apple',
      'facebook' => 'Facebook',
      _ => p,
    };

// ── selfie verification ──────────────────────────────────────────────────

enum VerificationStatus { none, pending, approved, rejected }

class VerificationState {
  const VerificationState(this.status, {this.reason, this.at});
  final VerificationStatus status;
  final String? reason;
  final DateTime? at;

  static const none = VerificationState(VerificationStatus.none);

  factory VerificationState.fromJson(Map<String, dynamic> m) => VerificationState(
        switch (m['status']) {
          'PENDING' => VerificationStatus.pending,
          'APPROVED' => VerificationStatus.approved,
          'REJECTED' => VerificationStatus.rejected,
          _ => VerificationStatus.none,
        },
        reason: m['reason'] as String?,
        at: _date(m['at']),
      );
}

// ── VIP subscription ─────────────────────────────────────────────────────

/// `GET /vip`: how the current VIP is billed and where to manage it.
class VipStatus {
  const VipStatus({this.active = false, this.until, this.planId, this.renews = false, this.method, this.manageUrl});
  final bool active;
  final DateTime? until;
  final String? planId;
  final bool renews;
  final PaymentMethod? method;

  /// Store subscriptions are cancelled in the store: open this.
  final String? manageUrl;

  bool get managedByStore => manageUrl != null && (method == PaymentMethod.googlePlay || method == PaymentMethod.appStore);

  factory VipStatus.fromJson(Map<String, dynamic> m) => VipStatus(
        active: m['active'] as bool? ?? false,
        until: _date(m['until']),
        planId: m['planId'] as String?,
        renews: m['renews'] as bool? ?? false,
        method: paymentMethodFromApi(m['method']),
        manageUrl: m['manageUrl'] as String?,
      );
}
