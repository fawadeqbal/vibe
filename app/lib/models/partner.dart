/// Creator partners (affiliates): the `/v1/affiliate` views, money in USD
/// cents, the link builder, the stats chart's maths and the apply form's
/// checks. Mirrors the web's `lib/affiliate.ts` (see
/// docs/specs/2026-10-06-referrals-affiliates-api.md). Partners earn real
/// money, so it's gold (money) in the UI, never coins.
library;

import 'models.dart';
import 'payments.dart';

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
int _i(Object? v) => (v as num?)?.toInt() ?? 0;
String _str(Object? v) => v is String ? v : '';
String? _optStr(Object? v) => v is String && v.isNotEmpty ? v : null;
Map<String, dynamic> _map(Object? v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
List<Object?> _list(Object? v) => v is List ? v : const [];

// ── status and overview (`GET /affiliate`) ──────────────────────────────────

enum PartnerStatus {
  /// Never applied.
  none,
  pending,
  active,
  suspended,
  rejected;

  static PartnerStatus parse(Object? v) => switch (v) {
        'PENDING' => pending,
        'ACTIVE' => active,
        'SUSPENDED' => suspended,
        'REJECTED' => rejected,
        _ => none,
      };

  String get wire => this == none ? 'none' : name.toUpperCase();
}

/// The partner's code, link and terms.
class PartnerTerms {
  const PartnerTerms({
    required this.code,
    required this.displayName,
    required this.link,
    this.revSharePercent = 20,
    this.cpaUsdCents = 10,
    this.commissionMonths = 6,
    this.holdDays = 14,
    this.minPayoutUsdCents = 1000,
    this.appliedAt,
    this.decisionReason,
  });

  final String code;
  final String displayName;

  /// `https://vibe.fawadiqbal.dev/i/<CODE>`.
  final String link;
  final int revSharePercent;
  final int cpaUsdCents;
  final int commissionMonths;
  final int holdDays;
  final int minPayoutUsdCents;
  final DateTime? appliedAt;

  /// Staff's reason when REJECTED / SUSPENDED.
  final String? decisionReason;

  factory PartnerTerms.fromJson(Map<String, dynamic> a) => PartnerTerms(
        code: _str(a['code']),
        displayName: _str(a['displayName']),
        link: _str(a['link']),
        revSharePercent: _i(a['revSharePercent']),
        cpaUsdCents: _i(a['cpaUsdCents']),
        commissionMonths: _i(a['commissionMonths']),
        holdDays: _i(a['holdDays']),
        minPayoutUsdCents: _i(a['minPayoutUsdCents']),
        appliedAt: _date(a['appliedAt']),
        decisionReason: _optStr(a['decisionReason']),
      );
}

/// pending (incl. held) · available · requested (in an open payout) · paid out.
class PartnerBalance {
  const PartnerBalance({this.pendingUsdCents = 0, this.availableUsdCents = 0, this.requestedUsdCents = 0, this.paidUsdCents = 0});
  final int pendingUsdCents;

  /// Can be negative after a refund of an already-paid commission.
  final int availableUsdCents;
  final int requestedUsdCents;
  final int paidUsdCents;

  factory PartnerBalance.fromJson(Map<String, dynamic> b) => PartnerBalance(
        pendingUsdCents: _i(b['pendingUsdCents']),
        availableUsdCents: _i(b['availableUsdCents']),
        requestedUsdCents: _i(b['requestedUsdCents']),
        paidUsdCents: _i(b['paidUsdCents']),
      );
}

enum PartnerPayoutStatus {
  requested,
  paid,
  rejected;

  static PartnerPayoutStatus parse(Object? v) => switch (v) {
        'PAID' => paid,
        'REJECTED' => rejected,
        _ => requested,
      };

  String get label => switch (this) {
        requested => 'On its way',
        paid => 'Paid',
        rejected => 'Returned',
      };
}

/// A partner payout (`GET /affiliate/payouts`, `POST /affiliate/payouts`).
class PartnerPayout {
  const PartnerPayout({
    required this.id,
    required this.usdCents,
    this.amountPkr = 0,
    required this.method,
    required this.accountMasked,
    this.status = PartnerPayoutStatus.requested,
    this.reference,
    this.failureReason,
    required this.createdAt,
    this.decidedAt,
  });

  final String id;
  final int usdCents;
  final int amountPkr;
  final PaymentMethod method;
  final String accountMasked;
  final PartnerPayoutStatus status;

  /// The bank / wallet reference once paid.
  final String? reference;
  final String? failureReason;
  final DateTime createdAt;
  final DateTime? decidedAt;

  factory PartnerPayout.fromJson(Map<String, dynamic> m) => PartnerPayout(
        id: _str(m['id']),
        usdCents: _i(m['usdCents']),
        amountPkr: _i(m['amountPkr']),
        method: paymentMethodFromApi(m['method']) ?? PaymentMethod.bank,
        accountMasked: _str(m['accountMasked']),
        status: PartnerPayoutStatus.parse(m['status']),
        reference: _optStr(m['reference']),
        failureReason: _optStr(m['failureReason']),
        createdAt: _date(m['createdAt']) ?? DateTime.fromMillisecondsSinceEpoch(0),
        decidedAt: _date(m['decidedAt']),
      );

  /// "JazzCash •••• 4567" (the bank rail reads "Bank").
  String get destination => '${method == PaymentMethod.bank ? 'Bank' : method.label} $accountMasked'.trim();
}

/// `GET /affiliate`: status, terms, link, balance and the open payout.
class PartnerOverview {
  const PartnerOverview({required this.status, this.terms, this.balance, this.openPayout});

  final PartnerStatus status;

  /// Null when [status] is none.
  final PartnerTerms? terms;
  final PartnerBalance? balance;

  /// A REQUESTED payout (one at a time).
  final PartnerPayout? openPayout;

  static const none = PartnerOverview(status: PartnerStatus.none);

  factory PartnerOverview.fromJson(Map<String, dynamic> m) {
    final status = PartnerStatus.parse(m['status']);
    if (status == PartnerStatus.none) return none;
    final open = m['openPayout'];
    return PartnerOverview(
      status: status,
      terms: PartnerTerms.fromJson(_map(m['affiliate'])),
      balance: PartnerBalance.fromJson(_map(m['balance'])),
      openPayout: open is Map ? PartnerPayout.fromJson(Map<String, dynamic>.from(open)) : null,
    );
  }

  bool get isActive => status == PartnerStatus.active;

  /// The dashboard shows (ACTIVE, and SUSPENDED read-only).
  bool get hasDashboard => (status == PartnerStatus.active || status == PartnerStatus.suspended) && terms != null && balance != null;

  /// Why a payout can't be asked for now, or null when it can.
  String? get payoutBlock {
    if (status != PartnerStatus.active) {
      return status == PartnerStatus.suspended ? 'Payouts are paused while your partner account is suspended.' : "Payouts open once you're an active partner.";
    }
    if (openPayout != null) return "You have a payout on its way. You can ask for the next one when it's done.";
    final b = balance;
    final min = terms?.minPayoutUsdCents ?? 0;
    if (b == null || b.availableUsdCents <= 0) return 'Nothing available yet. Commissions become available after the hold period.';
    if (b.availableUsdCents < min) return 'You can cash out from ${formatUsd(min)}. ${formatUsd(min - b.availableUsdCents)} to go.';
    return null;
  }

  PartnerOverview copyWith({PartnerStatus? status, PartnerBalance? balance, PartnerPayout? openPayout, bool clearOpenPayout = false}) => PartnerOverview(
        status: status ?? this.status,
        terms: terms,
        balance: balance ?? this.balance,
        openPayout: clearOpenPayout ? null : (openPayout ?? this.openPayout),
      );
}

// ── stats (`GET /affiliate/stats?days=7|30|90`) ─────────────────────────────

const partnerStatsRanges = [7, 30, 90];

class PartnerStatsTotals {
  const PartnerStatsTotals({this.clicks = 0, this.signups = 0, this.qualified = 0, this.payingUsers = 0, this.revenueUsdCents = 0, this.earnedUsdCents = 0});
  final int clicks;
  final int signups;

  /// Became active (verified + calls).
  final int qualified;
  final int payingUsers;

  /// What the people you brought spent.
  final int revenueUsdCents;
  final int earnedUsdCents;

  factory PartnerStatsTotals.fromJson(Map<String, dynamic> t) => PartnerStatsTotals(
        clicks: _i(t['clicks']),
        signups: _i(t['signups']),
        qualified: _i(t['qualified']),
        payingUsers: _i(t['payingUsers']),
        revenueUsdCents: _i(t['revenueUsdCents']),
        earnedUsdCents: _i(t['earnedUsdCents']),
      );
}

class PartnerStatsDay {
  const PartnerStatsDay({required this.day, this.clicks = 0, this.signups = 0, this.qualified = 0, this.revenueUsdCents = 0, this.earnedUsdCents = 0});

  /// `YYYY-MM-DD` (the server's business day).
  final String day;
  final int clicks;
  final int signups;
  final int qualified;
  final int revenueUsdCents;
  final int earnedUsdCents;

  factory PartnerStatsDay.fromJson(Map<String, dynamic> d) => PartnerStatsDay(
        day: _str(d['day']),
        clicks: _i(d['clicks']),
        signups: _i(d['signups']),
        qualified: _i(d['qualified']),
        revenueUsdCents: _i(d['revenueUsdCents']),
        earnedUsdCents: _i(d['earnedUsdCents']),
      );
}

class PartnerChannelStats {
  const PartnerChannelStats({required this.channel, this.clicks = 0, this.signups = 0, this.qualified = 0, this.earnedUsdCents = 0});

  /// The link's `s=` (`direct` without one).
  final String channel;
  final int clicks;
  final int signups;
  final int qualified;
  final int earnedUsdCents;

  factory PartnerChannelStats.fromJson(Map<String, dynamic> c) => PartnerChannelStats(
        channel: _optStr(c['channel']) ?? 'direct',
        clicks: _i(c['clicks']),
        signups: _i(c['signups']),
        qualified: _i(c['qualified']),
        earnedUsdCents: _i(c['earnedUsdCents']),
      );
}

class PartnerStats {
  const PartnerStats({required this.days, this.totals = const PartnerStatsTotals(), this.daily = const [], this.byChannel = const []});
  final int days;
  final PartnerStatsTotals totals;

  /// Oldest → today, zero-filled.
  final List<PartnerStatsDay> daily;

  /// Most sign-ups first.
  final List<PartnerChannelStats> byChannel;

  factory PartnerStats.fromJson(Map<String, dynamic> m) => PartnerStats(
        days: _i(m['days']) == 0 ? 30 : _i(m['days']),
        totals: PartnerStatsTotals.fromJson(_map(m['totals'])),
        daily: [for (final x in _list(m['daily'])) PartnerStatsDay.fromJson(_map(x))],
        byChannel: [for (final x in _list(m['byChannel'])) PartnerChannelStats.fromJson(_map(x))],
      );
}

/// What the chart shows, one at a time.
enum PartnerMetric {
  clicks('Clicks'),
  signups('Sign-ups'),
  qualified('Active users'),
  earned('Earnings');

  const PartnerMetric(this.label);
  final String label;

  bool get money => this == earned;

  int of(PartnerStatsDay d) => switch (this) {
        clicks => d.clicks,
        signups => d.signups,
        qualified => d.qualified,
        earned => d.earnedUsdCents,
      };

  /// A value as the chart's tooltip shows it.
  String format(int v) => money ? formatUsd(v) : _thousands(v);

  /// A value as an axis label.
  String tick(num v) => money ? formatUsdShort(v) : countShort(v);
}

/// One column: the first and last day in it (the same for daily bars).
class PartnerChartBar {
  const PartnerChartBar({required this.from, required this.to, required this.value});
  final String from;
  final String to;
  final int value;

  String get label => from == to ? dayLabel(to) : '${dayLabel(from)} – ${dayLabel(to)}';
}

/// Daily bars for 7/30 days; 90 days become weekly bars (the last one ends today).
List<PartnerChartBar> partnerChartBars(List<PartnerStatsDay> daily, PartnerMetric metric, int days) {
  final size = days > 30 ? 7 : 1;
  final bars = <PartnerChartBar>[];
  for (var end = daily.length; end > 0; end -= size) {
    final chunk = daily.sublist(end - size < 0 ? 0 : end - size, end);
    bars.insert(0, PartnerChartBar(from: chunk.first.day, to: chunk.last.day, value: chunk.fold(0, (s, d) => s + metric.of(d))));
  }
  return bars;
}

/// A clean axis top ≥ [v]: 1, 2, 5 × 10ⁿ (at least [min]).
num niceMax(num v, [num min = 1]) {
  final x = v > min ? v : min;
  var p = 1.0;
  while (p * 10 <= x) {
    p *= 10;
  }
  while (p > x) {
    p /= 10;
  }
  for (final m in const [1, 2, 5, 10]) {
    if (m * p >= x) return _clean(m * p);
  }
  return _clean(10 * p);
}

num _clean(double v) => v == v.roundToDouble() ? v.round() : v;

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// '2026-10-06' → "6 Oct".
String dayLabel(String day) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(day);
  if (m == null) return day;
  return '${int.parse(m.group(3)!)} ${_months[int.parse(m.group(2)!) - 1]}';
}

