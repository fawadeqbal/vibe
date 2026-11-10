import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/cache/cached_image.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../providers/match_provider.dart';

/// Friend calls share these pieces (web: features/calls/call-ui.tsx).
const callRed = Color(0xFFE11D48);
const callGreen = Color(0xFF34D399);
const onCallGreen = Color(0xFF062A26);

/// Their photo, dark and blurred, filling the screen (calling, voice, ended).
class BlurredPhoto extends StatelessWidget {
  const BlurredPhoto({super.key, required this.url, this.brightness = 0.38});
  final String url;
  final double brightness;

  @override
  Widget build(BuildContext context) {
    const fallback = DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [Color(0xFF2B1B4D), V.bg], begin: Alignment.topCenter, end: Alignment.bottomCenter),
      ),
    );
    if (url.isEmpty) return fallback;
    final b = brightness;
    return ClipRect(
      child: ImageFiltered(
        imageFilter: ImageFilter.blur(sigmaX: 22, sigmaY: 22, tileMode: TileMode.clamp),
        child: ColorFiltered(
          colorFilter: ColorFilter.matrix([b, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0]),
          child: Transform.scale(
            scale: 1.25,
            child: Image(image: netImage(url), fit: BoxFit.cover, width: double.infinity, height: double.infinity, errorBuilder: (_, __, ___) => fallback),
          ),
        ),
      ),
    );
  }
}

/// Their photo with three soft white rings around it, breathing.
class PulseAvatar extends StatefulWidget {
  const PulseAvatar({super.key, required this.url, required this.name, this.size = 124});
  final String url;
  final String name;
  final double size;

  @override
  State<PulseAvatar> createState() => _PulseAvatarState();
}

class _PulseAvatarState extends State<PulseAvatar> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    final still = MediaQuery.of(context).disableAnimations;
    return ExcludeSemantics(
      child: SizedBox.square(
        dimension: s + 170,
        child: AnimatedBuilder(
          animation: _c,
          builder: (_, child) => Stack(
            alignment: Alignment.center,
            children: [
              for (final (i, (d, a)) in const [(44.0, 0.22), (100.0, 0.12), (170.0, 0.06)].indexed)
                Container(
                  width: s + d,
                  height: s + d,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white.withValues(alpha: a * (still ? 1 : 0.6 + 0.4 * ((_c.value + i * 0.25) % 1))), width: 1.5),
                  ),
                ),
              child!,
            ],
          ),
          child: VAvatar(url: widget.url, name: widget.name, size: s),
        ),
      ),
    );
  }
}

/// A phone-call control: round, label under it. [on] = the white "active" look (muted, camera off).
class CallCtl extends StatelessWidget {
  const CallCtl({super.key, required this.icon, required this.label, this.onTap, this.on = false, this.size = 60, this.background, this.color, this.semantics, this.badge});
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool on;
  final double size;
  final Color? background;
  final Color? color;
  final String? semantics;

  /// A small mark on the button's corner (e.g. ⌄ when it opens a list).
  final Widget? badge;

  @override
  Widget build(BuildContext context) {
    final bg = background ?? (on ? Colors.white : Colors.white.withValues(alpha: 0.14));
    final fg = color ?? (on ? V.bg : Colors.white);
    return Semantics(
      button: true,
      enabled: onTap != null,
      toggled: on ? true : null,
      label: semantics ?? label,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: Opacity(
          opacity: onTap == null ? 0.5 : 1,
          child: SizedBox(
            width: 86,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    ClipOval(
                      child: BackdropFilter(
                        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
                        child: Container(
                          width: size,
                          height: size,
                          color: bg,
                          child: Icon(icon, size: size * 0.42, color: fg),
                        ),
                      ),
                    ),
                    if (badge != null) Positioned(right: -2, bottom: -2, child: badge!),
                  ],
                ),
                const SizedBox(height: 7),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: VT.label(12, color: Colors.white.withValues(alpha: 0.88)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The red hang-up button.
class EndCallButton extends StatelessWidget {
  const EndCallButton({super.key, required this.onTap, this.label = 'End', this.size = 64, this.semantics = 'End call'});
  final VoidCallback onTap;
  final String label;
  final double size;
  final String semantics;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semantics,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: SizedBox(
          width: 86,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: size,
                height: size,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: callRed,
                  boxShadow: [BoxShadow(color: callRed.withValues(alpha: 0.45), blurRadius: 26, offset: const Offset(0, 10))],
                ),
                child: Icon(Icons.call_end_rounded, size: size * 0.46, color: Colors.white),
              ),
              const SizedBox(height: 7),
              Text(label, style: VT.label(12, color: Colors.white.withValues(alpha: 0.88))),
            ],
          ),
        ),
      ),
    );
  }
}

