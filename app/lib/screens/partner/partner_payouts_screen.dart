import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../models/partner.dart';
import '../../models/payments.dart';
import '../../providers/partner_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/wallet_provider.dart';
import '../store/payout_account_form.dart';
import 'partner_widgets.dart';

/// Payouts: what's available, the cash-out, and every payout so far.
class PartnerPayoutsScreen extends StatefulWidget {
  const PartnerPayoutsScreen({super.key});

  @override
  State<PartnerPayoutsScreen> createState() => _PartnerPayoutsScreenState();
}

class _PartnerPayoutsScreenState extends State<PartnerPayoutsScreen> {
  bool _tried = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final p = context.read<PartnerProvider>();
      if (!p.payoutsLoaded) await p.loadPayouts();
      if (mounted) setState(() => _tried = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final partner = context.watch<PartnerProvider>();
    final ov = partner.overview;
    final b = ov?.balance;
    final block = ov?.payoutBlock;
    return Scaffold(
      appBar: vibeAppBar(context, 'Payouts'),
      body: RefreshIndicator(
        color: V.pink,
        backgroundColor: V.surface,
        onRefresh: () async {
          await partner.load();
          await partner.loadPayouts();
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
          children: [
            if (b != null)
              Panel(
                border: V.gold.withValues(alpha: 0.3),
                color: V.gold.withValues(alpha: 0.06),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Available', style: VT.label(12)),
                    const SizedBox(height: 4),
                    Text(formatUsd(b.availableUsdCents), style: VT.number(30, color: V.gold)),
                    const SizedBox(height: 2),
                    Text(
                      b.availableUsdCents > 0 ? 'About ${Fmt.pkr(b.availableUsdCents / 100)} at today\'s rate' : 'Commissions become available after the hold.',
                      style: VT.body(12.5, color: V.text2),
                    ),
                    const SizedBox(height: 14),
                    if (block == null)
                      GradientButton(
                        label: 'Cash out ${formatUsd(b.availableUsdCents)}',
                        icon: SolarIconsBold.wallet,
                        gradient: V.goldGrad,
                        foreground: V.onGold,
                        glow: V.gold,
                        onTap: () => requestPartnerPayout(context),
                      )
                    else
                      Text(block, style: VT.body(12.5, color: V.muted, height: 1.4)),
                  ],
                ),
              ),
            const SectionTitle('History'),
            if (!partner.payoutsLoaded)
              _tried ? PartnerRetry(text: "Couldn't load your payouts.", onRetry: partner.loadPayouts) : const PartnerSpinner()
            else if (partner.payouts.isEmpty)
              const EmptyState(icon: SolarIconsOutline.banknote2, title: 'No payouts ', accent: 'yet', body: 'When commissions become available you can cash them out here.')
            else
              for (final p in partner.payouts) Padding(padding: const EdgeInsets.only(bottom: 6), child: PartnerPayoutRow(p: p)),
            const SizedBox(height: 10),
            Text(
              'Paid to your saved cash-out accounts within 3 business days, in rupees at the day\'s rate. One payout at a time.',
              textAlign: TextAlign.center,
              style: VT.body(11.5, color: V.muted, height: 1.45),
            ),
          ],
        ),
      ),
    );
  }
}

class PartnerPayoutRow extends StatelessWidget {
  const PartnerPayoutRow({super.key, required this.p});
  final PartnerPayout p;

  @override
  Widget build(BuildContext context) {
    final sub = [
      p.destination,
      Fmt.ago(p.createdAt),
      if (p.reference != null) 'ref ${p.reference}',
    ].join(' · ');
    return Panel(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(TextSpan(children: [
                  TextSpan(text: formatUsd(p.usdCents), style: VT.title(15)),
                  if (p.amountPkr > 0) TextSpan(text: ' · Rs ${Fmt.thousands(p.amountPkr)}', style: VT.body(12.5, color: V.text2)),
                ])),
                Text(sub, style: VT.body(11.5, color: V.muted)),
                if (p.status == PartnerPayoutStatus.rejected && p.failureReason != null) Text(p.failureReason!, style: VT.body(12, color: V.bad)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Tag(p.status.label, color: partnerPayoutColor(p.status)),
        ],
      ),
    );
  }
}

/// Pick a saved payout account (the same ones gem cash-outs use, add one
/// if there are none) and send the whole available balance. Says where it
/// went; returns the payout, or null when closed.
Future<PartnerPayout?> requestPartnerPayout(BuildContext context) async {
  final available = context.read<PartnerProvider>().overview?.balance?.availableUsdCents ?? 0;
  final p = await showVibeSheet<PartnerPayout>(context, scrollable: true, child: PartnerPayoutSheet(availableUsdCents: available));
  if (p != null && context.mounted) toast(context, '${formatUsd(p.usdCents)} on its way to ${p.destination}');
  return p;
}

