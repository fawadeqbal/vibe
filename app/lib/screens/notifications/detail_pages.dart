import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/mock/mock_data.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/activity.dart';
import '../../models/calls.dart';
import '../../models/engagement.dart';
import '../../models/models.dart';
import '../../models/payments.dart';
import '../../providers/activity_provider.dart';
import '../../providers/calls_provider.dart';
import '../../providers/engagement_provider.dart';
import '../../providers/match_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/social_provider.dart';
import '../../providers/wallet_provider.dart';
import '../../services/app_services.dart';
import '../match/call_states.dart' show AppealSheet;
import '../profile/me_sections.dart';
import '../profile/verification_flow.dart';
import '../social/chat_screen.dart';
import '../social/inbox_screen.dart' show TeamAvatar;
import '../store/store_screen.dart';
import '../store/vip_screen.dart';
import '../store/wallet_screen.dart';
import '../profile/user_profile_screen.dart';

// The pages a notification opens when the thing had no page of its own:
// a payment's receipt, a cash-out, Account status, your verification, a
// message from the Vibe team, your week, and your calls with one friend.
// Mirror of the web's features/notifications/*-pages.

const _info = Color(0xFF60A5FA);
String _stamp(DateTime? d) => d == null ? '—' : '${Fmt.date(d)}, ${Fmt.time(d)}';

/// A page with a back button and, optionally, buttons pinned under it.
class _DetailPage extends StatelessWidget {
  const _DetailPage({required this.title, required this.children, this.actions = const []});
  final String title;
  final List<Widget> children;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: vibeAppBar(context, title),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: children),
      bottomNavigationBar: actions.isEmpty
          ? null
          : SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final (i, a) in actions.indexed) ...[if (i > 0) const SizedBox(height: 10), a],
                  ],
                ),
              ),
            ),
    );
  }
}

/// Loads one thing; null = gone (removed or not yours), and the page says so.
class _Loader<T> extends StatefulWidget {
  const _Loader({super.key, required this.title, required this.what, required this.load, required this.builder});
  final String title;
  final String what;
  final Future<T?> Function() load;
  final Widget Function(BuildContext context, T data, VoidCallback reload) builder;

  @override
  State<_Loader<T>> createState() => _LoaderState<T>();
}

class _LoaderState<T> extends State<_Loader<T>> {
  T? _data;
  bool _done = false;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await widget.load();
      if (mounted) {
        setState(() {
          _data = d;
          _done = true;
          _error = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _data = null;
          _done = true;
          _error = e.status != 404 && e.status != 403;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    if (d != null) return widget.builder(context, d, _load);
    return _DetailPage(
      title: widget.title,
      children: [
        if (!_done)
          const Padding(
            padding: EdgeInsets.only(top: 96),
            child: Center(child: CircularProgressIndicator(color: V.pink)),
          )
        else if (_error)
          const EmptyState(icon: SolarIconsOutline.wifiRouter, title: 'Couldn’t load this', body: 'Check your connection and try again.')
        else
          EmptyState(icon: SolarIconsOutline.cloudCross, title: 'Not here any more', body: 'This ${widget.what} was removed or isn’t yours, so there’s nothing to show.'),
      ],
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.icon, required this.color, required this.title, this.sub});
  final IconData icon;
  final Color color;
  final String title;
  final String? sub;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 6),
      child: Column(
        children: [
          Container(
            width: 76,
            height: 76,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color.withValues(alpha: 0.15),
              boxShadow: [BoxShadow(color: color.withValues(alpha: 0.06), spreadRadius: 8)],
            ),
            child: Icon(icon, size: 36, color: color),
          ),
          const SizedBox(height: 18),
          Text(title, textAlign: TextAlign.center, style: VT.title(22)),
          if (sub != null) ...[
            const SizedBox(height: 4),
            Text(
              sub!,
              textAlign: TextAlign.center,
              style: VT.body(13.5, color: V.text2, height: 1.5),
            ),
          ],
        ],
      ),
    );
  }
}

