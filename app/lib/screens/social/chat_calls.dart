import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/calls.dart';
import '../../models/models.dart';
import '../../providers/calls_provider.dart';

String _first(Friend f) => f.profile.name.split(' ').first;

/// Voice calls (blue).
const _info = Color(0xFF60A5FA);

/// Ask (or answer, or change your level): [video] false = voice calls only.
Future<void> allowCalls(BuildContext context, Friend f, {required bool video}) async {
  final calls = context.read<CallsProvider>();
  try {
    final st = await calls.allow(f.profile.id, video: video);
    if (!context.mounted) return;
    toast(context, st.video ? 'Voice and video calls are on' : st.on ? 'Voice calls are on' : 'Asked ${_first(f)} to allow ${video ? 'voice and video' : 'voice'} calls');
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
        title: const Text('Turn off calls?'),
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
    if (context.mounted) toast(context, on ? 'Calls turned off' : notNow ? 'OK — not now' : 'Request taken back');
  } on ApiException catch (e) {
    if (context.mounted) toast(context, e.message, error: true);
  }
}

/// "Talk to X live": pick voice only or voice and video, then ask.
Future<void> openAskCalls(BuildContext context, Friend f) => showVibeSheet<void>(context, child: AskCallsSheet(friend: f));

class AskCallsSheet extends StatefulWidget {
  const AskCallsSheet({super.key, required this.friend});
  final Friend friend;

  @override
  State<AskCallsSheet> createState() => _AskCallsSheetState();
}

class _AskCallsSheetState extends State<AskCallsSheet> {
  bool _video = true;
  bool _busy = false;

  Widget _option({required bool value, required IconData icon, required String title, required String body, required Color tint}) {
    final on = _video == value;
    return Semantics(
      inMutuallyExclusiveGroup: true,
      checked: on,
      button: true,
      label: title,
      child: GestureDetector(
        onTap: () => setState(() => _video = value),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: on ? V.surface2 : V.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: on ? V.pink : V.line, width: on ? 1.5 : 1),
          ),
          child: Row(children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: tint.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(16)),
              child: Icon(icon, size: 22, color: tint),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: VT.title(15, weight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(body, style: VT.body(12.5, color: V.muted, height: 1.4)),
              ]),
            ),
            const SizedBox(width: 8),
            Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: on ? Colors.white : null,
                border: Border.all(color: on ? V.pink : Colors.white.withValues(alpha: 0.25), width: on ? 7 : 2),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final f = widget.friend;
    final first = _first(f);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        Headline('Talk to $first ', accent: 'live', size: 24),
        const SizedBox(height: 6),
        Text("Calls only work after you both say yes. Pick what you're comfortable with — $first picks too, and the chat uses whichever is less.", style: VT.body(13.5, color: V.text2, height: 1.5)),
        const SizedBox(height: 16),
        _option(value: false, icon: SolarIconsBold.phone, title: 'Voice calls', body: 'Just talk — no camera. Good for a first call.', tint: _info),
        const SizedBox(height: 10),
        _option(value: true, icon: SolarIconsBold.videocamera, title: 'Voice and video calls', body: 'See each other. You can still start with voice and switch.', tint: V.pinkSoft),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(color: V.ok.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(14)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(SolarIconsBold.shieldCheck, size: 16, color: V.ok),
            const SizedBox(width: 8),
            Expanded(child: Text('Either of you can lower it to voice, or turn calls off, at any time. Calls are never recorded.', style: VT.body(12.5, color: V.ok, height: 1.45))),
          ]),
        ),
        const SizedBox(height: 16),
        GradientButton(
          label: _busy ? 'Asking…' : _video ? 'Ask to allow voice and video' : 'Ask to allow voice calls',
          busy: _busy,
          onTap: _busy
              ? null
              : () async {
                  setState(() => _busy = true);
                  await allowCalls(context, f, video: _video);
                  if (context.mounted) Navigator.of(context).pop();
                },
        ),
        const SizedBox(height: 4),
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text('Not now', style: VT.label(14, color: V.text2))),
      ]),
    );
  }
}

/// The phone and camera in the chat header: call when allowed, otherwise ask.
class CallButton extends StatelessWidget {
  const CallButton({super.key, required this.friend});
  final Friend friend;

