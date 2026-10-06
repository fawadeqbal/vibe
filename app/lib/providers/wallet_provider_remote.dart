part of 'wallet_provider.dart';

/// Server mode: every action is an API call; the server's answer (or a live
/// `wallet:updated` push) replaces local state. No rule is computed here.
class RemoteWalletProvider extends WalletProvider {
  RemoteWalletProvider(this._api, this._rt, {this.adRetryDelay = const Duration(seconds: 2)}) : super.base() {
    _subs = [
      _rt.on(Ev.walletUpdated).listen((w) => _applyView(w, refreshLedger: true)),
      _rt.on(Ev.paymentUpdated).listen(_onPaymentUpdated),
      _rt.on(Ev.cashoutUpdated).listen(_onCashoutUpdated),
    ];
  }

  final ApiClient _api;
  final RealtimeClient _rt;
  late final List<StreamSubscription<Map<String, dynamic>>> _subs;

  /// AdMob's verification callback can trail the reward by a moment: one
  /// retry after this delay when the server says `AD_NOT_VERIFIED`.
  final Duration adRetryDelay;
  Map<String, dynamic> _view = const {};
  Timer? _ledgerDebounce;

  @override
  bool get isRemote => true;

  // The server computes these in its business timezone; trust it.
  @override
  bool get checkedInToday => (_view['checkIn'] as Map?)?['checkedInToday'] as bool? ?? super.checkedInToday;
  @override
  int get nextCheckInDay => ((_view['checkIn'] as Map?)?['nextDay'] as num?)?.toInt() ?? super.nextCheckInDay;
  @override
  int get adsLeftToday => ((_view['ads'] as Map?)?['leftToday'] as num?)?.toInt() ?? super.adsLeftToday;
  @override
  int get freeFriendRequestsLeft => (_view['freeFriendRequestsLeft'] as num?)?.toInt() ?? super.freeFriendRequestsLeft;
  @override
  bool get canCashOut => _view['canCashOut'] as bool? ?? super.canCashOut;

  void _applyView(Map<String, dynamic> w, {bool refreshLedger = false}) {
    _view = w;
    _wallet = ApiMap.wallet(w);
    notifyListeners();
    if (refreshLedger) {
      _ledgerDebounce?.cancel();
      _ledgerDebounce = Timer(const Duration(milliseconds: 600), refresh);
    }
  }

  void _applyResult(dynamic res) {
    if (res is Map && res['wallet'] is Map) _applyView(Map<String, dynamic>.from(res['wallet'] as Map), refreshLedger: true);
  }

  @override
  Future<void> load() async {
    if (!_api.hasSession) return;
    _applyView(Map<String, dynamic>.from(await _api.get('/wallet') as Map));
    await refresh();
    _loaded = true;
    notifyListeners();
  }

  @override
  Future<void> refresh() async {
    try {
      final page = await _api.get('/wallet/transactions', query: {'limit': '50'}) as Map;
      // The base class shows `_tx` newest-last (it reverses), the API is newest-first.
      _tx = (page['items'] as List).map((e) => ApiMap.transaction(Map<String, dynamic>.from(e as Map))).toList().reversed.toList();
      notifyListeners();
    } on ApiException catch (_) {}
  }

  Future<T?> _claim<T>(String path, T Function(Map) pick, {Object? body, Set<String> nullOn = const {'ALREADY_CLAIMED', 'DAILY_LIMIT_REACHED'}}) async {
    try {
      final res = await _api.post(path, body, {'Idempotency-Key': ApiClient.newIdempotencyKey()}) as Map;
      _applyResult(res);
      return pick(res);
    } on ApiException catch (e) {
      if (nullOn.contains(e.code)) return null;
      rethrow;
    }
  }

  @override
  Future<int?> checkIn() => _claim('/wallet/check-in', (r) => (r['reward'] as num).toInt());

  @override
  Future<int?> rewardAd({String? adToken}) async {
    final body = {'adToken': adToken ?? ApiClient.newIdempotencyKey()};
    try {
      return await _claim('/wallet/rewards/ad', (r) => (r['reward'] as num).toInt(), body: body);
    } on ApiException catch (e) {
      if (e.code != 'AD_NOT_VERIFIED') rethrow;
      await Future<void>.delayed(adRetryDelay);
      return _claim('/wallet/rewards/ad', (r) => (r['reward'] as num).toInt(), body: body);
    }
  }

  @override
  Future<int?> claimProfileBonus() => _claim('/wallet/rewards/profile', (r) => (r['reward'] as num).toInt(), nullOn: {'ALREADY_CLAIMED', 'PROFILE_INCOMPLETE'});

  @override
  Future<int> claimInvite(String friendName) async => 0; // paid automatically by the server

  @override
  Future<bool> boost() async {
    try {
      _applyResult(await _api.post('/wallet/boost', null, {'Idempotency-Key': ApiClient.newIdempotencyKey()}));
      return true;
    } on ApiException catch (e) {
      if (e.isInsufficientCoins) return false;
      rethrow;
    }
  }

  @override
  Future<void> setGemGoal(int? goal) async {
    final me = Map<String, dynamic>.from(await _api.patch('/me', {'gemGoal': goal}) as Map);
    final g = (me['gemGoal'] as num?)?.toInt();
    _view = {..._view, 'gemGoal': g};
    _wallet = g == null ? _wallet.copyWith(clearGemGoal: true) : _wallet.copyWith(gemGoal: g);
    notifyListeners();
  }

  // ── checkout ──────────────────────────────────────────────────────────

  @override
  Future<PaymentOptions> paymentOptions() async => PaymentOptions.fromJson(Map<String, dynamic>.from(await _api.get('/payments/methods') as Map));

