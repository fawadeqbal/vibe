import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/wallet_provider.dart';
import 'store_screen.dart';

/// Balances, the ledger, and cashing gems out.
class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

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

/// Gems → money. Threshold, method, account, confirmation.
class CashoutScreen extends StatefulWidget {
  const CashoutScreen({super.key});

  @override
  State<CashoutScreen> createState() => _CashoutScreenState();
}

class _CashoutScreenState extends State<CashoutScreen> {
  PaymentMethod _method = PaymentMethod.jazzCash;
  final _account = TextEditingController();
  bool _busy = false;
  bool _done = false;
  int _gems = 0;

  @override
  void initState() {
    super.initState();
    _gems = context.read<WalletProvider>().gems;
  }

  @override
  void dispose() {
    _account.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final wallet = context.read<WalletProvider>();
    if (_account.text.trim().length < 6) {
      toast(context, 'Enter the account or number to pay to', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await wallet.cashOut(_gems, _method, _account.text.trim());
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      toast(context, e.message, error: true);
      return;
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _done = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletProvider>();
    final can = wallet.canCashOut;
    return Scaffold(
      appBar: vibeAppBar(context, 'Cash out gems'),
      body: _done
          ? Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  const Spacer(),
                  Container(width: 96, height: 96, decoration: const BoxDecoration(shape: BoxShape.circle, gradient: V.gemGrad), child: const Icon(Icons.check_rounded, size: 52, color: V.onGem)),
                  const SizedBox(height: 20),
                  Text('Request received', style: VT.display(28)),
                  const SizedBox(height: 8),
                  Text('${Fmt.gemsAsUsd(_gems)} is on its way to your ${_method.label}. Payouts land within 3 business days.', textAlign: TextAlign.center, style: VT.body(15, color: V.text2)),
                  const Spacer(),
                  GradientButton(label: 'Done', onTap: () => Navigator.of(context).pop()),
                ],
              ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                Panel(
                  gradient: const LinearGradient(colors: [Color(0xFF0E2E2B), V.surface], begin: Alignment.topLeft, end: Alignment.bottomRight),
                  border: V.gem.withValues(alpha: 0.3),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Available', style: VT.label(12)),
                      const SizedBox(height: 4),
                      Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [Text(Fmt.thousands(wallet.gems), style: VT.number(30, color: V.gem)), const SizedBox(width: 8), Text('gems = ${Fmt.gemsAsUsd(wallet.gems)}', style: VT.body(14, color: V.text2))]),
                      const SizedBox(height: 10),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(value: (wallet.gems / Economy.cashoutMinGems).clamp(0, 1).toDouble(), minHeight: 6, backgroundColor: V.surface3, color: V.gem),
                      ),
                      const SizedBox(height: 6),
                      Text(can ? 'You can cash out.' : '${Fmt.thousands(Economy.cashoutMinGems - wallet.gems)} more gems to reach the ${Fmt.thousands(Economy.cashoutMinGems)} minimum (${Fmt.gemsAsUsd(Economy.cashoutMinGems)}).', style: VT.body(12, color: V.text2)),
                    ],
                  ),
                ),
                const SectionTitle('How gems work'),
                Panel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _line('Someone sends you a gift during a match or chat.'),
                      _line('You keep ${(Economy.giftGemShare * 100).round()}% of its coin value as gems.'),
                      _line('1 gem = ${Fmt.usd(Economy.usdPerGem)}. Cash out from ${Fmt.thousands(Economy.cashoutMinGems)} gems.'),
                      _line('Paid within 3 business days. Identity check once above \$100 a month.'),
                    ],
                  ),
                ),
                const SectionTitle('Pay to'),
                Row(
                  children: [
                    for (final m in [PaymentMethod.jazzCash, PaymentMethod.easypaisa, PaymentMethod.bank]) ...[
                      Expanded(
                        child: GestureDetector(
                          onTap: () => setState(() => _method = m),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 150),
                            height: 48,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(color: _method == m ? V.gem.withValues(alpha: 0.12) : V.surface2, borderRadius: BorderRadius.circular(16), border: Border.all(color: _method == m ? V.gem : V.lineSoft, width: _method == m ? 1.5 : 1)),
                            child: Text(m == PaymentMethod.bank ? 'Bank' : m.label, style: VT.title(13, weight: FontWeight.w600, color: _method == m ? V.gem : V.text2)),
                          ),
                        ),
                      ),
                      if (m != PaymentMethod.bank) const SizedBox(width: 8),
                    ],
                  ],
                ),
                const SizedBox(height: 12),
                TextField(controller: _account, keyboardType: _method == PaymentMethod.bank ? TextInputType.text : TextInputType.phone, decoration: InputDecoration(hintText: _method == PaymentMethod.bank ? 'IBAN' : '03xx xxxxxxx')),
                const SizedBox(height: 20),
                GradientButton(label: can ? 'Cash out ${Fmt.gemsAsUsd(_gems)}' : 'Not enough gems yet', gradient: V.gemGrad, foreground: V.onGem, glow: V.gem, onTap: can ? _submit : null, busy: _busy),
              ],
            ),
    );
  }

  Widget _line(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [const Padding(padding: EdgeInsets.only(top: 6), child: Icon(Icons.circle, size: 5, color: V.gem)), const SizedBox(width: 10), Expanded(child: Text(t, style: VT.body(13, color: V.text2)))]),
      );
}
