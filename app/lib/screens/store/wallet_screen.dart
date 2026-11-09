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

  String _tab = 'all';

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletProvider>();
    final tx = wallet.transactions.where((t) => _tab == 'coins' ? t.coins != 0 : (_tab == 'gems' ? t.gems != 0 : true)).toList();
    final days = _byDay(tx);
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
          const SectionTitle('History', top: 26, bottom: 10),
          PillTabs(
            value: _tab,
            onChanged: (v) => setState(() => _tab = v),
            tabs: const [('all', 'All'), ('coins', 'Coins'), ('gems', 'Gems')],
          ),
          if (days.isEmpty)
            const EmptyState(icon: SolarIconsBold.billList, title: 'Nothing yet', body: 'Purchases, gifts, rewards and spends all show up here.')
          else
            for (final (label, items) in days) ...[
              Padding(padding: const EdgeInsets.fromLTRB(4, 18, 4, 8), child: Text(label, style: VT.label(12.5, color: V.text2, weight: FontWeight.w600))),
              GroupCard(children: [for (final t in items) _TxRow(t: t)]),
            ],
        ],
      ),
    );
  }
}

/// "Today", "Yesterday", "Mon 2 Nov" — newest first.
List<(String, List<Transaction>)> _byDay(List<Transaction> list) {
  final out = <String, List<Transaction>>{};
  final now = DateTime.now();
  bool same(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (final t in list) {
    final d = t.at.toLocal();
    final label = same(d, now) ? 'Today' : (same(d, now.subtract(const Duration(days: 1))) ? 'Yesterday' : '${wd[d.weekday - 1]} ${d.day} ${mo[d.month - 1]}');
    (out[label] ??= []).add(t);
  }
  return [for (final e in out.entries) (e.key, e.value)];
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

class _TxRow extends StatelessWidget {
  const _TxRow({required this.t});
  final Transaction t;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (t.kind) {
      TxKind.purchase => (SolarIconsBold.bagSmile, V.gold),
      TxKind.spend => (SolarIconsBold.bolt, V.gold),
      TxKind.earn => (SolarIconsBold.playCircle, V.pinkSoft),
      TxKind.gift => (SolarIconsBold.gift, V.gem),
      TxKind.cashout => (SolarIconsBold.banknote, V.gem),
      TxKind.vip => (SolarIconsBold.crown, V.gold),
    };
    final gems = t.coins == 0 && t.gems != 0;
    final v = gems ? t.gems : t.coins;
    final sub = [if (t.method != null) t.method!.label, if (t.usd > 0) Fmt.usdCompact(t.usd), Fmt.time(t.at)].join(' · ');
    return GroupRow(
      icon: icon,
      iconColor: color,
      iconBg: color.withValues(alpha: 0.13),
      title: t.title,
      subtitle: sub,
      trailing: v == 0
          ? null
          : Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('${v > 0 ? '+' : '−'}${Fmt.compact(v.abs())}', style: VT.number(15, color: v > 0 ? V.ok : V.text)),
                Text(gems ? 'gems' : 'coins', style: VT.body(11, color: V.muted)),
              ],
            ),
      onTap: () => _txDetail(context, t, icon, color),
    );
  }
}

void _txDetail(BuildContext context, Transaction t, IconData icon, Color color) {
  final gems = t.coins == 0 && t.gems != 0;
  final v = gems ? t.gems : t.coins;
  Widget fact(String l, String r, {bool mono = false}) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
    child: Row(children: [Expanded(child: Text(l, style: VT.title(15, weight: FontWeight.w600))), Text(r, style: mono ? VT.mono(13, color: V.text2) : VT.body(14, color: V.text2))]),
  );
  showVibeSheet<void>(
    context,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 56, height: 56, decoration: BoxDecoration(color: color.withValues(alpha: 0.13), borderRadius: BorderRadius.circular(18)), child: Icon(icon, size: 30, color: color)),
          const SizedBox(height: 12),
          Text.rich(TextSpan(children: [TextSpan(text: '${v > 0 ? '+' : (v < 0 ? '−' : '')}${Fmt.thousands(v.abs())} '), TextSpan(text: gems ? 'gems' : 'coins', style: VT.body(16, color: V.text2))]), style: VT.number(34)),
          Text(t.title, style: VT.body(14, color: V.text2)),
          const SizedBox(height: 16),
          GroupCard(
            dividerInset: 16,
            children: [
              fact('When', '${Fmt.date(t.at)}, ${Fmt.time(t.at)}'),
              if (t.method != null) fact('Paid with', t.method!.label),
              if (t.usd > 0) fact('Amount', Fmt.usdCompact(t.usd)),
              fact('Reference', t.receipt ?? t.id.substring(t.id.length > 8 ? t.id.length - 8 : 0).toUpperCase(), mono: true),
            ],
          ),
        ],
      ),
    ),
  );
}
