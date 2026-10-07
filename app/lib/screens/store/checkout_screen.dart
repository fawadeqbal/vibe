import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../models/payments.dart';
import '../../providers/wallet_provider.dart';
import '../../services/app_services.dart';
import '../../services/payments/checkout_controller.dart';
import '../../services/payments/payment_links.dart';

/// One checkout for coin packs and VIP plans. The methods come from the
/// server (or the offline mock); a [CheckoutController] runs the purchase
/// and this screen draws its stage: method → (wallet details) → approve in
/// the wallet app / hosted page / bank details / store sheet → result.
class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key, this.pack, this.plan, this.controller}) : assert(pack != null || plan != null);
  final CoinPack? pack;
  final VipPlan? plan;

  /// Tests inject one; otherwise built from the providers.
  final CheckoutController? controller;

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> with WidgetsBindingObserver {
  late final CheckoutController _c;
  late final AppServices _services;
  StreamSubscription<PaymentReturn>? _links;
  final _phone = TextEditingController();
  final _cnic = TextEditingController();
  final _otp = TextEditingController();
  final _bankRef = TextEditingController();
  String? _openedFor; // purchase whose hosted page was opened

  double get _usd => widget.pack?.usd ?? widget.plan!.usd;
  String get _title => widget.pack != null ? '${Fmt.coins(widget.pack!.coins)} coins' : 'VIP ${widget.plan!.label.toLowerCase()}';

  @override
  void initState() {
    super.initState();
    _services = context.read<AppServices>();
    _c = widget.controller ??
        CheckoutController(
          backend: context.read<WalletProvider>(),
          billing: _services.billing,
          kind: widget.pack != null ? ProductKind.coinPack : ProductKind.vipPlan,
          productId: widget.pack?.id ?? widget.plan!.id,
          usd: _usd,
          android: _services.android,
          ios: _services.ios,
          storeBuild: _services.config.isStoreBuild,
        );
    _c.addListener(_onChange);
    _links = _services.links.returns.listen((r) {
      unawaited(_services.hosted.closeBrowser());
      _c.onReturn(r);
    });
    WidgetsBinding.instance.addObserver(this);
    if (widget.controller == null || _c.stage == CheckoutStage.loading) unawaited(_c.load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _links?.cancel();
    _c.removeListener(_onChange);
    if (widget.controller == null) _c.dispose();
    _phone.dispose();
    _cnic.dispose();
    _otp.dispose();
    _bankRef.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _c.setVisible(state == AppLifecycleState.resumed);
  }

  void _onChange() {
    if (!mounted) return;
    setState(() {});
    // Entering the hosted-page step opens the page once per purchase.
    final p = _c.purchase;
    if (_c.stage == CheckoutStage.redirect && p != null && _openedFor != p.id) {
      _openedFor = p.id;
      WidgetsBinding.instance.addPostFrameCallback((_) => _openHosted());
    }
  }

  Future<void> _openHosted() async {
    final a = _c.purchase?.action;
    if (a?.url == null || !mounted) return;
    if (a!.post) {
      final back = await _services.hosted.openPost(context, a.url!, a.fields);
      await _c.onReturn(back ?? PaymentReturn(purchaseId: _c.purchase?.id, status: 'closed'));
    } else {
      final ok = await _services.hosted.openGet(a.url!);
      if (!ok && mounted) toast(context, "Couldn't open the payment page", error: true);
    }
  }

  bool get _canLeave => _c.stage != CheckoutStage.processing && !_c.busy;

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _canLeave,
      onPopInvokedWithResult: (didPop, _) {},
      child: Scaffold(
        appBar: vibeAppBar(context, 'Checkout', canGoBack: _canLeave),
        body: SafeArea(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 250),
            child: switch (_c.stage) {
              CheckoutStage.loading => const Center(key: ValueKey('loading'), child: CircularProgressIndicator(color: V.gold)),
              CheckoutStage.methods => _methods(),
              CheckoutStage.details => _details(),
              CheckoutStage.processing => _processing(),
              CheckoutStage.otp => _otpStep(),
              CheckoutStage.approveInApp => _approve(),
              CheckoutStage.redirect => _redirect(),
              CheckoutStage.bankTransfer => _bank(),
              CheckoutStage.succeeded => _done(),
              CheckoutStage.failed || CheckoutStage.expired => _failed(),
            },
          ),
        ),
      ),
    );
  }

  // ── pieces ────────────────────────────────────────────────────────────

  String _priceText() {
    final p = _c.price;
    return p.currency == 'PKR' ? 'Rs ${Fmt.thousands(p.amount.round())}' : Fmt.usd(p.amount);
  }

  Widget _summary() {
    final local = _c.price.currency == 'PKR';
    return Panel(
      gradient: widget.pack != null ? null : V.vipCard,
      border: V.gold.withValues(alpha: 0.3),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: widget.pack != null ? V.gold.withValues(alpha: 0.12) : null, gradient: widget.pack != null ? null : V.goldGrad, borderRadius: BorderRadius.circular(14)),
            child: widget.pack != null ? const Center(child: CoinIcon(size: 26)) : const Icon(SolarIconsBold.crown, color: V.onGoldIcon, size: 26),
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
            children: [
              Text(_priceText(), style: VT.number(18)),
              Text(local ? Fmt.usd(_usd) : '≈ Rs ${Fmt.thousands((_usd * _c.usdToPkr).round())}', style: VT.body(11, color: V.text2)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _methodIcon(PaymentMethod m) {
    final (icon, color) = switch (m) {
      PaymentMethod.googlePlay => (SolarIconsBold.play, V.ok),
      PaymentMethod.appStore => (Icons.apple_rounded, V.text),
      PaymentMethod.jazzCash => (SolarIconsBold.wallet, const Color(0xFFE0245E)),
      PaymentMethod.easypaisa => (SolarIconsBold.wallet, const Color(0xFF3DB54A)),
      PaymentMethod.card => (SolarIconsBold.card, V.violet),
      PaymentMethod.bank => (SolarIconsBold.banknote, V.text2),
    };
    return Container(width: 42, height: 42, decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)), child: Icon(icon, color: color));
  }

  Widget _methods() {
    final remote = context.read<WalletProvider>().isRemote;
    return ListView(
      key: const ValueKey('methods'),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        _summary(),
        const SectionTitle('Pay with', top: 26),
        for (final o in _c.methods) ...[
          Panel(
            onTap: () => _c.choose(o),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                _methodIcon(o.method),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Flexible(child: Text(o.label, style: VT.title(15, weight: FontWeight.w600))),
                        if (remote && !o.live) ...[const SizedBox(width: 8), const Tag('Test', color: V.warn)],
                      ]),
                      Text(o.isLocalCurrency ? '${o.method.hint} Rs ${Fmt.thousands((_usd * _c.usdToPkr).round())}' : o.method.hint, style: VT.body(12, color: V.text2)),
                    ],
                  ),
                ),
                const Icon(SolarIconsOutline.altArrowRight, color: V.muted),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
        const SizedBox(height: 8),
        Text(remote ? 'Payments are processed by the Vibe server; store receipts are verified there.' : 'Offline demo: no money moves.', style: VT.body(11, color: V.muted), textAlign: TextAlign.center),
      ],
    );
  }

  Widget _methodHeader() {
    final m = _c.method!;
    return Row(children: [_methodIcon(m.method), const SizedBox(width: 12), Expanded(child: Text(m.label, style: VT.title(17)))]);
  }

  Widget _errorLine() => _c.error == null ? const SizedBox.shrink() : Padding(padding: const EdgeInsets.only(top: 12), child: Text(_c.error!, style: VT.body(13, color: V.bad)));

  Widget _details() {
    final m = _c.method!;
    final cnic = m.needs.contains('cnicLast6');
    return ListView(
      key: const ValueKey('details'),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        _summary(),
        const SizedBox(height: 18),
        _methodHeader(),
        const SizedBox(height: 16),
        Text('${m.label} number', style: VT.label(13)),
        const SizedBox(height: 8),
        TextField(key: const ValueKey('phone'), controller: _phone, keyboardType: TextInputType.phone, autofillHints: const [AutofillHints.telephoneNumber], decoration: const InputDecoration(hintText: '03xx xxxxxxx')),
        if (cnic) ...[
          const SizedBox(height: 14),
          Text('Last 6 digits of your CNIC', style: VT.label(13)),
          const SizedBox(height: 8),
          TextField(
            key: const ValueKey('cnic'),
            controller: _cnic,
            keyboardType: TextInputType.number,
            maxLength: 6,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(hintText: '123456', counterText: ''),
          ),
          const SizedBox(height: 4),
          Text('JazzCash asks for these to send the payment request to your phone.', style: VT.body(11, color: V.muted)),
        ],
        _errorLine(),
        const SizedBox(height: 22),
        GradientButton(label: 'Pay ${_priceText()}', busy: _c.busy, onTap: () => _c.submitDetails(phone: _phone.text, cnicLast6: _cnic.text)),
        if (m.method == PaymentMethod.jazzCash) ...[
          const SizedBox(height: 8),
          TextButton(onPressed: _c.payOnProviderPage, child: Text('Pay on the JazzCash page instead', style: VT.label(13, color: V.text2))),
        ],
        TextButton(onPressed: _c.chooseAnother, child: Text('Choose another method', style: VT.label(13, color: V.text2))),
      ],
    );
  }

  Widget _processing() {
    final label = _c.method?.label ?? 'the payment provider';
    return Center(
      key: const ValueKey('processing'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const PulseRings(size: 160, color: V.gold, child: CircularProgressIndicator(color: V.gold)),
          const SizedBox(height: 8),
          Text('Talking to $label…', style: VT.title(17)),
          const SizedBox(height: 4),
          Text('Do not close the app.', style: VT.body(13, color: V.text2)),
        ],
      ),
    );
  }

  Widget _otpStep() {
    return ListView(
      key: const ValueKey('otp'),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        _summary(),
        const SizedBox(height: 18),
        _methodHeader(),
        const SizedBox(height: 16),
        Text('Enter the code sent to your phone', style: VT.label(13)),
        const SizedBox(height: 8),
        TextField(
          key: const ValueKey('otp'),
          controller: _otp,
          keyboardType: TextInputType.number,
          maxLength: 6,
          autofocus: true,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(hintText: '4-digit code', counterText: ''),
        ),
        if (_c.purchase?.action?.instructions != null) ...[const SizedBox(height: 4), Text(_c.purchase!.action!.instructions!, style: VT.body(11, color: V.muted))],
        _errorLine(),
        const SizedBox(height: 22),
        GradientButton(label: 'Confirm ${_priceText()}', busy: _c.busy, onTap: () => _c.confirmOtp(_otp.text)),
        const SizedBox(height: 8),
        TextButton(onPressed: _c.busy ? null : _c.cancel, child: Text('Cancel payment', style: VT.label(13, color: V.text2))),
      ],
    );
  }

  /// "Approve in your JazzCash app" — live: realtime push + polling.
  Widget _approve() {
    final m = _c.method;
    final store = m?.isStore ?? false;
    final instructions = _c.notice ?? _c.purchase?.action?.instructions ?? 'Open the ${m?.label ?? 'wallet'} app and approve the payment request.';
    return ListView(
      key: const ValueKey('approve'),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        _summary(),
        const SizedBox(height: 28),
        Center(
          child: PulseRings(
            size: 150,
            color: V.gold,
            child: Container(width: 64, height: 64, decoration: BoxDecoration(shape: BoxShape.circle, color: V.gold.withValues(alpha: 0.15)), child: const Icon(SolarIconsBold.smartphone, size: 32, color: V.gold)),
          ),
        ),
        const SizedBox(height: 8),
        Text(store ? 'Waiting for ${m!.label}' : 'Approve in your ${m?.label ?? 'wallet'} app', textAlign: TextAlign.center, style: VT.display(24)),
        const SizedBox(height: 8),
        Text(instructions, textAlign: TextAlign.center, style: VT.body(14, color: V.text2, height: 1.45)),
        if (_c.purchase?.expiresAt != null) ...[
          const SizedBox(height: 8),
          Text('Expires at ${Fmt.time(_c.purchase!.expiresAt!)}', textAlign: TextAlign.center, style: VT.body(12, color: V.muted)),
        ],
        const SizedBox(height: 10),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 1.6, color: V.muted)),
          const SizedBox(width: 8),
          Text('Checking automatically', style: VT.body(12, color: V.muted)),
        ]),
        _errorLine(),
        const SizedBox(height: 26),
        if (_c.purchase != null) GradientButton(label: store ? 'Check again' : "I've approved", busy: _c.busy, onTap: _c.checkNow),
        const SizedBox(height: 8),
        if (store)
          GhostButton(label: 'Close', expand: true, onTap: () => Navigator.of(context).pop(false))
        else
          GhostButton(label: 'Cancel payment', expand: true, onTap: _c.busy ? null : _c.cancel),
      ],
    );
  }

  Widget _redirect() {
    return ListView(
      key: const ValueKey('redirect'),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        _summary(),
        const SizedBox(height: 28),
        const Center(child: Icon(SolarIconsBold.squareArrowRightUp, size: 56, color: V.violet)),
        const SizedBox(height: 12),
        Text('Finish on the secure page', textAlign: TextAlign.center, style: VT.display(24)),
        const SizedBox(height: 8),
        Text(_c.purchase?.action?.instructions ?? 'Complete the payment on the page that opened. You will come back here automatically.', textAlign: TextAlign.center, style: VT.body(14, color: V.text2, height: 1.45)),
        _errorLine(),
        const SizedBox(height: 26),
        GradientButton(label: 'Open payment page', icon: SolarIconsBold.lockKeyhole, onTap: _openHosted),
        const SizedBox(height: 8),
        GhostButton(label: "I've paid", expand: true, onTap: _c.busy ? null : _c.checkNow),
        const SizedBox(height: 8),
        TextButton(onPressed: _c.busy ? null : _c.cancel, child: Text('Cancel payment', style: VT.label(13, color: V.text2))),
      ],
    );
  }

  Widget _bank() {
    final b = _c.purchase?.action?.bank;
    Widget row(String k, String v, {bool copy = true}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            children: [
              SizedBox(width: 92, child: Text(k, style: VT.body(13, color: V.text2))),
              Expanded(child: SelectableText(v, style: VT.body(14, weight: FontWeight.w600))),
              if (copy)
                IconButton(
                  tooltip: 'Copy $k',
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(SolarIconsBold.copy, size: 18, color: V.text2),
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: v));
                    toast(context, '$k copied');
                  },
                ),
            ],
          ),
        );
    return ListView(
      key: const ValueKey('bank'),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        _summary(),
        const SectionTitle('Transfer to', top: 22),
        Panel(
          child: Column(
            children: [
              if (b != null) ...[
                row('Bank', b.bankName, copy: false),
                row('Title', b.accountTitle),
                row('IBAN', b.iban),
                row('Reference', b.reference),
                row('Amount', b.amount),
              ] else
                Text(_c.purchase?.action?.instructions ?? '', style: VT.body(14, color: V.text2)),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Text(b != null ? 'Write the reference ${b.reference} in the transfer note so we can match it.' : '', style: VT.body(12.5, color: V.text2, height: 1.4)),
        const SectionTitle('Already sent it?', top: 22),
        if (_c.bankReferenceSent)
          Row(children: [const Icon(SolarIconsBold.checkCircle, color: V.ok, size: 18), const SizedBox(width: 8), Expanded(child: Text('Thanks — we will match it with your transfer.', style: VT.body(13, color: V.text2)))])
        else ...[
          TextField(key: const ValueKey('bankRef'), controller: _bankRef, decoration: const InputDecoration(hintText: "Your bank's transaction reference (optional)")),
          const SizedBox(height: 10),
          GhostButton(label: 'Send reference', expand: true, onTap: _c.busy ? null : () => _c.sendBankReference(_bankRef.text)),
        ],
        _errorLine(),
        const SizedBox(height: 18),
        Row(children: [
          const Icon(SolarIconsBold.bellBing, size: 16, color: V.gold),
          const SizedBox(width: 8),
          Expanded(child: Text("We'll notify you when the money arrives — usually within a working day.", style: VT.body(12.5, color: V.text2))),
        ]),
        const SizedBox(height: 20),
        GradientButton(label: 'Done', onTap: () => Navigator.of(context).pop(false)),
        TextButton(onPressed: _c.busy ? null : _c.cancel, child: Text('Cancel this transfer', style: VT.label(13, color: V.text2))),
      ],
    );
  }

  Widget _done() {
    final wallet = context.watch<WalletProvider>();
    final p = _c.purchase;
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
            child: Icon(widget.pack != null ? Icons.check_rounded : SolarIconsBold.crown, size: 52, color: V.onGoldIcon),
          ),
          const SizedBox(height: 20),
          Text(widget.pack != null ? 'Coins added' : 'You are VIP', style: VT.display(28), textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text(
            widget.pack != null ? 'Your balance is now ${Fmt.coins(wallet.coins)} coins.' : 'Filters are free, ads are gone, and ${Economy.vipMonthlyBonusCoins} bonus coins just landed.',
            textAlign: TextAlign.center,
            style: VT.body(15, color: V.text2),
          ),
          const SizedBox(height: 24),
          Panel(
            child: Column(
              children: [
                _kv('Item', _title),
                _kv('Paid', '${_priceText()} · ${_c.method?.label ?? p?.method?.label ?? ''}'),
                _kv('Receipt', p?.receipt ?? '—'),
                _kv('Date', Fmt.date(p?.completedAt ?? DateTime.now())),
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
    final expired = _c.stage == CheckoutStage.expired;
    return Padding(
      key: const ValueKey('failed'),
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Spacer(),
          Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(shape: BoxShape.circle, color: (expired ? V.warn : V.bad).withValues(alpha: 0.18)),
            child: Icon(expired ? SolarIconsBold.alarmTurnOff : Icons.close_rounded, size: 52, color: expired ? V.warn : V.bad),
          ),
          const SizedBox(height: 20),
          Text(expired ? 'Payment not completed' : 'Payment did not go through', style: VT.display(26), textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text(_c.error ?? 'Something went wrong.', textAlign: TextAlign.center, style: VT.body(15, color: V.text2)),
          const SizedBox(height: 6),
          Text('Nothing was charged.', textAlign: TextAlign.center, style: VT.body(13, color: V.muted)),
          const Spacer(),
          GradientButton(label: 'Try again', onTap: _c.retry),
          const SizedBox(height: 8),
          if (_c.methods.length > 1) GhostButton(label: 'Choose another method', expand: true, onTap: _c.chooseAnother),
        ],
      ),
    );
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(children: [Text(k, style: VT.body(13, color: V.text2)), const SizedBox(width: 12), Expanded(child: Text(v, textAlign: TextAlign.end, overflow: TextOverflow.ellipsis, style: VT.body(13, weight: FontWeight.w600)))]),
    );
  }
}
