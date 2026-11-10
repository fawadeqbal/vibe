import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../models/payments.dart';
import '../../providers/wallet_provider.dart';
import '../notifications/detail_pages.dart';

/// Lists on overview pages show this many, then See all.
const previewCount = 5;

/// How a history line looks (icon and colour by kind).
(IconData, Color) txLook(TxKind k) => switch (k) {
  TxKind.purchase => (SolarIconsBold.bagSmile, V.gold),
  TxKind.spend => (SolarIconsBold.bolt, V.gold),
  TxKind.earn => (SolarIconsBold.playCircle, V.pinkSoft),
  TxKind.gift => (SolarIconsBold.gift, V.gem),
  TxKind.cashout => (SolarIconsBold.banknote, V.gem),
  TxKind.vip => (SolarIconsBold.crown, V.gold),
};

/// Where a history line opens: its receipt, its cash-out, or its own page (gifts, rewards, spends).
void openTransaction(BuildContext context, Transaction t) {
  final Widget page = t.purchaseId != null
      ? PaymentReceiptScreen(id: t.purchaseId!)
      : t.cashoutId != null
      ? CashoutStatusScreen(id: t.cashoutId!)
      : TransactionDetailScreen(id: t.id);
  Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
}

/// "Today", "Yesterday", "Mon 2 Nov" — newest first.
List<(String, List<Transaction>)> historyByDay(List<Transaction> list) {
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

/// History grouped by day.
List<Widget> historyDays(List<Transaction> items) => [
  for (final (label, rows) in historyByDay(items)) ...[
    Padding(
      padding: const EdgeInsets.fromLTRB(4, 18, 4, 8),
      child: Text(label, style: VT.label(12.5, color: V.text2, weight: FontWeight.w600)),
    ),
    GroupCard(children: [for (final t in rows) TxRow(t: t)]),
  ],
];

class TxRow extends StatelessWidget {
  const TxRow({super.key, required this.t});
  final Transaction t;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = txLook(t.kind);
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
      onTap: () => openTransaction(context, t),
    );
  }
}

/// One cash-out; opens its page (how much, where to, where it is now).
class CashoutRow extends StatelessWidget {
  const CashoutRow({super.key, required this.c});
  final Cashout c;

  @override
  Widget build(BuildContext context) {
    final color = switch (c.status) {
      CashoutStatus.paid => V.ok,
      CashoutStatus.rejected => V.bad,
      CashoutStatus.review => V.warn,
      _ => V.gem,
    };
    final money = c.amountPkr != null ? 'Rs ${Fmt.thousands(c.amountPkr!)}' : Fmt.usd(c.usd);
    final sub =
        '${c.createdAt != null ? '${Fmt.date(c.createdAt!)} · ' : ''}${Fmt.thousands(c.gems)} gems · ${c.accountMasked}'
        '${c.status == CashoutStatus.rejected && c.failureReason != null ? '\n${c.failureReason}' : ''}';
    return GroupRow(
      icon: SolarIconsBold.banknote,
      iconColor: V.gem,
      iconBg: V.gem.withValues(alpha: 0.13),
      title: '$money to ${c.method.label}',
      subtitle: sub,
      trailing: Tag(c.status.label, color: color),
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => CashoutStatusScreen(id: c.id))),
    );
  }
}

/// A "See all" button under a short list.
class SeeAllButton extends StatelessWidget {
  const SeeAllButton({super.key, required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: GhostButton(label: label, icon: SolarIconsOutline.altArrowRight, height: 44, expand: true, onTap: onTap),
    );
  }
}

/// A long list that loads a page at a time and the next one as you scroll
/// near the end; pull to refresh starts over. [build] turns the rows loaded
/// so far into widgets (grouping is up to it).
class PagedList<T extends Object> extends StatefulWidget {
  const PagedList({super.key, required this.load, required this.idOf, required this.build, required this.empty, this.header});
  final Future<ListPage<T>> Function(String? cursor) load;
  final String Function(T item) idOf;
  final List<Widget> Function(List<T> items) build;
  final Widget empty;
  final Widget? header;

