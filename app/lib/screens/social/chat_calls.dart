import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/calls_provider.dart';

String _first(Friend f) => f.profile.name.split(' ').first;

/// Ask them to allow calls, or say yes to their ask.
Future<void> askForCalls(BuildContext context, Friend f) async {
  final calls = context.read<CallsProvider>();
  try {
    final st = await calls.allow(f.profile.id);
    if (context.mounted) toast(context, st.on ? 'Video calls are on' : 'Asked ${_first(f)} to allow video calls');
  } on ApiException catch (e) {
    if (!context.mounted) return;
    toast(context, e.code == 'CALL_NEEDS_MESSAGES' ? 'Say hi first — you both need to have written before asking for calls' : e.message, error: true);
  }
}

/// Turn calls off for both (confirming first when they're on), say "not
/// now" to their ask, or take back your own.
Future<void> turnOffCalls(BuildContext context, Friend f) async {
  final calls = context.read<CallsProvider>();
  final on = f.calls.on;
  final notNow = f.calls.theirs && !f.calls.mine;
  if (on) {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Turn off video calls?'),
        content: Text("Neither of you will be able to call until you both allow it again. ${_first(f)} won't be told it was you."),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Turn off', style: TextStyle(color: V.bad))),
        ],
      ),
    );
    if (ok != true) return;
  }
  try {
    await calls.turnOff(f.profile.id);
    if (context.mounted) toast(context, on ? 'Video calls turned off' : notNow ? 'OK — not now' : 'Request taken back');
  } on ApiException catch (e) {
    if (context.mounted) toast(context, e.message, error: true);
  }
}

/// The camera in the chat header: calls when both allowed, otherwise asks.
class CallButton extends StatelessWidget {
  const CallButton({super.key, required this.friend});
  final Friend friend;

  @override
  Widget build(BuildContext context) {
    final calls = context.watch<CallsProvider>();
    if (!calls.enabled) return const SizedBox.shrink();
    final f = friend;
    if (f.calls.on) {
      return Semantics(
        button: true,
        label: 'Video call ${f.profile.name}',
        excludeSemantics: true,
        child: GestureDetector(
          onTap: () => calls.ring(f.profile),
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(gradient: V.brand, shape: BoxShape.circle, boxShadow: [BoxShadow(color: V.pink.withValues(alpha: 0.3), blurRadius: 20, offset: const Offset(0, 8))]),
            child: const Icon(SolarIconsBold.videocamera, size: 20, color: Colors.white),
          ),
        ),
      );
    }
    final theyAsked = f.calls.theirs && !f.calls.mine;
    final label = f.calls.mine ? 'Waiting for them to allow video calls' : theyAsked ? '${_first(f)} asked to allow video calls' : 'Video calls are off — ask to allow them';
    final st = calls.stateFor(f.profile.id);
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: Tooltip(
        message: label,
        child: GestureDetector(
          onTap: () {
            if (theyAsked || (!f.calls.mine && st?.canAsk != false)) {
              askForCalls(context, f);
            } else {
              toast(context, label);
            }
          },
          child: Stack(clipBehavior: Clip.none, children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: theyAsked ? V.violet.withValues(alpha: 0.5) : Colors.white.withValues(alpha: 0.12))),
              child: Icon(Icons.videocam_off_rounded, size: 20, color: theyAsked ? V.lavender : V.muted),
            ),
            if (theyAsked) Positioned(top: 4, right: 4, child: Container(width: 8, height: 8, decoration: const BoxDecoration(color: V.pink, shape: BoxShape.circle))),
          ]),
        ),
      ),
    );
  }
}

/// The chat menu row for calls: (label, action, isBad).
(String, Future<void> Function(), bool) callsMenuItem(BuildContext context, Friend f) {
  if (f.calls.on) return ('Turn off video calls', () => turnOffCalls(context, f), true);
  if (f.calls.mine) return ('Take back video call request', () => turnOffCalls(context, f), false);
  return (f.calls.theirs ? 'Allow video calls' : 'Ask to allow video calls', () => askForCalls(context, f), false);
}

/// Above the composer: what's going on with calls in this chat. Off → how it
/// works and a button to ask; they asked → Allow / Not now; you asked →
/// waiting, with take back. Nothing when calls are on.
class CallsCard extends StatefulWidget {
  const CallsCard({super.key, required this.friend});
  final Friend friend;

  @override
  State<CallsCard> createState() => _CallsCardState();
}

class _CallsCardState extends State<CallsCard> {
  bool _busy = false;
  bool _hidden = false;

