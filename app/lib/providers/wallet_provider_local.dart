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

  // ── checkout (simulated gateway) ──────────────────────────────────────

  final Map<String, PurchaseView> _purchases = {};
  final Map<String, String> _purchaseByKey = {};

  @override
  Future<PaymentOptions> paymentOptions() async {
    PaymentMethodOption o(PaymentMethod m, PaymentFlow f, {String currency = 'PKR', Set<String> needs = const {}}) => PaymentMethodOption(method: m, flow: f, label: m.label, currency: currency, needs: needs);
    return PaymentOptions(
      methods: [
        o(PaymentMethod.googlePlay, PaymentFlow.store, currency: 'USD', needs: {'receipt'}),
        o(PaymentMethod.appStore, PaymentFlow.store, currency: 'USD', needs: {'receipt'}),
        o(PaymentMethod.jazzCash, PaymentFlow.wallet, needs: {'phone', 'cnicLast6'}),
        o(PaymentMethod.easypaisa, PaymentFlow.wallet, needs: {'phone'}),
        o(PaymentMethod.card, PaymentFlow.redirect),
        o(PaymentMethod.bank, PaymentFlow.manual),
      ],
      usdToPkr: Economy.pkrPerUsd,
      skus: [
        for (final p in MockData.packs) StoreSku(productType: ProductKind.coinPack, productId: p.id, sku: storeSkuFor(ProductKind.coinPack, p.id), usd: p.usd),
        for (final p in MockData.plans) StoreSku(productType: ProductKind.vipPlan, productId: p.id, sku: storeSkuFor(ProductKind.vipPlan, p.id), usd: p.usd),
      ],
    );
  }

  @override
  Future<PurchaseView> createPurchase(PurchaseRequest r, {required String idempotencyKey}) async {
    final prior = _purchaseByKey[idempotencyKey];
    if (prior != null) return _purchases[prior]!;
    final usd = _usdOf(r.productType, r.productId);
    final local = r.method != PaymentMethod.googlePlay && r.method != PaymentMethod.appStore;
    final id = 'p${_clock().microsecondsSinceEpoch}';
    var p = PurchaseView(
      id: id,
      state: PurchaseState.pending,
      productType: r.productType,
      productId: r.productId,
      method: r.method,
      usd: usd,
      currency: local ? 'PKR' : 'USD',
      amount: local ? (usd * Economy.pkrPerUsd).roundToDouble() : usd,
      createdAt: _clock(),
    );
    _purchaseByKey[idempotencyKey] = id;
    if (r.method.needsPhone) {
      if (PkValidation.localMobile(r.phone) == null) throw ApiException('VALIDATION_FAILED', 'Enter the full wallet number', status: 400);
      // Wallets confirm with a code first; nothing is charged yet.
      p = p.copyWith(state: PurchaseState.requiresAction, action: const PaymentAction(type: PaymentActionType.otp, instructions: 'Offline demo: any 4 digits approve the payment.'));
    } else if (r.method == PaymentMethod.bank) {
      final ref = 'VB${id.substring(id.length - 6)}';
      p = p.copyWith(
        state: PurchaseState.requiresAction,
        receipt: ref,
        action: PaymentAction(
          type: PaymentActionType.bankTransfer,
          instructions: 'Offline demo: no money moves, and nobody confirms the transfer.',
          bank: BankDetails(bankName: 'Demo Bank', accountTitle: 'Vibe Demo', iban: 'PK36SCBL0000001123456702', reference: ref, amount: 'PKR ${p.amount.toStringAsFixed(0)}'),
        ),
      );
    } else {
      p = await _charge(p);
    }
    return _purchases[id] = p;
  }

  @override
  Future<PurchaseView> purchase(String id) async => _owned(id);

  @override
  Future<PurchaseView> confirmPurchase(String id, String otp) async {
    final p = _owned(id);
    if (!p.isOpen) return p;
    if (!RegExp(r'^\d{4,6}$').hasMatch(otp)) throw ApiException('VALIDATION_FAILED', 'The code is 4 digits', status: 400);
    return _purchases[id] = await _charge(p);
  }

  @override
  Future<PurchaseView> checkPurchase(String id) async => _owned(id);

  @override
  Future<PurchaseView> cancelPurchase(String id) async {
    final p = _owned(id);
    if (!p.isOpen) return p;
    final done = p.copyWith(state: PurchaseState.expired, clearAction: true, failureReason: 'Cancelled');
    _emitPurchase(done);
    return _purchases[id] = done;
  }

  @override
  Future<PurchaseView> sendBankReference(String id, String reference) async => _owned(id);

  PurchaseView _owned(String id) => _purchases[id] ?? (throw ApiException('NOT_FOUND', 'Purchase not found', status: 404));

  double _usdOf(ProductKind type, String id) {
    if (type == ProductKind.coinPack) {
      for (final p in MockData.packs) {
        if (p.id == id) return p.usd;
      }
    } else {
      for (final p in MockData.plans) {
        if (p.id == id) return p.usd;
      }
    }
    throw ApiException('UNKNOWN_PRODUCT', 'That product does not exist', status: 404);
  }

  /// The mock gateway: succeeds (crediting coins / VIP) or declines the way
  /// a real one does, as a `PAYMENT_DECLINED` error.
  Future<PurchaseView> _charge(PurchaseView p) async {
    try {
      final receipt = await _backend.charge(method: p.method!, usd: p.usd, phone: null);
      if (p.productType == ProductKind.coinPack) {
        await creditPack(MockData.packs.firstWhere((x) => x.id == p.productId), p.method!, receipt);
      } else {
        await activateVip(MockData.plans.firstWhere((x) => x.id == p.productId), p.method!, receipt);
      }
      return p.copyWith(state: PurchaseState.succeeded, receipt: receipt, clearAction: true);
    } on PaymentException catch (e) {
      _purchases[p.id] = p.copyWith(state: PurchaseState.failed, clearAction: true, failureReason: e.message);
      throw ApiException('PAYMENT_DECLINED', e.message, status: 402, details: {'purchaseId': p.id});
    }
  }

  @override
  Future<VipStatus> vipStatus() async => VipStatus(active: isVip, until: _wallet.vipUntil, renews: isVip);

  @override
  Future<void> cancelVip() async {
    _wallet = _wallet.copyWith(clearVip: true);
    _tx.add(_entry(TxKind.vip, 'VIP cancelled', coins: 0));
    await _persist();
  }

  // ── cash-outs (kept on the device) ────────────────────────────────────

  @override
  Future<void> loadPayouts() async {
    final saved = await _backend.loadPayouts();
    _payoutAccounts = [for (final a in saved.accounts) PayoutAccount.fromJson(a)];
    _cashouts = [for (final c in saved.cashouts) Cashout.fromJson(c)];
    _payoutsLoaded = true;
    notifyListeners();
  }

  @override
  Future<PayoutAccount> addPayoutAccount(NewPayoutAccount a) async {
    final errors = PkValidation.payoutAccount(method: a.method, account: a.account, holderName: a.holderName, bankName: a.bankName, cnic: a.cnic);
    if (errors.isNotEmpty) throw ApiException('VALIDATION_FAILED', errors.values.first, status: 400);
    if (_payoutAccounts.length >= 5) throw ApiException('CONFLICT', 'You can save up to 5 payout accounts. Remove one first.', status: 409);
    final value = PkValidation.normaliseAccount(a.method, a.account);
    final masked = a.method == PaymentMethod.bank ? '${value.substring(0, 4)} •••• ${value.substring(value.length - 4)}' : '${value.substring(0, 4)}•••${value.substring(value.length - 3)}';
    final makeDefault = a.makeDefault || _payoutAccounts.isEmpty;
    if (makeDefault) _payoutAccounts = [for (final x in _payoutAccounts) x.copyWith(isDefault: false)];
    final account = PayoutAccount(id: 'pa${_clock().microsecondsSinceEpoch}', method: a.method, accountMasked: masked, holderName: a.holderName.trim(), bankName: a.bankName?.trim(), isDefault: makeDefault, createdAt: _clock());
    _payoutAccounts.add(account);
    _payoutAccounts.sort((x, y) => (y.isDefault ? 1 : 0) - (x.isDefault ? 1 : 0));
    await _persistPayouts();
    return account;
  }

  @override
  Future<void> makeDefaultPayoutAccount(String id) async {
    _payoutAccounts = [for (final x in _payoutAccounts) x.copyWith(isDefault: x.id == id)]..sort((x, y) => (y.isDefault ? 1 : 0) - (x.isDefault ? 1 : 0));
    await _persistPayouts();
  }

  @override
  Future<void> removePayoutAccount(String id) async {
    _payoutAccounts.removeWhere((x) => x.id == id);
    await _persistPayouts();
  }

  @override
  Future<Cashout> requestCashout({int? gems, required String payoutAccountId}) async {
    final account = _payoutAccounts.firstWhere((a) => a.id == payoutAccountId, orElse: () => throw ApiException('NOT_FOUND', 'Payout account not found', status: 404));
    final amount = gems ?? _wallet.gems;
    if (amount < Economy.cashoutMinGems) throw ApiException('CASHOUT_BELOW_MINIMUM', 'Cash out from ${Economy.cashoutMinGems} gems', status: 400);
    if (amount > _wallet.gems) throw ApiException('INSUFFICIENT_GEMS', 'Not enough gems', status: 409);
    await _backend.requestCashout(gems: amount, method: account.method, account: account.accountMasked);
    final usd = amount * Economy.usdPerGem;
    _wallet = _wallet.copyWith(gems: _wallet.gems - amount);
    _tx.add(_entry(TxKind.cashout, 'Cash-out to ${account.method.label}', coins: 0, gems: -amount, usd: usd, method: account.method));
    final c = Cashout(id: 'c${_clock().microsecondsSinceEpoch}', gems: amount, usd: usd, amountPkr: (usd * Economy.pkrPerUsd).floor(), method: account.method, accountMasked: account.accountMasked, status: CashoutStatus.requested, createdAt: _clock());
    _cashouts.insert(0, c);
    await _persist();
    await _persistPayouts();
    return c;
  }

  Future<void> _persistPayouts() async {
    await _backend.savePayouts(
      accounts: [
        for (final a in _payoutAccounts)
          {'id': a.id, 'method': paymentMethodToApi(a.method), 'accountMasked': a.accountMasked, 'holderName': a.holderName, 'bankName': a.bankName, 'isDefault': a.isDefault, 'createdAt': a.createdAt?.toIso8601String()},
      ],
      cashouts: [
        for (final c in _cashouts)
          {'id': c.id, 'gems': c.gems, 'usdCents': (c.usd * 100).round(), 'amountPkr': c.amountPkr, 'method': paymentMethodToApi(c.method), 'accountMasked': c.accountMasked, 'status': c.status.name.toUpperCase(), 'createdAt': c.createdAt?.toIso8601String()},
      ],
    );
    notifyListeners();
  }

  @override
  Future<bool> boost() async {
    if (isBoosted) return true;
    if (_wallet.freeBoosts > 0) {
      // A free credit is used before coins.
      _wallet = _wallet.copyWith(freeBoosts: _wallet.freeBoosts - 1);
      _tx.add(_entry(TxKind.earn, 'Free boost · 30 min priority', coins: 0));
    } else if (!await spend(Economy.boostCost, 'Boost · 30 min priority')) {
      return false;
    }
    _wallet = _wallet.copyWith(boostUntil: _clock().add(Economy.boostLength));
    await _persist();
    return true;
  }

  @override
  Future<void> setGemGoal(int? goal) async {
    _wallet = goal == null ? _wallet.copyWith(clearGemGoal: true) : _wallet.copyWith(gemGoal: goal);
    await _persist();
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

  Transaction _entry(TxKind kind, String title, {required int coins, int gems = 0, double usd = 0, PaymentMethod? method, String? receipt}) {
    return Transaction(id: 't${_clock().microsecondsSinceEpoch}', kind: kind, title: title, coins: coins, gems: gems, usd: usd, at: _clock(), method: method, receipt: receipt);
  }

  Future<void> _persist() async {
    await _backend.saveWallet(_wallet);
    await _backend.saveTransactions(_tx);
    notifyListeners();
  }
}
