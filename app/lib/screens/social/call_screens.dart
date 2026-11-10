import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/call_machine.dart';
import '../../models/calls.dart';
import '../../providers/calls_provider.dart';
import '../../providers/match_provider.dart';
import '../calls/call_ui.dart';

const _quickReplies = ["Can't talk now", 'Call me in 10 min', 'Text me instead'];

/// A friend is calling, full screen: quick replies, Decline, Voice only,
/// Accept. Closes itself when the call stops ringing (answered elsewhere,
/// cancelled, rang out). (web: features/calls/call-host.tsx)
class IncomingCallScreen extends StatefulWidget {
  const IncomingCallScreen({super.key, required this.call});
  final IncomingCall call;

  @override
  State<IncomingCallScreen> createState() => _IncomingCallScreenState();
}

class _IncomingCallScreenState extends State<IncomingCallScreen> {
  Timer? _buzz;
  late final CallsProvider _calls = context.read<CallsProvider>();

  @override
  void initState() {
    super.initState();
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
    _buzz?.cancel();
    _calls.removeListener(_onCalls);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final from = widget.call.from;
    final video = widget.call.media == CallMedia.video;
    final pad = MediaQuery.of(context).padding;
    return Scaffold(
      backgroundColor: V.bg,
      body: Stack(
        fit: StackFit.expand,
        children: [
          BlurredPhoto(url: from.avatarUrl, brightness: 0.42),
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Padding(
                padding: EdgeInsets.fromLTRB(16, pad.top + 96, 16, pad.bottom + 34),
                child: Column(
                  children: [
                    PulseAvatar(url: from.avatarUrl, name: from.name),
                    const SizedBox(height: 8),
                    Semantics(
                      header: true,
                      child: Text(
                        from.name,
                        textAlign: TextAlign.center,
                        style: VT.title(28, weight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text('is ${video ? 'video' : 'voice'} calling you', style: VT.body(14.5, color: Colors.white.withValues(alpha: 0.8))),
                    const Spacer(),
                    Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final r in _quickReplies)
                          Semantics(
                            button: true,
                            child: GestureDetector(
                              onTap: () => _calls.decline(r),
                              child: Container(
                                height: 36,
                                padding: const EdgeInsets.symmetric(horizontal: 14),
                                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
                                child: Center(
                                  widthFactor: 1,
                                  child: Text(
                                    r,
                                    style: VT.label(13.5, color: Colors.white, weight: FontWeight.w600),
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 22),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        EndCallButton(label: 'Decline', size: 68, semantics: 'Decline', onTap: () => _calls.decline()),
                        if (video)
                          CallCtl(
                            icon: SolarIconsBold.phone,
                            label: 'Voice only',
                            size: 68,
                            background: Colors.white.withValues(alpha: 0.16),
                            semantics: 'Accept as a voice call',
                            onTap: () => _calls.accept(CallMedia.voice),
                          ),
                        Semantics(
                          button: true,
                          label: video ? 'Accept video call' : 'Accept voice call',
                          excludeSemantics: true,
                          child: GestureDetector(
                            onTap: () => _calls.accept(),
                            child: SizedBox(
                              width: 86,
                              child: Column(
                                children: [
                                  Container(
                                    width: 68,
                                    height: 68,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: callGreen,
                                      boxShadow: [BoxShadow(color: callGreen.withValues(alpha: 0.4), blurRadius: 26, offset: const Offset(0, 10))],
                                    ),
                                    child: Icon(video ? SolarIconsBold.videocamera : SolarIconsBold.phone, size: 30, color: onCallGreen),
                                  ),
                                  const SizedBox(height: 7),
                                  Text('Accept', style: VT.label(12, color: Colors.white.withValues(alpha: 0.88))),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Your call ringing on their side: their photo, "Calling…", your camera
/// and the controls — then how it ended (declined with their reply, no
/// answer, busy).
class OutgoingCallScreen extends StatefulWidget {
  const OutgoingCallScreen({super.key, required this.onMessage});

  /// "Send a message" after a call that didn't connect: open the chat.
  final ValueChanged<String> onMessage;

  @override
  State<OutgoingCallScreen> createState() => _OutgoingCallScreenState();
}

class _OutgoingCallScreenState extends State<OutgoingCallScreen> {
  late final CallsProvider _calls = context.read<CallsProvider>();
  late final MatchProvider _match = context.read<MatchProvider>();
  VoidCallback? _unpin;

  @override
  void initState() {
    super.initState();
    _calls.addListener(_onCalls);
    _onCalls();
  }

  void _onCalls() {
    final c = _calls.outgoing;
    // Your camera, for a video call, while it rings.
    final wantCamera = c != null && c.status == OutgoingStatus.ringing && c.media == CallMedia.video;
    if (wantCamera && _unpin == null) {
      _unpin = _match.pinCamera();
    } else if (!wantCamera && _unpin != null) {
      _unpin!();
      _unpin = null;
    }
    if (c == null && mounted) Navigator.of(context).maybePop();
  }

  @override
  void dispose() {
    _unpin?.call();
    _calls.removeListener(_onCalls);
    super.dispose();
  }

  /// How your call ended (the server's reason): title, line, and whether Try again makes sense.
  (String, String, bool)? _outcome(OutgoingCall c, String name) => switch (c.status) {
    OutgoingStatus.ringing => null,
    OutgoingStatus.unavailable => ('Not in Vibe right now', "$name isn't using the app, so it can't ring. $name will see a missed call.", false),
    OutgoingStatus.declined => ("$name can't talk right now", c.reply != null ? '"${c.reply}"' : 'Send $name a message instead.', false),
    OutgoingStatus.noAnswer => ('No answer', "$name didn't pick up. We'll show a missed call.", true),
    OutgoingStatus.busy => ('$name is on another call', 'Try again in a few minutes, or leave a message.', true),
    OutgoingStatus.failed => ("Couldn't connect", "The call didn't start. Check your internet and try again.", true),
    OutgoingStatus.turnedOff => ('Calls were turned off', 'Calls are off in this chat now.', false),
    OutgoingStatus.paused => ("Can't call right now", 'They declined a few calls in a row. Try a message instead.', false),
    OutgoingStatus.error => ("Couldn't call", c.message ?? 'Something went wrong. Try again.', true),
  };

  @override
  Widget build(BuildContext context) {
    final c = context.watch<CallsProvider>().outgoing;
    final m = context.watch<MatchProvider>();
    if (c == null) return const Scaffold(backgroundColor: V.bg);
    final first = c.to.name.split(' ').first;
    final done = _outcome(c, first);
    final video = c.media == CallMedia.video;
    final pad = MediaQuery.of(context).padding;
    if (done != null) {
      return Scaffold(
        backgroundColor: V.bg,
        body: CallEndCard(
          url: c.to.avatarUrl,
          name: c.to.name,
          title: done.$1,
          sub: done.$2,
          children: [
            GradientButton(
              label: c.status == OutgoingStatus.declined ? 'Reply' : 'Send a message',
              icon: SolarIconsBold.chatRoundDots,
              height: 54,
              onTap: () {
                final id = c.to.id;
                _calls.dismissOutgoing();
                widget.onMessage(id);
              },
            ),
            if (done.$3)
              GhostButton(label: 'Try again', icon: SolarIconsOutline.restart, height: 48, expand: true, onTap: () => _calls.ring(c.to, c.media))
            else
              GhostButton(label: 'Close', height: 48, expand: true, onTap: _calls.dismissOutgoing),
          ],
        ),
      );
    }
    return Scaffold(
      backgroundColor: V.bg,
      body: Stack(
        fit: StackFit.expand,
        children: [
          BlurredPhoto(url: c.to.avatarUrl),
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Padding(
                padding: EdgeInsets.fromLTRB(16, pad.top + 96, 16, pad.bottom + 40),
                child: Column(
                  children: [
                    PulseAvatar(url: c.to.avatarUrl, name: c.to.name),
                    const SizedBox(height: 8),
                    Text(
                      c.to.name,
                      textAlign: TextAlign.center,
                      style: VT.title(28, weight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    Semantics(
                      liveRegion: true,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(video ? SolarIconsBold.videocamera : SolarIconsBold.phone, size: 17, color: c.reached ? V.pinkSoft : Colors.white.withValues(alpha: 0.8)),
                          const SizedBox(width: 6),
                          Text(
                            c.reached ? 'Ringing…' : 'Calling…',
                            style: VT.body(14.5, color: c.reached ? V.pinkSoft : Colors.white.withValues(alpha: 0.8), weight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(32, 8, 32, 0),
                      child: Text(
                        c.reached ? "$first's screen is showing your call" : "Reaching $first's app",
                        textAlign: TextAlign.center,
                        style: VT.body(13, color: Colors.white.withValues(alpha: 0.6), height: 1.5),
                      ),
                    ),
                    const Spacer(),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        if (video)
                          Flexible(
                            child: CallCtl(icon: SolarIconsBold.cameraRotate, label: 'Flip', onTap: () => m.switchCamera()),
                          ),
                        if (video)
                          Flexible(
                            child: CallCtl(icon: Icons.videocam_off_rounded, label: m.camOn ? 'Camera off' : 'Camera on', on: !m.camOn, onTap: m.toggleCam),
                          ),
                        Flexible(
                          child: CallCtl(icon: Icons.mic_off_rounded, label: m.micOn ? 'Mute' : 'Unmute', on: !m.micOn, onTap: m.toggleMic),
                        ),
                        Flexible(
                          child: EndCallButton(label: 'Cancel', semantics: 'Cancel call', onTap: () => _calls.cancel()),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (video) Positioned(right: 12, top: pad.top + 16, child: const SelfPreview()),
        ],
      ),
    );
  }
}


/// For the person called, after the ring: why it stopped. A moment and it
/// closes (they hung up, answered on another device), or Call back / Close
/// (too late, couldn't connect). (web: features/calls/call-host.tsx Notice)
class CallNoticeScreen extends StatefulWidget {
  const CallNoticeScreen({super.key, required this.notice});
  final CallNotice notice;

  @override
  State<CallNoticeScreen> createState() => _CallNoticeScreenState();
}

class _CallNoticeScreenState extends State<CallNoticeScreen> {
  Timer? _auto;
  late final CallsProvider _calls = context.read<CallsProvider>();

  bool get _brief => widget.notice.kind == NoticeKind.hungUp || widget.notice.kind == NoticeKind.elsewhere;

  @override
  void initState() {
    super.initState();
    if (_brief) _auto = Timer(const Duration(milliseconds: 1800), _close);
  }

  void _close() {
    _calls.dismissNotice();
    if (mounted) Navigator.of(context).maybePop();
  }

  @override
  void dispose() {
    _auto?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.notice;
    final first = n.from.name.split(' ').first;
    final (title, line) = switch (n.kind) {
      NoticeKind.hungUp => ('$first hung up', "Missed call. It's in your chat."),
      NoticeKind.elsewhere => ('Answered on your other device', 'The call goes on there.'),
      NoticeKind.over => ('That call has ended', '$first hung up just before you answered.'),
      NoticeKind.failed => ("Couldn't connect", "The call didn't start. Check your internet."),
    };
    return Scaffold(
      backgroundColor: V.bg,
      body: CallEndCard(
        url: n.from.avatarUrl,
        name: n.from.name,
        title: title,
        sub: line,
        children: _brief
            ? const []
            : [
                GradientButton(
                  label: 'Call $first back',
                  icon: n.media == CallMedia.voice ? SolarIconsBold.phone : SolarIconsBold.videocamera,
                  height: 54,
                  onTap: () {
                    _close();
                    unawaited(_calls.ring(n.from, n.media));
                  },
                ),
                GhostButton(label: 'Close', height: 48, expand: true, onTap: _close),
              ],
      ),
    );
  }
}