/// The frosted bar of controls at the bottom of a video call.
class CallDock extends StatelessWidget {
  const CallDock({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Glass(
      radius: 30,
      blur: 18,
      color: V.bg2.withValues(alpha: 0.52),
      border: Colors.white.withValues(alpha: 0.10),
      padding: const EdgeInsets.fromLTRB(4, 14, 4, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [for (final c in children) Flexible(child: c)],
      ),
    );
  }
}

/// Fades [child] away (and lets taps through to the video) while a video
/// call's controls are hidden; [slide] nudges it toward its edge.
class FadeAway extends StatelessWidget {
  const FadeAway({super.key, required this.hidden, required this.child, this.slide = 0});
  final bool hidden;
  final double slide;
  final Widget child;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    ignoring: hidden,
    child: AnimatedSlide(
      offset: Offset(0, hidden ? slide : 0),
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
      child: AnimatedOpacity(opacity: hidden ? 0 : 1, duration: const Duration(milliseconds: 300), curve: Curves.easeOut, child: child),
    ),
  );
}

/// Top of a friend call: shrink to the chat, and who / how long, centred (Report on the right when given).
class CallTopline extends StatelessWidget {
  const CallTopline({super.key, required this.title, required this.sub, required this.onShrink, this.verified = false, this.onReport});
  final String title;
  final String sub;
  final bool verified;
  final VoidCallback onShrink;
  final VoidCallback? onReport;

  Widget _round(IconData icon, Color color, VoidCallback onTap, String label) => Semantics(
    button: true,
    label: label,
    excludeSemantics: true,
    child: GestureDetector(
      onTap: onTap,
      child: Glass(
        radius: 999,
        height: 40,
        blur: 18,
        color: V.bg2.withValues(alpha: 0.52),
        border: Colors.white.withValues(alpha: 0.10),
        padding: EdgeInsets.zero,
        child: SizedBox(width: 40, child: Icon(icon, size: 21, color: color)),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(12, MediaQuery.of(context).padding.top + 12, 12, 0),
      child: Row(
        children: [
          _round(Icons.close_fullscreen_rounded, V.text, onShrink, 'Shrink the call and go to the chat'),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Flexible(
                      child: Text(
                        title,
                        overflow: TextOverflow.ellipsis,
                        style: VT.title(16, weight: FontWeight.w700),
                      ),
                    ),
                    if (verified)
                      const Padding(
                        padding: EdgeInsets.only(left: 4),
                        child: Icon(SolarIconsBold.verifiedCheck, size: 15, color: V.trust, semanticLabel: 'Verified'),
                      ),
                  ],
                ),
                Text(sub, style: VT.body(12.5, color: Colors.white.withValues(alpha: 0.8))),
              ],
            ),
          ),
          const SizedBox(width: 10),
          if (onReport != null) _round(SolarIconsBold.flag, V.bad, onReport!, 'Report') else const SizedBox(width: 40),
        ],
      ),
    );
  }
}

/// You, picture-in-picture (blurred while "Blur me" is on).
class SelfPreview extends StatelessWidget {
  const SelfPreview({super.key});

  @override
  Widget build(BuildContext context) => const PipFrame(child: SelfVideo());
}

/// The small picture's frame: rounded, a light border and a shadow.
class PipFrame extends StatelessWidget {
  const PipFrame({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        width: pipWidth,
        height: pipHeight,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white.withValues(alpha: 0.22), width: 2),
          color: V.surface2,
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 24, offset: const Offset(0, 8))],
        ),
        child: child,
      );
}

/// Your camera filling its box (the corner tile, or the whole screen after a swap).
class SelfVideo extends StatelessWidget {
  const SelfVideo({super.key, this.big = false});
  final bool big;

