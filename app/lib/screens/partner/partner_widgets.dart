import 'package:flutter/material.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/partner.dart';

/// A small selectable pill: the link builder's channels, the stats period
/// and the chart's measure. [outlined] is the link builder's look (violet
/// hairline when on); otherwise a quiet filled pill.
class PartnerChip extends StatelessWidget {
  const PartnerChip({super.key, required this.label, required this.selected, required this.onTap, this.outlined = false});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final bool outlined;

  @override
  Widget build(BuildContext context) {
    final Color bg;
    final Color border;
    if (outlined) {
      bg = selected ? V.violet.withValues(alpha: 0.16) : V.surface2;
      border = selected ? V.violet : V.line;
    } else {
      bg = selected ? Colors.white.withValues(alpha: 0.12) : Colors.transparent;
      border = Colors.transparent;
    }
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          height: outlined ? 34 : 30,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          alignment: Alignment.center,
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(17), border: Border.all(color: border)),
          child: Text(label, style: VT.label(12.5, color: selected ? V.text : (outlined ? V.text2 : V.muted))),
        ),
      ),
    );
  }
}

/// One balance figure (Available is the strong, gold one).
class PartnerMoneyTile extends StatelessWidget {
  const PartnerMoneyTile({super.key, required this.label, required this.cents, required this.hint, this.strong = false});
  final String label;
  final int cents;
  final String hint;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$label ${formatUsd(cents)}. $hint',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 13, 12, 13),
        decoration: BoxDecoration(
          color: strong ? V.gold.withValues(alpha: 0.06) : V.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: strong ? V.gold.withValues(alpha: 0.3) : V.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: VT.body(12, color: V.muted)),
            const SizedBox(height: 3),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(formatUsd(cents), maxLines: 1, style: VT.number(22, color: strong ? V.gold : V.text)),
            ),
            const SizedBox(height: 2),
            Text(hint, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(11, color: V.muted)),
          ],
        ),
      ),
    );
  }
}

/// A figure with a quiet label under it (stats totals).
class PartnerFigure extends StatelessWidget {
  const PartnerFigure({super.key, required this.label, required this.value, this.gold = false});
  final String label;
  final String value;
  final bool gold;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$label: $value',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(value, maxLines: 1, style: VT.number(18, color: gold ? V.gold : V.text))),
          const SizedBox(height: 1),
          Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(11, color: V.muted)),
        ],
      ),
    );
  }
}

Color partnerPayoutColor(PartnerPayoutStatus s) => switch (s) {
      PartnerPayoutStatus.requested => V.gold,
      PartnerPayoutStatus.paid => V.ok,
      PartnerPayoutStatus.rejected => V.bad,
    };

Color partnerCommissionColor(PartnerCommissionStatus s) => switch (s) {
      PartnerCommissionStatus.pending => V.muted,
      PartnerCommissionStatus.available => V.gold,
      PartnerCommissionStatus.paid => V.ok,
      PartnerCommissionStatus.reversed => V.bad,
      PartnerCommissionStatus.held => V.warn,
    };

/// "Couldn't load …" with a retry, inside a section.
class PartnerRetry extends StatelessWidget {
  const PartnerRetry({super.key, required this.text, required this.onRetry});
  final String text;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Panel(
      radius: 20,
      padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
      child: Row(
        children: [
          const Icon(Icons.cloud_off_rounded, color: V.text2, size: 20),
          const SizedBox(width: 12),
          Expanded(child: Text(text, style: VT.body(13.5, color: V.text2))),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

/// A centred spinner for a section that is loading.
class PartnerSpinner extends StatelessWidget {
  const PartnerSpinner({super.key, this.height = 120});
  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(height: height, child: const Center(child: SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 3, color: V.text2))));
}
