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
import '../../services/calls/call_audio.dart';
import '../match/call_states.dart';
import '../match/icebreakers.dart';
import 'auto_hide.dart';
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
/// dock. Not the random-match screen. Tap the small picture to swap it with
/// the big one; drag it to any corner. The header and dock hide 4 s after the
/// last tap and come back on the next one; a tap on the video hides them at
/// once. They stay up while a sheet or game is open, the small picture is
/// dragged, their video hasn't started, or a screen reader is on.
/// (web: features/calls/friend-call.tsx)
class FriendVideoCall extends StatefulWidget {
  const FriendVideoCall({super.key, required this.m, required this.actions});
  final MatchProvider m;
  final FriendCallActions actions;

  @override
  State<FriendVideoCall> createState() => _FriendVideoCallState();
}

class _FriendVideoCallState extends State<FriendVideoCall> {
  bool _swapped = false;
  PipCorner _corner = PipCorner.tr;
  bool _dragging = false;
  final _controls = AutoHide();

  /// Whether the controls were up when this touch began (a tap on the video then hides them).
  bool _downShown = true;
  bool? _held;

  @override
  void initState() {
    super.initState();
    _controls.addListener(_changed);
    _controls.poke();
  }

  void _changed() => setState(() {});

  @override
  void dispose() {
    _controls.removeListener(_changed);
    _controls.dispose();
    super.dispose();
  }

  /// Hold the controls up for as long as [held]; applied after the frame (it may rebuild).
  void _hold(bool held) {
    if (held == _held) return;
    _held = held;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _controls.hold(held);
    });
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.m;
    final actions = widget.actions;
    final p = m.partner!;
    final pad = MediaQuery.of(context).padding;
    final covered = !(ModalRoute.of(context)?.isCurrent ?? true);
    _hold(!m.hasRemoteVideo || m.game != null || _dragging || covered || MediaQuery.accessibleNavigationOf(context));
    final bare = !_controls.shown;
    final partner = _PartnerVideo(m: m, small: _swapped);
    const self = SelfVideo();
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (_) {
        _downShown = _controls.shown;
        _controls.poke();
      },
      child: Stack(
        fit: StackFit.expand,
        children: [
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {
              if (_downShown) _controls.hide();
            },
            child: _swapped ? const SelfVideo(big: true) : partner,
          ),
          IgnorePointer(
            child: AnimatedOpacity(
              opacity: bare ? 0 : 1,
              duration: const Duration(milliseconds: 300),
              child: const VideoScrims(top: 170, bottom: 260, topAlpha: 0.6, bottomAlpha: 0.75, bottomMid: 0.4),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            child: FadeAway(
              hidden: bare,
              slide: -0.3,
              child: CallTopline(title: p.name, verified: p.verified, sub: '${Fmt.clock(m.elapsed)} · video call', onShrink: actions.shrink),
            ),
          ),
          AnimatedPositioned(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
            left: _corner == PipCorner.tl ? 124 : 12,
            right: _corner == PipCorner.tr ? 124 : 12,
            top: pad.top + (bare ? 18 : 78),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // With the dock gone, your own mute and camera stay in sight.
                if (bare && !m.micOn) const GlassPill(label: "You're muted", icon: Icons.mic_off_rounded, iconColor: V.bad, height: 28, fontSize: 12),
                if (bare && !m.camOn) const GlassPill(label: 'Your camera is off', icon: Icons.videocam_off_rounded, height: 28, fontSize: 12),
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
          Positioned.fill(
            child: PipLayer(
              label: _swapped ? 'Show ${_first(p)} big' : 'Show yourself big',
              onTap: () => setState(() => _swapped = !_swapped),
              onCorner: (c) => setState(() => _corner = c),
              onDrag: (d) => setState(() => _dragging = d),
              top: bare ? 18 : 78,
              bottom: bare ? 24 : 132,
              child: _swapped ? partner : self,
            ),
          ),
          Positioned(
            left: 12,
            right: 12,
            bottom: pad.bottom + 22,
            child: FadeAway(
              hidden: bare,
              slide: 0.3,
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
          ),
        ],
      ),
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
                      cell(AudioRouteButton(audio: m.audio)),
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
            Builder(builder: (_) {
              final o = m.audio.current;
              final where = o?.label ?? 'Speaker';
              return row(
                ctx,
                audioIcon(o?.route ?? AudioRoute.speaker),
                'Sound: $where',
                m.audio.hasHeadphones ? 'Tap to choose where it plays' : (m.audio.onSpeaker ? 'Tap for the phone earpiece' : 'Tap for the speaker'),
                () => m.audio.hasHeadphones ? showAudioPicker(ctx, m.audio) : m.audio.toggle(),
              );
            }),
            row(ctx, SolarIconsBold.flag, 'Report ${_first(p)}', 'The call ends and our team takes a look', () => run(ctx, actions.report), bad: true),
          ],
        ),
      ),
    ),
  );
}

