import 'dart:math' as math;
import 'dart:ui' show ImageFilter, lerpDouble;

import 'package:flutter/gestures.dart' show kTouchSlop;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'vibe_theme.dart';

/// One destination in the [VibeDock].
class VibeDockItem {
  const VibeDockItem({required this.icon, required this.activeIcon, required this.label, this.badge = 0});
  final IconData icon;
  final IconData activeIcon;
  final String label;

  /// Unread count. 0 hides the badge; above 99 reads "99+".
  final int badge;
}

/// The tab dock, in the iOS 26 "Liquid Glass" idiom (the bar WhatsApp
/// moved to): a floating glass capsule with equal tabs, each an icon over a
/// small label.
///
/// * The selected tab sits on a clear glass lens — neutral, not coloured —
///   and only its icon and label take the accent.
/// * The lens travels between tabs: its leading edge moves first and the
///   trailing edge catches up, and it swells slightly in flight, so it
///   reads as a drop of glass sliding along the bar.
/// * Glass edges are lit: a rim that is bright along the top and fades
///   down the sides.
///
/// Put it in `Scaffold.bottomNavigationBar` with `extendBody: true`: the
/// body then gets the dock's height as bottom padding, so lists scroll under
/// the glass and still end above it.
class VibeDock extends StatelessWidget {
  const VibeDock({super.key, required this.items, required this.index, required this.onTap, this.overVideo = false});

  final List<VibeDockItem> items;
  final int index;
  final ValueChanged<int> onTap;
  final bool overVideo;

  @override
  Widget build(BuildContext context) {
    final safe = MediaQuery.paddingOf(context).bottom;
    // On phones with a gesture strip the capsule sits down into it, like
    // iOS; elsewhere it keeps a margin.
    final gap = safe > 0 ? math.max(safe - V.dockSink, V.dockLift) : V.dockLift + 6;
    final radius = BorderRadius.circular(V.dockHeight / 2);
    final fill = overVideo ? V.dockFillVideo : V.dockFill;

    final contrast = MediaQuery.highContrastOf(context);
    // With high contrast the glass goes solid; there is nothing to see
    // through it anyway.
    final glass = contrast ? V.surface2 : fill;

    // The glass is clipped to the capsule; the tabs and the lens are not,
    // so a lifted lens can grow past the bar's edge like the real one.
    final capsule = SizedBox(
      height: V.dockHeight,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(borderRadius: radius, boxShadow: V.lift),
              child: ClipRRect(
                borderRadius: radius,
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 28, sigmaY: 28),
                  child: CustomPaint(
                    foregroundPainter: _GlassRim(strength: contrast ? 1.6 : 1),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: radius,
                        // A sheen across the top half of the glass.
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Color.alphaBlend(V.specular, glass), glass],
                          stops: const [0, 0.55],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          _DockTabs(items: items, index: index, onTap: onTap),
        ],
      ),
    );

    return MediaQuery.withClampedTextScaling(
      maxScaleFactor: 1.2,
      child: Stack(
        children: [
          // iOS's scroll-edge effect: the page dims softly as it slides
          // under the bar. Over video the scrims already do this.
          if (!overVideo)
            const Positioned.fill(
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Color(0x000B0A10), Color(0x990B0A10), Color(0xE60B0A10)],
                      stops: [0, 0.6, 1],
                    ),
                  ),
                ),
              ),
            ),
          Padding(
            padding: EdgeInsets.fromLTRB(V.dockInset, overVideo ? 0 : V.dockFade, V.dockInset, gap),
            child: Center(
              heightFactor: 1,
              child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: V.dockMaxWidth), child: capsule),
            ),
          ),
        ],
      ),
    );
  }
}