// ── commissions (`GET /affiliate/commissions`) ──────────────────────────────

enum PartnerCommissionKind { revshare, cpa }

enum PartnerCommissionStatus {
  pending('Pending'),
  available('Available'),
  paid('Paid'),
  reversed('Reversed'),
  held('Held');

  const PartnerCommissionStatus(this.label);
  final String label;

  static PartnerCommissionStatus parse(Object? v) => switch (v) {
        'AVAILABLE' => available,
        'PAID' => paid,
        'REVERSED' => reversed,
        'HELD' => held,
        _ => pending,
      };
}

class PartnerCommission {
  const PartnerCommission({
    required this.id,
    required this.kind,
    required this.usdCents,
    this.baseUsdCents = 0,
    required this.status,
    this.availableAt,
    required this.createdAt,
    this.adjustment = false,
    this.userName = 'Someone',
  });

  final String id;
  final PartnerCommissionKind kind;
  final int usdCents;

  /// The purchase it's a share of (CPA: the fixed amount).
  final int baseUsdCents;
  final PartnerCommissionStatus status;
  final DateTime? availableAt;
  final DateTime createdAt;

  /// A negative row: refund of a commission that was already paid.
  final bool adjustment;

  /// The person you brought (first name only).
  final String userName;

  factory PartnerCommission.fromJson(Map<String, dynamic> m) => PartnerCommission(
        id: _str(m['id']),
        kind: m['kind'] == 'CPA' ? PartnerCommissionKind.cpa : PartnerCommissionKind.revshare,
        usdCents: _i(m['usdCents']),
        baseUsdCents: _i(m['baseUsdCents']),
        status: PartnerCommissionStatus.parse(m['status']),
        availableAt: _date(m['availableAt']),
        createdAt: _date(m['createdAt']) ?? DateTime.fromMillisecondsSinceEpoch(0),
        adjustment: m['adjustment'] == true,
        userName: _optStr(_map(m['user'])['name']) ?? 'Someone',
      );

