import '../../models/models.dart';

class Fmt {
  Fmt._();

  /// 1234 → "1,234"; 1200000 → "1.2M".
  static String coins(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    return thousands(n);
  }

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
