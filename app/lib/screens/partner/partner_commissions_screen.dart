import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../models/partner.dart';
import '../../providers/partner_provider.dart';
import 'partner_widgets.dart';

/// Who joined with your link and what you earned on each: the active-user
/// bonus, a share of each purchase, refunds taken back. Newest first, 20 at
/// a time.
class PartnerCommissionsScreen extends StatefulWidget {
  const PartnerCommissionsScreen({super.key});

  @override
  State<PartnerCommissionsScreen> createState() => _PartnerCommissionsScreenState();
}

class _PartnerCommissionsScreenState extends State<PartnerCommissionsScreen> {
  bool _tried = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final p = context.read<PartnerProvider>();
      if (!p.commissionsLoaded) await p.loadCommissions();
      if (mounted) setState(() => _tried = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final partner = context.watch<PartnerProvider>();
    final items = partner.commissions;
    final holdDays = partner.overview?.terms?.holdDays ?? Economy.affiliateHoldDays;
    return Scaffold(
      appBar: vibeAppBar(context, 'Commissions'),
      body: RefreshIndicator(
        color: V.pink,
        backgroundColor: V.surface,
        onRefresh: () => partner.loadCommissions(),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
          children: [
            if (!partner.commissionsLoaded)
              (_tried && !partner.loadingMore) ? PartnerRetry(text: "Couldn't load your commissions.", onRetry: () => partner.loadCommissions()) : const PartnerSpinner()
            else if (items.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 40),
                child: EmptyState(
                  icon: SolarIconsBold.billList,
                  title: 'Nothing ',
                  accent: 'yet',
                  body: 'You earn when people who joined with your link become active and when they buy.',
                ),
              )
            else ...[
              GroupCard(dividerInset: 16, children: [for (final c in items) PartnerCommissionRow(c: c)]),
              if (partner.hasMoreCommissions) ...[
                const SizedBox(height: 12),
                Center(
                  child: GhostButton(
                    label: partner.loadingMore ? 'Loading…' : 'Show more',
                    height: 40,
                    onTap: partner.loadingMore ? null : () => partner.loadCommissions(more: true),
                  ),
                ),
              ],
            ],
            const SizedBox(height: 16),
            Text(
              'New commissions wait $holdDays days for refunds, then become available to cash out. Names are first names only.',
              textAlign: TextAlign.center,
              style: VT.body(11.5, color: V.muted, height: 1.45),
            ),
          ],
        ),
      ),
    );
  }
}

class PartnerCommissionRow extends StatelessWidget {
  const PartnerCommissionRow({super.key, required this.c});
  final PartnerCommission c;

  @override
  Widget build(BuildContext context) {
    final color = partnerCommissionColor(c.status);
    final when = [
      Fmt.ago(c.createdAt),
      if (c.status == PartnerCommissionStatus.pending && c.availableAt != null) 'available ${Fmt.date(c.availableAt!)}',
    ].join(' · ');
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
                  Text.rich(
                    TextSpan(children: [
                      TextSpan(text: c.userName, style: VT.title(14, weight: FontWeight.w600)),
                      TextSpan(text: ' · ${c.what}', style: VT.body(14, color: V.text2)),
                    ]),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(when, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(11.5, color: V.muted)),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Text(formatUsd(c.usdCents), style: VT.number(14, color: c.negative ? V.bad : V.gold)),
            const SizedBox(width: 10),
            Tag(c.status.label, color: color),
          ],
        ),
      ),
    );
  }
}
