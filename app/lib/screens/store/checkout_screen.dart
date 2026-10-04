import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/wallet_provider.dart';

/// One checkout for coin packs and VIP plans. Pick a method → (wallet
/// methods: phone + OTP) → processing → receipt. The wallet provider runs it
/// against the Vibe API (server mode) or the offline mock gateway.
class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key, this.pack, this.plan}) : assert(pack != null || plan != null);
  final CoinPack? pack;
  final VipPlan? plan;

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

enum _Stage { method, details, processing, done, failed }

class _CheckoutScreenState extends State<CheckoutScreen> {
  _Stage _stage = _Stage.method;
  PaymentMethod _method = PaymentMethod.googlePlay;
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  final _card = TextEditingController();
  final _expiry = TextEditingController();
  final _cvv = TextEditingController();
  bool _otpSent = false;
  PurchaseOutcome? _pending;
  String? _error;
  String? _receipt;

  /// Bank transfers: instructions shown instead of "coins added".
  String? _note;

  double get _usd => widget.pack?.usd ?? widget.plan!.usd;
  String get _title => widget.pack != null ? '${Fmt.coins(widget.pack!.coins)} coins' : 'VIP ${widget.plan!.label.toLowerCase()}';

  @override
  void dispose() {
    _phone.dispose();
    _otp.dispose();
    _card.dispose();
    _expiry.dispose();
    _cvv.dispose();
    super.dispose();
  }

  void _choose(PaymentMethod m) {
    setState(() {
      _method = m;
      _error = null;
      _stage = m == PaymentMethod.googlePlay || m == PaymentMethod.appStore || m == PaymentMethod.bank ? _Stage.processing : _Stage.details;
    });
    if (_stage == _Stage.processing) _pay();
  }

  /// Starts the charge, or — for wallets that asked for an OTP — confirms it.
  Future<void> _pay() async {
    setState(() {
      _stage = _Stage.processing;
      _error = null;
    });
    final wallet = context.read<WalletProvider>();
    final pending = _pending;
    final outcome = pending != null && _otpSent
        ? await wallet.confirmPurchase(pending, otp: _otp.text.trim(), pack: widget.pack, plan: widget.plan, method: _method, phone: _phone.text)
        : await wallet.startPurchase(pack: widget.pack, plan: widget.plan, method: _method, phone: _phone.text, cardToken: _cardToken());
    if (!mounted) return;
    setState(() {
      switch (outcome.status) {
        case PurchaseStatus.succeeded:
          _receipt = outcome.receipt;
          _stage = _Stage.done;
        case PurchaseStatus.needsOtp:
          _pending = outcome;
          _otpSent = true;
          _stage = _Stage.details;
        case PurchaseStatus.pendingTransfer:
          _receipt = outcome.receipt;
          _note = outcome.message;
          _stage = _Stage.done;
        case PurchaseStatus.failed:
          _error = outcome.message ?? 'Payment did not go through';
          _pending = null;
          _otpSent = false;
          _stage = _Stage.failed;
      }
    });
  }