  @override
  Future<PurchaseView> createPurchase(PurchaseRequest request, {required String idempotencyKey}) =>
      _purchaseCall(() => _api.post('/payments/purchases', request.toJson(), {'Idempotency-Key': idempotencyKey}));

  @override
  Future<PurchaseView> purchase(String id) => _purchaseCall(() => _api.get('/payments/purchases/$id'));

  @override
  Future<PurchaseView> confirmPurchase(String id, String otp) => _purchaseCall(() => _api.post('/payments/purchases/$id/confirm', {'otp': otp}));

  @override
  Future<PurchaseView> checkPurchase(String id) => _purchaseCall(() => _api.post('/payments/purchases/$id/check'));

  @override
  Future<PurchaseView> cancelPurchase(String id) => _purchaseCall(() => _api.post('/payments/purchases/$id/cancel'));

  @override
  Future<PurchaseView> sendBankReference(String id, String reference) => _purchaseCall(() => _api.post('/payments/purchases/$id/bank-reference', {'reference': reference.trim()}));

  /// Every purchase answer carries the new wallet once it succeeded.
  Future<PurchaseView> _purchaseCall(Future<dynamic> Function() call) async {
    final p = PurchaseView.fromJson(Map<String, dynamic>.from(await call() as Map));
    if (p.wallet != null) _applyView(p.wallet!, refreshLedger: true);
    return p;
  }

  void _onPaymentUpdated(Map<String, dynamic> m) {
    final p = PurchaseView.fromJson(m);
    _emitPurchase(p);
    // The socket payload has no wallet; `wallet:updated` follows on success.
  }

  @override
  Future<VipStatus> vipStatus() async => VipStatus.fromJson(Map<String, dynamic>.from(await _api.get('/vip') as Map));

  @override
  Future<void> cancelVip() async {
    await _api.post('/vip/cancel');
    _applyView(Map<String, dynamic>.from(await _api.get('/wallet') as Map), refreshLedger: true);
  }

  // ── cash-outs ─────────────────────────────────────────────────────────

  @override
  Future<void> loadPayouts() async {
    final res = await Future.wait([_api.get('/wallet/payout-accounts'), _api.get('/wallet/cashouts')]);
    final accounts = Map<String, dynamic>.from(res[0] as Map);
    _payoutAccounts = [for (final a in (accounts['accounts'] as List? ?? const [])) PayoutAccount.fromJson(Map<String, dynamic>.from(a as Map))];
    _payoutMethods = [for (final m in (accounts['methods'] as List? ?? const [])) ?paymentMethodFromApi(m)];
    _cashouts = [for (final c in (res[1] as List? ?? const [])) Cashout.fromJson(Map<String, dynamic>.from(c as Map))];
    _payoutsLoaded = true;
    notifyListeners();
  }

  @override
  Future<PayoutAccount> addPayoutAccount(NewPayoutAccount account) async {
    final body = account.toJson()..['account'] = PkValidation.normaliseAccount(account.method, account.account);
    final a = PayoutAccount.fromJson(Map<String, dynamic>.from(await _api.post('/wallet/payout-accounts', body) as Map));
    await _reloadAccounts();
    return a;
  }

  @override
  Future<void> makeDefaultPayoutAccount(String id) async {
    final list = await _api.post('/wallet/payout-accounts/$id/default') as List;
    _payoutAccounts = [for (final a in list) PayoutAccount.fromJson(Map<String, dynamic>.from(a as Map))];
    notifyListeners();
  }

  @override
  Future<void> removePayoutAccount(String id) async {
    await _api.delete('/wallet/payout-accounts/$id');
    await _reloadAccounts();
  }

  Future<void> _reloadAccounts() async {
    final res = Map<String, dynamic>.from(await _api.get('/wallet/payout-accounts') as Map);
    _payoutAccounts = [for (final a in (res['accounts'] as List? ?? const [])) PayoutAccount.fromJson(Map<String, dynamic>.from(a as Map))];
    notifyListeners();
  }

  @override
  Future<Cashout> requestCashout({int? gems, required String payoutAccountId}) async {
    final res = Map<String, dynamic>.from(await _api.post('/wallet/cashouts', {'gems': ?gems, 'payoutAccountId': payoutAccountId}, {'Idempotency-Key': ApiClient.newIdempotencyKey()}) as Map);
    _applyResult(res);
    final c = Cashout.fromJson(Map<String, dynamic>.from(res['cashout'] as Map));
    _upsertCashout(c);
    return c;
  }

  void _onCashoutUpdated(Map<String, dynamic> m) {
    final id = '${m['id']}';
    final i = _cashouts.indexWhere((c) => c.id == id);
    if (i < 0) {
      if (_payoutsLoaded) unawaited(loadPayouts().catchError((_) {}));
      return;
    }
    _upsertCashout(_cashouts[i].copyWith(status: cashoutStatusFromApi(m['status']), failureReason: m['failureReason'] as String?));
  }

  // The server owns the ledger: these exist only for the offline mock.
  Never _serverOwned() => throw UnsupportedError('In server mode the Vibe API moves coins');
  @override
  Future<bool> spend(int amount, String title, {TxKind kind = TxKind.spend}) async => _serverOwned();
  @override
  Future<void> earn(int amount, String title, {TxKind kind = TxKind.earn}) async => _serverOwned();
  @override
  Future<void> receiveGems(int gems, String title) async => _serverOwned();
  @override
  Future<void> creditPack(CoinPack pack, PaymentMethod method, String receipt) async => _serverOwned();
  @override
  Future<void> activateVip(VipPlan plan, PaymentMethod method, String receipt) async => _serverOwned();
  @override
  Future<bool> payFriendRequest(String partnerName) async => _serverOwned();

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _ledgerDebounce?.cancel();
    super.dispose();
  }
}