  @override
  Widget build(BuildContext context) {
    final calls = context.watch<CallsProvider>();
    if (!calls.enabled) return const SizedBox.shrink();
    final f = friend;
    if (f.calls.on) {
      return Row(mainAxisSize: MainAxisSize.min, children: [
        Semantics(
          button: true,
          label: 'Voice call ${f.profile.name}',
          excludeSemantics: true,
          child: GestureDetector(
            onTap: () => calls.ring(f.profile, CallMedia.voice),
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.06), border: Border.all(color: Colors.white.withValues(alpha: 0.12))),
              child: const Icon(SolarIconsBold.phone, size: 19, color: V.text),
            ),
          ),
        ),
        if (f.calls.video) ...[
          const SizedBox(width: 6),
          Semantics(
            button: true,
            label: 'Video call ${f.profile.name}',
            excludeSemantics: true,
            child: GestureDetector(
              onTap: () => calls.ring(f.profile, CallMedia.video),
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(gradient: V.brand, shape: BoxShape.circle, boxShadow: [BoxShadow(color: V.pink.withValues(alpha: 0.3), blurRadius: 20, offset: const Offset(0, 8))]),
                child: const Icon(SolarIconsBold.videocamera, size: 20, color: Colors.white),
              ),
            ),
          ),
        ],
      ]);
    }
    final theyAsked = f.calls.theirs && !f.calls.mine;
    final label = f.calls.mine ? 'Waiting for ${_first(f)} to allow calls' : theyAsked ? '${_first(f)} wants to call' : 'Calls are off — ask to allow them';
    final st = calls.stateFor(f.profile.id);
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: Tooltip(
        message: label,
        child: GestureDetector(
          onTap: () {
            if (theyAsked) {
              toast(context, '${_first(f)} asked — answer in the card below');
            } else if (!f.calls.mine && st?.canAsk != false) {
              openAskCalls(context, f);
            } else {
              toast(context, label);
            }
          },
          child: Stack(clipBehavior: Clip.none, children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: theyAsked ? V.violet.withValues(alpha: 0.5) : Colors.white.withValues(alpha: 0.12))),
              child: Icon(Icons.phone_disabled_rounded, size: 20, color: theyAsked ? V.lavender : V.muted),
            ),
            if (theyAsked) Positioned(top: 4, right: 4, child: Container(width: 8, height: 8, decoration: const BoxDecoration(color: V.pink, shape: BoxShape.circle))),
          ]),
        ),
      ),
    );
  }
}

/// The chat menu rows for calls: (label, action, isBad).
List<(String, Future<void> Function(), bool)> callsMenuItems(BuildContext context, Friend f) {
  if (f.calls.on) {
    return [
      f.calls.mineVideo
          ? ('Voice calls only (no video)', () => allowCalls(context, f, video: false), false)
          : (f.calls.theirsVideo ? 'Allow video too' : 'Ask to allow video too', () => allowCalls(context, f, video: true), false),
      ('Turn off calls', () => turnOffCalls(context, f), true),
    ];
  }
  if (f.calls.mine) return [('Take back call request', () => turnOffCalls(context, f), false)];
  if (f.calls.theirs) return [('Answer call request…', () async => toast(context, 'Answer in the card above the message box'), false)];
  return [('Ask to allow calls', () => openAskCalls(context, f), false)];
}