  /// "Active user bonus", "$4.99 purchase", "Refund adjustment".
  String get what => adjustment ? 'Refund adjustment' : (kind == PartnerCommissionKind.cpa ? 'Active user bonus' : '${formatUsd(baseUsdCents)} purchase');

  bool get negative => usdCents < 0 || status == PartnerCommissionStatus.reversed;

  PartnerCommission copyWith({PartnerCommissionStatus? status}) => PartnerCommission(
        id: id,
        kind: kind,
        usdCents: usdCents,
        baseUsdCents: baseUsdCents,
        status: status ?? this.status,
        availableAt: availableAt,
        createdAt: createdAt,
        adjustment: adjustment,
        userName: userName,
      );
}

/// A cursor page of commissions.
class PartnerCommissionPage {
  const PartnerCommissionPage({this.items = const [], this.nextCursor});
  final List<PartnerCommission> items;
  final String? nextCursor;

  factory PartnerCommissionPage.fromJson(Map<String, dynamic> m) => PartnerCommissionPage(
        items: [for (final x in _list(m['items'])) PartnerCommission.fromJson(_map(x))],
        nextCursor: _optStr(m['nextCursor']),
      );
}

// ── link builder ────────────────────────────────────────────────────────────

/// Channels offered as chips in the link builder (any `[a-z0-9_-]{1,24}` works).
const partnerLinkSources = ['tiktok', 'youtube', 'instagram', 'whatsapp', 'facebook', 'x', 'snapchat'];

