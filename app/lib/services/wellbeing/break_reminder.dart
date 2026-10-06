/// "You've been vibing for 60 minutes. Time for a break?" — a client-only
/// timer. It counts time with the app in the foreground while you are
/// searching or in a call; at the threshold [due] turns true once. Ten
/// minutes in the background start the count over.
///
/// Pure (an injected clock, no timers), so the rules are unit-tested; the
/// home shell feeds it state changes and polls [due].
class BreakReminder {
  BreakReminder({DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final DateTime Function() _clock;

  /// Background for this long resets the count.
  static const resetAfter = Duration(minutes: 10);

  /// null = reminders off.
  int? minutes;
  Duration _counted = Duration.zero;
  DateTime? _since; // counting from (active and in the foreground)
  DateTime? _backgroundAt;
  bool _active = false;
  bool _foreground = true;

  /// Time counted so far.
  Duration get vibing => _counted + (_since == null ? Duration.zero : _clock().difference(_since!));

  /// Searching or in a call.
  void setActive(bool active) {
    if (active == _active) return;
    _active = active;
    _sync();
  }

  void setForeground(bool foreground) {
    if (foreground == _foreground) return;
    _foreground = foreground;
    if (!foreground) {
      _backgroundAt = _clock();
    } else {
      final away = _backgroundAt;
      _backgroundAt = null;
      if (away != null && _clock().difference(away) >= resetAfter) reset();
    }
    _sync();
  }

  void _sync() {
    final counting = _active && _foreground;
    if (counting && _since == null) {
      _since = _clock();
    } else if (!counting && _since != null) {
      _counted += _clock().difference(_since!);
      _since = null;
    }
  }

  /// The reminder should show now.
  bool get due {
    final m = minutes;
    return m != null && m > 0 && _active && _foreground && vibing >= Duration(minutes: m);
  }

  /// After the sheet ("Keep going" / "Take a break"): count again from zero.
  void reset() {
    _counted = Duration.zero;
    _since = _active && _foreground ? _clock() : null;
  }
}