Widget _keyValues(List<(String, Widget)> rows) => Container(
  padding: const EdgeInsets.symmetric(horizontal: 16),
  decoration: BoxDecoration(
    color: V.surface,
    borderRadius: BorderRadius.circular(22),
    border: Border.all(color: V.line),
  ),
  child: Column(
    children: [
      for (final (i, (k, v)) in rows.indexed) ...[
        if (i > 0) const Divider(height: 1, color: V.lineSoft),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Row(
            children: [
              Expanded(
                child: Text(k, style: VT.body(13.5, color: V.text2)),
              ),
              DefaultTextStyle(
                style: VT.body(14, weight: FontWeight.w600),
                child: v,
              ),
            ],
          ),
        ),
      ],
    ],
  ),
);

Widget _text(String s) => Text(s, textAlign: TextAlign.right);

Widget _tag(String text, Color color, [IconData? icon]) => Container(
  height: 26,
  padding: const EdgeInsets.symmetric(horizontal: 10),
  decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(13)),
  child: Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      if (icon != null) ...[Icon(icon, size: 14, color: color), const SizedBox(width: 4)],
      Text(
        text,
        style: VT.label(12.5, color: color, weight: FontWeight.w700),
      ),
    ],
  ),
);

class _Copy extends StatelessWidget {
  const _Copy(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: () {
      Clipboard.setData(ClipboardData(text: text));
      toast(context, 'Copied');
    },
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 160),
          child: Text(text, overflow: TextOverflow.ellipsis),
        ),
        const SizedBox(width: 6),
        const Icon(SolarIconsOutline.copy, size: 15, color: V.muted),
      ],
    ),
  );
}

Widget _label(String t) => Padding(
  padding: const EdgeInsets.fromLTRB(4, 22, 4, 8),
  child: Text(t.toUpperCase(), style: VT.overline()),
);

Widget _note(String text, Color color, {String? bold}) => Container(
  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
  decoration: BoxDecoration(
    color: color.withValues(alpha: 0.08),
    borderRadius: BorderRadius.circular(18),
    border: Border.all(color: color.withValues(alpha: 0.22)),
  ),
  child: Text.rich(
    TextSpan(
      style: VT.body(13.5, height: 1.5),
      children: [
        if (bold != null)
          TextSpan(
            text: '$bold ',
            style: VT.body(13.5, weight: FontWeight.w700),
          ),
        TextSpan(text: text),
      ],
    ),
  ),
);

void _push(BuildContext context, Widget page) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));

// ── Payment ──────────────────────────────────────────────────────────────