String partnerSourceLabel(String s) =>
    const {'tiktok': 'TikTok', 'youtube': 'YouTube', 'instagram': 'Instagram', 'whatsapp': 'WhatsApp', 'facebook': 'Facebook', 'x': 'X', 'snapchat': 'Snapchat', 'twitch': 'Twitch', 'direct': 'Direct', 'other': 'Other'}[s] ??
    s;

final _sourceRe = RegExp(r'^[a-z0-9_-]{1,24}$');

/// The partner link for one channel: `…/i/CODE?s=tiktok`; no source = the plain link.
String partnerLink(String link, [String? source]) {
  final uri = Uri.tryParse(link);
  if (uri == null || !uri.hasScheme) return link;
  final s = (source ?? '').trim().toLowerCase();
  final q = Map<String, String>.from(uri.queryParameters)..remove('s');
  if (_sourceRe.hasMatch(s)) q['s'] = s;
  final out = (q.isEmpty ? uri.replace(query: '') : uri.replace(queryParameters: q)).toString();
  return out.endsWith('?') ? out.substring(0, out.length - 1) : out;
}

/// The link without `https://`, for showing.
String bareLink(String url) => url.replaceFirst(RegExp(r'^https?://'), '');

// ── apply form (`POST /affiliate/apply`) ────────────────────────────────────