/// Above the composer: what's going on with calls in this chat. Off → a line
/// and Ask; they asked → Allow voice and video / Voice only / Not now; you
/// asked → waiting, with take back; on with voice only and they'd like
/// video → Allow video. Nothing otherwise.
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

  Widget _pill(String label, {required VoidCallback? onTap, required Color bg, required Color fg, Color? border, IconData? icon}) => SizedBox(
        height: 40,
        child: TextButton(
          onPressed: onTap,
          style: TextButton.styleFrom(
            backgroundColor: bg,
            foregroundColor: fg,
            shape: StadiumBorder(side: border == null ? BorderSide.none : BorderSide(color: border)),
            padding: const EdgeInsets.symmetric(horizontal: 12),
          ),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, mainAxisSize: MainAxisSize.min, children: [
            if (icon != null) ...[Icon(icon, size: 18, color: fg), const SizedBox(width: 8)],
            Flexible(child: Text(label, overflow: TextOverflow.ellipsis, style: VT.title(13.5, color: fg, weight: FontWeight.w700))),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final calls = context.watch<CallsProvider>();
    final f = widget.friend;
    if (!calls.enabled || _hidden) return const SizedBox.shrink();
    final first = _first(f);
    final st = calls.stateFor(f.profile.id);

    if (f.calls.on) {
      // On, you're voice only and they'd like video.
      if (!(f.calls.theirsVideo && !f.calls.mineVideo && st?.mineVideo == false)) return const SizedBox.shrink();
      return Container(
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 4),
        padding: const EdgeInsets.fromLTRB(14, 8, 6, 8),
        decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(18), border: Border.all(color: V.violet.withValues(alpha: 0.35))),
        child: Row(children: [
          const Icon(SolarIconsBold.videocamera, size: 18, color: V.lavender),
          const SizedBox(width: 10),
          Expanded(child: Text('$first would like video calls too.', style: VT.body(12.5, color: V.text2))),
          SizedBox(
            height: 32,
            child: TextButton(
              onPressed: _busy ? null : () => _run(() => allowCalls(context, f, video: true)),
              style: TextButton.styleFrom(backgroundColor: V.ok, foregroundColor: V.bg, shape: const StadiumBorder(), padding: const EdgeInsets.symmetric(horizontal: 12)),
              child: Text('Allow video', style: VT.label(12, color: V.bg, weight: FontWeight.w700)),
            ),
          ),
          IconButton(tooltip: 'Keep voice only', visualDensity: VisualDensity.compact, onPressed: () => setState(() => _hidden = true), icon: const Icon(Icons.close_rounded, size: 16, color: V.muted)),
        ]),
      );
    }

    if (f.calls.theirs && !f.calls.mine) {
      final askedVideo = f.calls.theirsVideo;
      final notNow = _pill('Not now', onTap: _busy ? null : () => _run(() => turnOffCalls(context, f)), bg: Colors.white.withValues(alpha: 0.06), fg: V.text, border: Colors.white.withValues(alpha: 0.12));
      return Semantics(
        container: true,
        label: '$first wants to call',
        child: Container(
          margin: const EdgeInsets.fromLTRB(12, 0, 12, 4),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(20), border: Border.all(color: V.violet.withValues(alpha: 0.45))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Container(width: 40, height: 40, decoration: BoxDecoration(color: V.violet.withValues(alpha: 0.2), shape: BoxShape.circle), child: const Icon(SolarIconsBold.phone, size: 20, color: V.lavender)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('$first wants to call', style: VT.title(15, weight: FontWeight.w600)),
                  Text(
                    askedVideo ? "They asked for voice and video. Allow what you're comfortable with." : 'Voice calls only. Either of you can turn it off any time.',
                    style: VT.body(12, color: V.muted, height: 1.4),
                  ),
                ]),
              ),
            ]),
            const SizedBox(height: 12),
            if (askedVideo) ...[
              _pill('Allow voice and video', icon: SolarIconsBold.videocamera, onTap: _busy ? null : () => _run(() => allowCalls(context, f, video: true)), bg: V.ok, fg: V.bg),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: _pill('Voice only', onTap: _busy ? null : () => _run(() => allowCalls(context, f, video: false)), bg: _info.withValues(alpha: 0.1), fg: _info, border: _info.withValues(alpha: 0.4))),
                const SizedBox(width: 8),
                Expanded(child: notNow),
              ]),
            ] else
              Row(children: [
                Expanded(child: notNow),
                const SizedBox(width: 8),
                Expanded(child: _pill('Allow voice calls', onTap: _busy ? null : () => _run(() => allowCalls(context, f, video: false)), bg: V.ok, fg: V.bg)),
              ]),
          ]),
        ),
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
          Expanded(child: Text('You asked to allow ${f.calls.mineVideo ? 'voice and video' : 'voice'} calls. Waiting for $first.', style: VT.body(12.5, color: V.text2))),
          GhostButton(label: 'Take back', height: 32, onTap: _busy ? null : () => _run(() => turnOffCalls(context, f))),
        ]),
      );
    }

    final blocked = st?.askBlockedBy;
    final text = blocked == 'messages'
        ? "Calls unlock when you've both said something."
        : blocked == 'wait' && st?.askAfter != null
            ? 'Calls are off. You can ask again ${_when(st!.askAfter!)}.'
            : 'Calls are off. You both need to allow them.';
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 4),
      padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
      decoration: BoxDecoration(color: V.bg2, borderRadius: BorderRadius.circular(18), border: Border.all(color: Colors.white.withValues(alpha: 0.14))),
      child: Row(children: [
        const Icon(Icons.phone_disabled_rounded, size: 18, color: V.muted),
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: VT.body(12.5, color: V.text2, height: 1.4))),
        if (blocked == null)
          TextButton(
            onPressed: _busy ? null : () => openAskCalls(context, f),
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

  /// Call back a missed call (true = it was a video call).
  final void Function(bool video)? onCallBack;

  static const _look = <String, (IconData, Color, Color)>{
    'matched': (SolarIconsBold.heart, Color(0x1FFF3D8F), V.pinkSoft),
    'calls_on': (SolarIconsBold.phone, Color(0x1A34D399), V.ok),
    'calls_asked': (SolarIconsBold.phone, Color(0x248B5CF6), V.lavender),
    'calls_voice_only': (SolarIconsBold.phone, Color(0x1A60A5FA), _info),
    'calls_off': (Icons.phone_disabled_rounded, V.surface, V.text2),
    'calls_declined': (Icons.phone_disabled_rounded, V.surface, V.text2),
    'call_ended': (SolarIconsBold.phone, V.surface, V.text2),
    'call_missed': (Icons.phone_missed_rounded, Color(0x1AFF3D8F), V.pinkSoft),
    'call_declined': (Icons.phone_missed_rounded, V.surface, V.text2),
  };

  @override
  Widget build(BuildContext context) {
    final event = m.event ?? '';
    var (icon, bg, fg) = _look[event] ?? (SolarIconsOutline.infoCircle, V.surface, V.text2);
    final video = m.meta?['video'] != false;
    // Video events get the camera; voice ones keep the phone.
    if (video && (event == 'calls_on' || event == 'calls_asked' || event == 'call_ended')) icon = SolarIconsBold.videocamera;
    if (video && event == 'call_missed') icon = Icons.missed_video_call_rounded;
    final text = event == 'calls_asked' && m.fromMe
        ? (m.text.contains('video too') ? 'You asked to allow video too' : 'You asked to allow ${video ? 'voice and video' : 'voice'} calls')
        : event == 'call_missed' && m.fromMe
            ? 'No answer'
            : m.text;
    final cb = onCallBack;
    final VoidCallback? callBack = event == 'call_missed' && !m.fromMe && cb != null ? () => cb(video) : null;
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