  /// Stand-in for the card gateway's client SDK, which returns a token —
  /// raw card numbers never reach the Vibe server.
  String? _cardToken() {
    final digits = _card.text.replaceAll(RegExp(r'\D'), '');
    return digits.length == 16 ? 'tok_${digits.substring(12)}' : null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: vibeAppBar(context, 'Checkout', canGoBack: _stage != _Stage.processing),
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          child: switch (_stage) {
            _Stage.method => _methods(),
            _Stage.details => _details(),
            _Stage.processing => _processing(),
            _Stage.done => _done(),
            _Stage.failed => _failed(),
          },
        ),
      ),
    );
  }

  Widget _summary() {
    return Panel(
      gradient: widget.pack != null ? null : V.vipCard,
      border: V.gold.withValues(alpha: 0.3),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: widget.pack != null ? V.gold.withValues(alpha: 0.12) : null, gradient: widget.pack != null ? null : V.goldGrad, borderRadius: BorderRadius.circular(14)),
            child: widget.pack != null ? const Center(child: CoinIcon(size: 26)) : const Icon(Icons.workspace_premium_rounded, color: V.onGoldIcon, size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_title, style: VT.title(16)),
                Text(widget.pack != null ? (widget.pack!.bonusPercent > 0 ? '+${widget.pack!.bonusPercent}% bonus coins' : widget.pack!.name) : 'Renews automatically. Cancel any time.', style: VT.body(12, color: V.text2)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [Text(Fmt.usd(_usd), style: VT.number(18)), Text('≈ ${Fmt.pkr(_usd)}', style: VT.body(11, color: V.text2))],
          ),
        ],
      ),
    );
  }

  Widget _methods() {
    return ListView(
      key: const ValueKey('methods'),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        _summary(),
        const SectionTitle('Pay with', top: 26),
        for (final m in [PaymentMethod.googlePlay, PaymentMethod.jazzCash, PaymentMethod.easypaisa, PaymentMethod.card, PaymentMethod.bank]) ...[
          Panel(
            onTap: () => _choose(m),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                _methodIcon(m),
                const SizedBox(width: 14),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(m.label, style: VT.title(15, weight: FontWeight.w600)), Text(m.hint, style: VT.body(12, color: V.text2))])),
                const Icon(Icons.chevron_right_rounded, color: V.muted),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
        const SizedBox(height: 8),
        Text(
          context.read<WalletProvider>().isRemote
              ? 'Payments are processed by the Vibe server; store receipts are verified there.'
              : 'Offline demo: no money moves.',
          style: VT.body(11, color: V.muted),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _methodIcon(PaymentMethod m) {
    final (icon, color) = switch (m) {
      PaymentMethod.googlePlay => (Icons.play_arrow_rounded, V.ok),
      PaymentMethod.appStore => (Icons.apple_rounded, V.text),
      PaymentMethod.jazzCash => (Icons.account_balance_wallet_rounded, const Color(0xFFE0245E)),
      PaymentMethod.easypaisa => (Icons.account_balance_wallet_rounded, const Color(0xFF3DB54A)),
      PaymentMethod.card => (Icons.credit_card_rounded, V.violet),
      PaymentMethod.bank => (Icons.account_balance_rounded, V.text2),
    };
    return Container(width: 42, height: 42, decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)), child: Icon(icon, color: color));
  }

  Widget _details() {
    final wallet = _method.needsPhone;
    return ListView(
      key: const ValueKey('details'),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        _summary(),
        const SizedBox(height: 18),
        Row(children: [_methodIcon(_method), const SizedBox(width: 12), Text(_method.label, style: VT.title(17))]),
        const SizedBox(height: 16),
        if (wallet) ...[
          Text('${_method.label} number', style: VT.label(13)),
          const SizedBox(height: 8),
          TextField(controller: _phone, keyboardType: TextInputType.phone, enabled: !_otpSent, decoration: const InputDecoration(hintText: '03xx xxxxxxx')),
          if (_otpSent) ...[
            const SizedBox(height: 14),
            Text('Enter the code sent to your phone', style: VT.label(13)),
            const SizedBox(height: 8),
            TextField(controller: _otp, keyboardType: TextInputType.number, maxLength: 4, autofocus: true, decoration: const InputDecoration(hintText: '4-digit code', counterText: '')),
            const SizedBox(height: 4),
            Text('Mock: any 4 digits approve the payment.', style: VT.body(11, color: V.muted)),
          ],
        ] else ...[
          Text('Card number', style: VT.label(13)),
          const SizedBox(height: 8),
          TextField(controller: _card, keyboardType: TextInputType.number, decoration: const InputDecoration(hintText: '4242 4242 4242 4242')),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: TextField(controller: _expiry, keyboardType: TextInputType.datetime, decoration: const InputDecoration(hintText: 'MM/YY'))),
              const SizedBox(width: 12),
              Expanded(child: TextField(controller: _cvv, keyboardType: TextInputType.number, obscureText: true, maxLength: 4, decoration: const InputDecoration(hintText: 'CVV', counterText: ''))),
            ],
          ),
          const SizedBox(height: 4),
          Text('Mock: any 16 digits work. Real cards go through a PCI-compliant gateway, never this app.', style: VT.body(11, color: V.muted)),
        ],
        if (_error != null) ...[const SizedBox(height: 12), Text(_error!, style: VT.body(13, color: V.bad))],
        const SizedBox(height: 22),
        GradientButton(
          label: wallet ? (_otpSent ? 'Confirm ${Fmt.pkr(_usd)}' : 'Send code') : 'Pay ${Fmt.usd(_usd)}',
          onTap: () {
            if (wallet) {
              final digits = _phone.text.replaceAll(RegExp(r'\D'), '');
              if (digits.length < 10) {
                setState(() => _error = 'Enter the full 11-digit number.');
                return;
              }
              if (_otpSent && _otp.text.trim().length != 4) {
                setState(() => _error = 'The code is 4 digits.');
                return;
              }
            } else {
              if (_card.text.replaceAll(RegExp(r'\D'), '').length != 16) {
                setState(() => _error = 'Enter a 16-digit card number.');
                return;
              }
              if (_expiry.text.trim().length < 4 || _cvv.text.trim().length < 3) {
                setState(() => _error = 'Expiry and CVV are required.');
                return;
              }
            }
            _pay();
          },
        ),
        const SizedBox(height: 8),
        TextButton(onPressed: () => setState(() => _stage = _Stage.method), child: Text('Choose another method', style: VT.label(13, color: V.text2))),
      ],
    );
  }

  Widget _processing() {
    return Center(
      key: const ValueKey('processing'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const PulseRings(size: 160, color: V.gold, child: CircularProgressIndicator(color: V.gold)),
          const SizedBox(height: 8),
          Text('Talking to ${_method.label}…', style: VT.title(17)),
          const SizedBox(height: 4),
          Text('Do not close the app.', style: VT.body(13, color: V.text2)),
        ],
      ),
    );
  }

  Widget _done() {
    final wallet = context.watch<WalletProvider>();
    return Padding(
      key: const ValueKey('done'),
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Spacer(),
          Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(shape: BoxShape.circle, gradient: V.goldGrad, boxShadow: [BoxShadow(color: V.gold.withValues(alpha: 0.4), blurRadius: 40)]),
            child: Icon(_note != null ? Icons.schedule_rounded : (widget.pack != null ? Icons.check_rounded : Icons.workspace_premium_rounded), size: 52, color: V.onGoldIcon),
          ),
          const SizedBox(height: 20),
          Text(_note != null ? 'Waiting for your transfer' : (widget.pack != null ? 'Coins added' : 'You are VIP'), style: VT.display(28), textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text(
            _note ?? (widget.pack != null ? 'Your balance is now ${Fmt.coins(wallet.coins)} coins.' : 'Filters are free, ads are gone, and ${Economy.vipMonthlyBonusCoins} bonus coins just landed.'),
            textAlign: TextAlign.center,
            style: VT.body(15, color: V.text2),
          ),
          const SizedBox(height: 24),
          Panel(
            child: Column(
              children: [
                _kv('Item', _title),
                _kv(_note != null ? 'Amount' : 'Paid', '${Fmt.usd(_usd)} · ${_method.label}'),
                _kv('Receipt', _receipt ?? '—'),
                _kv('Date', Fmt.date(DateTime.now())),
              ],
            ),
          ),
          const Spacer(),
          GradientButton(label: 'Done', onTap: () => Navigator.of(context).pop(true)),
        ],
      ),
    );
  }

  Widget _failed() {
    return Padding(
      key: const ValueKey('failed'),
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Spacer(),
          Container(width: 96, height: 96, decoration: BoxDecoration(shape: BoxShape.circle, color: V.bad.withValues(alpha: 0.18)), child: const Icon(Icons.close_rounded, size: 52, color: V.bad)),
          const SizedBox(height: 20),
          Text('Payment did not go through', style: VT.display(26), textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text(_error ?? 'Something went wrong.', textAlign: TextAlign.center, style: VT.body(15, color: V.text2)),
          const Spacer(),
          GradientButton(label: 'Try again', onTap: _pay),
          const SizedBox(height: 8),
          GhostButton(label: 'Choose another method', expand: true, onTap: () => setState(() => _stage = _Stage.method)),
        ],
      ),
    );
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(children: [Text(k, style: VT.body(13, color: V.text2)), const Spacer(), Text(v, style: VT.body(13, weight: FontWeight.w600))]),
    );
  }
}
