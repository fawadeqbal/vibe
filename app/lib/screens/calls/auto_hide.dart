import 'dart:async';

import 'package:flutter/foundation.dart';

/// How long a video call's controls stay up after the last tap.
const Duration autoHideDelay = Duration(seconds: 4);

/// The controls of a video call that get out of the way, like WhatsApp or
/// FaceTime: up when the call starts, gone after [delay] without a tap, back
/// on the next tap. While [hold] is on (a sheet open, dragging the small
/// picture, no video yet) they stay up. (web: features/calls/auto-hide.ts)
class AutoHide extends ChangeNotifier {
  AutoHide({this.delay = autoHideDelay});
  final Duration delay;

  bool _shown = true;
  bool _held = false;
  Timer? _timer;

  bool get shown => _shown;

  void _set(bool v) {
    if (v == _shown) return;
    _shown = v;
    notifyListeners();
  }

  void _arm() {
    _timer?.cancel();
    _timer = null;
    if (_held || !_shown) return;
    _timer = Timer(delay, () {
      _timer = null;
      _set(false);
    });
  }

  /// Show them and start the countdown again (any tap on the call).
  void poke() {
    _set(true);
    _arm();
  }

  /// A tap on the video while they're up: hide them at once (unless held).
  void hide() {
    if (_held) return;
    _timer?.cancel();
    _timer = null;
    _set(false);
  }

  void hold(bool held) {
    if (held == _held) return;
    _held = held;
    if (held) _set(true);
    _arm();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
