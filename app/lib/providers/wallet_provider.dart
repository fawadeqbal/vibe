import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../core/mock/mock_backend.dart';
import '../core/mock/mock_data.dart';
import '../core/util/format.dart';
import '../core/util/pk_validation.dart';
import '../models/models.dart';
import '../models/payments.dart';

part 'wallet_provider_local.dart';
part 'wallet_provider_remote.dart';

/// Buying coins and VIP, step by step. The checkout controller and the
/// store-billing service drive a purchase through this; the server (or the
/// offline mock) decides every state.
abstract interface class CheckoutBackend {
  /// Methods to offer, the PKR rate and the store tokens/SKUs.
  Future<PaymentOptions> paymentOptions();

  /// Starts a purchase. One [idempotencyKey] per checkout attempt; retries
  /// reuse it. A declined charge throws [ApiException] `PAYMENT_DECLINED`.
  Future<PurchaseView> createPurchase(PurchaseRequest request, {required String idempotencyKey});
  Future<PurchaseView> purchase(String id);
  Future<PurchaseView> confirmPurchase(String id, String otp);

  /// "I've approved": asks the provider now.
  Future<PurchaseView> checkPurchase(String id);
  Future<PurchaseView> cancelPurchase(String id);
  Future<PurchaseView> sendBankReference(String id, String reference);

  /// Purchases that changed outside a request (wallet approved, card paid, expired…).
  Stream<PurchaseView> get purchaseUpdates;
}

