import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../core/theme/vibe_theme.dart';

export '../core/theme/vibe_widgets.dart' show VibeLogo, VibeMark;

/// Cold-start splash — "dark minimal" from the splash handoff
/// (`Vibe Splash Live.dc.html`). The two rings slide in and lock together,
/// the wordmark rises, then the mark breathes with sonar ripples until the
/// app is ready. Every size and time comes from the spec (412×892 reference).
///
/// All motion runs off one clock (seconds since first frame) so the
/// entrance and the ambient loop stay in sync exactly as in the CSS.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  final _t = ValueNotifier<double>(0);
  late final Ticker _ticker;
  bool _reduce = false;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_tick)..start();
  }

  void _tick(Duration elapsed) {
    final t = elapsed.inMicroseconds / 1e6;
    _t.value = t;
    // With reduced motion nothing moves after the fades, so stop the clock.
    if (_reduce && t > _Spec.settled) _ticker.stop();
  }

  @override
  void dispose() {
    _ticker.dispose();
    _t.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final reduce = _reduce = mq.disableAnimations;
    // Scale from the 412pt-wide reference, within sensible bounds.
    final s = (mq.size.width / 412).clamp(0.85, 1.2);
    final bottom = 52 * s + math.max(0.0, mq.viewPadding.bottom - 24);

    return Scaffold(
      backgroundColor: V.bg,
      body: Semantics(
        label: 'Vibe is starting',
        child: DecoratedBox(
          // radial-gradient(120% 90% at 50% 30%, #1B0F2E 0%, #0B0A10 62%)
          decoration: const BoxDecoration(
            gradient: RadialGradient(center: Alignment(0, -0.4), radius: 1.2, colors: [Color(0xFF1B0F2E), V.bg], stops: [0, 0.62], transform: _EllipseY(0.9 / 1.2)),
          ),
          child: SizedBox.expand(
            child: Stack(
              children: [
                // Violet glow behind the mark, breathing with it.
                Positioned(
                  left: 0,
                  right: 0,
                  top: mq.size.height * 0.34 - 180 * s,
                  height: 360 * s,
                  child: Center(
                    child: ValueListenableBuilder<double>(
                      valueListenable: _t,
                      builder: (_, t, child) => Opacity(opacity: reduce ? 0.55 : _Spec.glow(t), child: child),
                      child: Container(
                        width: 360 * s,
                        height: 360 * s,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(colors: [Color(0x248B5CF6), Color(0x008B5CF6)], stops: [0, 0.65]),
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned.fill(
                  child: Column(
                    children: [
                      const Spacer(),
                      SizedBox(
                        width: 220 * s,
                        height: 220 * s,
                        child: RepaintBoundary(
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              if (!reduce) Positioned.fill(child: CustomPaint(painter: _RipplesPainter(_t))),
                              ValueListenableBuilder<double>(
                                valueListenable: _t,
                                builder: (_, t, child) => Transform.scale(scale: reduce ? 1 : _Spec.breathe(t), child: child),
                                child: SizedBox(
                                  width: 112 * s,
                                  height: 112 * s,
                                  child: CustomPaint(painter: _MarkPainter(_t, reduce: reduce)),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      SizedBox(height: 26 * s),
                      _Rise(
                        t: _t,
                        start: 0.75,
                        reduce: reduce,
                        child: Text(
                          'Vibe',
                          style: TextStyle(fontFamily: V.sans, fontSize: 36 * s, fontWeight: FontWeight.w700, letterSpacing: -1.3 * s, height: 1.1, color: V.text),
                        ),
                      ),
                      SizedBox(height: 9 * s),
                      _Rise(
                        t: _t,
                        start: 0.9,
                        reduce: reduce,
                        child: Text(
                          'MEET SOMEONE NEW',
                          style: TextStyle(fontFamily: V.sans, fontSize: 12.5 * s, letterSpacing: 1.8 * s, height: 1.2, color: V.muted),
                        ),
                      ),
                      const Spacer(),
                      Padding(
                        padding: EdgeInsets.only(bottom: bottom),
                        child: ValueListenableBuilder<double>(
                          valueListenable: _t,
                          builder: (_, t, child) => Opacity(opacity: _Spec.footer(t), child: child),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _ProgressSweep(t: _t, reduce: reduce, s: s),
                              SizedBox(height: 14 * s),
                              Text(
                                '18+ · be kind on camera',
                                style: TextStyle(fontFamily: V.sans, fontSize: 11 * s, height: 1.2, color: V.muted),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Keeps the splash up until the app has booted **and** the entrance has
/// played, then fades it to the background (250 ms) and shows [builder].
class SplashGate extends StatefulWidget {
  const SplashGate({super.key, required this.ready, required this.builder});

  /// True once boot work is done (session restored).
  final bool ready;
  final WidgetBuilder builder;

  /// Entrance (rings + wordmark) plus a couple of breathing loops.
  static const minVisible = Duration(milliseconds: 3500);

  @override
  State<SplashGate> createState() => _SplashGateState();
}

class _SplashGateState extends State<SplashGate> with SingleTickerProviderStateMixin {
  late final AnimationController _fade = AnimationController(vsync: this, duration: const Duration(milliseconds: 250));
  late final Animation<double> _opacity = Tween<double>(begin: 1, end: 0).animate(_fade);
  Timer? _min;
  bool _minDone = false;
  bool _gone = false;

  @override
  void initState() {
    super.initState();
    _min = Timer(SplashGate.minVisible, () {
      _minDone = true;
      _maybeExit();
    });
  }

  @override
  void didUpdateWidget(SplashGate oldWidget) {
    super.didUpdateWidget(oldWidget);
    _maybeExit();
  }

  void _maybeExit() {
    if (!mounted || _gone || !_minDone || !widget.ready || _fade.isAnimating) return;
    _fade.forward().whenCompleteOrCancel(() {
      if (mounted) setState(() => _gone = true);
    });
  }

  @override
  void dispose() {
    _min?.cancel();
    _fade.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_gone) return widget.builder(context);
    return ColoredBox(
      color: V.bg,
      child: FadeTransition(opacity: _opacity, child: const SplashScreen()),
    );
  }
}

/// Motion spec, as functions of seconds since start.
abstract final class _Spec {
  static const spring = Cubic(0.16, 1, 0.3, 1);
  static const rippleEase = Cubic(0, 0.4, 0.4, 1);
  static const sweepEase = Cubic(0.45, 0, 0.55, 1);

  /// Ambient loop: starts at 1.6 s, 3 s period.
  static const loopStart = 1.6;
  static const period = 3.0;

  /// After this every one-shot animation has finished.
  static const settled = 2.1;

  static double seg(double t, double start, double dur) => ((t - start) / dur).clamp(0.0, 1.0);

  /// 0→1→0 over the loop, ease-in-out each half (CSS keyframes 0/50/100%).
  static double _wave(double t) {
    if (t < loopStart) return 0;
    final p = ((t - loopStart) % period) / period;
    return Curves.easeInOut.transform(p < 0.5 ? p * 2 : (1 - p) * 2);
  }

  static double breathe(double t) => 1 + 0.045 * _wave(t);
  static double glow(double t) => 0.55 + 0.45 * _wave(t);
  static double footer(double t) => Curves.ease.transform(seg(t, 1.2, 0.8));
}

/// Wordmark / tagline entrance: rise 14 px + fade, 0.6 s spring.
class _Rise extends StatelessWidget {
  const _Rise({required this.t, required this.start, required this.reduce, required this.child});
  final ValueNotifier<double> t;
  final double start;
  final bool reduce;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<double>(
      valueListenable: t,
      builder: (_, t, child) {
        final e = _Spec.spring.transform(_Spec.seg(t, start, 0.6));
        return Opacity(
          opacity: e,
          child: Transform.translate(offset: Offset(0, reduce ? 0 : 14 * (1 - e)), child: child),
        );
      },
      child: child,
    );
  }
}

/// 128×3 track with a 44 px gradient segment sweeping every 1.6 s.
class _ProgressSweep extends StatelessWidget {
  const _ProgressSweep({required this.t, required this.reduce, required this.s});
  final ValueNotifier<double> t;
  final bool reduce;
  final double s;

  @override
  Widget build(BuildContext context) {
    final seg = 44 * s;
    final bar = Container(
      width: seg,
      height: 3 * s,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(2),
        gradient: const LinearGradient(colors: [Color(0x00FF3D8F), V.pink, V.violet, Color(0x008B5CF6)]),
      ),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(2),
      child: Container(
        width: 128 * s,
        height: 3 * s,
        color: Colors.white.withValues(alpha: 0.09),
        alignment: Alignment.centerLeft,
        child: reduce
            ? Transform.translate(offset: Offset((128 * s - seg) / 2, 0), child: bar)
            : ValueListenableBuilder<double>(
                valueListenable: t,
                builder: (_, t, child) {
                  // translateX(-120%) → translateX(320%) of the segment's width.
                  final p = t < 1.2 ? 0.0 : _Spec.sweepEase.transform(((t - 1.2) % 1.6) / 1.6);
                  final x = t < 1.2 ? 0.0 : seg * (-1.2 + 4.4 * p);
                  return Transform.translate(offset: Offset(x, 0), child: child);
                },
                child: bar,
              ),
      ),
    );
  }
}

/// The two-ring mark on the spec's 112-unit grid: 74 px rings with 10 px
/// borders, pink left / violet right (screen blend), 34 px outer glows.
class _MarkPainter extends CustomPainter {
  _MarkPainter(this.t, {required this.reduce}) : super(repaint: t);
  final ValueNotifier<double> t;
  final bool reduce;

  @override
  void paint(Canvas canvas, Size size) {
    final k = size.width / 112;
    canvas.save();
    canvas.scale(k);
    canvas.saveLayer(const Rect.fromLTWH(-60, -60, 232, 232), Paint());
    _ring(canvas, start: 0.15, from: 26, centre: const Offset(37, 56), color: V.pink);
    _ring(canvas, start: 0.30, from: -26, centre: const Offset(75, 56), color: V.violet, blend: BlendMode.screen);
    canvas.restore();
    canvas.restore();
  }

  void _ring(Canvas canvas, {required double start, required double from, required Offset centre, required Color color, BlendMode blend = BlendMode.srcOver}) {
    final p = _Spec.seg(t.value, start, 0.7);
    // Transform eases over the whole 0.7 s; opacity reaches 1 at 60 %.
    final e = _Spec.spring.transform(p);
    final opacity = _Spec.spring.transform((p / 0.6).clamp(0.0, 1.0));
    if (opacity <= 0) return;
    final dx = reduce ? 0.0 : from * (1 - e);
    final scale = reduce ? 1.0 : 0.6 + 0.4 * e;

    canvas.saveLayer(null, Paint()..blendMode = blend);
    canvas.translate(centre.dx + dx, centre.dy);
    canvas.scale(scale);
    // box-shadow: 0 0 34px — only outside the ring's outer edge.
    canvas.save();
    canvas.clipPath(
      Path()
        ..fillType = PathFillType.evenOdd
        ..addRect(const Rect.fromLTWH(-120, -120, 240, 240))
        ..addOval(Rect.fromCircle(center: Offset.zero, radius: 37)),
    );
    canvas.drawCircle(
      Offset.zero,
      37,
      Paint()
        ..color = color.withValues(alpha: 0.5 * opacity)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 17),
    );
    canvas.restore();
    canvas.drawCircle(
      Offset.zero,
      32,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 10
        ..color = color.withValues(alpha: opacity),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _MarkPainter old) => old.reduce != reduce || old.t != t;
}

/// Two sonar ripples (pink, then violet 1.5 s later) behind the mark.
class _RipplesPainter extends CustomPainter {
  _RipplesPainter(this.t) : super(repaint: t);
  final ValueNotifier<double> t;

  @override
  void paint(Canvas canvas, Size size) {
    final k = size.width / 220;
    final c = size.center(Offset.zero);
    for (final (start, color) in const [(_Spec.loopStart, V.pink), (_Spec.loopStart + 1.5, V.violet)]) {
      if (t.value < start) continue;
      final p = ((t.value - start) % _Spec.period) / _Spec.period;
      final scale = 0.62 + (1.55 - 0.62) * _Spec.rippleEase.transform(p);
      final o = p < 0.12 ? 0.55 * _Spec.rippleEase.transform(p / 0.12) : 0.55 * (1 - _Spec.rippleEase.transform((p - 0.12) / 0.88));
      if (o <= 0) continue;
      canvas.drawCircle(
        c,
        (110 - 0.75) * k * scale,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5 * k * scale
          ..color = color.withValues(alpha: 0.4 * o),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _RipplesPainter old) => old.t != t;
}

/// Squashes a circular radial gradient into the spec's 120%×90% ellipse.
class _EllipseY extends GradientTransform {
  const _EllipseY(this.ratio);

  /// Vertical radius ÷ horizontal radius, in widths (0.9 h ÷ 1.2 w).
  final double ratio;

  @override
  Matrix4? transform(Rect bounds, {TextDirection? textDirection}) {
    // Radii: 1.2·w horizontally, 0.9·h vertically (gradient radius is in widths).
    final sy = ratio * bounds.height / bounds.width;
    final cy = bounds.top + bounds.height * 0.3;
    return Matrix4.identity()
      ..translateByDouble(0, cy, 0, 1)
      ..scaleByDouble(1, sy, 1, 1)
      ..translateByDouble(0, -cy, 0, 1);
  }
}
