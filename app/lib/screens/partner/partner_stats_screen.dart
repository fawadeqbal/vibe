import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/partner.dart';
import '../../providers/partner_provider.dart';
import 'partner_stats_chart.dart';
import 'partner_widgets.dart';

/// Stats for 7, 30 or 90 days: the totals, one measure as a chart, and
/// where people came from (by channel).
class PartnerStatsScreen extends StatefulWidget {
  const PartnerStatsScreen({super.key});

  @override
  State<PartnerStatsScreen> createState() => _PartnerStatsScreenState();
}

class _PartnerStatsScreenState extends State<PartnerStatsScreen> {
  PartnerMetric _metric = PartnerMetric.clicks;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final p = context.read<PartnerProvider>();
      if (p.stats == null && !p.statsLoading) p.loadStats();
    });
  }

  @override
  Widget build(BuildContext context) {
    final partner = context.watch<PartnerProvider>();
    final stats = partner.stats;
    return Scaffold(
      appBar: vibeAppBar(context, 'Stats'),
      body: RefreshIndicator(
        color: V.pink,
        backgroundColor: V.surface,
        onRefresh: () => partner.loadStats(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
          children: [
            Row(
              children: [
                Expanded(child: Text('PERIOD', style: VT.overline())),
                for (final r in partnerStatsRanges) ...[
                  const SizedBox(width: 4),
                  PartnerChip(label: '$r days', selected: r == partner.range, onTap: () => partner.setRange(r)),
                ],
              ],
            ),
            const SizedBox(height: 12),
            if (stats == null)
              partner.statsLoading ? const PartnerSpinner(height: 260) : PartnerRetry(text: "Couldn't load your stats.", onRetry: () => partner.loadStats())
            else ...[
              Panel(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _grid([
                      PartnerFigure(label: 'Clicks', value: Fmt.thousands(stats.totals.clicks)),
                      PartnerFigure(label: 'Sign-ups', value: Fmt.thousands(stats.totals.signups)),
                      PartnerFigure(label: 'Active users', value: Fmt.thousands(stats.totals.qualified)),
                      PartnerFigure(label: 'Paying users', value: Fmt.thousands(stats.totals.payingUsers)),
                      PartnerFigure(label: 'Their purchases', value: formatUsd(stats.totals.revenueUsdCents)),
                      PartnerFigure(label: 'You earned', value: formatUsd(stats.totals.earnedUsdCents), gold: true),
                    ]),
                    const SizedBox(height: 16),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          for (final m in PartnerMetric.values) ...[
                            PartnerChip(label: m.label, selected: m == _metric, onTap: () => setState(() => _metric = m)),
                            const SizedBox(width: 6),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    PartnerStatsChart(daily: stats.daily, metric: _metric, days: stats.days),
                  ],
                ),
              ),
              if (stats.byChannel.isNotEmpty) ...[
                const SectionTitle('By channel', top: 22),
                GroupCard(
                  dividerInset: 16,
                  children: [for (final c in stats.byChannel) _ChannelRow(c: c)],
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  /// Three per row.
  Widget _grid(List<Widget> cells) {
    return Column(
      children: [
        for (var i = 0; i < cells.length; i += 3) ...[
          if (i > 0) const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var j = i; j < i + 3; j++) ...[
                if (j > i) const SizedBox(width: 10),
                Expanded(child: j < cells.length ? cells[j] : const SizedBox.shrink()),
              ],
            ],
          ),
        ],
      ],
    );
  }
}

class _ChannelRow extends StatelessWidget {
  const _ChannelRow({required this.c});
  final PartnerChannelStats c;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(partnerSourceLabel(c.channel), style: VT.title(14.5, weight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(
                    '${Fmt.thousands(c.clicks)} clicks · ${Fmt.thousands(c.signups)} sign-ups · ${Fmt.thousands(c.qualified)} active',
                    style: VT.body(12, color: V.text2),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Text(formatUsd(c.earnedUsdCents), style: VT.number(14, color: V.gold)),
          ],
        ),
      ),
    );
  }
}
