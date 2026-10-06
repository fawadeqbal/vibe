import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/api/api_config.dart';
import '../core/api/api_exception.dart';
import '../core/api/realtime_client.dart';
import '../core/mock/mock_data.dart';
import '../models/models.dart';
import '../models/partner.dart';
import '../models/payments.dart';

part 'partner_provider_local.dart';
part 'partner_provider_remote.dart';

/// The creator partner program (affiliates): your status and balance, the
/// application, stats for 7/30/90 days, commissions (cursor pages), payouts
/// and the payout request. Mirrors the web's `stores/affiliate.ts`.
///
/// The shared logic (what is loaded, paging, keeping the overview and the
/// lists in step after an action) lives here; the subclasses only do I/O:
/// [LocalPartnerProvider] is the offline demo (apply → review → a believable
/// dashboard), [RemotePartnerProvider] calls `/v1/affiliate` and re-reads
/// everything that's loaded when `affiliate:updated` arrives. The toasts
/// for those notices come from `ReferralsProvider.partnerNotices`.
abstract class PartnerProvider extends ChangeNotifier {
  PartnerProvider.base();

  /// The offline demo. [verified] says whether the signed-in user passed the
  /// selfie check (applying needs it, like on the server).
  factory PartnerProvider({bool Function()? verified, PartnerStatus status, DateTime Function()? clock}) = LocalPartnerProvider;

  static const commissionsPageSize = 20;

  PartnerOverview? _overview;
  bool _loading = false;
  ApiException? _error;
  int _range = 30;
  final Map<int, PartnerStats> _stats = {};
  final Set<int> _statsLoading = {};
  List<PartnerCommission> _commissions = const [];
  String? _commissionsCursor;
  bool _commissionsLoaded = false;
  bool _loadingMore = false;
  List<PartnerPayout> _payouts = const [];
  bool _payoutsLoaded = false;
  bool _disposed = false;

  PartnerOverview? get overview => _overview;
  PartnerStatus? get status => _overview?.status;
  bool get loading => _loading;

  /// The last overview read failed and there is nothing to show yet.
  ApiException? get error => _error;
  bool get isRemote => false;

  /// The stats period (7, 30 or 90 days).
  int get range => _range;
  PartnerStats? statsFor(int days) => _stats[days];
  PartnerStats? get stats => _stats[_range];
  bool get statsLoading => _statsLoading.contains(_range);

  List<PartnerCommission> get commissions => _commissions;
  bool get commissionsLoaded => _commissionsLoaded;
  bool get hasMoreCommissions => _commissionsCursor != null;
  bool get loadingMore => _loadingMore;

  /// Newest first (latest 50).
  List<PartnerPayout> get payouts => _payouts;
  bool get payoutsLoaded => _payoutsLoaded;

  // ── I/O, per implementation ─────────────────────────────────────────────

  @protected
  Future<PartnerOverview> fetchOverview();
  @protected
  Future<PartnerStats> fetchStats(int days);
  @protected
  Future<PartnerCommissionPage> fetchCommissions({String? cursor, int limit = commissionsPageSize});
  @protected
  Future<List<PartnerPayout>> fetchPayouts();
  @protected
  Future<PartnerOverview> submitApplication(PartnerApplication application);
  @protected
  Future<PartnerPayout> submitPayout(PayoutAccount account);

  /// Is this partner code free? (`{ code, available, reason }`).
  Future<PartnerCodeCheck> codeAvailable(String code);

  // ── what screens call ───────────────────────────────────────────────────

  /// Status, terms and balance.
  Future<void> load() async {
    _loading = _overview == null;
    _error = null;
    _notify();
    try {
      _overview = await fetchOverview();
    } on ApiException catch (e) {
      _error = e;
    } finally {
      _loading = false;
      _notify();
    }
  }

  /// Everything the screen shows: the overview, then (with a dashboard)
  /// the current stats period, the first commissions page and the payouts.
  Future<void> refreshAll() async {
    await load();
    if (_overview?.hasDashboard != true) return;
    await Future.wait([loadStats(), loadCommissions(), loadPayouts()]);
  }

  void setRange(int days) {
    if (!partnerStatsRanges.contains(days) || days == _range) return;
    _range = days;
    _notify();
    if (!_stats.containsKey(days)) unawaited(loadStats(days));
  }

  /// Stats for [days] (default: the current period). Failures keep what
  /// was shown; the screen offers a retry when there's nothing.
  Future<void> loadStats([int? days]) async {
    final d = days ?? _range;
    _statsLoading.add(d);
    _notify();
    try {
      _stats[d] = await fetchStats(d);
    } on ApiException {
      // Keep the previous numbers.
    } finally {
      _statsLoading.remove(d);
      _notify();
    }
  }

  /// The first page, or the next one with [more].
  Future<void> loadCommissions({bool more = false}) async {
    if (more && (_commissionsCursor == null || _loadingMore)) return;
    _loadingMore = more;
    _notify();
    try {
      final page = await fetchCommissions(cursor: more ? _commissionsCursor : null);
      _commissions = more ? [..._commissions, ...page.items] : page.items;
      _commissionsCursor = page.nextCursor;
      _commissionsLoaded = true;
    } on ApiException {
      // Shown as "nothing loaded yet" with a retry.
    } finally {
      _loadingMore = false;
      _notify();
    }
  }

  Future<void> loadPayouts() async {
    try {
      _payouts = await fetchPayouts();
      _payoutsLoaded = true;
    } on ApiException {
      // Keep the last list.
    }
    _notify();
  }

  /// `POST /affiliate/apply`. Throws [ApiException]: `VERIFICATION_REQUIRED`,
  /// `AFFILIATE_EXISTS`, `AFFILIATE_CODE_TAKEN` (details.reason),
  /// `VALIDATION_FAILED`.
  Future<void> apply(PartnerApplication application) async {
    final errors = application.errors();
    if (errors.isNotEmpty) throw ApiException('VALIDATION_FAILED', errors.values.first, status: 400, details: {'fields': errors});
    _overview = await submitApplication(application);
    _notify();
  }

  /// Sends the whole available balance to [account]. Throws [ApiException]:
  /// `AFFILIATE_BELOW_MINIMUM` (details.minimumUsdCents),
  /// `AFFILIATE_PAYOUT_OPEN`, `AFFILIATE_NOT_ACTIVE`, `NOT_FOUND`.
  Future<PartnerPayout> requestPayout(PayoutAccount account) async {
    final p = await submitPayout(account);
    _payouts = [p, ..._payouts.where((x) => x.id != p.id)];
    _payoutsLoaded = true;
    _notify();
    // The balance and the commissions moved (AVAILABLE → PAID).
    unawaited(load());
    unawaited(loadCommissions());
    return p;
  }

  /// Sign-out: forget the previous account.
  void clear() {
    _overview = null;
    _error = null;
    _loading = false;
    _range = 30;
    _stats.clear();
    _statsLoading.clear();
    _commissions = const [];
    _commissionsCursor = null;
    _commissionsLoaded = false;
    _loadingMore = false;
    _payouts = const [];
    _payoutsLoaded = false;
    _notify();
  }

  /// Something changed on the server (`affiliate:updated`): re-read what's loaded.
  @protected
  Future<void> refreshLoaded() async {
    if (_overview == null) return;
    await refreshAll();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