/// Tabs plus the glass lens that marks the selection.
///
/// How it behaves (matching the iOS 26 tab bar):
/// * Touch down anywhere on the bar: the lens lifts (grows past the bar,
///   turns clearer, magnifies what's under it) and jumps to that tab.
/// * Slide: the lens follows the finger 1:1, tabs light up as it passes,
///   and a haptic tick marks every tab boundary.
/// * Release: the tab under the finger is selected, the lens drops back
///   into the bar with a jelly settle and the icon gives a small bounce.
/// * A plain tap is the same press-and-release, just quick.
class _DockTabs extends StatefulWidget {
  const _DockTabs({required this.items, required this.index, required this.onTap});
  final List<VibeDockItem> items;
  final int index;
  final ValueChanged<int> onTap;

  @override
  State<_DockTabs> createState() => _DockTabsState();
}

class _DockTabsState extends State<_DockTabs> with TickerProviderStateMixin {
  static const _pad = 4.0;

  /// Travel: 0 → 1 as the lens moves from [_from] to [_to].
  late final AnimationController _c = AnimationController(vsync: this, duration: VMotion.travel, value: 1);

  /// Lift: 0 = resting in the bar, 1 = held up under a finger. Allowed to
  /// dip below 0 so the drop back can wobble.
  late final AnimationController _lift = AnimationController(vsync: this, lowerBound: -0.5, upperBound: 1.5, value: 0);

  // Lens edges in tab units (tab i spans i…i+1).
  late (double, double) _from = _span(widget.index);
  late (double, double) _to = _from;
  int _popIndex = -1;

  // Touch tracking.
  int? _pointer;
  int? _hover;
  double _downX = 0;
  bool _dragging = false;
  double _tab = 1;

  int get _n => widget.items.length;
  double get _t => _c.value;
  bool get _reduce => MediaQuery.of(context).disableAnimations;

  (double, double) _span(int i) => (i.toDouble(), i + 1.0);

  /// Whichever edge leads the move runs on a fast curve, the trailing one on
  /// a slow start: the lens stretches, then settles.
  (double, double) get _lens {
    final (fl, fr) = _from;
    final (tl, tr) = _to;
    final right = tl >= fl;
    final lead = VMotion.out.transform(_t);
    final trail = VMotion.inOut.transform(_t);
    return (lerpDouble(fl, tl, right ? trail : lead)!, lerpDouble(fr, tr, right ? lead : trail)!);
  }

  /// Glide the lens to [target] from wherever it is now.
  void _travelTo((double, double) target) {
    if (target == _to && (_c.isAnimating || _lens == target)) return;
    _from = _lens;
    _to = target;
    if (_reduce) {
      _c.value = 1;
    } else {
      _c.forward(from: 0);
    }
  }

  @override
  void didUpdateWidget(_DockTabs old) {
    super.didUpdateWidget(old);
    if (old.items.length != _n) {
      _from = _to = _span(widget.index);
      _c.value = 1;
      return;
    }
    // Selected from outside (a notification, a button on a page): glide
    // there. While a finger is on the bar, the finger owns the lens.
    if (old.index != widget.index && _pointer == null) {
      if (_to != _span(widget.index)) _popIndex = widget.index;
      _travelTo(_span(widget.index));
    }
  }

  @override
  void dispose() {
    _c.dispose();
    _lift.dispose();
    super.dispose();
  }

  // ── Touch ─────────────────────────────────────────────────────────────

  /// Tab position (in tab units, centre of the lens) under a finger.
  double _centreAt(double dx) => ((dx - _pad) / _tab).clamp(0.5, _n - 0.5);

  void _setHover(int i) {
    if (i == _hover) return;
    // A tick for every tab the finger enters, including the first one if
    // it isn't the current tab.
    if (_hover != null || i != widget.index) HapticFeedback.selectionClick();
    _hover = i;
  }

  void _onDown(PointerDownEvent e) {
    if (_pointer != null) return;
    _pointer = e.pointer;
    _downX = e.localPosition.dx;
    _dragging = false;
    _hover = null;
    final i = _centreAt(_downX).floor().clamp(0, _n - 1);
    _setHover(i);
    _lift.animateTo(1, duration: VMotion.fast, curve: VMotion.out);
    _travelTo(_span(i));
  }

