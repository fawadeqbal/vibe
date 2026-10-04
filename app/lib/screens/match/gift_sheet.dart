import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/mock/mock_data.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/wallet_provider.dart';
import '../store/store_screen.dart';

/// Pick a gift, then send — no accidental spend from one tap. Returns the
/// gift, or null. The caller pays; out-of-reach gifts are locked and the
/// button offers the store instead.
Future<Gift?> showGiftSheet(BuildContext context, {required String toName}) {
  return showVibeSheet<Gift>(context, child: _GiftSheet(toName: toName));
}

class _GiftSheet extends StatefulWidget {
  const _GiftSheet({required this.toName});
  final String toName;

  @override
  State<_GiftSheet> createState() => _GiftSheetState();
}

class _GiftSheetState extends State<_GiftSheet> {
  Gift? _picked;

  void _openStore() {
    final nav = Navigator.of(context);
    nav.pop();
    nav.push(MaterialPageRoute(builder: (_) => const StoreScreen(asPage: true)));
  }

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletProvider>();
    final g = _picked;
    final canAfford = g != null && wallet.coins >= g.coins;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Send ${widget.toName} a gift', style: VT.title(22)),
                    const SizedBox(height: 4),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Padding(padding: EdgeInsets.only(top: 1), child: GemIcon(size: 14)),
                        const SizedBox(width: 5),
                        Expanded(child: Text('They keep ${(Economy.giftGemShare * 100).round()}% as gems they can cash out.', style: VT.body(12.5, color: V.text2, height: 1.35))),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              CoinChip(coins: wallet.coins, onTap: _openStore),
            ],
          ),
          const SizedBox(height: 18),
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 0.92,
            children: [
              for (final gift in MockData.gifts)
                _GiftTile(
                  gift: gift,
                  selected: gift == _picked,
                  locked: wallet.coins < gift.coins,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() => _picked = gift);
                  },
                ),
            ],
          ),
          const SizedBox(height: 18),
          if (g != null && !canAfford)
            GradientButton(label: 'Get coins for ${g.name}', icon: Icons.add_rounded, gradient: V.goldGrad, foreground: V.onGold, glow: V.gold, onTap: _openStore)
          else
            GradientButton(
              label: g == null ? 'Pick a gift' : 'Send ${g.name}',
              onTap: g == null ? null : () => Navigator.of(context).pop(g),
              trailing: g == null
                  ? null
                  : Container(
                      height: 26,
                      padding: const EdgeInsets.symmetric(horizontal: 9),
                      decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.22), borderRadius: BorderRadius.circular(13)),
                      child: CoinAmount(g.coins, size: 13, color: Colors.white),
                    ),
            ),
          const SizedBox(height: 10),
          Text(
            g == null
                ? 'You have ${Fmt.thousands(wallet.coins)} coins'
                : canAfford
                    ? '${Fmt.thousands(wallet.coins - g.coins)} coins left after this gift'
                    : '${Fmt.thousands(g.coins - wallet.coins)} more coins needed',
            textAlign: TextAlign.center,
            style: VT.body(12, color: V.muted),
          ),
        ],
      ),
    );
  }
}

class _GiftTile extends StatelessWidget {
  const _GiftTile({required this.gift, required this.selected, required this.locked, required this.onTap});
  final Gift gift;
  final bool selected;
  final bool locked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final content = Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 56,
          height: 56,
          alignment: Alignment.center,
          decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: selected ? 0.06 : 0.04)),
          child: Opacity(opacity: locked && !selected ? 0.45 : 1, child: Text(gift.emoji, style: const TextStyle(fontSize: 32))),
        ),
        const SizedBox(height: 8),
        Text(gift.name, style: VT.title(13, weight: FontWeight.w600, color: locked && !selected ? V.muted : V.text)),
        const SizedBox(height: 6),
        CoinAmount(gift.coins, size: 12, locked: locked),
      ],
    );
    return Semantics(
      button: true,
      selected: selected,
      label: '${gift.name}, ${gift.coins} coins${locked ? ', not enough coins' : ''}',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          // Gradient hairline when picked.
          padding: EdgeInsets.all(selected ? 1.5 : 1),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: selected ? V.brand : null,
            color: selected ? null : Colors.white.withValues(alpha: 0.06),
          ),
          child: Container(
            decoration: BoxDecoration(color: selected ? V.surfaceSel : V.surface2, borderRadius: BorderRadius.circular(18.5)),
            child: Stack(
              children: [
                Positioned.fill(child: content),
                if (selected)
                  Positioned(
                    right: 8,
                    top: 8,
                    child: Container(
                      width: 20,
                      height: 20,
                      decoration: const BoxDecoration(shape: BoxShape.circle, gradient: V.brand),
                      child: const Icon(Icons.check_rounded, size: 14, color: Colors.white),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The floating "+20 🌹" moment when a gift is sent or received.
class GiftBurst extends StatefulWidget {
  const GiftBurst({super.key, required this.gift, required this.received});
  final Gift gift;
  final bool received;

  @override
  State<GiftBurst> createState() => _GiftBurstState();
}

class _GiftBurstState extends State<GiftBurst> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final t = Curves.easeOutCubic.transform(_c.value);
        final fade = _c.value < 0.7 ? 1.0 : 1 - (_c.value - 0.7) / 0.3;
        return Opacity(
          opacity: fade.clamp(0, 1),
          child: Transform.translate(
            offset: Offset(0, -60 * t),
            child: Transform.scale(
              scale: 0.6 + 0.6 * t,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(widget.gift.emoji, style: const TextStyle(fontSize: 72)),
                  const SizedBox(height: 4),
                  GlassPill(
                    height: 34,
                    icon: widget.received ? Icons.diamond_rounded : Icons.redeem_rounded,
                    iconColor: widget.received ? V.gem : V.gold,
                    label: widget.received ? '${widget.gift.name} · +${widget.gift.gems} gems' : 'Sent a ${widget.gift.name}',
                    fontSize: 13.5,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