/// A payment's receipt: what you bought, what you paid, with what, and its reference.
class PaymentReceiptScreen extends StatelessWidget {
  const PaymentReceiptScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context) {
    return _Loader<PurchaseView>(
      key: ValueKey(id),
      title: 'Payment',
      what: 'payment',
      load: () => context.read<WalletProvider>().purchase(id),
      builder: (context, p, _) {
        final pack = p.productType == ProductKind.coinPack ? MockData.packs.where((x) => x.id == p.productId).firstOrNull : null;
        final plan = p.productType == ProductKind.vipPlan ? MockData.plans.where((x) => x.id == p.productId).firstOrNull : null;
        final item = pack != null ? '${pack.name} · ${Fmt.thousands(pack.coins)} coins' : (plan != null ? 'VIP · ${plan.label}' : (p.productType == ProductKind.vipPlan ? 'VIP' : 'Coins'));
        final ok = p.state == PurchaseState.succeeded;
        final failed = p.state == PurchaseState.failed || p.state == PurchaseState.expired;
        final refunded = p.state == PurchaseState.refunded;
        final amount = p.currency == 'PKR' ? 'Rs ${Fmt.thousands(p.amount.round())}' : Fmt.usd(p.amount);
        final vip = p.productType == ProductKind.vipPlan;
        return _DetailPage(
          title: 'Payment',
          actions: failed
              ? [
                  GradientButton(label: 'Try again', icon: SolarIconsBold.refresh, onTap: () => _push(context, vip ? const VipScreen() : const StoreScreen(asPage: true))),
                  GhostButton(label: 'Pay another way', icon: SolarIconsOutline.card, height: 48, expand: true, onTap: () => _push(context, const StoreScreen(asPage: true))),
                ]
              : [
                  GradientButton(label: 'Open wallet', icon: SolarIconsBold.wallet, onTap: () => _push(context, const WalletScreen())),
                  GhostButton(label: 'Get help with this payment', icon: SolarIconsOutline.headphonesRound, height: 48, expand: true, onTap: () => _push(context, const HelpSectionScreen())),
                ],
          children: [
            if (ok)
              _Hero(
                icon: SolarIconsBold.checkCircle,
                color: V.ok,
                title: 'Payment received',
                sub: '${_stamp(p.completedAt ?? p.createdAt)} · ${vip ? 'your VIP is on' : 'your coins are in your wallet'}',
              )
            else if (failed)
              _Hero(icon: SolarIconsOutline.dangerCircle, color: V.bad, title: 'Payment not completed', sub: '${_stamp(p.createdAt)} · nothing was charged')
            else if (refunded)
              _Hero(icon: SolarIconsBold.refresh, color: V.warn, title: 'Payment refunded', sub: _stamp(p.completedAt ?? p.createdAt))
            else
              const _Hero(icon: SolarIconsBold.clockCircle, color: _info, title: 'Payment in progress', sub: 'We’ll tell you as soon as it goes through.'),
            if (ok && pack != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    const CoinIcon(size: 30),
                    const SizedBox(width: 8),
                    Text('+${Fmt.thousands(pack.coins)}', style: VT.number(38, color: V.gold)),
                    const SizedBox(width: 8),
                    Text(
                      'coins',
                      style: VT.body(16, color: V.text2, weight: FontWeight.w600),
                    ),
                  ],
                ),
              )
            else
              const SizedBox(height: 16),
            if (failed && p.failureReason != null) ...[_note(p.failureReason!, V.bad), const SizedBox(height: 14)],
            _keyValues([
              (vip ? 'Plan' : 'Pack', _text(item)),
              (ok ? 'Paid' : 'Amount', _text(amount)),
              if (p.method != null) ('With', _text(p.method!.label)),
              ('Status', ok ? _tag('Completed', V.ok, SolarIconsBold.checkCircle) : (failed ? _tag('Not completed', V.bad) : (refunded ? _tag('Refunded', V.warn) : _tag('In progress', _info)))),
              ('Reference', _Copy(p.receipt ?? p.id)),
              ('Date', _text(_stamp(p.completedAt ?? p.createdAt))),
            ]),
          ],
        );
      },
    );
  }
}

// ── Cash-out ─────────────────────────────────────────────────────────────

