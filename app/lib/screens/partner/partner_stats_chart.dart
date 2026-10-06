import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme/vibe_theme.dart';
import '../../models/partner.dart';

/// One measure at a time as columns (one axis, no legend: the chips above
/// name it). Money is gold, counts violet. Columns ≤ 24 px with a 4 px
/// rounded cap, hairline grid at 0, half and top. Tap or drag across to
/// read a column. 90 days are drawn as weekly columns.
class PartnerStatsChart extends StatefulWidget {
  const PartnerStatsChart({super.key, required this.daily, required this.metric, required this.days});
  final List<PartnerStatsDay> daily;
  final PartnerMetric metric;
  final int days;

  static const height = 168.0;

  @override
  State<PartnerStatsChart> createState() => _PartnerStatsChartState();
}

class _PartnerStatsChartState extends State<PartnerStatsChart> {
  int? _hover;

  @override
  void didUpdateWidget(PartnerStatsChart old) {
    super.didUpdateWidget(old);
    if (old.metric != widget.metric || old.days != widget.days) _hover = null;
  }

  @override
  Widget build(BuildContext context) {
    final bars = partnerChartBars(widget.daily, widget.metric, widget.days);
    final metric = widget.metric;
    final max = niceMax(bars.fold<int>(0, (m, b) => math.max(m, b.value)), metric.money ? 100 : 4);
    final weekly = widget.days > 30;
    return Semantics(
      label: '${metric.label}, ${weekly ? 'weekly' : 'daily'} for the last ${widget.days} days. '
          '${bars.isEmpty ? '' : 'Latest ${bars.last.label}: ${metric.format(bars.last.value)}. Highest: ${metric.format(bars.fold<int>(0, (m, b) => math.max(m, b.value)))}.'}',
      excludeSemantics: true,
      child: LayoutBuilder(builder: (context, c) {
        final w = c.maxWidth;
        final geo = _Geometry(width: w, count: bars.length);
        int? indexAt(double x) {
          if (bars.isEmpty || geo.slot <= 0) return null;
          return ((x - _Geometry.axisW) / geo.slot).floor().clamp(0, bars.length - 1);
        }

        final hover = _hover != null && _hover! < bars.length ? _hover : null;
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (d) => setState(() => _hover = indexAt(d.localPosition.dx)),
          onHorizontalDragUpdate: (d) => setState(() => _hover = indexAt(d.localPosition.dx)),
          onHorizontalDragEnd: (_) {},
          child: SizedBox(
            width: w,
            height: PartnerStatsChart.height,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned.fill(
                  child: CustomPaint(
                    painter: PartnerBarsPainter(bars: bars, max: max, metric: metric, hover: hover),
                  ),
                ),
                if (hover != null)
                  Positioned(
                    top: 0,
                    left: (geo.center(hover) - 60).clamp(0.0, math.max(0.0, w - 120)),
                    width: 120,
                    child: IgnorePointer(
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: V.surface3,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: V.line),
                            boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 20, offset: Offset(0, 6))],
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(bars[hover].label, maxLines: 1, style: VT.body(11, color: V.text2)),
                              Text(metric.format(bars[hover].value), maxLines: 1, style: VT.number(13)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      }),
    );
  }
}

class _Geometry {
  _Geometry({required this.width, required this.count});
  static const padTop = 10.0;
  static const padBottom = 22.0;
  static const axisW = 40.0;

  final double width;
  final int count;

  double get plotW => math.max(0, width - axisW);
  double get plotH => PartnerStatsChart.height - padTop - padBottom;
  double get slot => count == 0 ? 0 : plotW / count;
  double get barW => math.max(2, math.min(24, slot - 2));
  double center(int i) => axisW + slot * i + slot / 2;
  double y(num v, num max) => padTop + plotH - (v / max) * plotH;
}

/// The chart's drawing (public for tests).
class PartnerBarsPainter extends CustomPainter {
  PartnerBarsPainter({required this.bars, required this.max, required this.metric, this.hover});
  final List<PartnerChartBar> bars;
  final num max;
  final PartnerMetric metric;
  final int? hover;

  @override
  void paint(Canvas canvas, Size size) {
    final g = _Geometry(width: size.width, count: bars.length);
    final grid = Paint()
      ..color = V.line
      ..strokeWidth = 1;
    // Gridlines at 0, half and top; counts skip a half that isn't whole.
    final ticks = <num>[0, max / 2, max].where((t) => metric.money || t == t.roundToDouble()).toList();
    for (final t in ticks) {
      final y = g.y(t, max);
      canvas.drawLine(Offset(_Geometry.axisW, y), Offset(size.width, y), grid);
      _text(canvas, metric.tick(t), Offset(_Geometry.axisW - 8, y), align: TextAlign.right);
    }
    final fill = Paint()..color = metric.money ? V.gold : V.violet;
    final base = _Geometry.padTop + g.plotH;
    for (var i = 0; i < bars.length; i++) {
      final v = bars[i].value;
      if (v <= 0) continue;
      final top = g.y(v, max);
      final h = base - top;
      final r = math.min(4.0, math.min(g.barW / 2, h));
      final x = g.center(i) - g.barW / 2;
      fill.color = (metric.money ? V.gold : V.violet).withValues(alpha: hover == null || hover == i ? 1 : 0.45);
      canvas.drawRRect(
        RRect.fromRectAndCorners(Rect.fromLTWH(x, top, g.barW, h), topLeft: Radius.circular(r), topRight: Radius.circular(r)),
        fill,
      );
    }
    // A few x labels: first, middle, last.
    if (bars.isNotEmpty) {
      final idx = <int>{0, (bars.length - 1) ~/ 2, bars.length - 1};
      for (final i in idx) {
        final align = bars.length > 1 && i == 0
            ? TextAlign.left
            : bars.length > 1 && i == bars.length - 1
                ? TextAlign.right
                : TextAlign.center;
        final cx = g.center(i);
        final x = align == TextAlign.left ? cx - g.slot / 2 : (align == TextAlign.right ? cx + g.slot / 2 : cx);
        _text(canvas, dayLabel(bars[i].to), Offset(x, PartnerStatsChart.height - 11), align: align);
      }
    }
  }

  /// Draws [s] anchored at [at] (vertically centred): right-aligned text ends
  /// at it, left-aligned starts at it, centred straddles it.
  void _text(Canvas canvas, String s, Offset at, {TextAlign align = TextAlign.left}) {
    final tp = TextPainter(text: TextSpan(text: s, style: VT.label(10.5, color: V.muted, weight: FontWeight.w500)), textDirection: TextDirection.ltr)..layout();
    final dx = switch (align) {
      TextAlign.right => at.dx - tp.width,
      TextAlign.center => at.dx - tp.width / 2,
      _ => at.dx,
    };
    tp.paint(canvas, Offset(dx, at.dy - tp.height / 2));
  }

  @override
  bool shouldRepaint(PartnerBarsPainter old) => old.bars != bars || old.max != max || old.metric != metric || old.hover != hover;
}
