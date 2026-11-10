import '../../core/cache/cached_image.dart';
import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/match_provider.dart';
import '../../providers/social_provider.dart';
import '../match/call_states.dart';
import '../match/icebreakers.dart';
import 'call_ui.dart';

String _first(Profile p) => p.name.split(' ').first;

/// What the friend call screens hand back to the match screen.
class FriendCallActions {
  const FriendCallActions({required this.shrink, required this.gift, required this.report, required this.play});

  /// Shrink the call and open the chat with them.
  final VoidCallback shrink;
  final VoidCallback gift;
  final VoidCallback report;
  final VoidCallback play;
}

/// A video call with a friend: their video, you in the corner, one frosted
/// dock. Not the random-match screen. (web: features/calls/friend-call.tsx)
class FriendVideoCall extends StatelessWidget {
  const FriendVideoCall({super.key, required this.m, required this.actions});
  final MatchProvider m;
  final FriendCallActions actions;

  @override
  Widget build(BuildContext context) {
    final p = m.partner!;
    final pad = MediaQuery.of(context).padding;
    return Stack(
      fit: StackFit.expand,
      children: [
        ImageFiltered(
          enabled: m.partnerBlur,
          imageFilter: ImageFilter.blur(sigmaX: 24, sigmaY: 24, tileMode: TileMode.clamp),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (m.hasRemoteVideo)
                RTCVideoView(m.remoteRenderer, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)
              else
                Image(
                  image: netImage(p.avatarUrl),
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => BlurredPhoto(url: '', brightness: 1),
                ),
              if (!m.partnerCamOn) CameraOffCover(partner: p, weak: m.partnerWeak),
            ],
          ),
        ),
        const IgnorePointer(child: VideoScrims(top: 170, bottom: 260, topAlpha: 0.6, bottomAlpha: 0.75, bottomMid: 0.4)),
        Positioned(
          left: 0,
          right: 0,
          top: 0,
          child: CallTopline(title: p.name, verified: p.verified, sub: '${Fmt.clock(m.elapsed)} · video call', onShrink: actions.shrink),
        ),
        Positioned(right: 12, top: pad.top + 78, child: const SelfPreview()),
        Positioned(
          left: 12,
          right: 124,
          top: pad.top + 78,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (m.partnerBlur) GlassPill(label: '${_first(p)} turned on Blur me', icon: SolarIconsBold.radialBlur, iconColor: V.trust, height: 30, fontSize: 12),
              PartnerMediaPills(m: m, name: _first(p)),
            ],
          ),
        ),
        if (m.game != null)
          Positioned(
            left: 12,
            right: 12,
            bottom: pad.bottom + 130,
            child: GameCard(m: m, round: m.game!),
          ),
        Positioned(
          left: 12,
          right: 12,
          bottom: pad.bottom + 22,
          child: CallDock(
            children: [
              CallCtl(icon: SolarIconsBold.cameraRotate, label: 'Flip', size: 54, onTap: () => m.switchCamera()),
              CallCtl(icon: m.camOn ? SolarIconsBold.videocamera : Icons.videocam_off_rounded, label: m.camOn ? 'Camera' : 'Camera off', on: !m.camOn, size: 54, onTap: m.toggleCam),
              CallCtl(icon: m.micOn ? Icons.mic_rounded : Icons.mic_off_rounded, label: m.micOn ? 'Mute' : 'Unmute', on: !m.micOn, size: 54, onTap: m.toggleMic),
              CallCtl(icon: SolarIconsBold.menuDots, label: 'More', size: 54, onTap: () => showCallTools(context, m, actions)),
              EndCallButton(size: 58, onTap: m.stop),
            ],
          ),
        ),
      ],
    );
  }
}

/// A voice call with a friend: their photo, the time, their voice as bars,
/// six controls. No camera opens.
class FriendVoiceCall extends StatefulWidget {
  const FriendVoiceCall({super.key, required this.m, required this.actions});
  final MatchProvider m;
  final FriendCallActions actions;

