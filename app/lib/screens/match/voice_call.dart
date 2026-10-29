import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../providers/match_provider.dart';
import '../../providers/social_provider.dart';

/// A voice call with a friend: their photo, the time, mute, "Turn on video"
/// (when you both allow video in the chat) and End. Cameras stay off.
class VoiceCallView extends StatelessWidget {
  const VoiceCallView({super.key, required this.m, required this.onReport});
  final MatchProvider m;
  final VoidCallback onReport;

  @override
  Widget build(BuildContext context) {
    final p = m.partner;
    if (p == null) return const SizedBox.shrink();
    final friend = context.select<SocialProvider, ({bool known, bool video})>((s) {
      final f = s.friend(p.id);
      return (known: f != null, video: f?.calls.video ?? false);
    });
    // Video can be turned on only when you both allow video in the chat.
    final videoAllowed = !friend.known || friend.video;
    final first = p.name.split(' ').first;
    final media = MediaQuery.of(context);
    return Container(
      decoration: const BoxDecoration(
        gradient: RadialGradient(center: Alignment(0, -0.44), radius: 1.2, colors: [Color(0xFF2B1B4D), Color(0xFF15121D), V.bg], stops: [0, 0.55, 1]),
      ),
      padding: EdgeInsets.fromLTRB(24, media.padding.top + 16, 24, media.padding.bottom + 28),
      child: Column(
        children: [
          Row(
            children: [
              Text('VOICE CALL', style: VT.overline(color: V.text2)),
              const Spacer(),
              GlassPill(label: 'Report', icon: SolarIconsBold.flag, tint: V.bad, height: 36, onTap: onReport),
            ],
          ),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                children: [
                  const SizedBox(height: 40),
                  PulseRings(
                    child: VAvatar(url: p.avatarUrl, name: p.name, size: 132),
                  ),
                  const SizedBox(height: 24),
                  Text(first, style: VT.display(30)),
                  const SizedBox(height: 6),
                  Semantics(
                    liveRegion: true,
                    child: Text(m.hasRemoteVideo || m.elapsed > Duration.zero ? Fmt.clock(m.elapsed) : 'Connecting…', style: VT.mono(15, color: V.lavender)),
                  ),
                  const SizedBox(height: 18),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(16)),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(SolarIconsBold.shieldCheck, size: 14, color: V.text2),
                        const SizedBox(width: 8),
                        Flexible(child: Text('Camera stays off. Not recorded.', style: VT.body(12.5, color: V.text2))),
                      ],
                    ),
                  ),
                  if (m.videoAsk == VideoAsk.theirs) ...[
                    const SizedBox(height: 18),
                    Semantics(
                      container: true,
                      label: '$first wants to turn on video',
                      child: Container(
                        constraints: const BoxConstraints(maxWidth: 340),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: V.surface,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: V.violet.withValues(alpha: 0.45)),
                        ),
                        child: Column(
                          children: [
                            Text(
                              '$first wants to turn on video',
                              textAlign: TextAlign.center,
                              style: VT.title(15, weight: FontWeight.w600),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: GhostButton(label: 'Stay on voice', height: 40, expand: true, onTap: () => m.answerVideo(false)),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: GradientButton(
                                    label: 'Turn on video',
                                    height: 40,
                                    gradient: const LinearGradient(colors: [V.ok, V.ok]),
                                    foreground: V.bg,
                                    glow: V.ok,
                                    onTap: () => m.answerVideo(true),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              RoundControl(
                icon: m.micOn ? Icons.mic_rounded : Icons.mic_off_rounded,
                size: 64,
                onTap: m.toggleMic,
                label: m.micOn ? 'Mute' : 'Unmute',
                background: m.micOn ? null : V.text,
                color: m.micOn ? Colors.white : V.bg,
              ),
              const SizedBox(width: 40),
              if (videoAllowed)
                Opacity(
                  opacity: m.videoAsk == VideoAsk.mine ? 0.6 : 1,
                  child: RoundControl(
                    icon: SolarIconsBold.videocamera,
                    size: 64,
                    onTap: m.videoAsk == VideoAsk.mine ? null : m.askVideo,
                    label: m.videoAsk == VideoAsk.mine ? 'Asking…' : 'Video',
                    tint: V.pink,
                  ),
                )
              else
                Tooltip(
                  message: 'You both need to allow video in the chat first',
                  child: RoundControl(icon: Icons.videocam_off_rounded, size: 64, onTap: null, label: 'Voice only', color: V.muted, labelColor: V.muted),
                ),
            ],
          ),
          const SizedBox(height: 26),
          RoundControl(icon: Icons.call_end_rounded, size: 72, onTap: m.stop, label: 'End', background: const Color(0xFFE11D48)),
        ],
      ),
    );
  }
}