/// A cash-out: how much, where to, and where it is now.
class CashoutStatusScreen extends StatelessWidget {
  const CashoutStatusScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context) {
    return _Loader<Cashout>(
      key: ValueKey(id),
      title: 'Cash-out',
      what: 'cash-out',
      load: () => context.read<ActivityProvider>().cashout(id),
      builder: (context, c, _) {
        final returned = c.status == CashoutStatus.rejected;
        final amount = c.amountPkr != null ? 'Rs ${Fmt.thousands(c.amountPkr!)}' : Fmt.usd(c.usd);
        final to = '${c.method.label} ${c.accountMasked}'.trim();
        final steps = <(String, String, bool)>[
          ('Requested', _stamp(c.createdAt), true),
          if (c.status == CashoutStatus.review)
            ('Being checked', 'Big cash-outs get a quick look first, usually within a day.', false)
          else
            ('Approved', c.status == CashoutStatus.requested ? 'Starting now' : 'Done', c.status != CashoutStatus.requested),
          ('Sent to $to', c.status == CashoutStatus.paid ? '${_stamp(c.processedAt)} · usually arrives within an hour' : 'Next', c.status == CashoutStatus.paid),
        ];
        return _DetailPage(
          title: 'Cash-out',
          actions: [
            GradientButton(label: 'Open wallet', icon: SolarIconsBold.wallet, onTap: () => _push(context, const WalletScreen())),
            GhostButton(
              label: c.status == CashoutStatus.paid ? 'Money didn’t arrive? Get help' : 'Get help',
              icon: SolarIconsOutline.headphonesRound,
              height: 48,
              expand: true,
              onTap: () => _push(context, const HelpSectionScreen()),
            ),
          ],
          children: [
            const SizedBox(height: 16),
            Center(
              child: returned ? _tag('Returned', V.warn) : (c.status == CashoutStatus.paid ? _tag('Sent', V.ok, SolarIconsBold.checkCircle) : _tag('On its way', _info, SolarIconsBold.clockCircle)),
            ),
            const SizedBox(height: 12),
            Center(child: Text(amount, style: VT.number(40))),
            const SizedBox(height: 8),
            Center(
              child: Text.rich(
                TextSpan(
                  style: VT.body(13.5, color: V.text2),
                  children: [
                    const TextSpan(text: 'from '),
                    TextSpan(
                      text: '${Fmt.thousands(c.gems)} gems',
                      style: VT.body(13.5, color: V.gem, weight: FontWeight.w700),
                    ),
                    if (c.accountMasked.isNotEmpty) TextSpan(text: ' · to $to'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            if (returned)
              _note(c.failureReason ?? 'The payout didn’t go through.', V.warn, bold: 'Your ${Fmt.thousands(c.gems)} gems are back in your wallet.')
            else
              Container(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
                decoration: BoxDecoration(
                  color: V.surface,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: V.line),
                ),
                child: Column(
                  children: [
                    for (final (i, (title, sub, done)) in steps.indexed)
                      IntrinsicHeight(
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Column(
                              children: [
                                Container(
                                  width: 26,
                                  height: 26,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: done ? V.ok.withValues(alpha: 0.16) : Colors.white.withValues(alpha: 0.06),
                                    border: Border.all(color: done ? V.ok : Colors.white24, width: 2),
                                  ),
                                  child: done ? const Icon(Icons.check_rounded, size: 14, color: V.ok) : null,
                                ),
                                if (i < steps.length - 1)
                                  Expanded(
                                    child: Container(width: 2, constraints: const BoxConstraints(minHeight: 26), color: done ? V.ok.withValues(alpha: 0.5) : Colors.white10),
                                  ),
                              ],
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Padding(
                                padding: const EdgeInsets.only(top: 2, bottom: 18),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(title, style: VT.title(14.5, color: done ? V.text : V.text2)),
                                    const SizedBox(height: 2),
                                    Text(sub, style: VT.body(12.5, color: V.text2)),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            _label('Details'),
            _keyValues([('Gems', _text(Fmt.thousands(c.gems))), ('Amount', _text(amount)), ('Reference', _Copy(c.id)), ('Requested', _text(_stamp(c.createdAt)))]),
          ],
        );
      },
    );
  }
}

// ── Account status ───────────────────────────────────────────────────────

/// Account status: whether matching is paused (until when, appeal), and every
/// note the Vibe team sent about your account. [noteId] highlights the one a
/// notification was about.
class AccountStatusScreen extends StatelessWidget {
  const AccountStatusScreen({super.key, this.noteId});
  final String? noteId;

  static const _icons = {'account.warning': SolarIconsOutline.dangerTriangle, 'account.paused': SolarIconsOutline.pauseCircle, 'account.appeal': SolarIconsOutline.flag};

  @override
  Widget build(BuildContext context) {
    return _Loader<AccountStatus>(
      title: 'Account status',
      what: 'page',
      load: () => context.read<ActivityProvider>().accountStatus(),
      builder: (context, s, reload) {
        Future<void> appeal() async {
          final sent = await showVibeSheet<bool>(context, child: AppealSheet(send: context.read<MatchProvider>().sendAppeal));
          if (sent == true) reload();
        }

        final until = s.pausedUntil;
        return _DetailPage(
          title: 'Account status',
          children: [
            const SizedBox(height: 8),
            if (until != null)
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: V.warn.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: V.warn.withValues(alpha: 0.25)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(SolarIconsBold.pauseCircle, size: 26, color: V.warn),
                        const SizedBox(width: 10),
                        Expanded(child: Text('Matching is paused', style: VT.title(17))),
                        _tag(Fmt.until(until), V.warn),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text.rich(
                      TextSpan(
                        style: VT.body(13.5, color: V.text2, height: 1.5),
                        children: [
                          const TextSpan(text: 'People reported your recent calls, so random matching is off until '),
                          TextSpan(
                            text: _stamp(until),
                            style: VT.body(13.5, color: V.text, weight: FontWeight.w700),
                          ),
                          const TextSpan(text: '. Your chats, friends and Discover still work.'),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        if (s.appealStatus == null) ...[
                          SizedBox(
                            width: 120,
                            child: GradientButton(label: 'Appeal', icon: SolarIconsBold.flag, height: 36, onTap: appeal),
                          ),
                          const SizedBox(width: 8),
                        ],
                        GhostButton(label: 'Guidelines', height: 36, onTap: () => _push(context, const LegalSectionScreen())),
                      ],
                    ),
                  ],
                ),
              )
            else
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: V.ok.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: V.ok.withValues(alpha: 0.22)),
                ),
                child: Row(
                  children: [
                    const Icon(SolarIconsBold.shieldCheck, size: 26, color: V.ok),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Your account is in good standing', style: VT.title(16)),
                          const SizedBox(height: 2),
                          Text('You can match, chat and call as usual.', style: VT.body(13, color: V.text2)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            if (s.appealStatus != null && until != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: V.surface,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: V.line),
                ),
                child: Row(
                  children: [
                    const Icon(SolarIconsOutline.clockCircle, size: 20, color: _info),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text.rich(
                        TextSpan(
                          style: VT.body(13, color: V.text2),
                          children: [
                            TextSpan(
                              text: 'Appeal sent',
                              style: VT.body(13, color: V.text, weight: FontWeight.w700),
                            ),
                            TextSpan(text: '${s.appealAt != null ? ' ${Fmt.date(s.appealAt!)}' : ''} · we answer within 24 hours'),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            _label('From the Vibe team'),
            if (s.notes.isEmpty)
              Container(
                padding: const EdgeInsets.symmetric(vertical: 20),
                decoration: BoxDecoration(
                  color: V.surface,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: V.line),
                ),
                child: Text(
                  'No notes. Nice.',
                  textAlign: TextAlign.center,
                  style: VT.body(13.5, color: V.muted),
                ),
              )
            else
              Container(
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  color: V.surface,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: V.line),
                ),
                child: Column(
                  children: [
                    for (final (i, n) in s.notes.indexed) ...[
                      if (i > 0) const Divider(height: 1, color: V.lineSoft),
                      _NoteRow(note: n, on: n.id == noteId, icon: _icons[n.type] ?? SolarIconsOutline.infoCircle),
                    ],
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 14, 8, 0),
              child: Text('Notes stay here for 90 days.', style: VT.body(12, color: V.muted)),
            ),
          ],
        );
      },
    );
  }
}

class _NoteRow extends StatelessWidget {
  const _NoteRow({required this.note, required this.on, required this.icon});
  final AccountNote note;
  final bool on;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final c = on ? V.warn : V.text2;
    return Container(
      decoration: on
          ? BoxDecoration(
              color: V.warn.withValues(alpha: 0.07),
              border: const Border(left: BorderSide(color: V.warn, width: 3)),
            )
          : null,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: c.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: c.withValues(alpha: 0.2)),
            ),
            child: Icon(icon, size: 21, color: c),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(note.title, style: VT.title(14)),
                const SizedBox(height: 2),
                Text('${Fmt.date(note.at)} · ${note.body}', style: VT.body(13, color: V.text2, height: 1.45)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Verification ─────────────────────────────────────────────────────────

/// Your selfie verification: verified, not this time (try again), checking, or not yet.
class VerificationResultScreen extends StatefulWidget {
  const VerificationResultScreen({super.key});

  @override
  State<VerificationResultScreen> createState() => _VerificationResultScreenState();
}

class _VerificationResultScreenState extends State<VerificationResultScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<SessionProvider>().loadVerification();
    });
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final me = session.me;
    final v = session.verification;
    final verified = v.status == VerificationStatus.approved;
    final (icon, color, title, sub) = switch (v.status) {
      VerificationStatus.approved => (SolarIconsBold.verifiedCheck, _info, 'You’re verified', 'Your selfie matched your photos.'),
      VerificationStatus.rejected => (SolarIconsOutline.dangerCircle, V.bad, 'We couldn’t verify your selfie', v.reason ?? 'Try again in good light, facing the camera.'),
      VerificationStatus.pending => (SolarIconsBold.clockCircle, _info, 'Checking your selfie', 'This usually takes a minute.'),
      VerificationStatus.none => (SolarIconsBold.shieldUser, V.text2, 'Not verified yet', 'A quick selfie shows people you’re really you.'),
    };
    return _DetailPage(
      title: 'Verification',
      actions: [
        if (verified && me != null)
          GradientButton(
            label: 'See your profile',
            icon: SolarIconsBold.user,
            onTap: () => _push(context, UserProfileScreen(userId: me.id)),
          )
        else if (v.status != VerificationStatus.pending)
          GradientButton(
            label: v.status == VerificationStatus.rejected ? 'Try again' : 'Verify with a selfie',
            icon: SolarIconsBold.camera,
            onTap: () async {
              final r = await startSelfieVerification(context);
              if (context.mounted && r?.status == VerificationStatus.approved) toast(context, 'You’re verified ✅');
            },
          ),
      ],
      children: [
        _Hero(icon: icon, color: color, title: title, sub: sub),
        if (me != null) ...[
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: V.surface,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: V.line),
            ),
            child: Row(
              children: [
                VAvatar(url: me.avatarUrl, name: me.name, size: 56, ring: true),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(child: Text('${me.name}, ${me.age}', style: VT.title(17))),
                          if (verified) ...[const SizedBox(width: 6), const Icon(SolarIconsBold.verifiedCheck, size: 19, color: _info)],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text('This is how people see you', style: VT.body(12.5, color: V.text2)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.symmetric(vertical: 4),
          decoration: BoxDecoration(
            color: V.surface,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: V.line),
          ),
          child: Column(
            children: [
              for (final (icon, color, title, sub) in const [
                (SolarIconsBold.verifiedCheck, _info, 'The badge on your profile', 'People see you’re really you.'),
                (SolarIconsBold.shieldCheck, V.ok, 'Safe mode matches', 'You can match with people who only meet verified people.'),
                (SolarIconsBold.lock, V.lavender, 'Your selfie stays private', 'We use it to check, then delete it.'),
              ])
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(icon, size: 22, color: color),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(title, style: VT.title(14)),
                            const SizedBox(height: 2),
                            Text(sub, style: VT.body(12.5, color: V.text2)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── A message from the Vibe team ─────────────────────────────────────────

class TeamMessageScreen extends StatelessWidget {
  const TeamMessageScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context) {
    return _Loader<TeamMessage>(
      key: ValueKey(id),
      title: 'Vibe team',
      what: 'message',
      load: () => context.read<ActivityProvider>().teamMessage(id),
      builder: (context, m, _) => _DetailPage(
        title: 'Vibe team',
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 6, 4, 0),
            child: Row(
              children: [
                const TeamAvatar(size: 44),
                const SizedBox(width: 12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text('Vibe', style: VT.title(15)),
                        const SizedBox(width: 4),
                        const Icon(SolarIconsBold.verifiedCheck, size: 16, color: V.pinkSoft),
                      ],
                    ),
                    Text('Official · ${Fmt.date(m.at)}', style: VT.body(12.5, color: V.muted)),
                  ],
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 20, 4, 10),
            child: Text(m.title, style: VT.title(24)),
          ),
          for (final para in m.body.split(RegExp(r'\n{2,}')))
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
              child: Text(para, style: VT.body(15, color: V.text2, height: 1.6)),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 20, 4, 0),
            child: GestureDetector(
              onTap: () => _push(context, const NotificationsSectionScreen()),
              child: Text.rich(
                TextSpan(
                  style: VT.body(12, color: V.muted),
                  children: [
                    const TextSpan(text: 'You get these because News from Vibe is on. '),
                    TextSpan(
                      text: 'Change',
                      style: VT.body(12, color: V.pinkSoft),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Your week ────────────────────────────────────────────────────────────

class WeeklyRecapScreen extends StatelessWidget {
  const WeeklyRecapScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return _Loader<WeeklyRecap>(
      title: 'Your week',
      what: 'recap',
      load: () => context.read<EngagementProvider>().loadRecap(),
      builder: (context, r, _) {
        final start = r.weekStart;
        final end = r.weekEnd?.subtract(const Duration(days: 1));
        final range = start != null && end != null ? '${Fmt.date(start).replaceFirst(RegExp(r' \d{4}$'), '')} – ${Fmt.date(end)}' : 'Last week';
        final tiles = <(IconData, Color, String, String)>[
          (SolarIconsBold.gift, V.gold, Fmt.thousands(r.giftsReceived), 'gifts'),
          (Icons.diamond_rounded, V.gem, '+${Fmt.figure(r.gemsEarned)}', 'gems'),
          (SolarIconsBold.userPlusRounded, V.lavender, Fmt.thousands(r.newFollowers), 'followers'),
          (SolarIconsBold.heart, V.pink, Fmt.thousands(r.matches), 'matches'),
        ];
        return _DetailPage(
          title: 'Your week',
          actions: [
            GradientButton(
              label: 'Share my week',
              icon: SolarIconsBold.share,
              onTap: () => context.read<AppServices>().share.shareText(
                'My week on Vibe: ${Fmt.thousands(r.likesReceived)} likes, ${Fmt.thousands(r.giftsReceived)} gifts, ${Fmt.thousands(r.newFollowers)} new followers.',
              ),
            ),
          ],
          children: [
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                gradient: LinearGradient(colors: [V.pink.withValues(alpha: 0.22), V.violet.withValues(alpha: 0.22)], begin: Alignment.topLeft, end: Alignment.bottomRight),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    range,
                    style: VT.label(12.5, color: V.text2, weight: FontWeight.w600),
                  ),
                  const SizedBox(height: 6),
                  Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(text: Fmt.figure(r.likesReceived), style: VT.number(44)),
                        TextSpan(
                          text: ' likes',
                          style: VT.body(18, weight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text('${r.bestStreak > 0 ? 'Your best streak was ${r.bestStreak} days. ' : ''}Here’s the rest of your week.', style: VT.body(13.5)),
                ],
              ),
            ),
            const SizedBox(height: 10),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.55,
              children: [
                for (final (icon, color, big, small) in tiles)
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: color.withValues(alpha: 0.2)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(icon, size: 20, color: color),
                        const Spacer(),
                        Text(big, style: VT.number(24)),
                        Text(small, style: VT.body(12.5, color: V.text2)),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        );
      },
    );
  }
}

// ── Calls with one friend ────────────────────────────────────────────────

/// "45 s", "14 min", "1 h 5 min".
String callLength(int seconds) {
  if (seconds < 60) return '${seconds < 1 ? 1 : seconds} s';
  final m = (seconds / 60).round();
  return m < 60 ? '$m min' : '${m ~/ 60} h${m % 60 > 0 ? ' ${m % 60} min' : ''}';
}

String _callLabel(CallLogEntry c) {
  final what = c.video ? 'video call' : 'voice call';
  return switch (c.kind) {
    CallLogKind.missed => c.outgoing == true ? 'No answer · $what' : 'Missed $what',
    CallLogKind.declined => c.outgoing == true ? 'Declined · $what' : 'You declined a $what',
    CallLogKind.ended => c.outgoing == true ? 'Outgoing $what' : (c.outgoing == false ? 'Incoming $what' : '${c.video ? 'Video' : 'Voice'} call'),
  };
}

/// Your calls with one friend (a missed call opens this): call back or message, and the list.
class CallHistoryScreen extends StatelessWidget {
  const CallHistoryScreen({super.key, required this.userId});
  final String userId;

  @override
  Widget build(BuildContext context) {
    return _Loader<CallHistory>(
      key: ValueKey(userId),
      title: 'Calls',
      what: 'chat',
      load: () => context.read<ActivityProvider>().callHistory(userId),
      builder: (context, h, _) {
        final f = context.watch<SocialProvider>().friend(userId);
        if (f == null) {
          return const _DetailPage(
            title: 'Calls',
            children: [EmptyState(icon: SolarIconsOutline.cloudCross, title: 'Not here any more', body: 'You’re not friends any more, so there’s nothing to show.')],
          );
        }
        final p = f.profile;
        final now = DateTime.now();
        final today = [
          for (final c in h.calls)
            if (Fmt.sameDay(c.at, now)) c,
        ];
        final earlier = [
          for (final c in h.calls)
            if (!Fmt.sameDay(c.at, now)) c,
        ];
        Widget list(List<CallLogEntry> rows, bool highlightFirst) => Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: V.surface,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: V.line),
          ),
          child: Column(
            children: [
              for (final (i, c) in rows.indexed) ...[
                if (i > 0) const Divider(height: 1, color: V.lineSoft),
                Builder(
                  builder: (context) {
                    final missed = c.kind == CallLogKind.missed && c.outgoing != true;
                    final hl = highlightFirst && i == 0 && missed;
                    return Container(
                      decoration: hl
                          ? BoxDecoration(
                              color: V.bad.withValues(alpha: 0.06),
                              border: const Border(left: BorderSide(color: V.bad, width: 3)),
                            )
                          : null,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      child: Row(
                        children: [
                          Container(
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(shape: BoxShape.circle, color: missed ? V.bad.withValues(alpha: 0.12) : Colors.white.withValues(alpha: 0.06)),
                            child: Icon(missed ? SolarIconsBold.phoneRounded : (c.video ? SolarIconsBold.videocamera : SolarIconsBold.phone), size: 19, color: missed ? V.bad : V.text2),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _callLabel(c),
                                  style: VT.body(14.5, color: missed ? V.bad : V.text, weight: FontWeight.w600),
                                ),
                                const SizedBox(height: 2),
                                Text(Fmt.sameDay(c.at, now) ? Fmt.time(c.at) : _stamp(c.at), style: VT.body(12.5, color: V.muted)),
                              ],
                            ),
                          ),
                          if (c.seconds != null && c.seconds! > 0) Text(callLength(c.seconds!), style: VT.body(13, color: V.text2)),
                        ],
                      ),
                    );
                  },
                ),
              ],
            ],
          ),
        );
        final since = h.friendSince != null ? 'Friends since ${Fmt.date(h.friendSince!).replaceFirst(RegExp(r'^\d+ '), '')}' : 'Friends';
        return _DetailPage(
          title: 'Calls',
          children: [
            const SizedBox(height: 8),
            Center(
              child: GestureDetector(
                onTap: () => _push(context, UserProfileScreen(userId: p.id)),
                child: VAvatar(url: p.avatarUrl, name: p.name, size: 88, ring: true),
              ),
            ),
            const SizedBox(height: 12),
            Center(child: Text(p.name, style: VT.title(21))),
            const SizedBox(height: 2),
            Center(
              child: Text('$since${h.streak > 0 ? ' · 🔥 ${h.streak}-day streak' : ''}', style: VT.body(13, color: V.text2)),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  flex: 14,
                  child: f.calls.on
                      ? GradientButton(
                          label: f.calls.video ? 'Video call' : 'Voice call',
                          icon: f.calls.video ? SolarIconsBold.videocamera : SolarIconsBold.phone,
                          height: 52,
                          onTap: () => context.read<CallsProvider>().ring(p, f.calls.video ? CallMedia.video : CallMedia.voice),
                        )
                      : GradientButton(
                          label: 'Allow calls',
                          icon: SolarIconsBold.videocamera,
                          height: 52,
                          onTap: () => _push(context, ChatScreen(friendId: p.id)),
                        ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 10,
                  child: GhostButton(
                    label: 'Message',
                    icon: SolarIconsBold.chatRound,
                    expand: true,
                    onTap: () => _push(context, ChatScreen(friendId: p.id)),
                  ),
                ),
              ],
            ),
            if (!f.calls.on)
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
                child: Text('You both need to allow calls in the chat first.', style: VT.body(12.5, color: V.muted)),
              ),
            if (today.isNotEmpty) ...[_label('Today'), list(today, true)],
            if (earlier.isNotEmpty) ...[_label(today.isEmpty ? 'Calls' : 'Earlier'), list(earlier, today.isEmpty)],
            if (h.calls.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 32),
                child: Text(
                  'No calls yet.',
                  textAlign: TextAlign.center,
                  style: VT.body(13.5, color: V.muted),
                ),
              ),
          ],
        );
      },
    );
  }
}
