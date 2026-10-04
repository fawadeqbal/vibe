import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../core/mock/mock_backend.dart';
import '../core/util/format.dart';
import '../models/models.dart';

part 'wallet_provider_local.dart';
part 'wallet_provider_remote.dart';

/// Result of a checkout step, for the checkout screen.
enum PurchaseStatus { succeeded, needsOtp, pendingTransfer, failed }

class PurchaseOutcome {
  const PurchaseOutcome(this.status, {this.receipt, this.purchaseId, this.message});
  final PurchaseStatus status;
  final String? receipt;
  final String? purchaseId;

  /// Failure reason, or bank-transfer instructions.
  final String? message;
}

/// Coins, gems, VIP, boosts, and the ledger.
///
/// Two implementations behind one API, so screens never care which runs:
/// * [LocalWalletProvider] — the offline mock; rules run on the device.
/// * [RemoteWalletProvider] — the Vibe API is the source of truth; every
///   action is a server call and balances arrive live over the socket.
///
/// `WalletProvider(backend)` builds the local one (tests, demo builds).
abstract class WalletProvider extends ChangeNotifier {
  WalletProvider.base({DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  factory WalletProvider(MockBackend backend, {DateTime Function()? clock}) = LocalWalletProvider;

  final DateTime Function() _clock;
  Wallet _wallet = const Wallet(coins: 0, gems: 0);
  List<Transaction> _tx = [];
  bool _loaded = false;

  Wallet get wallet => _wallet;
  int get coins => _wallet.coins;
  int get gems => _wallet.gems;
  bool get isVip => _wallet.vipUntil != null && _wallet.vipUntil!.isAfter(_clock());
  bool get isBoosted => _wallet.boostUntil != null && _wallet.boostUntil!.isAfter(_clock());
  List<Transaction> get transactions => List.unmodifiable(_tx.reversed);
  bool get loaded => _loaded;

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

  Future<bool> boost();

  Future<PurchaseOutcome> startPurchase({CoinPack? pack, VipPlan? plan, required PaymentMethod method, String? phone, String? cardToken});

  Future<PurchaseOutcome> confirmPurchase(PurchaseOutcome pending, {required String otp, CoinPack? pack, VipPlan? plan, required PaymentMethod method, String? phone});

  Future<void> cancelVip();

  Future<void> cashOut(int gems, PaymentMethod method, String account);

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
}