/// Coins, gems, VIP, boosts, and the ledger.
///
/// Two implementations behind one API, so screens never care which runs:
/// * [LocalWalletProvider] — the offline mock; rules run on the device.
/// * [RemoteWalletProvider] — the Vibe API is the source of truth; every
///   action is a server call and balances arrive live over the socket.
///
/// `WalletProvider(backend)` builds the local one (tests, demo builds).
abstract class WalletProvider extends ChangeNotifier implements CheckoutBackend {
  WalletProvider.base({DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  factory WalletProvider(MockBackend backend, {DateTime Function()? clock}) = LocalWalletProvider;

  final DateTime Function() _clock;
  Wallet _wallet = const Wallet(coins: 0, gems: 0);
  List<Transaction> _tx = [];
  bool _loaded = false;
  List<PayoutAccount> _payoutAccounts = [];
  List<PaymentMethod> _payoutMethods = const [PaymentMethod.jazzCash, PaymentMethod.easypaisa, PaymentMethod.bank];
  List<Cashout> _cashouts = [];
  bool _payoutsLoaded = false;
  final _purchaseUpdates = StreamController<PurchaseView>.broadcast();

  Wallet get wallet => _wallet;
  int get coins => _wallet.coins;
  int get gems => _wallet.gems;
  bool get isVip => _wallet.vipUntil != null && _wallet.vipUntil!.isAfter(_clock());
  bool get isBoosted => _wallet.boostUntil != null && _wallet.boostUntil!.isAfter(_clock());
  List<Transaction> get transactions => List.unmodifiable(_tx.reversed);
  bool get loaded => _loaded;

  /// Saved cash-out destinations (default first) and the rails that are on.
  List<PayoutAccount> get payoutAccounts => List.unmodifiable(_payoutAccounts);
  List<PaymentMethod> get payoutMethods => _payoutMethods;
  List<Cashout> get cashouts => List.unmodifiable(_cashouts);
  bool get payoutsLoaded => _payoutsLoaded;
  PayoutAccount? get defaultPayoutAccount {
    for (final a in _payoutAccounts) {
      if (a.isDefault) return a;
    }
    return _payoutAccounts.isEmpty ? null : _payoutAccounts.first;
  }

  @override
  Stream<PurchaseView> get purchaseUpdates => _purchaseUpdates.stream;

  bool get checkedInToday => Fmt.sameDay(_wallet.lastCheckIn, _clock());

  /// The day (0-based) the next check-in will award: consecutive days
  /// advance it, a missed day resets to 0, day 7 wraps.
  int get nextCheckInDay {
    final last = _wallet.lastCheckIn;
    if (last == null) return 0;
    final today = _clock();
    final yesterday = today.subtract(const Duration(days: 1));
    if (Fmt.sameDay(last, today) || Fmt.sameDay(last, yesterday)) return _wallet.streakDay % Economy.checkInRewards.length;
    return 0;
  }

  int get adsLeftToday {
    if (!Fmt.sameDay(_wallet.adsDay, _clock())) return Economy.rewardedAdsPerDay;
    return (Economy.rewardedAdsPerDay - _wallet.adsWatchedToday).clamp(0, Economy.rewardedAdsPerDay);
  }

  int get freeFriendRequestsLeft {
    if (!Fmt.sameDay(_wallet.friendRequestsDay, _clock())) return Economy.freeFriendRequestsPerDay;
    return (Economy.freeFriendRequestsPerDay - _wallet.freeFriendRequestsToday).clamp(0, Economy.freeFriendRequestsPerDay);
  }

  bool get canCashOut => _wallet.gems >= Economy.cashoutMinGems;

  /// Gems you are saving up for (null = none set).
  int? get gemGoal => _wallet.gemGoal;

  /// Free 30-minute boosts waiting (used before coins).
  int get freeBoosts => _wallet.freeBoosts;
  int filterCost(MatchFilters f) => f.costFor(vip: isVip);

  /// True when the server is the source of truth (invites pay automatically,
  /// ads are verified, etc.).
  bool get isRemote => false;

  // ── use-cases every implementation provides ───────────────────────────

  Future<void> load();

  /// Today's check-in. Null when already claimed today.
  Future<int?> checkIn();

  /// After a rewarded ad played. Null when the daily cap is hit.
  Future<int?> rewardAd({String? adToken});

  Future<int?> claimProfileBonus();

  /// Mock only: pretend an invited friend joined. On the server the reward
  /// arrives by itself when they finish their profile.
  Future<int> claimInvite(String friendName);

  /// A 30-minute boost: a free credit when you have one, else coins.
  Future<bool> boost();

  /// Sets (100 … 10,000,000) or clears the gem goal.
  Future<void> setGemGoal(int? goal);

  static const minGemGoal = 100;
  static const maxGemGoal = 10000000;

  /// How VIP is billed (store subscriptions are managed in the store).
  Future<VipStatus> vipStatus();

  /// Stops renewal. Store subscriptions throw [ApiException] (409) with
  /// `details.manageUrl` — open it instead.
  Future<void> cancelVip();

  // ── cash-outs ─────────────────────────────────────────────────────────

  /// Loads saved payout accounts, available rails and cash-out history.
  Future<void> loadPayouts();
  Future<PayoutAccount> addPayoutAccount(NewPayoutAccount account);
  Future<void> makeDefaultPayoutAccount(String id);
  Future<void> removePayoutAccount(String id);

  /// Gems → money to a saved account. Errors: `CASHOUT_BELOW_MINIMUM`,
  /// `KYC_REQUIRED` (403, `details.limitUsd`), readable validation messages.
  Future<Cashout> requestCashout({int? gems, required String payoutAccountId});

  /// Re-fetches the ledger (wallet screen pull-to-refresh / open).
  Future<void> refresh() async {}

  // ── ledger primitives (local mock only — the server owns the ledger) ──

  Future<bool> spend(int amount, String title, {TxKind kind = TxKind.spend});
  Future<void> earn(int amount, String title, {TxKind kind = TxKind.earn});
  Future<void> receiveGems(int gems, String title);
  Future<void> creditPack(CoinPack pack, PaymentMethod method, String receipt);
  Future<void> activateVip(VipPlan plan, PaymentMethod method, String receipt);
  Future<bool> payFriendRequest(String partnerName);

  /// Test seam.
  @visibleForTesting
  void debugSet(Wallet w) {
    _wallet = w;
    notifyListeners();
  }

  void _emitPurchase(PurchaseView p) {
    if (!_purchaseUpdates.isClosed) _purchaseUpdates.add(p);
  }

  void _upsertCashout(Cashout c) {
    final i = _cashouts.indexWhere((x) => x.id == c.id);
    if (i >= 0) {
      _cashouts[i] = c;
    } else {
      _cashouts.insert(0, c);
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _purchaseUpdates.close();
    super.dispose();
  }
}
