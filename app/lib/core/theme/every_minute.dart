import 'dart:async';

import 'package:flutter/widgets.dart';

/// Rebuilds [builder] every minute, so "Last seen 5 min ago" keeps counting
/// while it's on screen (web: useNow(60_000)).
class EveryMinute extends StatefulWidget {
  const EveryMinute({super.key, required this.builder});
  final WidgetBuilder builder;

  @override
  State<EveryMinute> createState() => _EveryMinuteState();
}

class _EveryMinuteState extends State<EveryMinute> {
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context);
}
