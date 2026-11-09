import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/calls.dart';
import '../../providers/calls_provider.dart';
import '../../providers/match_provider.dart';
import 'call_ui.dart';

/// Friend calls over every page (MaterialApp.builder): the ringing banner,
/// and a call shrunk to the chat — the green bar on top (it pushes the
/// page down) and the small window. (web: features/calls/call-host.tsx)
class CallLayer extends StatelessWidget {
  const CallLayer({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final m = context.watch<MatchProvider?>();
    final calls = context.watch<CallsProvider?>();
    final shrunk = m != null && m.isConnected && m.friendCall && m.minimized;
    final incoming = calls?.incoming;
    final media = MediaQuery.of(context);
    return Material(
      type: MaterialType.transparency,
      child: Stack(
        children: [
          Column(
            children: [
              if (shrunk) _ReturnBar(m: m),
              Expanded(
                child: shrunk ? MediaQuery(data: media.removePadding(removeTop: true), child: child) : child,
              ),
            ],
          ),
          if (shrunk)
            Positioned(
              right: 12,
              top: media.padding.top + 112,
              child: _MiniCall(m: m),
            ),
          if (incoming != null && !calls!.incomingFull)
            Positioned(
              left: 10,
              right: 10,
              top: media.padding.top + 10,
              child: _IncomingBanner(calls: calls, call: incoming),
            ),
        ],
      ),
    );
  }
}

/// "Tap to go back to the call · 12:31".
class _ReturnBar extends StatelessWidget {
  const _ReturnBar({required this.m});
  final MatchProvider m;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Go back to the call',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: () => m.setMinimized(false),
        child: Container(
          color: callGreen,
          padding: EdgeInsets.fromLTRB(16, MediaQuery.of(context).padding.top, 16, 0),
          height: MediaQuery.of(context).padding.top + 34,
          child: Row(
            children: [
              const Icon(SolarIconsBold.phone, size: 16, color: onCallGreen),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Tap to go back to the call',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: VT.label(13, color: onCallGreen, weight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                Fmt.clock(m.elapsed),
                style: VT.mono(13, color: onCallGreen, weight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The call, small, over the chat: their video (or photo), mute and end. Tap it to go back.
class _MiniCall extends StatelessWidget {
  const _MiniCall({required this.m});
  final MatchProvider m;

  @override
  Widget build(BuildContext context) {
    final p = m.partner;
    if (p == null) return const SizedBox.shrink();
    final video = !m.voiceCall && m.hasRemoteVideo && m.partnerCamOn;
    Widget round(IconData icon, Color bg, Color fg, VoidCallback onTap, String label) => Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(shape: BoxShape.circle, color: bg),
          child: Icon(icon, size: 15, color: fg),
        ),
      ),
    );
    return Container(
      width: 108,
      height: 150,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.22), width: 2),
        color: V.surface2,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.55), blurRadius: 30, offset: const Offset(0, 12))],
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Semantics(
            button: true,
            label: 'Go back to the call with ${p.name}',
            child: GestureDetector(
              onTap: () => m.setMinimized(false),
              child: video
                  ? RTCVideoView(m.remoteRenderer, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)
                  : Image.network(
                      p.avatarUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Center(
                        child: VAvatar(url: '', name: p.name, size: 56),
                      ),
                    ),
            ),
          ),
          Positioned(
            left: 6,
            right: 6,
            bottom: 6,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                round(m.micOn ? Icons.mic_rounded : Icons.mic_off_rounded, V.bg2.withValues(alpha: 0.6), m.micOn ? Colors.white : V.bad, m.toggleMic, m.micOn ? 'Mute' : 'Unmute'),
                round(Icons.call_end_rounded, callRed, Colors.white, m.stop, 'End call'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Someone's calling while you use the app: a banner; tap it for the full screen.
class _IncomingBanner extends StatelessWidget {
  const _IncomingBanner({required this.calls, required this.call});
  final CallsProvider calls;
  final IncomingCall call;

  @override
  Widget build(BuildContext context) {
    final video = call.media == CallMedia.video;
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: V.surface2.withValues(alpha: 0.96),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: V.line),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.55), blurRadius: 40, offset: const Offset(0, 16))],
          ),
          child: Row(
            children: [
              Expanded(
                child: Semantics(
                  button: true,
                  label: '${call.from.name} is ${video ? 'video' : 'voice'} calling you. Open the call',
                  excludeSemantics: true,
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: calls.showIncomingFull,
                    child: Row(
                      children: [
                        VAvatar(url: call.from.avatarUrl, name: call.from.name, size: 48, ring: true, gapColor: V.surface2),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                call.from.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: VT.title(15, weight: FontWeight.w700),
                              ),
                              Row(
                                children: [
                                  Icon(video ? SolarIconsBold.videocamera : SolarIconsBold.phone, size: 14, color: V.text2),
                                  const SizedBox(width: 5),
                                  Text(video ? 'Video call' : 'Voice call', style: VT.body(12.5, color: V.text2)),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              _circle(Icons.call_end_rounded, callRed, Colors.white, 'Decline', () => calls.decline()),
              const SizedBox(width: 8),
              _circle(video ? SolarIconsBold.videocamera : SolarIconsBold.phone, callGreen, onCallGreen, 'Accept', () => calls.accept()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _circle(IconData icon, Color bg, Color fg, String label, VoidCallback onTap) => Semantics(
    button: true,
    label: label,
    excludeSemantics: true,
    child: GestureDetector(
      onTap: onTap,
      child: Container(
        width: 46,
        height: 46,
        decoration: BoxDecoration(shape: BoxShape.circle, color: bg),
        child: Icon(icon, size: 22, color: fg),
      ),
    ),
  );
}
