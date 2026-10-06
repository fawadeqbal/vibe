part of 'partner_provider.dart';

/// The offline demo: apply (the same checks as the server: verified, one
/// application, a free code) → "in review" → approved with a believable
/// dashboard: 23 commissions over two months (some waiting out the hold,
/// some available, one refunded, older ones already paid out), daily
/// stats for 7/30/90 days split by channel, and a paid payout. Cashing out
/// moves the available commissions into a payout "on its way";
/// [advanceDemo] plays the staff side (approve, pay).
class LocalPartnerProvider extends PartnerProvider {
  LocalPartnerProvider({bool Function()? verified, PartnerStatus status = PartnerStatus.none, DateTime Function()? clock})
      : _verified = verified ?? (() => true),
        _clock = clock ?? DateTime.now,
        _status = status,
        super.base() {
    if (status != PartnerStatus.none) {
      _appliedAt = _clock().subtract(const Duration(days: 64));
      if (status == PartnerStatus.active || status == PartnerStatus.suspended) _seed();
      if (status == PartnerStatus.rejected) _reason = "We couldn't confirm the channels are yours.";
      if (status == PartnerStatus.suspended) _reason = 'Unusual sign-ups from the same devices.';
    }
  }

  final bool Function() _verified;
  final DateTime Function() _clock;
  PartnerStatus _status;
  String _code = 'SANACREATES';
  String _displayName = 'Sana Creates';
  DateTime? _appliedAt;
  String? _reason;
  List<PartnerCommission> _comms = [];
  List<PartnerPayout> _pays = [];

  static const _reserved = {'VIBE', 'ADMIN', 'SUPPORT', 'STAFF', 'OFFICIAL'};
  static const _taken = {'ALI', 'ALI123', 'SANA77', 'ZARA', 'ZARACREATES', MockData.myInviteCode};

  // (days ago, first name, CPA?, purchase in cents, refunded?)
  static const _history = <(int, String, bool, int, bool)>[
    (1, 'Ayesha', false, 999, false),
    (2, 'Bilal', true, 0, false),
    (3, 'Hira', false, 499, false),
    (5, 'Usman', false, 1999, false),
    (6, 'Mahnoor', true, 0, false),
    (9, 'Zain', false, 999, false),
    (12, 'Fatima', false, 4999, false),
    (15, 'Hamza', true, 0, false),
    (16, 'Iqra', false, 1999, false),
    (18, 'Saad', false, 4999, false),
    (20, 'Noor', false, 999, false),
    (21, 'Ayesha', false, 1999, false),
    (23, 'Bilal', false, 999, false),
    (25, 'Hira', true, 0, false),
    (27, 'Usman', false, 4999, true),
    (33, 'Zain', false, 4999, false),
    (36, 'Mahnoor', false, 1999, false),
    (40, 'Fatima', false, 999, false),
    (44, 'Hamza', false, 4999, false),
    (48, 'Iqra', true, 0, false),
    (52, 'Saad', false, 1999, false),
    (55, 'Noor', true, 0, false),
    (58, 'Ayesha', false, 999, false),
  ];

  PartnerTerms get _terms => PartnerTerms(
        code: _code,
        displayName: _displayName,
        link: ApiConfig.inviteLink(_code),
        revSharePercent: Economy.affiliateRevSharePercent,
        cpaUsdCents: Economy.affiliateCpaUsdCents,
        commissionMonths: Economy.affiliateCommissionMonths,
        holdDays: Economy.affiliateHoldDays,
        minPayoutUsdCents: Economy.affiliateMinPayoutUsdCents,
        appliedAt: _appliedAt,
        decisionReason: _status == PartnerStatus.active || _status == PartnerStatus.pending ? null : _reason,
      );

  int _sum(Iterable<PartnerCommission> xs) => xs.fold(0, (s, c) => s + c.usdCents);

  PartnerBalance get _balance => PartnerBalance(
        pendingUsdCents: _sum(_comms.where((c) => c.status == PartnerCommissionStatus.pending || c.status == PartnerCommissionStatus.held)),
        availableUsdCents: _sum(_comms.where((c) => c.status == PartnerCommissionStatus.available)),
        requestedUsdCents: _pays.where((p) => p.status == PartnerPayoutStatus.requested).fold(0, (s, p) => s + p.usdCents),
        paidUsdCents: _pays.where((p) => p.status == PartnerPayoutStatus.paid).fold(0, (s, p) => s + p.usdCents),
      );

  PartnerOverview get _view {
    if (_status == PartnerStatus.none) return PartnerOverview.none;
    PartnerPayout? open;
    for (final p in _pays) {
      if (p.status == PartnerPayoutStatus.requested) open = p;
    }
    return PartnerOverview(status: _status, terms: _terms, balance: _balance, openPayout: open);
  }