const partnerPlatforms = ['tiktok', 'youtube', 'instagram', 'facebook', 'x', 'snapchat', 'twitch', 'other'];

final _codeRe = RegExp(r'^[A-Za-z0-9_]{3,20}$');

/// 3–20 letters, digits or _ → upper-case; null otherwise.
String? normalisePartnerCode(String raw) {
  final t = raw.trim();
  return _codeRe.hasMatch(t) ? t.toUpperCase() : null;
}

/// `GET /affiliate/code-available` answer.
class PartnerCodeCheck {
  const PartnerCodeCheck({required this.code, required this.available, this.reason});
  final String? code;
  final bool available;

  /// `invalid`, `reserved` or `taken`.
  final String? reason;

  factory PartnerCodeCheck.fromJson(Map<String, dynamic> m, String raw) => PartnerCodeCheck(
        code: _optStr(m['code']) ?? normalisePartnerCode(raw),
        available: m['available'] == true,
        reason: _optStr(m['reason']),
      );
}

/// Why a code can't be used.
String partnerCodeReasonLabel(String? reason) => switch (reason) {
      'taken' => 'That code is taken.',
      'reserved' => 'That code is reserved.',
      _ => '3–20 letters, digits or _.',
    };

/// Followers as typed ("25k", "1.2m", "12,500") → a whole number, or null.
int? parseFollowers(String raw) {
  final t = raw.trim().toLowerCase().replaceAll(',', '');
  final m = RegExp(r'^(\d+(?:\.\d+)?)([km])?$').firstMatch(t);
  if (m == null) return null;
  final mult = switch (m.group(2)) { 'k' => 1e3, 'm' => 1e6, _ => 1.0 };
  final n = (double.parse(m.group(1)!) * mult).round();
  return n >= 0 && n <= 1000000000 ? n : null;
}

