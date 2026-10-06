part of 'partner_provider.dart';

/// Server mode: `/v1/affiliate` (overview, code-available, apply, stats,
/// commissions, payouts). `affiliate:updated` (approved, rejected,
/// suspended, reactivated, payout paid/returned) re-reads everything that
/// is loaded, so an open partner screen moves on by itself.
class RemotePartnerProvider extends PartnerProvider {
  RemotePartnerProvider(this._api, this._rt) : super.base() {
    _sub = _rt.on(Ev.affiliateUpdated).listen((_) {
      if (_api.hasSession) unawaited(refreshLoaded());
    });
  }

  final ApiClient _api;
  final RealtimeClient _rt;
  late final StreamSubscription<Map<String, dynamic>> _sub;

  @override
  bool get isRemote => true;

  static Map<String, dynamic> _obj(Object? v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

  @override
  Future<PartnerOverview> fetchOverview() async {
    if (!_api.hasSession) return PartnerOverview.none;
    return PartnerOverview.fromJson(_obj(await _api.get('/affiliate')));
  }

  @override
  Future<PartnerCodeCheck> codeAvailable(String code) async {
    final raw = code.trim();
    return PartnerCodeCheck.fromJson(_obj(await _api.get('/affiliate/code-available', query: {'code': raw})), raw);
  }

  @override
  Future<PartnerOverview> submitApplication(PartnerApplication application) async {
    return PartnerOverview.fromJson(_obj(await _api.post('/affiliate/apply', application.toJson())));
  }

  @override
  Future<PartnerStats> fetchStats(int days) async {
    return PartnerStats.fromJson(_obj(await _api.get('/affiliate/stats', query: {'days': '$days'})));
  }

  @override
  Future<PartnerCommissionPage> fetchCommissions({String? cursor, int limit = PartnerProvider.commissionsPageSize}) async {
    return PartnerCommissionPage.fromJson(_obj(await _api.get('/affiliate/commissions', query: {'limit': '$limit', 'cursor': ?cursor})));
  }

  @override
  Future<List<PartnerPayout>> fetchPayouts() async {
    final r = await _api.get('/affiliate/payouts');
    return [for (final x in (r is List ? r : const [])) PartnerPayout.fromJson(_obj(x))];
  }

  @override
  Future<PartnerPayout> submitPayout(PayoutAccount account) async {
    final r = await _api.post('/affiliate/payouts', {'payoutAccountId': account.id}, {'Idempotency-Key': ApiClient.newIdempotencyKey()});
    return PartnerPayout.fromJson(_obj(r));
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}