  /// Commissions over the last two months and a payout of the oldest ones.
  void _seed() {
    final now = _clock();
    final hold = Economy.affiliateHoldDays;
    final comms = <PartnerCommission>[];
    var paidTotal = 0;
    for (final (i, h) in _history.indexed) {
      final (daysAgo, name, cpa, base, refunded) = h;
      final usd = cpa ? Economy.affiliateCpaUsdCents : base * Economy.affiliateRevSharePercent ~/ 100;
      final at = now.subtract(Duration(days: daysAgo, hours: 3 + i % 7));
      final status = refunded
          ? PartnerCommissionStatus.reversed
          : daysAgo > 30
              ? PartnerCommissionStatus.paid
              : daysAgo >= hold
                  ? PartnerCommissionStatus.available
                  : (_status == PartnerStatus.suspended ? PartnerCommissionStatus.held : PartnerCommissionStatus.pending);
      if (status == PartnerCommissionStatus.paid) paidTotal += usd;
      comms.add(PartnerCommission(
        id: 'pc-${i + 1}',
        kind: cpa ? PartnerCommissionKind.cpa : PartnerCommissionKind.revshare,
        usdCents: usd,
        baseUsdCents: cpa ? usd : base,
        status: status,
        availableAt: at.add(Duration(days: hold)),
        createdAt: at,
        userName: name,
      ));
    }
    _comms = comms;
    final paidAt = now.subtract(const Duration(days: 30));
    _pays = [
      PartnerPayout(
        id: 'pp-1',
        usdCents: paidTotal,
        amountPkr: usdCentsToPkr(paidTotal, Economy.pkrPerUsd),
        method: PaymentMethod.jazzCash,
        accountMasked: '•••• 4567',
        status: PartnerPayoutStatus.paid,
        reference: 'JC-20260907-118',
        createdAt: paidAt,
        decidedAt: paidAt.add(const Duration(days: 2)),
      ),
    ];
  }

  ApiException _notPartner() => ApiException('AFFILIATE_NOT_ACTIVE', 'You are not a creator partner yet', status: 403);

  @override
  Future<PartnerOverview> fetchOverview() async => _view;

  @override
  Future<PartnerCodeCheck> codeAvailable(String code) async {
    final c = normalisePartnerCode(code);
    if (c == null) return const PartnerCodeCheck(code: null, available: false, reason: 'invalid');
    if (_reserved.contains(c)) return PartnerCodeCheck(code: c, available: false, reason: 'reserved');
    if (_taken.contains(c)) return PartnerCodeCheck(code: c, available: false, reason: 'taken');
    return PartnerCodeCheck(code: c, available: true);
  }

  @override
  Future<PartnerOverview> submitApplication(PartnerApplication application) async {
    if (!_verified()) throw ApiException('VERIFICATION_REQUIRED', 'Verify your profile (selfie) before applying', status: 403);
    if (_status != PartnerStatus.none) throw ApiException('AFFILIATE_EXISTS', 'You already applied', status: 409);
    final check = await codeAvailable(application.code);
    if (!check.available) throw ApiException('AFFILIATE_CODE_TAKEN', partnerCodeReasonLabel(check.reason), status: 409, details: {'reason': check.reason});
    _status = PartnerStatus.pending;
    _code = check.code!;
    _displayName = application.displayName.trim();
    _appliedAt = _clock();
    return _view;
  }