String _withScheme(String url) => RegExp(r'^https?://', caseSensitive: false).hasMatch(url) ? url : 'https://$url';

bool _isWebUrl(String s) {
  final u = Uri.tryParse(s.trim());
  return u != null && (u.scheme == 'https' || u.scheme == 'http') && u.host.contains('.');
}

class PartnerChannelInput {
  const PartnerChannelInput({this.platform = 'tiktok', this.url = '', this.followers = ''});
  final String platform;
  final String url;

  /// As typed ("25k").
  final String followers;
}

/// What the apply form sends.
class PartnerApplication {
  const PartnerApplication({required this.displayName, required this.code, required this.channels, this.note = ''});
  final String displayName;
  final String code;
  final List<PartnerChannelInput> channels;
  final String note;

  /// Field errors before sending: `displayName`, `code`, `channels.<i>.url`,
  /// `channels.<i>.followers`, `channels`, `note`.
  Map<String, String> errors() {
    final e = <String, String>{};
    final name = displayName.trim();
    if (name.length < 2 || name.length > 40) e['displayName'] = '2–40 characters.';
    if (normalisePartnerCode(code) == null) e['code'] = '3–20 letters, digits or _.';
    if (channels.isEmpty) e['channels'] = 'Add at least one channel.';
    if (channels.length > 5) e['channels'] = 'At most 5 channels.';
    for (var i = 0; i < channels.length; i++) {
      final url = channels[i].url.trim();
      if (url.isEmpty || !_isWebUrl(_withScheme(url)) || url.length > 300) e['channels.$i.url'] = 'The full link to your profile (https://…).';
      if (parseFollowers(channels[i].followers) == null) e['channels.$i.followers'] = 'A number, e.g. 25000 or 25k.';
    }
    if (note.length > 1000) e['note'] = 'At most 1000 characters.';
    return e;
  }

  /// The `POST /affiliate/apply` body.
  Map<String, dynamic> toJson() {
    final n = note.trim();
    return {
      'displayName': displayName.trim(),
      'code': normalisePartnerCode(code) ?? code.trim(),
      'channels': [
        for (final c in channels) {'platform': c.platform, 'url': _withScheme(c.url.trim()), 'followers': parseFollowers(c.followers) ?? 0},
      ],
      if (n.isNotEmpty) 'note': n,
    };
  }
}

// ── money (USD cents) ───────────────────────────────────────────────────────

String _thousands(int n) {
  final s = n.abs().toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return n < 0 ? '-$b' : b.toString();
}

/// 123456 → "$1,234.56"; -120 → "−$1.20".
String formatUsd(int cents) {
  final abs = cents.abs();
  return '${cents < 0 ? '−' : ''}\$${_thousands(abs ~/ 100)}.${(abs % 100).toString().padLeft(2, '0')}';
}

String _trimZero(String s) => s.endsWith('.0') ? s.substring(0, s.length - 2) : s;

/// Chart axis labels: "$0", "$40", "$1.2k".
String formatUsdShort(num cents) {
  final d = cents.round() / 100;
  final abs = d.abs();
  final sign = d < 0 ? '−' : '';
  if (abs >= 1000) return '$sign\$${_trimZero((abs / 1000).toStringAsFixed(abs >= 10000 ? 0 : 1))}k';
  if (abs >= 10 || abs == abs.roundToDouble()) return '$sign\$${abs.round()}';
  return '$sign\$${abs.toStringAsFixed(2)}';
}

/// Whole numbers on count axes: 1234 → "1.2k".
String countShort(num n) {
  if (n.abs() >= 1000) return '${_trimZero((n / 1000).toStringAsFixed(n.abs() >= 10000 ? 0 : 1))}k';
  return '${n.round()}';
}

/// About how many rupees at [pkrPerUsd].
int usdCentsToPkr(int cents, double pkrPerUsd) => (cents / 100 * pkrPerUsd).round();