  @override
  Widget build(BuildContext context) {
    final m = context.watch<MatchProvider>();
    return Stack(
      fit: StackFit.expand,
      children: [
        if (m.hasLocalVideo && m.camOn && !m.voiceCall)
          RTCVideoView(m.localRenderer, mirror: m.frontCamera, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)
        else
          ColoredBox(color: V.surface2, child: Center(child: Icon(Icons.videocam_off_rounded, color: V.muted, size: big ? 40 : 24))),
        if (m.blurMe) ...[
          BackdropFilter(filter: ImageFilter.blur(sigmaX: big ? 24 : 12, sigmaY: big ? 24 : 12), child: const SizedBox.expand()),
          Positioned(
            left: big ? null : 6,
            right: big ? null : 6,
            bottom: big ? MediaQuery.paddingOf(context).bottom + 150 : 6,
            child: Center(
              child: Container(
                padding: EdgeInsets.symmetric(vertical: 2, horizontal: big ? 12 : 0),
                decoration: BoxDecoration(color: V.bg2.withValues(alpha: 0.7), borderRadius: BorderRadius.circular(999)),
                child: Text('Blurred', textAlign: TextAlign.center, style: VT.label(big ? 12.5 : 10.5, color: V.trust)),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

const double pipWidth = 100;
const double pipHeight = 140;

enum PipCorner { tl, tr, bl, br }

/// Where the small picture sits in each corner of a [size] screen, clear of
/// the header ([top]) and the controls ([bottom]), safe areas included.
Offset pipPoint(PipCorner c, Size size, EdgeInsets pad, {double top = 78, double bottom = 132, double margin = 12}) {
  final left = c == PipCorner.tl || c == PipCorner.bl;
  final upper = c == PipCorner.tl || c == PipCorner.tr;
  final x = left ? margin : (size.width - pipWidth - margin).clamp(margin, double.infinity);
  final y = upper ? top + pad.top : (size.height - pipHeight - bottom - pad.bottom).clamp(top + pad.top, double.infinity);
  return Offset(x.toDouble(), y.toDouble());
}

/// The corner nearest to where it was let go.
PipCorner pipNearest(Offset at, Size size) {
  final left = at.dx + pipWidth / 2 < size.width / 2;
  final upper = at.dy + pipHeight / 2 < size.height / 2;
  return upper ? (left ? PipCorner.tl : PipCorner.tr) : (left ? PipCorner.bl : PipCorner.br);
}

/// The small picture in a video call, like WhatsApp: drag it anywhere and it
/// snaps to the nearest corner; tap it to swap it with the big picture.
/// Fill the screen with it (it only takes touches on the tile itself).
/// [top] and [bottom] keep it clear of the header and the controls; they
/// shrink while the controls are hidden, so it slides to the edges.
class PipLayer extends StatefulWidget {
  const PipLayer({super.key, required this.child, required this.onTap, this.onCorner, this.onDrag, this.label = 'Swap pictures', this.top = 78, this.bottom = 132});
  final Widget child;
  final VoidCallback onTap;
  final ValueChanged<PipCorner>? onCorner;

  /// True while it's being dragged, false once it's let go.
  final ValueChanged<bool>? onDrag;
  final String label;
  final double top;
  final double bottom;

  @override
  State<PipLayer> createState() => _PipLayerState();
}

class _PipLayerState extends State<PipLayer> {
  PipCorner _corner = PipCorner.tr;
  Offset? _drag;

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    return LayoutBuilder(builder: (context, box) {
      final size = box.biggest;
      final pos = _drag ?? pipPoint(_corner, size, pad, top: widget.top, bottom: widget.bottom);
      return Stack(
        children: [
          AnimatedPositioned(
            duration: _drag == null ? const Duration(milliseconds: 220) : Duration.zero,
            curve: Curves.easeOutCubic,
            left: pos.dx,
            top: pos.dy,
            width: pipWidth,
            height: pipHeight,
            child: Semantics(
              button: true,
              label: widget.label,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: widget.onTap,
                onPanStart: (_) {
                  setState(() => _drag = pos);
                  widget.onDrag?.call(true);
                },
                onPanUpdate: (d) => setState(() {
                  final p = (_drag ?? pos) + d.delta;
                  _drag = Offset(p.dx.clamp(0, size.width - pipWidth), p.dy.clamp(0, size.height - pipHeight));
                }),
                onPanEnd: (_) {
                  final c = pipNearest(_drag ?? pos, size);
                  setState(() {
                    _corner = c;
                    _drag = null;
                  });
                  widget.onCorner?.call(c);
                  widget.onDrag?.call(false);
                },
                onPanCancel: () {
                  setState(() => _drag = null);
                  widget.onDrag?.call(false);
                },
                child: PipFrame(child: widget.child),
              ),
            ),
          ),
        ],
      );
    });
  }
}

/// Eleven bars that move with their voice (still when they're quiet).
class VoiceBars extends StatelessWidget {
  const VoiceBars({super.key, required this.level});
  final double level;

  @override
  Widget build(BuildContext context) {
    const shape = [10.0, 18.0, 28.0, 16.0, 24.0, 12.0, 20.0, 30.0, 14.0, 22.0, 10.0];
    return ExcludeSemantics(
      child: SizedBox(
        height: 30,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (i, h) in shape.indexed) ...[
              if (i > 0) const SizedBox(width: 3),
              AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                width: 4,
                height: (h * (0.25 + 0.75 * (level * (0.6 + ((i * 7) % 5) / 5)).clamp(0.0, 1.0))).clamp(4.0, 30.0),
                decoration: BoxDecoration(
                  color: V.pinkSoft.withValues(alpha: (0.5 + h / 60).clamp(0, 1)),
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Ending screens of a friend call: their photo, a title, one line, then buttons.
class CallEndCard extends StatelessWidget {
  const CallEndCard({super.key, required this.url, required this.name, required this.title, required this.sub, required this.children});
  final String url;
  final String name;
  final String title;
  final String sub;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.of(context).padding;
    return Stack(
      fit: StackFit.expand,
      children: [
        BlurredPhoto(url: url, brightness: 0.3),
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Padding(
              padding: EdgeInsets.fromLTRB(16, pad.top + 150, 16, pad.bottom + 34),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: VAvatar(url: url, name: name, size: 112, ring: true),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: VT.title(26, weight: FontWeight.w700),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    sub,
                    textAlign: TextAlign.center,
                    style: VT.body(14.5, color: Colors.white.withValues(alpha: 0.8), height: 1.45),
                  ),
                  const Spacer(),
                  for (final (i, c) in children.indexed) ...[if (i > 0) const SizedBox(height: 10), c],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
