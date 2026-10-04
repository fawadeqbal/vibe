part of 'wallet_provider.dart';

/// Server mode: every action is an API call; the server's answer (or a live
/// `wallet:updated` push) replaces local state. No rule is computed here.
class RemoteWalletProvider extends WalletProvider {
  RemoteWalletProvider(this._api, this._rt) : super.base() {
    _sub = _rt.on(Ev.walletUpdated).listen((w) => _applyView(w, refreshLedger: true));
  }

  final ApiClient _api;
  final RealtimeClient _rt;
  late final StreamSubscription<Map<String, dynamic>> _sub;
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
  Future<int?> rewardAd({String? adToken}) => _claim('/wallet/rewards/ad', (r) => (r['reward'] as num).toInt(), body: {'adToken': adToken ?? ApiClient.newIdempotencyKey()});

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
  Future<PurchaseOutcome> startPurchase({CoinPack? pack, VipPlan? plan, required PaymentMethod method, String? phone, String? cardToken}) async {
    final body = {
      'productType': pack != null ? 'COIN_PACK' : 'VIP_PLAN',
      'productId': pack?.id ?? plan!.id,
      'method': ApiMap.methodOut(method),
      if (phone != null && phone.isNotEmpty) 'phone': phone.replaceAll(RegExp(r'[^0-9+]'), ''),
      // Store builds pass the real purchase token from the billing SDK here.
      if (method == PaymentMethod.googlePlay || method == PaymentMethod.appStore) 'receipt': 'dev-${ApiClient.newIdempotencyKey()}',
      if (method == PaymentMethod.card) 'cardToken': cardToken ?? 'tok_dev',
    };
    return _purchase(() => _api.post('/payments/purchases', body, {'Idempotency-Key': ApiClient.newIdempotencyKey()}));
  }

  @override
  Future<PurchaseOutcome> confirmPurchase(PurchaseOutcome pending, {required String otp, CoinPack? pack, VipPlan? plan, required PaymentMethod method, String? phone}) {
    return _purchase(() => _api.post('/payments/purchases/${pending.purchaseId}/confirm', {'otp': otp}));
  }

  Future<PurchaseOutcome> _purchase(Future<dynamic> Function() call) async {
    try {
      final p = Map<String, dynamic>.from(await call() as Map);
      if (p['wallet'] is Map) _applyView(Map<String, dynamic>.from(p['wallet'] as Map), refreshLedger: true);
      return switch (p['status']) {
        'SUCCEEDED' => PurchaseOutcome(PurchaseStatus.succeeded, receipt: p['receipt'] as String?, purchaseId: p['id'] as String?),
        'REQUIRES_ACTION' when p['nextAction'] == 'otp' => PurchaseOutcome(PurchaseStatus.needsOtp, purchaseId: p['id'] as String?),
        'REQUIRES_ACTION' => PurchaseOutcome(
          PurchaseStatus.pendingTransfer,
          purchaseId: p['id'] as String?,
          receipt: p['receipt'] as String?,
          message: 'Transfer the amount using reference ${p['receipt']}. Coins arrive when it clears.',
        ),
        _ => PurchaseOutcome(PurchaseStatus.failed, message: p['failureReason'] as String? ?? 'Payment did not go through'),
      };
    } on ApiException catch (e) {
      return PurchaseOutcome(PurchaseStatus.failed, message: e.message);
    }
  }

  @override
  Future<void> cancelVip() async {
    await _api.post('/vip/cancel');
    _applyView(Map<String, dynamic>.from(await _api.get('/wallet') as Map), refreshLedger: true);
  }

  @override
  Future<void> cashOut(int gems, PaymentMethod method, String account) async {
    _applyResult(await _api.post('/wallet/cashouts', {'gems': gems, 'method': ApiMap.methodOut(method), 'account': account}, {'Idempotency-Key': ApiClient.newIdempotencyKey()}));
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
    _sub.cancel();
    _ledgerDebounce?.cancel();
    super.dispose();
  }
}