class PartnerPayoutSheet extends StatefulWidget {
  const PartnerPayoutSheet({super.key, required this.availableUsdCents});
  final int availableUsdCents;

  @override
  State<PartnerPayoutSheet> createState() => _PartnerPayoutSheetState();
}

class _PartnerPayoutSheetState extends State<PartnerPayoutSheet> {
  String? _selected;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final wallet = context.read<WalletProvider>();
    _selected = wallet.defaultPayoutAccount?.id;
    wallet.loadPayouts().then((_) {
      if (mounted) setState(() => _selected ??= wallet.defaultPayoutAccount?.id);
    }, onError: (Object e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : "Couldn't load your accounts.");
    });
  }

  PayoutAccount? _chosen(WalletProvider w) {
    for (final a in w.payoutAccounts) {
      if (a.id == _selected) return a;
    }
    return w.defaultPayoutAccount;
  }

  Future<void> _add() async {
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

  Future<void> _send() async {
    final account = _chosen(context.read<WalletProvider>());
    if (account == null) {
      setState(() => _error = 'Add an account to send the money to.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final p = await context.read<PartnerProvider>().requestPayout(account);
      if (mounted) Navigator.of(context).pop(p);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = switch (e.code) {
            'AFFILIATE_BELOW_MINIMUM' => 'The minimum is ${formatUsd((e.details['minimumUsdCents'] as num?)?.toInt() ?? Economy.affiliateMinPayoutUsdCents)}.',
            'AFFILIATE_PAYOUT_OPEN' => 'You already have a payout on its way.',
            _ => e.message,
          });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletProvider>();
    final amount = formatUsd(widget.availableUsdCents);
    final chosen = _chosen(wallet);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Cash out $amount', style: VT.title(20)),
          const SizedBox(height: 4),
          Text('About ${Fmt.pkr(widget.availableUsdCents / 100)} at today\'s rate. Paid within 3 business days.', style: VT.body(13, color: V.text2)),
          const SizedBox(height: 18),
          Text('PAY TO', style: VT.overline()),
          const SizedBox(height: 10),
          if (!wallet.payoutsLoaded && _error == null)
            const PartnerSpinner(height: 80)
          else ...[
            for (final a in wallet.payoutAccounts) ...[_account(a, a.id == chosen?.id), const SizedBox(height: 8)],
            Panel(
              onTap: wallet.payoutAccounts.length >= 5 ? null : _add,
              radius: 18,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(children: [
                Container(width: 40, height: 40, decoration: BoxDecoration(color: V.surface2, borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.add_rounded, color: V.text2)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    wallet.payoutAccounts.length >= 5 ? 'Up to 5 accounts — remove one in Cash out' : 'Add JazzCash, Easypaisa or a bank account',
                    style: VT.title(14, weight: FontWeight.w600),
                  ),
                ),
              ]),
            ),
          ],
          if (_error != null) ...[const SizedBox(height: 10), Text(_error!, style: VT.body(13, color: V.bad))],
          const SizedBox(height: 16),
          GradientButton(
            label: 'Cash out $amount',
            gradient: V.goldGrad,
            foreground: V.onGold,
            glow: V.gold,
            busy: _busy,
            onTap: chosen == null ? null : _send,
          ),
        ],
      ),
    );
  }

  Widget _account(PayoutAccount a, bool on) {
    final (icon, color) = switch (a.method) {
      PaymentMethod.jazzCash => (SolarIconsBold.wallet, const Color(0xFFE0245E)),
      PaymentMethod.easypaisa => (SolarIconsBold.wallet, const Color(0xFF3DB54A)),
      _ => (SolarIconsBold.banknote, V.text2),
    };
    return Semantics(
      selected: on,
      button: true,
      child: GestureDetector(
        onTap: () => setState(() => _selected = a.id),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: on ? V.gold.withValues(alpha: 0.08) : V.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: on ? V.gold : V.line, width: on ? 1.5 : 1),
          ),
          child: Row(
            children: [
              Container(width: 40, height: 40, decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)), child: Icon(icon, color: color, size: 20)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${a.method == PaymentMethod.bank ? (a.bankName ?? 'Bank') : a.method.label} · ${a.accountMasked}', overflow: TextOverflow.ellipsis, style: VT.title(14, weight: FontWeight.w600)),
                    Text(a.holderName, style: VT.body(12, color: V.text2)),
                  ],
                ),
              ),
              if (on) const Icon(SolarIconsBold.checkCircle, color: V.gold, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
