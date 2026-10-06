import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/engagement_provider.dart';
import '../../providers/wallet_provider.dart';
import 'cashout_screen.dart';
import 'store_screen.dart';
import 'wallet_cards.dart';

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
    final tx = wallet.transactions;
    return Scaffold(
      appBar: vibeAppBar(context, 'Wallet'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          Row(
            children: [
              Expanded(
                child: Panel(
                  gradient: const LinearGradient(colors: [Color(0xFF2A2210), V.surface], begin: Alignment.topLeft, end: Alignment.bottomRight),
                  border: V.gold.withValues(alpha: 0.3),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [const CoinIcon(size: 16), const SizedBox(width: 6), Text('Coins', style: VT.label(12))]),
                      const SizedBox(height: 8),
                      Text(Fmt.thousands(wallet.coins), style: VT.number(28, color: V.gold)),
                      const SizedBox(height: 10),
                      GhostButton(label: 'Buy', height: 36, onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StoreScreen(asPage: true)))),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Panel(
                  gradient: const LinearGradient(colors: [Color(0xFF0E2E2B), V.surface], begin: Alignment.topLeft, end: Alignment.bottomRight),
                  border: V.gem.withValues(alpha: 0.3),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [const GemIcon(size: 16), const SizedBox(width: 6), Text('Gems', style: VT.label(12))]),
                      const SizedBox(height: 8),
                      Text(Fmt.thousands(wallet.gems), style: VT.number(28, color: V.gem)),
                      Text('≈ ${Fmt.gemsAsUsd(wallet.gems)}', style: VT.body(11, color: V.text2)),
                      const SizedBox(height: 4),
                      GhostButton(label: 'Cash out', height: 36, onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CashoutScreen()))),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const GemGoalCard(),
          const WeeklyRecapCard(),
          const SectionTitle('History', top: 26),
          if (tx.isEmpty)
            const EmptyState(icon: Icons.receipt_long_rounded, title: 'Nothing yet', body: 'Purchases, gifts, rewards and spends all show up here.')
          else
            for (final t in tx) _TxRow(t: t),
        ],
      ),
    );
  }
}

class _TxRow extends StatelessWidget {
  const _TxRow({required this.t});
  final Transaction t;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (t.kind) {
      TxKind.purchase => (Icons.shopping_bag_rounded, V.gold),
      TxKind.spend => (Icons.remove_circle_outline_rounded, V.text2),
      TxKind.earn => (Icons.add_circle_outline_rounded, V.ok),
      TxKind.gift => (Icons.card_giftcard_rounded, V.pink),
      TxKind.cashout => (Icons.account_balance_rounded, V.gem),
      TxKind.vip => (Icons.workspace_premium_rounded, V.gold),
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Panel(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            Container(width: 36, height: 36, decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(10)), child: Icon(icon, size: 18, color: color)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(t.title, style: VT.body(14, weight: FontWeight.w600)),
                  Text('${Fmt.ago(t.at)}${t.method != null ? ' · ${t.method!.label}' : ''}${t.receipt != null ? ' · ${t.receipt}' : ''}', style: VT.body(11, color: V.muted)),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (t.coins != 0) Text('${t.coins > 0 ? '+' : ''}${Fmt.thousands(t.coins)}', style: VT.title(14, color: t.coins > 0 ? V.ok : V.text)),
                if (t.gems != 0) Text('${t.gems > 0 ? '+' : ''}${Fmt.thousands(t.gems)} gems', style: VT.label(12, color: V.gem)),
                if (t.usd > 0) Text(Fmt.usd(t.usd), style: VT.body(11, color: V.muted)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
