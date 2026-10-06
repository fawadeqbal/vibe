import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../models/partner.dart';
import '../../providers/partner_provider.dart';
import '../invite/invite_screen.dart';
import 'partner_apply_form.dart';
import 'partner_commissions_screen.dart';
import 'partner_links_screen.dart';
import 'partner_payouts_screen.dart';
import 'partner_stats_screen.dart';
import 'partner_widgets.dart';

/// Me → "Creator partner program", the Invite screen's partner card and
/// the `partner` push: the native partner screen.
void openPartnerScreen(BuildContext context) {
  Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PartnerScreen()));
}

/// The creator partner program: the pitch and the application, the review
/// states, and once approved a short dashboard (your link, earnings and the
/// cash-out) with the rest one tap away: Stats, Links per channel,
/// Commissions, Payouts. Live over `affiliate:updated`.
class PartnerScreen extends StatefulWidget {
  const PartnerScreen({super.key});

  @override
  State<PartnerScreen> createState() => _PartnerScreenState();
}

class _PartnerScreenState extends State<PartnerScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<PartnerProvider>().refreshAll();
    });
  }

  @override
  Widget build(BuildContext context) {
    final partner = context.watch<PartnerProvider>();
    final ov = partner.overview;
    return Scaffold(
      appBar: vibeAppBar(context, 'Creator partners'),
      body: ov == null
          ? (partner.error != null && !partner.loading
              ? EmptyState(
                  icon: Icons.cloud_off_rounded,
                  title: "Couldn't load the program",
                  body: partner.error!.message,
                  action: GhostButton(label: 'Try again', onTap: partner.refreshAll),
                )
              : const Center(child: CircularProgressIndicator(color: V.text2)))
          : RefreshIndicator(
              color: V.pink,
              backgroundColor: V.surface,
              onRefresh: partner.refreshAll,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
                children: [
                  ...switch (ov.status) {
                    PartnerStatus.none => [const _Pitch(), const PartnerApplyForm()],
                    PartnerStatus.active => [_Header(terms: ov.terms!), PartnerDashboard(overview: ov)],
                    PartnerStatus.suspended => [_StatusCard(overview: ov), if (ov.hasDashboard) PartnerDashboard(overview: ov)],
                    PartnerStatus.pending || PartnerStatus.rejected => [_StatusCard(overview: ov)],
                  },
                  if (partner is LocalPartnerProvider && partner.demoAction != null) _DemoButton(provider: partner),
                ],
              ),
            ),
    );
  }
}

class _Pitch extends StatelessWidget {
  const _Pitch();

  @override
  Widget build(BuildContext context) {
    final points = [
      (Icons.percent_rounded, '${Economy.affiliateRevSharePercent}% of what the people you bring spend, for ${Economy.affiliateCommissionMonths} months'),
      (Icons.how_to_reg_rounded, '${formatUsd(Economy.affiliateCpaUsdCents)} for every person who becomes active'),
      (Icons.insights_rounded, 'Your own code, links per channel and live stats'),
      (Icons.account_balance_wallet_rounded, 'Paid to JazzCash, Easypaisa or your bank from ${formatUsd(Economy.affiliateMinPayoutUsdCents)}'),
    ];
    return Panel(
      radius: 26,
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Tag('For TikTok, YouTube and Instagram creators', color: V.lavender, icon: Icons.campaign_rounded),
          ),
          const SizedBox(height: 12),
          const Headline('Get paid for the people ', accent: 'you bring', size: 28, accentColor: V.pinkSoft),
          const SizedBox(height: 14),
          for (final (icon, text) in points)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(padding: const EdgeInsets.only(top: 1), child: Icon(icon, size: 18, color: V.gold)),
                  const SizedBox(width: 10),
                  Expanded(child: Text(text, style: VT.body(13.5, color: V.text2, height: 1.4))),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.terms});
  final PartnerTerms terms;

  @override
  Widget build(BuildContext context) {
    return Panel(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: V.violet.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(14)),
            child: const Icon(Icons.campaign_rounded, color: V.lavender),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(terms.displayName, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.title(16)),
                const SizedBox(height: 2),
                Text('${terms.revSharePercent}% share · ${formatUsd(terms.cpaUsdCents)} per active user', style: VT.body(12, color: V.text2)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          const Tag('Active', color: V.ok, icon: Icons.check_rounded),
        ],
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.overview});
  final PartnerOverview overview;

  @override
  Widget build(BuildContext context) {
    final (IconData icon, Color color, String title, String body) = switch (overview.status) {
      PartnerStatus.rejected => (Icons.do_not_disturb_on_rounded, V.bad, 'Not this time', "Your application wasn't approved. You can still invite friends and earn coins."),
      PartnerStatus.suspended => (Icons.pause_circle_rounded, V.warn, 'Your partner account is paused', 'New commissions are on hold and payouts are paused. Contact support if you think this is a mistake.'),
      _ => (Icons.hourglass_top_rounded, V.gold, "We're reviewing your application", "We look at every channel by hand. You'll get a notification when it's decided — usually within a few days."),
    };
    final t = overview.terms;
    final facts = [
      if (t != null) ('Code', t.code, true),
      if (t != null) ('Name', t.displayName, false),
      if (t?.appliedAt != null) ('Applied', Fmt.date(t!.appliedAt!), false),
    ];
    return Panel(
      radius: 24,
      border: color.withValues(alpha: 0.3),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(16)),
            child: Icon(icon, size: 26, color: color),
          ),
          const SizedBox(height: 16),
          Semantics(header: true, child: Text(title, style: VT.title(21))),
          const SizedBox(height: 6),
          Text(body, style: VT.body(14, color: V.text2, height: 1.5)),
          if (t?.decisionReason != null && overview.status != PartnerStatus.pending) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(color: V.surface2, borderRadius: BorderRadius.circular(14)),
              child: Text.rich(TextSpan(children: [
                TextSpan(text: 'Reason: ', style: VT.body(13, color: V.muted)),
                TextSpan(text: t!.decisionReason, style: VT.body(13)),
              ])),
            ),
          ],
          if (facts.isNotEmpty) ...[
            const SizedBox(height: 14),
            Wrap(
              spacing: 18,
              runSpacing: 6,
              children: [
                for (final (label, value, mono) in facts)
                  Text.rich(TextSpan(children: [
                    TextSpan(text: '$label ', style: VT.body(12.5, color: V.muted)),
                    TextSpan(text: value, style: mono ? VT.mono(12.5, color: V.text) : VT.body(12.5)),
                  ])),
              ],
            ),
          ],
          if (overview.status == PartnerStatus.rejected) ...[
            const SizedBox(height: 18),
            GhostButton(
              label: 'Invite friends instead',
              icon: Icons.group_add_rounded,
              expand: true,
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const InviteScreen())),
            ),
          ],
        ],
      ),
    );
  }
}