  @override
  State<PagedList<T>> createState() => _PagedListState<T>();
}

class _PagedListState<T extends Object> extends State<PagedList<T>> {
  final _items = <T>[];
  String? _next;
  bool _done = false;
  bool _loading = false;
  bool _failed = false;
  int _generation = 0;
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.extentAfter < 600) _more();
    });
    _load(null);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load(String? cursor) async {
    if (_loading && cursor != null) return;
    final gen = cursor == null ? ++_generation : _generation;
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final page = await widget.load(cursor);
      if (!mounted || gen != _generation) return;
      setState(() {
        if (cursor == null) _items.clear();
        final seen = {for (final i in _items) widget.idOf(i)};
        _items.addAll(page.items.where((i) => !seen.contains(widget.idOf(i))));
        _next = page.next;
        _done = page.next == null;
      });
    } on ApiException catch (_) {
      if (mounted && gen == _generation) setState(() => _failed = true);
    } finally {
      if (mounted && gen == _generation) setState(() => _loading = false);
    }
  }

  void _more() {
    if (_done || _loading || _failed || _next == null) return;
    _load(_next);
  }

  @override
  Widget build(BuildContext context) {
    final empty = _done && _items.isEmpty;
    return RefreshIndicator(
      color: V.pink,
      onRefresh: () => _load(null),
      child: ListView(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
        children: [
          ?widget.header,
          if (empty) widget.empty else ...widget.build(_items),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Center(
              child: _failed
                  ? TextButton(
                      onPressed: () => _load(_items.isEmpty ? null : _next),
                      child: Text('Couldn’t load more · Try again', style: VT.label(13, color: V.pinkSoft)),
                    )
                  : _loading
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: V.pink))
                  : const SizedBox.shrink(),
            ),
          ),
        ],
      ),
    );
  }
}

/// Wallet → History → See all: every coin and gem move, by day, a page at a time.
class WalletHistoryScreen extends StatefulWidget {
  const WalletHistoryScreen({super.key});

  @override
  State<WalletHistoryScreen> createState() => _WalletHistoryScreenState();
}

class _WalletHistoryScreenState extends State<WalletHistoryScreen> {
  String _tab = 'all';

  @override
  Widget build(BuildContext context) {
    final wallet = context.read<WalletProvider>();
    return Scaffold(
      appBar: vibeAppBar(context, 'History'),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: PillTabs(
              value: _tab,
              onChanged: (v) => setState(() => _tab = v),
              tabs: const [('all', 'All'), ('coins', 'Coins'), ('gems', 'Gems')],
            ),
          ),
          Expanded(
            child: PagedList<Transaction>(
              key: ValueKey(_tab),
              load: (cursor) => wallet.historyPage(cursor: cursor, currency: _tab == 'all' ? null : _tab),
              idOf: (t) => t.id,
              build: historyDays,
              empty: const EmptyState(icon: SolarIconsBold.billList, title: 'Nothing yet', body: 'Purchases, gifts, rewards and spends all show up here.'),
            ),
          ),
        ],
      ),
    );
  }
}

/// Cash out → Cash-outs → See all: every cash-out, newest first, a page at a time.
class CashoutsScreen extends StatelessWidget {
  const CashoutsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final wallet = context.read<WalletProvider>();
    return Scaffold(
      appBar: vibeAppBar(context, 'Cash-outs'),
      body: PagedList<Cashout>(
        load: (cursor) => wallet.cashoutPage(cursor: cursor),
        idOf: (c) => c.id,
        build: (items) => [
          const SizedBox(height: 8),
          GroupCard(children: [for (final c in items) CashoutRow(c: c)]),
        ],
        empty: const EmptyState(icon: SolarIconsBold.banknote, title: 'No cash-outs yet', body: 'When you cash out gems, each one shows here with where it is.'),
      ),
    );
  }
}