  @override
  State<FriendVoiceCall> createState() => _FriendVoiceCallState();
}

class _FriendVoiceCallState extends State<FriendVoiceCall> {
  double _level = 0;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _poll = Timer.periodic(const Duration(milliseconds: 300), (_) async {
      final l = await widget.m.partnerVoiceLevel();
      if (mounted && (l - _level).abs() > 0.02) setState(() => _level = l);
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.m;
    final a = widget.actions;
    final p = m.partner!;
    final first = _first(p);
    final pad = MediaQuery.of(context).padding;
    final calls = context.select<SocialProvider, CallsView?>((s) => s.friend(p.id)?.calls);
    final videoAllowed = calls == null || (calls.mineVideo && calls.theirsVideo);
    final talking = _level > 0.05;
    Widget cell(Widget w) => SizedBox(
      width: (MediaQuery.sizeOf(context).width.clamp(0, 480) - 16) / 3,
      child: Center(child: w),
    );
    return Stack(
      fit: StackFit.expand,
      children: [
        BlurredPhoto(url: p.avatarUrl, brightness: 0.3),
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Padding(
              padding: EdgeInsets.fromLTRB(8, pad.top + 96, 8, pad.bottom + 40),
              child: Column(
                children: [
                  PulseAvatar(url: p.avatarUrl, name: p.name, size: 140),
                  const SizedBox(height: 8),
                  Semantics(
                    liveRegion: true,
                    child: Column(
                      children: [
                        Text(m.hasRemoteVideo || m.elapsed > Duration.zero ? Fmt.clock(m.elapsed) : 'Connecting…', style: VT.title(30, weight: FontWeight.w700)),
                        const SizedBox(height: 10),
                        VoiceBars(level: _level),
                        const SizedBox(height: 10),
                        Text(
                          !m.partnerMicOn ? '$first muted their mic' : (talking ? '$first is talking' : 'Camera stays off. Not recorded.'),
                          style: VT.body(13, color: Colors.white.withValues(alpha: 0.75)),
                        ),
                      ],
                    ),
                  ),
                  const Spacer(),
                  if (m.game != null) ...[GameCard(m: m, round: m.game!), const SizedBox(height: 16)],
                  Wrap(
                    alignment: WrapAlignment.center,
                    runSpacing: 22,
                    children: [
                      cell(CallCtl(icon: m.micOn ? Icons.mic_rounded : Icons.mic_off_rounded, label: m.micOn ? 'Mute' : 'Unmute', on: !m.micOn, onTap: m.toggleMic)),
                      cell(CallCtl(icon: SolarIconsBold.soundwave, label: 'Speaker', on: m.speakerOn, onTap: m.toggleSpeaker)),
                      cell(
                        videoAllowed
                            ? CallCtl(
                                icon: SolarIconsBold.videocamera,
                                label: m.videoAsk == VideoAsk.mine ? 'Asking $first…' : 'Turn on video',
                                onTap: m.videoAsk == VideoAsk.mine ? null : () => m.askVideo(),
                              )
                            : const CallCtl(icon: Icons.videocam_off_rounded, label: 'Voice only chat', semantics: 'Video is off in this chat: you both need to allow video first'),
                      ),
                      cell(CallCtl(icon: SolarIconsBold.chatRoundDots, label: 'Message', onTap: a.shrink)),
                      cell(EndCallButton(onTap: m.stop)),
                      cell(CallCtl(icon: SolarIconsBold.gift, label: 'Gift', color: V.gold, onTap: a.gift)),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
        Positioned(
          left: 0,
          right: 0,
          top: 0,
          child: CallTopline(title: p.name, verified: p.verified, sub: 'Voice call', onShrink: a.shrink, onReport: a.report),
        ),
        if (m.videoAsk == VideoAsk.theirs)
          Positioned(
            left: 12,
            right: 12,
            top: pad.top + 70,
            child: _VideoAskCard(m: m, partner: p),
          ),
      ],
    );
  }
}

/// In a voice call: they asked to turn on video.
class _VideoAskCard extends StatelessWidget {
  const _VideoAskCard({required this.m, required this.partner});
  final MatchProvider m;
  final Profile partner;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: V.surface2.withValues(alpha: 0.96),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: V.line),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 34, offset: const Offset(0, 14))],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  VAvatar(url: partner.avatarUrl, name: partner.name, size: 40),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      '${_first(partner)} wants to turn on video',
                      style: VT.label(14.5, color: V.text, weight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: GhostButton(label: 'Not now', height: 42, expand: true, onTap: () => m.answerVideo(false)),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Semantics(
                      button: true,
                      label: 'Turn on video',
                      excludeSemantics: true,
                      child: GestureDetector(
                        onTap: () => m.answerVideo(true),
                        child: Container(
                          height: 42,
                          decoration: BoxDecoration(color: callGreen, borderRadius: BorderRadius.circular(999)),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(SolarIconsBold.videocamera, size: 18, color: onCallGreen),
                              const SizedBox(width: 6),
                              Text(
                                'Turn on',
                                style: VT.label(14.5, color: onCallGreen, weight: FontWeight.w700),
                              ),
                            ],
                          ),
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
    );
  }
}

/// "During the call": message, gift, a game, blur me; voice only; report.
Future<void> showCallTools(BuildContext context, MatchProvider m, FriendCallActions actions) {
  final p = m.partner;
  if (p == null) return Future.value();
  void run(BuildContext ctx, VoidCallback fn) {
    Navigator.of(ctx).pop();
    fn();
  }

  Widget tile(IconData icon, String label, Color color, VoidCallback onTap, {bool on = false}) => Semantics(
    button: true,
    toggled: on ? true : null,
    label: label,
    excludeSemantics: true,
    child: GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: color.withValues(alpha: on ? 0.34 : 0.16),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Icon(icon, size: 26, color: color),
          ),
          const SizedBox(height: 7),
          Text(label, style: VT.label(12.5, color: V.text)),
        ],
      ),
    ),
  );

  Widget row(BuildContext ctx, IconData icon, String title, String sub, VoidCallback onTap, {bool bad = false}) => Semantics(
    button: true,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: bad ? V.bad.withValues(alpha: 0.14) : Colors.white.withValues(alpha: 0.05), borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, size: 21, color: bad ? V.bad : V.text2),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: VT.label(15, color: bad ? V.bad : V.text, weight: FontWeight.w600),
                  ),
                  Text(sub, style: VT.body(12, color: V.text2)),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );

  return showVibeSheet(
    context,
    child: ListenableBuilder(
      listenable: m,
      builder: (ctx, _) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 4, bottom: 14),
              child: Text('During the call', style: VT.title(18, weight: FontWeight.w700)),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                tile(SolarIconsBold.chatRoundDots, 'Message', V.lavender, () => run(ctx, actions.shrink)),
                tile(SolarIconsBold.gift, 'Gift', V.gold, () => run(ctx, actions.gift)),
                tile(SolarIconsBold.gamepadMinimalistic, 'Play a game', V.pinkSoft, () => run(ctx, actions.play)),
                tile(SolarIconsBold.radialBlur, m.blurMe ? 'Blurred' : 'Blur me', V.trust, m.toggleBlurMe, on: m.blurMe),
              ],
            ),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Divider(height: 1, color: V.lineSoft),
            ),
            if (!m.voiceCall) row(ctx, SolarIconsBold.phone, 'Switch to voice only', 'Both cameras turn off', () => run(ctx, () => m.switchToVoice())),
            row(ctx, SolarIconsBold.soundwave, 'Speaker', m.speakerOn ? 'On · tap for the phone earpiece' : 'Phone earpiece · tap for the speaker', m.toggleSpeaker),
            row(ctx, SolarIconsBold.flag, 'Report ${_first(p)}', 'The call ends and our team takes a look', () => run(ctx, actions.report), bad: true),
          ],
        ),
      ),
    ),
  );
}
