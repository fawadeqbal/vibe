import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/calls.dart';
import '../../providers/calls_provider.dart';

const _quickReplies = ["Can't talk now", 'Call me in 10 min', 'Text me instead'];

/// A friend is calling: full screen, Accept / Decline, quick replies.
/// Closes itself when the call stops ringing (answered elsewhere, cancelled,
/// rang out).
class IncomingCallScreen extends StatefulWidget {
  const IncomingCallScreen({super.key, required this.call});
  final IncomingCall call;

  @override
  State<IncomingCallScreen> createState() => _IncomingCallScreenState();
}

class _IncomingCallScreenState extends State<IncomingCallScreen> {
  Timer? _tick;
  Timer? _buzz;
  late final CallsProvider _calls = context.read<CallsProvider>();

  int get _left => widget.call.expiresAt.difference(DateTime.now()).inSeconds.clamp(0, 999);

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(milliseconds: 500), (_) {
      if (mounted) setState(() {});
    });
    // A gentle buzz while it rings (the app's own ring; the push rings when closed).
    unawaited(HapticFeedback.heavyImpact());
    _buzz = Timer.periodic(const Duration(milliseconds: 1600), (_) => HapticFeedback.mediumImpact());
    _calls.addListener(_onCalls);
  }

  void _onCalls() {
    if (_calls.incoming?.callId != widget.call.callId && mounted) Navigator.of(context).maybePop();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _buzz?.cancel();
    _calls.removeListener(_onCalls);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final from = widget.call.from;
    final first = from.name.split(' ').first;
    return Scaffold(
      body: Container(
        width: double.infinity,
        decoration: const BoxDecoration(
          gradient: RadialGradient(center: Alignment(0, -0.44), radius: 1.1, colors: [Color(0xFF6B3A7A), Color(0xFF2B1B4D), V.bg], stops: [0, 0.45, 0.85]),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
            child: Column(
              children: [
                Text('VIBE · VIDEO CALL', style: VT.overline(color: const Color(0xFFE0D6F5))),
                const SizedBox(height: 44),
                PulseRings(child: VAvatar(url: from.avatarUrl, name: from.name, size: 160)),
                const SizedBox(height: 32),
                Text(first, style: VT.display(34)),
                const SizedBox(height: 6),
                Text('wants to video call you', style: VT.body(15, color: const Color(0xFFD8CFE8))),
                const Spacer(),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final r in _quickReplies)
                      ActionChip(
                        label: Text(r, style: VT.label(13, color: V.text)),
                        backgroundColor: Colors.black.withValues(alpha: 0.3),
                        side: BorderSide(color: Colors.white.withValues(alpha: 0.18)),
                        shape: const StadiumBorder(),
                        onPressed: () => _calls.decline(r),
                      ),
                  ],
                ),
                const SizedBox(height: 32),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _BigButton(label: 'Decline', icon: Icons.call_end_rounded, color: const Color(0xFFE11D48), onTap: () => _calls.decline()),
                    _BigButton(label: 'Accept', icon: SolarIconsBold.videocamera, color: V.ok, iconColor: V.bg, onTap: () => _calls.accept()),
                  ],
                ),
                const SizedBox(height: 20),
                Text("Rings for ${_left}s more. Not answered, it shows as a missed call in your chat.", textAlign: TextAlign.center, style: VT.body(12, color: const Color(0xFFB3A9C9))),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BigButton extends StatelessWidget {
  const _BigButton({required this.label, required this.icon, required this.color, required this.onTap, this.iconColor = Colors.white});
  final String label;
  final IconData icon;
  final Color color;
  final Color iconColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 76,
            height: 76,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle, boxShadow: [BoxShadow(color: color.withValues(alpha: 0.4), blurRadius: 30, offset: const Offset(0, 12))]),
            child: Icon(icon, size: 32, color: iconColor),
          ),
          const SizedBox(height: 10),
          Text(label, style: VT.label(13, color: const Color(0xFFE0D6F5))),
        ]),
      ),
    );
  }
}

/// Your call, ringing on their side ("Calling… 12s", Cancel) — and how it
/// ended (declined with their reply, no answer, busy).
class OutgoingCallScreen extends StatefulWidget {
  const OutgoingCallScreen({super.key, required this.onMessage});

  /// "Send a message" after a call that didn't connect: open the chat.
  final ValueChanged<String> onMessage;

  @override
  State<OutgoingCallScreen> createState() => _OutgoingCallScreenState();
}

class _OutgoingCallScreenState extends State<OutgoingCallScreen> {
  int _secs = 0;
  Timer? _tick;
  late final CallsProvider _calls = context.read<CallsProvider>();

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _calls.outgoing?.status == OutgoingStatus.ringing) setState(() => _secs++);
    });
    _calls.addListener(_onCalls);
  }

  void _onCalls() {
    if (_calls.outgoing == null && mounted) Navigator.of(context).maybePop();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _calls.removeListener(_onCalls);
    super.dispose();
  }

  (String, String)? _outcome(OutgoingCall c, String name) => switch (c.status) {
        OutgoingStatus.ringing => null,
        OutgoingStatus.declined => ('Not available right now', c.reply != null ? '$name: "${c.reply}"' : "$name can't talk now. Send a message instead — calls are still allowed."),
        OutgoingStatus.noAnswer => ('No answer', "$name didn't pick up. It shows as a missed call in your chat."),
        OutgoingStatus.busy => ('In another call', '$name is busy right now. Try again in a little while.'),
        OutgoingStatus.paused => ("Can't call right now", 'They declined a few calls in a row. Try a message instead.'),
        OutgoingStatus.error => ("Couldn't call", c.message ?? 'Something went wrong. Try again.'),
      };

  @override
  Widget build(BuildContext context) {
    final c = context.watch<CallsProvider>().outgoing;
    if (c == null) return const Scaffold(backgroundColor: V.bg);
    final first = c.to.name.split(' ').first;
    final done = _outcome(c, first);
    return Scaffold(
      body: Container(
        width: double.infinity,
        decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF2A2A3A), Color(0xFF17151F), V.bg], stops: [0, 0.6, 1])),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 72, 24, 32),
            child: Column(
              children: [
                VAvatar(url: c.to.avatarUrl, name: c.to.name, size: 112),
                const SizedBox(height: 20),
                Text(first, style: VT.display(30)),
                const SizedBox(height: 6),
                Semantics(liveRegion: true, child: Text(done?.$1 ?? 'Calling… ${_secs}s', style: VT.body(15, color: const Color(0xFFD8CFE8)))),
                if (done != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    constraints: const BoxConstraints(maxWidth: 340),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.4), borderRadius: BorderRadius.circular(16)),
                    child: Text(done.$2, textAlign: TextAlign.center, style: VT.body(13.5, height: 1.45)),
                  ),
                ],
                const Spacer(),
                if (done != null) ...[
                  GradientButton(
                    label: 'Send a message',
                    onTap: () {
                      final id = c.to.id;
                      _calls.dismissOutgoing();
                      widget.onMessage(id);
                    },
                  ),
                  const SizedBox(height: 10),
                  GhostButton(label: 'Close', expand: true, onTap: _calls.dismissOutgoing),
                ] else
                  _BigButton(label: 'Cancel', icon: Icons.call_end_rounded, color: const Color(0xFFE11D48), onTap: () => _calls.cancel()),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
