import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/engagement_provider.dart';
import '../../providers/wallet_provider.dart';
import 'cashout_screen.dart';
import 'store_screen.dart';
import 'wallet_cards.dart';
import 'wallet_history.dart';

/// Balances, your gem goal, last week's recap (early in the week), the
/// ledger, and cashing gems out.
class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final e = context.read<EngagementProvider>();
      if (e.recap == null && DateTime.now().weekday <= DateTime.wednesday) e.loadRecap();
    });
  }

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletProvider>();
    // The latest few here; See all opens every one, a page at a time (with All · Coins · Gems).
    final tx = wallet.transactions;
    final latest = tx.take(previewCount).toList();
    void push(Widget w) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => w));
    return Scaffold(
      appBar: vibeAppBar(context, 'Wallet', actions: [CircleIconButton(icon: SolarIconsOutline.infoCircle, tooltip: 'How coins and gems work', onTap: () => _howItWorks(context))]),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Panel(
            child: Column(
              children: [
                IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(child: _Balance(icon: const CoinIcon(size: 16), label: 'Coins', color: V.gold, value: wallet.coins, unit: 'coins', sub: 'to spend on calls, gifts, filters')),
                      Container(width: 1, margin: const EdgeInsets.symmetric(horizontal: 14), color: V.lineSoft),
                      Expanded(child: _Balance(icon: const GemIcon(size: 16), label: 'Gems', color: V.gem, value: wallet.gems, unit: 'gems', sub: '≈ ${Fmt.usdCompact(wallet.gems * Economy.usdPerGem)} · from gifts')),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(child: GradientButton(label: 'Buy coins', icon: SolarIconsOutline.addCircle, height: 44, gradient: V.goldGrad, foreground: V.onGold, glow: V.gold, onTap: () => push(const StoreScreen(asPage: true)))),
                    const SizedBox(width: 10),
                    Expanded(child: GradientButton(label: 'Cash out', icon: SolarIconsBold.banknote, height: 44, gradient: V.gemGrad, foreground: const Color(0xFF062A26), glow: V.gem, onTap: () => push(const CashoutScreen()))),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          const GemGoalCard(),
          const WeeklyRecapCard(),
          SectionTitle('History', action: tx.isEmpty ? null : 'See all', onAction: () => push(const WalletHistoryScreen()), top: 26, bottom: 2),
          if (latest.isEmpty)
            const EmptyState(icon: SolarIconsBold.billList, title: 'Nothing yet', body: 'Purchases, gifts, rewards and spends all show up here.')
          else
            ...historyDays(latest),
          if (tx.length > previewCount) SeeAllButton(label: 'See all history', onTap: () => push(const WalletHistoryScreen())),
        ],
      ),
    );
  }
}

class _Balance extends StatelessWidget {
  const _Balance({required this.icon, required this.label, required this.color, required this.value, required this.unit, required this.sub});
  final Widget icon;
  final String label;
  final Color color;
  final int value;
  final String unit;
  final String sub;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [icon, const SizedBox(width: 6), Text(label, style: VT.label(12.5, color: color, weight: FontWeight.w600))]),
        const SizedBox(height: 6),
        Text(Fmt.figure(value), style: VT.number(30), semanticsLabel: '${Fmt.thousands(value)} $unit'),
        const SizedBox(height: 6),
        Text(sub, style: VT.body(12, color: V.text2, height: 1.4)),
      ],
    );
  }
}

void _howItWorks(BuildContext context) {
  showVibeSheet<void>(
    context,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Coins and gems', style: VT.title(18)),
          const SizedBox(height: 12),
          GroupCard(
            children: [
              GroupRow(icon: SolarIconsBold.dollarMinimalistic, iconColor: V.gold, iconBg: V.gold.withValues(alpha: 0.13), title: 'Coins are for spending', subtitle: 'Gifts, filters, boosts and Super Likes. They never expire.'),
              GroupRow(icon: Icons.diamond_rounded, iconColor: V.gem, iconBg: V.gem.withValues(alpha: 0.13), title: 'Gems are what you earn', subtitle: 'People send you gifts; you keep half their value as gems.'),
              GroupRow(icon: SolarIconsBold.banknote, iconColor: V.gem, iconBg: V.gem.withValues(alpha: 0.13), title: 'Cash gems out', subtitle: 'Paid in rupees to JazzCash, Easypaisa or a bank.'),
            ],
          ),
        ],
      ),
    ),
  );
}