  void _onMove(PointerMoveEvent e) {
    if (e.pointer != _pointer) return;
    final dx = e.localPosition.dx;
    if (!_dragging && (dx - _downX).abs() < kTouchSlop / 2) return;
    _dragging = true;
    final c = _centreAt(dx);
    _setHover(c.floor().clamp(0, _n - 1));
    final target = (c - 0.5, c + 0.5);
    if (_c.isAnimating) {
      _to = target; // still catching up with the finger: keep chasing it
    } else {
      setState(() => _from = _to = target); // 1:1 with the finger
    }
  }

  void _onUp(PointerUpEvent e) {
    if (e.pointer != _pointer) return;
    final i = _hover ?? widget.index;
    _release(i);
    widget.onTap(i);
  }

  void _onCancel(PointerCancelEvent e) {
    if (e.pointer != _pointer) return;
    _release(widget.index);
  }

  void _release(int i) {
    _pointer = null;
    _hover = null;
    _dragging = false;
    if (i != widget.index) _popIndex = i;
    // Drop back into the bar; the overshoot below 0 is the wobble.
    if (_reduce) {
      _lift.value = 0;
    } else {
      _lift.animateTo(0, duration: const Duration(milliseconds: 460), curve: VMotion.jelly);
    }
    _travelTo(_span(i));
  }

  // ── Paint ─────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        _tab = (box.maxWidth - _pad * 2) / _n;
        final tab = _tab;
        return Listener(
          behavior: HitTestBehavior.opaque,
          onPointerDown: _onDown,
          onPointerMove: _onMove,
          onPointerUp: _onUp,
          onPointerCancel: _onCancel,
          child: AnimatedBuilder(
            animation: Listenable.merge([_c, _lift]),
            builder: (context, _) {
              final (l, r) = _lens;
              final lift = _lift.value;
              final up = lift.clamp(0.0, 1.0);
              final travelling = _c.isAnimating && !_reduce;
              // Swell in flight (only when no finger is holding it up).
              final swell = travelling && _pointer == null ? 0.07 * math.sin(math.pi * _t) : 0.0;
              final grow = _reduce ? 0.0 : lift;
              final sx = 1 + 0.14 * grow + swell;
              final sy = 1 + 0.30 * grow + swell;
              // A tab is "on" as much as the lens covers it.
              double cover(int i) => (math.min(r, i + 1.0) - math.max(l, i.toDouble())).clamp(0.0, 1.0);
              final popT = (_t / 0.6).clamp(0.0, 1.0);
              final pop = 1 + 0.14 * math.sin(math.pi * popT);
              return Stack(
                clipBehavior: Clip.none,
                children: [
                  Positioned(
                    left: _pad + l * tab,
                    width: math.max(0, (r - l) * tab),
                    top: _pad,
                    bottom: _pad,
                    child: Transform(
                      alignment: Alignment.center,
                      transform: Matrix4.diagonal3Values(sx, sy, 1),
                      child: _Lens(lift: up),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: _pad),
                    child: Row(
                      children: [
                        for (var i = 0; i < _n; i++)
                          Expanded(
                            child: _DockTab(
                              item: widget.items[i],
                              on: VMotion.out.transform(cover(i)),
                              selected: i == widget.index,
                              // Bounce on the newly picked tab; magnify
                              // whatever sits under a lifted lens.
                              scale: (i == _popIndex && travelling && _pointer == null ? pop : 1) * (1 + (_reduce ? 0 : 0.12) * up * cover(i)),
                              onActivate: () => widget.onTap(i),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }
}

/// The selection lens: clear glass, a touch brighter than the bar. Lifted,
/// it turns clearer in the middle and its rim lights up.
class _Lens extends StatelessWidget {
  const _Lens({required this.lift});
  final double lift;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(V.dockHeight / 2);
    return CustomPaint(
      foregroundPainter: _GlassRim(strength: 0.8 + 0.7 * lift),
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: radius,
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color.lerp(V.dockLensTop, V.dockLensLiftTop, lift)!,
              Color.lerp(V.dockLens, V.dockLensLift, lift)!,
            ],
          ),
        ),
      ),
    );
  }
}

/// A lit glass edge: bright across the top, fading down the sides, a faint
/// return along the bottom.
class _GlassRim extends CustomPainter {
  const _GlassRim({required this.strength});
  final double strength;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final rrect = RRect.fromRectAndRadius(rect.deflate(0.5), Radius.circular(size.height / 2));
    double a(double v) => (v * strength).clamp(0.0, 1.0);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Colors.white.withValues(alpha: a(0.30)), Colors.white.withValues(alpha: a(0.06)), Colors.white.withValues(alpha: a(0.12))],
        stops: const [0, 0.5, 1],
      ).createShader(rect);
    canvas.drawRRect(rrect, paint);
  }

  @override
  bool shouldRepaint(_GlassRim old) => old.strength != strength;
}

/// One tab: icon over label. Touch is handled by the bar; this handles
/// keyboard focus and the screen reader.
class _DockTab extends StatefulWidget {
  const _DockTab({required this.item, required this.on, required this.selected, required this.scale, required this.onActivate});
  final VibeDockItem item;

