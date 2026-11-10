import '../../models/models.dart';

class Fmt {
  Fmt._();

  // How amounts are written (coins, gems, money, counts) — the same rule as
  // web's lib/format.ts:
  //
  //  - compact(n): chips, tiles, list rows, counts. Never more than 5
  //    characters: 9,999 · 12.4K · 999K · 1.25M · 45.6M · 3.4B · 1.2T.
  //    It rounds DOWN, so a balance is never shown as more than it is.
  //    Show it in an [AmountSlot] so a growing number never moves anything.
  //  - figure(n): the one big number on a screen (wallet balance, cash out,
  //    a coin pack). Exact up to 999,999, compact from a million.
  //  - thousands(n): sentences, receipts and history, where the exact value
  //    matters and the text can wrap.
  //
  // Wherever a short form is shown, the exact value goes in the semantics
  // label: "1,234,567 coins".

  static const _units = [(1e12, 'T'), (1e9, 'B'), (1e6, 'M'), (1e3, 'K')];

  static double _floorTo(double v, int places) {
    final f = places == 2 ? 100 : (places == 1 ? 10 : 1);
    return (v * f + 1e-9).floorToDouble() / f;
  }

  static String _trim(String s) => s.contains('.') ? s.replaceFirst(RegExp(r'\.?0+$'), '') : s;

  /// 9,999 · 12.4K · 999K · 1.25M · 3.4B — at most 5 characters (plus a minus sign).
  static String compact(int n) {
    final a = n.abs();
    final sign = n < 0 ? '-' : '';
    if (a < 10000) return '$sign${thousands(a)}';
    for (final (size, unit) in _units) {
      if (a < size) continue;
      final v = a / size;
      if (v >= 1000) return '${sign}999$unit+';
      final s = v < 10 ? _trim(_floorTo(v, 2).toStringAsFixed(2)) : (v < 100 ? _trim(_floorTo(v, 1).toStringAsFixed(1)) : v.floor().toString());
      return '$sign$s$unit';
    }
    return '$sign${thousands(a)}';
  }

  /// The one big number on a screen: exact up to 999,999, then compact.
  static String figure(int n) => n.abs() < 1000000 ? thousands(n) : compact(n);

  /// The old name: coins in a chip are [compact].
  static String coins(int n) => compact(n);

  /// Money in a tight spot: "Rs 9,999" · "Rs 12.4K" · "$12.50" · "$1.25M".
  static String pkrCompact(num rupees) => 'Rs ${compact(rupees.round())}';
  static String usdCompact(double v) => v.abs() < 10000 ? usd(v) : '\$${compact(v.truncate())}';

  static String thousands(int n) {
    final s = n.abs().toString();
    final b = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
      b.write(s[i]);
    }
    return n < 0 ? '-$b' : b.toString();
  }

  static String usd(double v) => '\$${v.toStringAsFixed(2)}';

  static String pkr(double usd) => 'Rs ${thousands((usd * Economy.pkrPerUsd).round())}';

  static String gemsAsUsd(int gems) => usd(gems * Economy.usdPerGem);

  /// 65 → "1:05"; 3700 → "1h 1m".
  static String duration(Duration d) {
    final s = d.inSeconds;
    if (s >= 3600) return '${s ~/ 3600}h ${(s % 3600) ~/ 60}m';
    return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
  }

  static String ago(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${t.day}/${t.month}/${t.year}';
  }

  /// A friend's status line: "Active now" while their app or tab is connected, then
  /// "Active 5 min ago" from the moment it disconnected (the server records it then),
  /// or null when we don't know (never from the friendship date).
  static String? presence(bool? online, DateTime? lastSeenAt) {
    if (online == true) return 'Active now';
    if (lastSeenAt == null) return null;
    return activeAgo(lastSeenAt);
  }

  /// "Active just now", "Active 5 min ago", "Active 3 hours ago", "Active 2 days ago", "Active on 31 Oct".
  static String activeAgo(DateTime t) {
    final diff = DateTime.now().difference(t);
    final m = diff.inMinutes < 0 ? 0 : diff.inMinutes;
    if (m < 1) return 'Active just now';
    if (m < 60) return 'Active $m min ago';
    final h = m ~/ 60;
    if (h < 24) return 'Active $h ${h == 1 ? 'hour' : 'hours'} ago';
    final d = h ~/ 24;
    if (d < 7) return 'Active $d ${d == 1 ? 'day' : 'days'} ago';
    const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final l = t.toLocal();
    return 'Active on ${l.day} ${mo[l.month - 1]}';
  }

  /// Compact list timestamp: "now", "5m", "1h", "3d", "12/9".
  static String agoShort(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inMinutes < 1) return 'now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    return '${t.day}/${t.month}';
  }

  /// Call timer: 84 s → "01:24".
  static String clock(Duration d) {
    final s = d.inSeconds;
    if (s >= 3600) return '${s ~/ 3600}:${((s % 3600) ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
    return '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
  }

  static String until(DateTime t) {
    final diff = t.difference(DateTime.now());
    if (diff.isNegative) return 'expired';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m left';
    if (diff.inHours < 48) return '${diff.inHours}h left';
    return '${diff.inDays} days left';
  }

  static String time(DateTime t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  static String date(DateTime t) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${t.day} ${months[t.month - 1]} ${t.year}';
  }

  static bool sameDay(DateTime? a, DateTime? b) => a != null && b != null && a.year == b.year && a.month == b.month && a.day == b.day;
}