  @override
  Future<PartnerStats> fetchStats(int days) async {
    if (_status == PartnerStatus.none) throw _notPartner();
    final now = _clock();
    final today = DateTime(now.year, now.month, now.day);
    String label(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    final daily = <PartnerStatsDay>[];
    final payers = <String>{};
    for (var i = days - 1; i >= 0; i--) {
      final d = today.subtract(Duration(days: i));
      // The same numbers for the same day, whatever the period.
      final rnd = Random(d.year * 400 + d.month * 32 + d.day);
      final weekend = d.weekday >= DateTime.saturday;
      final clicks = 6 + rnd.nextInt(weekend ? 60 : 35);
      final signups = clicks ~/ 8 + rnd.nextInt(2);
      final sameDay = _comms.where((c) => c.status != PartnerCommissionStatus.reversed && c.createdAt.year == d.year && c.createdAt.month == d.month && c.createdAt.day == d.day);
      final revenue = sameDay.where((c) => c.kind == PartnerCommissionKind.revshare).fold(0, (s, c) => s + c.baseUsdCents);
      payers.addAll(sameDay.where((c) => c.kind == PartnerCommissionKind.revshare).map((c) => c.userName));
      daily.add(PartnerStatsDay(
        day: label(d),
        clicks: clicks,
        signups: signups,
        qualified: sameDay.where((c) => c.kind == PartnerCommissionKind.cpa).length + (signups > 3 ? 1 : 0),
        revenueUsdCents: revenue,
        earnedUsdCents: _sum(sameDay),
      ));
    }
    int total(int Function(PartnerStatsDay d) f) => daily.fold(0, (s, d) => s + f(d));
    final totals = PartnerStatsTotals(
      clicks: total((d) => d.clicks),
      signups: total((d) => d.signups),
      qualified: total((d) => d.qualified),
      payingUsers: payers.length,
      revenueUsdCents: total((d) => d.revenueUsdCents),
      earnedUsdCents: total((d) => d.earnedUsdCents),
    );
    // Where people came from: the link's `s=`.
    const split = [('tiktok', 50), ('youtube', 25), ('instagram', 15), ('direct', 10)];
    int part(int n, int pct, bool last, int given) => last ? n - given : n * pct ~/ 100;
    final byChannel = <PartnerChannelStats>[];
    var c = 0, s = 0, q = 0, e = 0;
    for (final (i, (channel, pct)) in split.indexed) {
      final last = i == split.length - 1;
      final row = PartnerChannelStats(
        channel: channel,
        clicks: part(totals.clicks, pct, last, c),
        signups: part(totals.signups, pct, last, s),
        qualified: part(totals.qualified, pct, last, q),
        earnedUsdCents: part(totals.earnedUsdCents, pct, last, e),
      );
      c += row.clicks;
      s += row.signups;
      q += row.qualified;
      e += row.earnedUsdCents;
      byChannel.add(row);
    }
    return PartnerStats(days: days, totals: totals, daily: daily, byChannel: byChannel);
  }

  @override
  Future<PartnerCommissionPage> fetchCommissions({String? cursor, int limit = PartnerProvider.commissionsPageSize}) async {
    if (_status == PartnerStatus.none) throw _notPartner();
    final sorted = [..._comms]..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    final start = cursor == null ? 0 : (int.tryParse(cursor) ?? 0);
    final end = min(start + limit, sorted.length);
    return PartnerCommissionPage(items: sorted.sublist(min(start, end), end), nextCursor: end < sorted.length ? '$end' : null);
  }

  @override
  Future<List<PartnerPayout>> fetchPayouts() async {
    if (_status == PartnerStatus.none) throw _notPartner();
    return [..._pays]..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  @override
  Future<PartnerPayout> submitPayout(PayoutAccount account) async {
    if (_status == PartnerStatus.none) throw _notPartner();
    if (_status != PartnerStatus.active) throw ApiException('AFFILIATE_NOT_ACTIVE', 'Payouts are paused on your partner account', status: 403);
    if (_pays.any((p) => p.status == PartnerPayoutStatus.requested)) throw ApiException('AFFILIATE_PAYOUT_OPEN', 'Your last payout is still being processed', status: 409);
    final available = _comms.where((c) => c.status == PartnerCommissionStatus.available).toList();
    final total = _sum(available);
    final minimum = Economy.affiliateMinPayoutUsdCents;
    if (total < minimum || total <= 0) {
      throw ApiException('AFFILIATE_BELOW_MINIMUM', 'Payouts start at ${formatUsd(minimum)}', status: 400, details: {'minimumUsdCents': minimum, 'availableUsdCents': total});
    }
    final p = PartnerPayout(
      id: 'pp-${_clock().microsecondsSinceEpoch}',
      usdCents: total,
      amountPkr: usdCentsToPkr(total, Economy.pkrPerUsd),
      method: account.method,
      accountMasked: account.accountMasked,
      createdAt: _clock(),
    );
    final ids = {for (final c in available) c.id};
    _comms = [for (final c in _comms) ids.contains(c.id) ? c.copyWith(status: PartnerCommissionStatus.paid) : c];
    _pays = [p, ..._pays];
    return p;
  }

  /// Demo (and tests): the staff side moves one step — an application is
  /// approved, or a payout on its way is paid. Returns the notice, or null.
  Future<String?> advanceDemo() async {
    String? notice;
    if (_status == PartnerStatus.pending) {
      _status = PartnerStatus.active;
      _seed();
      notice = "You're a Vibe creator partner 🎉";
    } else if (_status == PartnerStatus.suspended) {
      _status = PartnerStatus.active;
      _comms = [for (final c in _comms) c.status == PartnerCommissionStatus.held ? c.copyWith(status: PartnerCommissionStatus.pending) : c];
      notice = 'Your creator partner account is active again';
    } else {
      final i = _pays.indexWhere((p) => p.status == PartnerPayoutStatus.requested);
      if (i < 0) return null;
      final p = _pays[i];
      _pays = [..._pays]
        ..[i] = PartnerPayout(
          id: p.id,
          usdCents: p.usdCents,
          amountPkr: p.amountPkr,
          method: p.method,
          accountMasked: p.accountMasked,
          status: PartnerPayoutStatus.paid,
          reference: 'DEMO-${p.id.hashCode.abs() % 100000}',
          createdAt: p.createdAt,
          decidedAt: _clock(),
        );
      notice = 'Partner payout sent 💸';
    }
    await refreshAll();
    return notice;
  }

  /// What [advanceDemo] would do next (the demo button's label), or null.
  String? get demoAction {
    if (_status == PartnerStatus.pending) return 'Offline demo: approve my application';
    if (_status == PartnerStatus.suspended) return 'Offline demo: reactivate my account';
    if (_pays.any((p) => p.status == PartnerPayoutStatus.requested)) return 'Offline demo: pay my payout';
    return null;
  }

  @override
  void clear() {
    _status = PartnerStatus.none;
    _comms = [];
    _pays = [];
    _reason = null;
    _appliedAt = null;
    _code = 'SANACREATES';
    _displayName = 'Sana Creates';
    super.clear();
  }
}