/// ACTIVE (and SUSPENDED, read-only): your link and earnings up front, the
/// rest behind menu rows that open their own screens.
class PartnerDashboard extends StatelessWidget {
  const PartnerDashboard({super.key, required this.overview});
  final PartnerOverview overview;

  @override
  Widget build(BuildContext context) {
    final partner = context.watch<PartnerProvider>();
    final t = overview.terms!;
    final b = overview.balance!;
    final active = overview.isActive;
    final block = overview.payoutBlock;
    final stats = partner.stats;
    final open = overview.openPayout;
    void push(Widget screen) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (active) ...[
          const SectionTitle('Your link', top: 22),
          _LinkCard(terms: t),
        ],
        const SectionTitle('Earnings', note: 'USD', top: 26),
        Row(
          children: [
            Expanded(child: PartnerMoneyTile(label: 'Available', cents: b.availableUsdCents, hint: 'Ready to cash out', strong: true)),
            const SizedBox(width: 10),
            Expanded(child: PartnerMoneyTile(label: 'Pending', cents: b.pendingUsdCents, hint: 'Held ${t.holdDays} days')),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(child: PartnerMoneyTile(label: 'Requested', cents: b.requestedUsdCents, hint: 'On its way to you')),
            const SizedBox(width: 10),
            Expanded(child: PartnerMoneyTile(label: 'Paid', cents: b.paidUsdCents, hint: 'All time')),
          ],
        ),
        const SizedBox(height: 12),
        if (block == null)
          // The one primary action here: money, so gold.
          GradientButton(
            label: 'Cash out ${formatUsd(b.availableUsdCents)}',
            icon: Icons.account_balance_wallet_rounded,
            gradient: V.goldGrad,
            foreground: V.onGold,
            glow: V.gold,
            onTap: () => requestPartnerPayout(context),
          )
        else ...[
          const GhostButton(label: 'Cash out', icon: Icons.account_balance_wallet_rounded, expand: true),
          const SizedBox(height: 8),
          Text(block, textAlign: TextAlign.center, style: VT.body(12, color: V.muted, height: 1.4)),
        ],
        const SectionTitle('Your dashboard', top: 26),
        GroupCard(
          children: [
            GroupRow(
              icon: Icons.insights_rounded,
              iconColor: V.lavender,
              iconBg: V.violet.withValues(alpha: 0.14),
              title: 'Stats',
              subtitle: stats == null
                  ? 'Clicks, sign-ups, active users and earnings'
                  : 'Last ${stats.days} days · ${Fmt.thousands(stats.totals.clicks)} clicks · ${Fmt.thousands(stats.totals.signups)} sign-ups',
              trailing: const Icon(Icons.chevron_right_rounded, color: V.muted),
              onTap: () => push(const PartnerStatsScreen()),
            ),
            if (active)
              GroupRow(
                icon: Icons.link_rounded,
                title: 'Links per channel',
                subtitle: 'A link for TikTok, YouTube, Instagram… so stats show where people came from',
                trailing: const Icon(Icons.chevron_right_rounded, color: V.muted),
                onTap: () => push(const PartnerLinksScreen()),
              ),
            GroupRow(
              icon: Icons.receipt_long_rounded,
              title: 'Commissions',
              subtitle: !partner.commissionsLoaded
                  ? 'Who joined with your link and what you earned'
                  : partner.commissions.isEmpty
                      ? 'Nothing yet'
                      : 'Latest: ${partner.commissions.first.userName} · ${formatUsd(partner.commissions.first.usdCents)}',
              trailing: const Icon(Icons.chevron_right_rounded, color: V.muted),
              onTap: () => push(const PartnerCommissionsScreen()),
            ),
            GroupRow(
              icon: Icons.payments_rounded,
              iconColor: V.gold,
              iconBg: V.gold.withValues(alpha: 0.12),
              title: 'Payouts',
              subtitle: open != null
                  ? '${formatUsd(open.usdCents)} on its way to ${open.destination}'
                  : partner.payoutsLoaded && partner.payouts.isNotEmpty
                      ? '${partner.payouts.length} ${partner.payouts.length == 1 ? 'payout' : 'payouts'} · ${formatUsd(b.paidUsdCents)} paid'
                      : 'To JazzCash, Easypaisa or your bank',
              trailing: const Icon(Icons.chevron_right_rounded, color: V.muted),
              onTap: () => push(const PartnerPayoutsScreen()),
            ),
            GroupRow(
              icon: Icons.description_outlined,
              title: 'Your terms',
              subtitle: '${t.revSharePercent}% for ${t.commissionMonths} months · ${formatUsd(t.cpaUsdCents)} per active user',
              trailing: const Icon(Icons.chevron_right_rounded, color: V.muted),
              onTap: () => showPartnerTerms(context, t),
            ),
          ],
        ),
      ],
    );
  }
}