/// Their video (or photo while it starts, or the camera-off cover), filling its box.
class _PartnerVideo extends StatelessWidget {
  const _PartnerVideo({required this.m, this.small = false});
  final MatchProvider m;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final p = m.partner!;
    final blur = small ? 10.0 : 24.0;
    return ImageFiltered(
      enabled: m.partnerBlur,
      imageFilter: ImageFilter.blur(sigmaX: blur, sigmaY: blur, tileMode: TileMode.clamp),
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
          if (!m.partnerCamOn && !small) CameraOffCover(partner: p),
        ],
      ),
    );
  }
}

/// The icon for where a call's sound plays: an ear (the phone's earpiece), a
/// speaker, Bluetooth, or headphones.
IconData audioIcon(AudioRoute r) => switch (r) {
  AudioRoute.earpiece => Icons.hearing_rounded,
  AudioRoute.speaker => Icons.volume_up_rounded,
  AudioRoute.bluetooth => Icons.bluetooth_audio_rounded,
  AudioRoute.wired => Icons.headphones_rounded,
};

/// Where the sound plays, as one call button: "Phone" with an ear, "Speaker"
/// (white while on), or the headphones' name. One tap switches earpiece ⇄
/// speaker; with headphones or Bluetooth around (the small ⌄) it opens the list.
class AudioRouteButton extends StatelessWidget {
  const AudioRouteButton({super.key, required this.audio});
  final CallAudio audio;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: audio,
      builder: (context, _) {
        final o = audio.current;
        final label = o?.label ?? 'Phone';
        final list = audio.hasHeadphones;
        return CallCtl(
          icon: audioIcon(o?.route ?? AudioRoute.earpiece),
          label: label,
          on: audio.onSpeaker,
          semantics: list ? 'Sound plays through $label. Choose where' : (audio.onSpeaker ? 'Speaker on. Tap for the phone earpiece' : 'Sound on the phone earpiece. Tap for the speaker'),
          badge: list
              ? Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(color: V.surface3, shape: BoxShape.circle, border: Border.all(color: V.bg2, width: 2)),
                  child: const Icon(Icons.expand_more_rounded, size: 15, color: Colors.white),
                )
              : null,
          onTap: () => list ? showAudioPicker(context, audio) : audio.toggle(),
        );
      },
    );
  }
}

/// "Play the call through": the phone, the speaker, and any headphones or Bluetooth.
Future<void> showAudioPicker(BuildContext context, CallAudio audio) {
  return showVibeSheet(
    context,
    child: ListenableBuilder(
      listenable: audio,
      builder: (ctx, _) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 4, bottom: 8),
              child: Text('Play the call through', style: VT.title(18, weight: FontWeight.w700)),
            ),
            for (final o in audio.outputs)
              Semantics(
                button: true,
                selected: audio.current == o,
                child: InkWell(
                  onTap: () {
                    Navigator.of(ctx).pop();
                    unawaited(audio.choose(o));
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 11),
                    child: Row(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: audio.current == o ? V.pink.withValues(alpha: 0.16) : Colors.white.withValues(alpha: 0.06),
                            borderRadius: BorderRadius.circular(13),
                          ),
                          child: Icon(audioIcon(o.route), size: 22, color: audio.current == o ? V.pinkSoft : V.text2),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(o.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.label(15, color: V.text, weight: FontWeight.w600)),
                              Text(o.detail, style: VT.body(12, color: V.text2)),
                            ],
                          ),
                        ),
                        if (audio.current == o) const Icon(Icons.check_rounded, size: 22, color: V.pinkSoft),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}
