part of 'wallet_provider.dart';

/// The offline mock: the business rules from BUSINESS.md run on the device
/// and persist through [MockBackend].
class LocalWalletProvider extends WalletProvider {
  LocalWalletProvider(this._backend, {super.clock}) : super.base();

  final MockBackend _backend;

  @override
  Future<void> load() async {
    _wallet = await _backend.loadWallet();
    _tx = await _backend.loadTransactions();
    if (_tx.isEmpty && _wallet.coins == Economy.welcomeCoins) {
      _tx.add(_entry(TxKind.earn, 'Welcome bonus', coins: Economy.welcomeCoins));
      await _backend.saveTransactions(_tx);
    }
    _loaded = true;
    notifyListeners();
  }

  @override
  Future<bool> spend(int amount, String title, {TxKind kind = TxKind.spend}) async {
    if (amount <= 0) return true;
    if (_wallet.coins < amount) return false;
    _wallet = _wallet.copyWith(coins: _wallet.coins - amount);
    _tx.add(_entry(kind, title, coins: -amount));
    await _persist();
    return true;
  }

  @override
  Future<void> earn(int amount, String title, {TxKind kind = TxKind.earn}) async {
    if (amount <= 0) return;
    _wallet = _wallet.copyWith(coins: _wallet.coins + amount);
    _tx.add(_entry(kind, title, coins: amount));
    await _persist();
  }

  @override
  Future<void> receiveGems(int gems, String title) async {
    if (gems <= 0) return;
    _wallet = _wallet.copyWith(gems: _wallet.gems + gems);
    _tx.add(_entry(TxKind.gift, title, coins: 0, gems: gems));
    await _persist();
  }

  @override
  Future<void> creditPack(CoinPack pack, PaymentMethod method, String receipt) async {
    final bonus = (pack.coins * pack.bonusPercent / 100).round();
    _wallet = _wallet.copyWith(coins: _wallet.coins + pack.coins + bonus);
    _tx.add(_entry(TxKind.purchase, '${pack.name} pack${bonus > 0 ? ' +$bonus bonus' : ''}', coins: pack.coins + bonus, usd: pack.usd, method: method, receipt: receipt));
    await _persist();
  }

  @override
  Future<void> activateVip(VipPlan plan, PaymentMethod method, String receipt) async {
    final now = _clock();
    final from = isVip ? _wallet.vipUntil! : now;
    final until = from.add(plan.trialDays > 0 && !isVip ? Duration(days: plan.trialDays) + plan.length : plan.length);
    _wallet = _wallet.copyWith(vipUntil: until, coins: _wallet.coins + Economy.vipMonthlyBonusCoins);
    _tx.add(
      _entry(TxKind.vip, 'VIP ${plan.label.toLowerCase()}${plan.trialDays > 0 && from == now ? ' (trial)' : ''}', coins: Economy.vipMonthlyBonusCoins, usd: plan.usd, method: method, receipt: receipt),
    );
    await _persist();
  }

  @override
  Future<PurchaseOutcome> startPurchase({CoinPack? pack, VipPlan? plan, required PaymentMethod method, String? phone, String? cardToken}) async {
    // Wallets confirm with an OTP first; nothing is charged yet.
    if (method.needsPhone) return const PurchaseOutcome(PurchaseStatus.needsOtp);
    return _charge(pack: pack, plan: plan, method: method, phone: phone);
  }

  @override
  Future<PurchaseOutcome> confirmPurchase(PurchaseOutcome pending, {required String otp, CoinPack? pack, VipPlan? plan, required PaymentMethod method, String? phone}) {
    return _charge(pack: pack, plan: plan, method: method, phone: phone);
  }

  Future<PurchaseOutcome> _charge({CoinPack? pack, VipPlan? plan, required PaymentMethod method, String? phone}) async {
    try {
      final receipt = await _backend.charge(method: method, usd: pack?.usd ?? plan!.usd, phone: phone);
      if (pack != null) {
        await creditPack(pack, method, receipt);
      } else {
        await activateVip(plan!, method, receipt);
      }
      return PurchaseOutcome(PurchaseStatus.succeeded, receipt: receipt);
    } on PaymentException catch (e) {
      return PurchaseOutcome(PurchaseStatus.failed, message: e.message);
    }
  }

  @override
  Future<void> cancelVip() async {
    _wallet = _wallet.copyWith(clearVip: true);
    _tx.add(_entry(TxKind.vip, 'VIP cancelled', coins: 0));
    await _persist();
  }

  @override
  Future<bool> boost() async {
    if (isBoosted) return true;
    if (!await spend(Economy.boostCost, 'Boost · 30 min priority')) return false;
    _wallet = _wallet.copyWith(boostUntil: _clock().add(Economy.boostLength));
    await _persist();
    return true;
  }

  @override
  Future<int?> checkIn() async {
    if (checkedInToday) return null;
    final day = nextCheckInDay;
    final reward = Economy.checkInRewards[day];
    _wallet = _wallet.copyWith(streakDay: day + 1, lastCheckIn: _clock());
    await earn(reward, 'Daily check-in · day ${day + 1}');
    return reward;
  }

  @override
  Future<int?> rewardAd({String? adToken}) async {
    if (adsLeftToday <= 0) return null;
    final today = _clock();
    final count = Fmt.sameDay(_wallet.adsDay, today) ? _wallet.adsWatchedToday + 1 : 1;
    _wallet = _wallet.copyWith(adsWatchedToday: count, adsDay: today);
    await earn(Economy.rewardedAdCoins, 'Watched an ad');
    return Economy.rewardedAdCoins;
  }

  @override
  Future<int?> claimProfileBonus() async {
    if (_wallet.profileBonusClaimed) return null;
    _wallet = _wallet.copyWith(profileBonusClaimed: true);
    await earn(Economy.profileCompleteCoins, 'Profile completed');
    return Economy.profileCompleteCoins;
  }

  @override
  Future<int> claimInvite(String friendName) async {
    await earn(Economy.inviteRewardCoins, 'Invited $friendName');
    return Economy.inviteRewardCoins;
  }

  @override
  Future<bool> payFriendRequest(String partnerName) async {
    if (freeFriendRequestsLeft > 0) {
      final today = _clock();
      final used = Fmt.sameDay(_wallet.friendRequestsDay, today) ? _wallet.freeFriendRequestsToday + 1 : 1;
      _wallet = _wallet.copyWith(freeFriendRequestsToday: used, friendRequestsDay: today);
      await _persist();
      return true;
    }
    return spend(Economy.friendRequestCost, 'Friend request · $partnerName');
  }

  @override
  Future<void> cashOut(int gems, PaymentMethod method, String account) async {
    await _backend.requestCashout(gems: gems, method: method, account: account);
    _wallet = _wallet.copyWith(gems: _wallet.gems - gems);
    _tx.add(_entry(TxKind.cashout, 'Cash-out to ${method.label}', coins: 0, gems: -gems, usd: gems * Economy.usdPerGem, method: method));
    await _persist();
  }

  Transaction _entry(TxKind kind, String title, {required int coins, int gems = 0, double usd = 0, PaymentMethod? method, String? receipt}) {
    return Transaction(id: 't${_clock().microsecondsSinceEpoch}', kind: kind, title: title, coins: coins, gems: gems, usd: usd, at: _clock(), method: method, receipt: receipt);
  }

  Future<void> _persist() async {
    await _backend.saveWallet(_wallet);
    await _backend.saveTransactions(_tx);
    notifyListeners();
  }
}