/// Your code and plain link, with copy and share.
class _LinkCard extends StatelessWidget {
  const _LinkCard({required this.terms});
  final PartnerTerms terms;

  @override
  Widget build(BuildContext context) {
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text('YOUR CODE', style: VT.overline()),
              const SizedBox(width: 12),
              Expanded(child: Text(terms.code, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.mono(18, color: V.text, weight: FontWeight.w600))),
              IconButton(
                tooltip: 'Copy code',
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.copy_rounded, size: 18, color: V.text2),
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: terms.code));
                  if (context.mounted) toast(context, 'Code copied');
                },
              ),
            ],
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(color: V.surface2, borderRadius: BorderRadius.circular(14)),
            child: Text(bareLink(terms.link), style: VT.mono(13, color: V.text)),
          ),
          const SizedBox(height: 12),
          PartnerLinkActions(url: terms.link, height: 46),
        ],
      ),
    );
  }
}

/// Your terms, in a sheet.
Future<void> showPartnerTerms(BuildContext context, PartnerTerms t) {
  Widget term(IconData icon, String title, String body) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(padding: const EdgeInsets.only(top: 2), child: Icon(icon, size: 20, color: V.text2)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: VT.title(14, weight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(body, style: VT.body(12.5, color: V.text2, height: 1.4)),
                ],
              ),
            ),
          ],
        ),
      );
  return showVibeSheet<void>(
    context,
    scrollable: true,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Your terms', style: VT.title(20)),
          const SizedBox(height: 14),
          GroupCard(
            dividerInset: 48,
            children: [
              term(Icons.percent_rounded, '${t.revSharePercent}% of what your users spend', 'For ${t.commissionMonths} months after they join. Store fees come off first for Google Play purchases.'),
              term(Icons.how_to_reg_rounded, '${formatUsd(t.cpaUsdCents)} per active user', 'When someone you brought verifies and has their first calls.'),
              term(Icons.schedule_rounded, '${t.holdDays}-day hold · ${formatUsd(t.minPayoutUsdCents)} minimum', 'Commissions wait out refunds, then become available.'),
            ],
          ),
        ],
      ),
    ),
  );
}

class _DemoButton extends StatelessWidget {
  const _DemoButton({required this.provider});
  final LocalPartnerProvider provider;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Center(
        child: TextButton.icon(
          onPressed: () async {
            final notice = await provider.advanceDemo();
            if (notice != null && context.mounted) toast(context, notice);
          },
          icon: const Icon(Icons.fast_forward_rounded, size: 18, color: V.muted),
          label: Text(provider.demoAction ?? '', style: VT.label(12.5, color: V.muted, weight: FontWeight.w500)),
        ),
      ),
    );
  }
}
