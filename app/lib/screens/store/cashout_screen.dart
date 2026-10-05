import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../models/payments.dart';
import '../../providers/session_provider.dart';
import '../../providers/wallet_provider.dart';
import '../profile/verification_flow.dart';
import 'payout_account_form.dart';

/// Gems → money: saved payout accounts, the request, and its history.
/// Status changes arrive live (`cashout:updated`).
class CashoutScreen extends StatefulWidget {
  const CashoutScreen({super.key});

  @override
  State<CashoutScreen> createState() => _CashoutScreenState();
}

class _CashoutScreenState extends State<CashoutScreen> {
  String? _selected;
  bool _busy = false;
  bool _loading = true;
  String? _loadError;
  Cashout? _done;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final wallet = context.read<WalletProvider>();
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      await wallet.loadPayouts();
    } on ApiException catch (e) {
      _loadError = e.message;
    }
    if (!mounted) return;
    setState(() {
      _loading = false;
      _selected ??= wallet.defaultPayoutAccount?.id;
    });
  }

  Future<void> _addAccount() async {
    final wallet = context.read<WalletProvider>();
    final name = context.read<SessionProvider>().me?.name ?? '';
    final added = await showVibeSheet<PayoutAccount>(
      context,
      scrollable: true,
      child: Builder(
        builder: (sheet) => PayoutAccountForm(
          methods: wallet.payoutMethods,
          initialHolderName: name,
          firstAccount: wallet.payoutAccounts.isEmpty,
          onSubmit: (a) async {
            final account = await wallet.addPayoutAccount(a);
            if (sheet.mounted) Navigator.of(sheet).pop(account);
          },
        ),
      ),
    );
    if (added != null && mounted) setState(() => _selected = added.id);
  }

  Future<void> _accountMenu(PayoutAccount a, String action) async {
    final wallet = context.read<WalletProvider>();
    try {
      if (action == 'default') {
        await wallet.makeDefaultPayoutAccount(a.id);
      } else {
        final ok = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Remove this account?'),
            content: Text('${a.method.label} ${a.accountMasked} will no longer receive cash-outs.'),
            actions: [
              TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Keep', style: TextStyle(color: V.text2))),
              TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Remove', style: TextStyle(color: V.bad))),
            ],
          ),
        );
        if (ok != true) return;
        await wallet.removePayoutAccount(a.id);
        if (_selected == a.id) _selected = wallet.defaultPayoutAccount?.id;
      }
      if (mounted) setState(() {});
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  Future<void> _submit() async {
    final wallet = context.read<WalletProvider>();
    final account = _selected;
    if (account == null) {
      toast(context, 'Add an account to send the money to', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final c = await wallet.requestCashout(gems: wallet.gems, payoutAccountId: account);
      if (mounted) setState(() => _done = c);
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == 'KYC_REQUIRED') {
        await _offerVerification(e);
      } else {
        toast(context, e.message, error: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _offerVerification(ApiException e) async {
    final limit = e.details['limitUsd'];
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Verify to cash out more'),
        content: Text('${e.message}\n\nA quick selfie check${limit is num ? ' lifts the \$${limit.toStringAsFixed(0)} monthly limit' : ''}. It takes a minute.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Not now', style: TextStyle(color: V.text2))),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Verify now')),
        ],
      ),
    );
    if (go == true && mounted) await startSelfieVerification(context);
  }

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletProvider>();
    return Scaffold(
      appBar: vibeAppBar(context, 'Cash out gems'),
      body: _done != null ? _sent(_done!) : _form(wallet),
    );
  }

  Widget _sent(Cashout c) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Spacer(),
          Container(width: 96, height: 96, decoration: const BoxDecoration(shape: BoxShape.circle, gradient: V.gemGrad), child: const Icon(Icons.check_rounded, size: 52, color: V.onGem)),
          const SizedBox(height: 20),
          Text(c.status == CashoutStatus.review ? 'Request received' : 'On its way', style: VT.display(28)),
          const SizedBox(height: 8),
          Text(
            '${_money(c)} to your ${c.method.label} ${c.accountMasked}. ${c.status == CashoutStatus.review ? 'Larger cash-outs get a quick check first; ' : ''}Payouts land within 3 business days. We will notify you.',
            textAlign: TextAlign.center,
            style: VT.body(15, color: V.text2),
          ),
          const Spacer(),
          GradientButton(label: 'Done', gradient: V.gemGrad, foreground: V.onGem, glow: V.gem, onTap: () => Navigator.of(context).pop()),
        ],
      ),
    );
  }

  String _money(Cashout c) => c.amountPkr != null ? 'Rs ${Fmt.thousands(c.amountPkr!)}' : Fmt.usd(c.usd);

  Widget _form(WalletProvider wallet) {
    final can = wallet.canCashOut;
    final estimatePkr = (wallet.gems * Economy.usdPerGem * Economy.pkrPerUsd).floor();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
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
                Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                  Text(Fmt.thousands(wallet.gems), style: VT.number(30, color: V.gem)),
                  const SizedBox(width: 8),
                  Flexible(child: Text('gems ≈ Rs ${Fmt.thousands(estimatePkr)} (${Fmt.gemsAsUsd(wallet.gems)})', style: VT.body(14, color: V.text2))),
                ]),
                const SizedBox(height: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(value: (wallet.gems / Economy.cashoutMinGems).clamp(0, 1).toDouble(), minHeight: 6, backgroundColor: V.surface3, color: V.gem),
                ),
                const SizedBox(height: 6),
                Text(
                  can ? 'You can cash out.' : '${Fmt.thousands(Economy.cashoutMinGems - wallet.gems)} more gems to reach the ${Fmt.thousands(Economy.cashoutMinGems)} minimum (${Fmt.gemsAsUsd(Economy.cashoutMinGems)}).',
                  style: VT.body(12, color: V.text2),
                ),
              ],
            ),
          ),
          const SectionTitle('Pay to'),
          if (_loading && !wallet.payoutsLoaded)
            const Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator(color: V.gem)))
          else if (_loadError != null && !wallet.payoutsLoaded)
            EmptyState(icon: Icons.cloud_off_rounded, title: "Couldn't load your accounts", body: _loadError!, action: GhostButton(label: 'Try again', onTap: _load))
          else ...[
            for (final a in wallet.payoutAccounts) ...[_accountRow(a), const SizedBox(height: 8)],
            Panel(
              onTap: wallet.payoutAccounts.length >= 5 ? null : _addAccount,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(children: [
                Container(width: 40, height: 40, decoration: BoxDecoration(color: V.gem.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.add_rounded, color: V.gem)),
                const SizedBox(width: 14),
                Expanded(child: Text(wallet.payoutAccounts.length >= 5 ? 'Up to 5 accounts — remove one to add another' : 'Add JazzCash, Easypaisa or a bank account', style: VT.title(14, weight: FontWeight.w600))),
              ]),
            ),
          ],
          const SizedBox(height: 20),
          GradientButton(
            label: can ? 'Cash out ${Fmt.thousands(wallet.gems)} gems' : 'Not enough gems yet',
            gradient: V.gemGrad,
            foreground: V.onGem,
            glow: V.gem,
            onTap: can && _selected != null ? _submit : null,
            busy: _busy,
          ),
          const SizedBox(height: 8),
          Text('Paid within 3 business days. Identity check (selfie) above the monthly limit.', textAlign: TextAlign.center, style: VT.body(11.5, color: V.muted)),
          if (wallet.cashouts.isNotEmpty) ...[
            const SectionTitle('Your cash-outs'),
            for (final c in wallet.cashouts) _cashoutRow(c),
          ],
          const SectionTitle('How gems work'),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _line('Someone sends you a gift during a match or chat.'),
                _line('You keep ${(Economy.giftGemShare * 100).round()}% of its coin value as gems.'),
                _line('1 gem = ${Fmt.usd(Economy.usdPerGem)}, paid in rupees at the day\'s rate. Cash out from ${Fmt.thousands(Economy.cashoutMinGems)} gems.'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _accountRow(PayoutAccount a) {
    final on = a.id == _selected;
    final (icon, color) = switch (a.method) {
      PaymentMethod.jazzCash => (Icons.account_balance_wallet_rounded, const Color(0xFFE0245E)),
      PaymentMethod.easypaisa => (Icons.account_balance_wallet_rounded, const Color(0xFF3DB54A)),
      _ => (Icons.account_balance_rounded, V.text2),
    };
    return Semantics(
      selected: on,
      button: true,
      child: GestureDetector(
        onTap: () => setState(() => _selected = a.id),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.fromLTRB(16, 12, 4, 12),
          decoration: BoxDecoration(color: on ? V.gem.withValues(alpha: 0.08) : V.surface, borderRadius: BorderRadius.circular(18), border: Border.all(color: on ? V.gem : V.line, width: on ? 1.5 : 1)),
          child: Row(
            children: [
              Container(width: 40, height: 40, decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)), child: Icon(icon, color: color, size: 20)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Flexible(child: Text('${a.method == PaymentMethod.bank ? (a.bankName ?? 'Bank') : a.method.label} · ${a.accountMasked}', overflow: TextOverflow.ellipsis, style: VT.title(14, weight: FontWeight.w600))),
                      if (a.isDefault) ...[const SizedBox(width: 6), const Tag('Default', color: V.gem)],
                    ]),
                    Text(a.holderName, style: VT.body(12, color: V.text2)),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                tooltip: 'Account options',
                icon: const Icon(Icons.more_vert_rounded, color: V.muted),
                onSelected: (v) => _accountMenu(a, v),
                itemBuilder: (_) => [
                  if (!a.isDefault) const PopupMenuItem(value: 'default', child: Text('Use by default')),
                  const PopupMenuItem(value: 'remove', child: Text('Remove')),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _cashoutRow(Cashout c) {
    final color = switch (c.status) {
      CashoutStatus.paid => V.ok,
      CashoutStatus.rejected => V.bad,
      CashoutStatus.review => V.warn,
      _ => V.gem,
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Panel(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_money(c), style: VT.title(15)),
                  Text('${Fmt.thousands(c.gems)} gems · ${c.method.label} ${c.accountMasked}${c.createdAt != null ? ' · ${Fmt.ago(c.createdAt!)}' : ''}', style: VT.body(11.5, color: V.muted)),
                  if (c.status == CashoutStatus.rejected && c.failureReason != null) Text(c.failureReason!, style: VT.body(12, color: V.bad)),
                ],
              ),
            ),
            Tag(c.status.label, color: color),
          ],
        ),
      ),
    );
  }

  Widget _line(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [const Padding(padding: EdgeInsets.only(top: 6), child: Icon(Icons.circle, size: 5, color: V.gem)), const SizedBox(width: 10), Expanded(child: Text(t, style: VT.body(13, color: V.text2)))]),
      );
}