  Future<void> _run(Future<void> Function() fn) async {
    setState(() => _busy = true);
    await fn();
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final calls = context.watch<CallsProvider>();
    final f = widget.friend;
    if (!calls.enabled || f.calls.on || _hidden) return const SizedBox.shrink();
    final first = _first(f);

    if (f.calls.theirs && !f.calls.mine) {
      return Container(
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 4),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(20), border: Border.all(color: V.violet.withValues(alpha: 0.45))),
        child: Column(children: [
          Row(children: [
            Container(width: 40, height: 40, decoration: BoxDecoration(color: V.violet.withValues(alpha: 0.2), shape: BoxShape.circle), child: const Icon(SolarIconsBold.videocamera, size: 20, color: V.lavender)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('$first wants to allow video calls', style: VT.title(15, weight: FontWeight.w600)),
                Text('Say yes and you can call each other from here. Either of you can turn it off any time.', style: VT.body(12, color: V.muted, height: 1.4)),
              ]),
            ),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: GhostButton(label: 'Not now', height: 40, expand: true, onTap: _busy ? null : () => _run(() => turnOffCalls(context, f)))),
            const SizedBox(width: 8),
            Expanded(
              child: GradientButton(
                label: 'Allow calls',
                height: 40,
                gradient: const LinearGradient(colors: [V.ok, V.ok]),
                foreground: V.bg,
                onTap: _busy ? null : () => _run(() => askForCalls(context, f)),
              ),
            ),
          ]),
        ]),
      );
    }

    if (f.calls.mine) {
      return Container(
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 4),
        padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
        decoration: BoxDecoration(color: V.surface2, borderRadius: BorderRadius.circular(18), border: Border.all(color: V.pink.withValues(alpha: 0.3))),
        child: Row(children: [
          Container(width: 8, height: 8, decoration: const BoxDecoration(color: V.pink, shape: BoxShape.circle)),
          const SizedBox(width: 12),
          Expanded(child: Text('You asked to allow video calls. Waiting for $first.', style: VT.body(12.5, color: V.text2))),
          GhostButton(label: 'Take back', height: 32, onTap: _busy ? null : () => _run(() => turnOffCalls(context, f))),
        ]),
      );
    }

    final st = calls.stateFor(f.profile.id);
    final blocked = st?.askBlockedBy;
    final text = blocked == 'messages'
        ? "Video calls unlock when you've both said something."
        : blocked == 'wait' && st?.askAfter != null
            ? 'Video calls are off. You can ask again ${_when(st!.askAfter!)}.'
            : 'Video calls are off. You both need to allow them.';
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 4),
      padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
      decoration: BoxDecoration(color: V.bg2, borderRadius: BorderRadius.circular(18), border: Border.all(color: Colors.white.withValues(alpha: 0.14))),
      child: Row(children: [
        const Icon(Icons.videocam_off_rounded, size: 18, color: V.muted),
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: VT.body(12.5, color: V.text2, height: 1.4))),
        if (blocked == null)
          TextButton(
            onPressed: _busy ? null : () => _run(() => askForCalls(context, f)),
            style: TextButton.styleFrom(backgroundColor: V.violet.withValues(alpha: 0.24), foregroundColor: V.lavender, shape: const StadiumBorder(), minimumSize: const Size(0, 32), padding: const EdgeInsets.symmetric(horizontal: 12)),
            child: Text('Ask', style: VT.label(12, color: V.lavender)),
          ),
        IconButton(tooltip: 'Hide', visualDensity: VisualDensity.compact, onPressed: () => setState(() => _hidden = true), icon: const Icon(Icons.close_rounded, size: 16, color: V.muted)),
      ]),
    );
  }
}

/// A line from Vibe in the chat ("You matched in Discover", call events).
class SystemLine extends StatelessWidget {
  const SystemLine({super.key, required this.m, this.onCallBack});
  final ChatMessage m;
  final VoidCallback? onCallBack;

  static const _look = <String, (IconData, Color, Color)>{
    'matched': (SolarIconsBold.heart, Color(0x1FFF3D8F), V.pinkSoft),
    'calls_on': (SolarIconsBold.videocamera, Color(0x1A34D399), V.ok),
    'calls_asked': (SolarIconsBold.videocamera, Color(0x248B5CF6), V.lavender),
    'calls_off': (Icons.videocam_off_rounded, V.surface, V.text2),
    'calls_declined': (Icons.videocam_off_rounded, V.surface, V.text2),
    'call_ended': (SolarIconsBold.videocamera, V.surface, V.text2),
    'call_missed': (Icons.missed_video_call_rounded, Color(0x1AFF3D8F), V.pinkSoft),
    'call_declined': (Icons.phone_missed_rounded, V.surface, V.text2),
  };

  @override
  Widget build(BuildContext context) {
    final event = m.event ?? '';
    final (icon, bg, fg) = _look[event] ?? (SolarIconsOutline.infoCircle, V.surface, V.text2);
    final text = event == 'calls_asked' && m.fromMe ? 'You asked to allow video calls' : event == 'call_missed' && m.fromMe ? 'No answer' : m.text;
    final callBack = event == 'call_missed' && !m.fromMe ? onCallBack : null;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Center(
        child: Container(
          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.86),
          padding: EdgeInsets.fromLTRB(12, 6, callBack != null ? 6 : 12, 6),
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 14, color: fg),
            const SizedBox(width: 6),
            Flexible(child: Text('$text · ${Fmt.time(m.at)}', textAlign: TextAlign.center, style: VT.label(12, color: fg))),
            if (callBack != null) ...[
              const SizedBox(width: 6),
              GestureDetector(
                onTap: callBack,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                  child: Text('Call back', style: VT.label(11.5, color: V.text)),
                ),
              ),
            ],
          ]),
        ),
      ),
    );
  }
}

/// "at 14:05", "tomorrow at 09:00", "on 3/11".
String _when(DateTime t) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(t.year, t.month, t.day);
  final diff = day.difference(today).inDays;
  if (diff <= 0) return 'at ${Fmt.time(t)}';
  if (diff == 1) return 'tomorrow at ${Fmt.time(t)}';
  return 'on ${t.day}/${t.month}';
}