  /// 0 = idle, 1 = under the lens; in between while it slides.
  final double on;
  final bool selected;
  final double scale;
  final VoidCallback onActivate;

  @override
  State<_DockTab> createState() => _DockTabState();
}

class _DockTabState extends State<_DockTab> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final it = widget.item;
    final color = Color.lerp(V.text, V.pinkSoft, widget.on)!;

    final content = Transform.scale(
      scale: widget.scale,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Icon(widget.on > 0.5 ? it.activeIcon : it.icon, size: 25, color: color),
              Positioned(left: 15, top: -5, child: _Badge(count: it.badge)),
            ],
          ),
          const SizedBox(height: 3),
          Text(it.label, maxLines: 1, softWrap: false, style: VT.label(10.5, color: color, weight: widget.on > 0.5 ? FontWeight.w600 : FontWeight.w500)),
        ],
      ),
    );

    return Semantics(
      selected: widget.selected,
      button: true,
      inMutuallyExclusiveGroup: true,
      label: it.badge > 0 ? '${it.label}, ${it.badge} new' : it.label,
      excludeSemantics: true,
      onTap: widget.onActivate,
      child: FocusableActionDetector(
        actions: {ActivateIntent: CallbackAction<ActivateIntent>(onInvoke: (_) => widget.onActivate())},
        onShowFocusHighlight: (v) => setState(() => _focused = v),
        child: DecoratedBox(
          decoration: ShapeDecoration(
            shape: StadiumBorder(side: _focused ? BorderSide(color: V.pinkSoft.withValues(alpha: 0.7), width: 1.5) : BorderSide.none),
          ),
          child: Center(child: FittedBox(fit: BoxFit.scaleDown, child: content)),
        ),
      ),
    );
  }
}

/// Unread count, iOS-style: a solid pill on the icon's corner that pops
/// when the number changes.
class _Badge extends StatelessWidget {
  const _Badge({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    final text = count > 99 ? '99+' : '$count';
    return AnimatedSwitcher(
      duration: MediaQuery.of(context).disableAnimations ? Duration.zero : VMotion.base,
      switchInCurve: VMotion.pop,
      switchOutCurve: Curves.easeIn,
      transitionBuilder: (child, a) => ScaleTransition(scale: a, child: child),
      child: count <= 0
          ? const SizedBox.shrink(key: ValueKey('none'))
          : Container(
              key: ValueKey(text),
              constraints: const BoxConstraints(minWidth: 18),
              height: 18,
              padding: const EdgeInsets.symmetric(horizontal: 5),
              alignment: Alignment.center,
              decoration: BoxDecoration(color: V.pink, borderRadius: BorderRadius.circular(9)),
              child: Text(text, style: VT.number(10.5, color: Colors.white, weight: FontWeight.w700)),
            ),
    );
  }
}
