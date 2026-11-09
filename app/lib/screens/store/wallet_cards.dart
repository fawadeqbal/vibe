import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/engagement_provider.dart';
import '../../providers/wallet_provider.dart';

/// Gems you're saving up for: a bar of gems vs the goal and what it is worth.
class GemGoalCard extends StatelessWidget {
  const GemGoalCard({super.key});

  /// The goal sheet (web: GoalSheet in features/wallet/goal-cards.tsx).
  static Future<void> edit(BuildContext context, int? current) => showVibeSheet<void>(context, child: _GoalSheet(current: current));

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletProvider>();
    final goal = wallet.gemGoal;
    if (goal == null) {
      return Panel(
        onTap: () => edit(context, null),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Semantics(
          button: true,
          label: 'Set a gem goal',
          excludeSemantics: true,
          child: Row(
            children: [
              Container(width: 40, height: 40, decoration: BoxDecoration(color: V.gem.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: const Icon(SolarIconsBold.flag, color: V.gem, size: 22)),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Set a gem goal', style: VT.title(15, weight: FontWeight.w600)),
                    Text('Save toward a cash-out and watch it fill up.', style: VT.body(12, color: V.text2)),
                  ],
                ),
              ),
              const Icon(SolarIconsOutline.altArrowRight, color: V.muted),
            ],
          ),
        ),
      );
    }
    final gems = wallet.gems;
    final reached = gems >= goal;
    return Panel(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        children: [
          Row(
            children: [
              Container(width: 40, height: 40, decoration: BoxDecoration(color: V.gem.withValues(alpha: 0.13), borderRadius: BorderRadius.circular(12)), child: const Icon(SolarIconsBold.flag, color: V.gem, size: 21)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Goal: ${Fmt.figure(goal)} gems', style: VT.title(15, weight: FontWeight.w600), semanticsLabel: 'Goal: ${Fmt.thousands(goal)} gems, about ${Fmt.gemsAsUsd(goal)}'),
                    Text(
                      reached ? 'Reached 🎯 Cash out, or set a bigger one' : '${Fmt.figure(goal - gems)} to go${goal >= Economy.cashoutMinGems ? ' · enough to cash out' : ''}',
                      style: VT.body(12, color: V.text2),
                    ),
                  ],
                ),
              ),
              GestureDetector(
                onTap: () => edit(context, goal),
                child: Padding(padding: const EdgeInsets.all(4), child: Text('Change', style: VT.label(13, color: V.pinkSoft, weight: FontWeight.w600))),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              height: 8,
              child: Stack(
                children: [
                  Container(color: V.surface3),
                  FractionallySizedBox(widthFactor: (gems / goal).clamp(0.0, 1.0), child: Container(decoration: const BoxDecoration(gradient: V.gemGrad))),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Set, change or remove the gem goal: a number (or a preset), what it's worth, Save.
class _GoalSheet extends StatefulWidget {
  const _GoalSheet({this.current});
  final int? current;

  @override
  State<_GoalSheet> createState() => _GoalSheetState();
}

class _GoalSheetState extends State<_GoalSheet> {
  late final _c = TextEditingController(text: widget.current?.toString() ?? '');
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  /// The web's parseGemGoal.
  (int?, String?) _parse() {
    final n = int.tryParse(_c.text.replaceAll(RegExp(r'[,\s]'), ''));
    if (n == null || n <= 0) return (null, 'Enter a whole number of gems.');
    if (n < WalletProvider.minGemGoal) return (null, 'At least ${WalletProvider.minGemGoal} gems.');
    if (n > WalletProvider.maxGemGoal) return (null, "That's more than 10 million gems.");
    return (n, null);
  }

  Future<void> _save(int? goal) async {
    setState(() => _busy = true);
    try {
      await context.read<WalletProvider>().setGemGoal(goal);
    } on ApiException catch (_) {
      if (mounted) setState(() => _error = "Couldn't save that, try again.");
      return;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    if (!mounted) return;
    toast(context, goal != null ? 'Goal set: ${Fmt.thousands(goal)} gems' : 'Goal removed');
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final presets = ({1000, Economy.cashoutMinGems, 10000, 50000}.toList()..sort());
    final (goal, _) = _parse();
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.current != null ? 'Change your goal' : 'Set a gem goal', style: VT.title(20)),
          const SizedBox(height: 4),
          Text("Gems come from gifts. We'll tell you when you get there.", style: VT.body(13, color: V.text2)),
          const SizedBox(height: 16),
          TextField(
            controller: _c,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9,]'))],
            decoration: InputDecoration(hintText: 'e.g. 5,000', errorText: _error, prefixIcon: const Icon(Icons.diamond_rounded, color: V.gem)),
            onChanged: (_) => setState(() => _error = null),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final n in presets)
                GestureDetector(
                  onTap: () => setState(() {
                    _c.text = '$n';
                    _error = null;
                  }),
                  child: Container(
                    height: 32,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(color: V.surface2, borderRadius: BorderRadius.circular(16), border: Border.all(color: V.line)),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const GemIcon(size: 13),
                        const SizedBox(width: 4),
                        Text(Fmt.compact(n), style: VT.label(12.5, color: V.text2)),
                      ],
                    ),
                  ),
                ),
            ],
          ),
          if (goal != null) ...[
            const SizedBox(height: 12),
            Text('Worth about ${Fmt.gemsAsUsd(goal)} when you cash out.', style: VT.body(12.5, color: V.text2)),
          ],
          const SizedBox(height: 16),
          GradientButton(
            label: 'Save goal',
            gradient: V.gemGrad,
            foreground: V.onGem,
            glow: V.gem,
            busy: _busy,
            onTap: () {
              // Read the field now, not as of the last build.
              final (g, p) = _parse();
              g != null ? _save(g) : setState(() => _error = p);
            },
          ),
          if (widget.current != null) ...[
            const SizedBox(height: 8),
            Center(
              child: TextButton(
                onPressed: _busy ? null : () => _save(null),
                child: Text('Remove goal', style: VT.label(14, color: V.text2)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// "Your week on Vibe" — last week's numbers, Monday to Wednesday.
class WeeklyRecapCard extends StatelessWidget {
  const WeeklyRecapCard({super.key});

  @override
  Widget build(BuildContext context) {
    final e = context.watch<EngagementProvider>();
    final r = e.recap;
    if (!e.showRecap || r == null) return const SizedBox.shrink();
    Widget stat(String value, String label) => Expanded(
      child: Column(children: [Text(value, style: VT.number(18)), const SizedBox(height: 2), Text(label, style: VT.body(11.5, color: V.text2))]),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionTitle('Last week', top: 26, bottom: 10),
        Panel(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
          child: Row(children: [
            stat('+${Fmt.compact(r.gemsEarned)}', 'Gems'),
            stat(Fmt.compact(r.giftsReceived), 'Gifts'),
            stat(Fmt.compact(r.matches), 'Matches'),
            stat(Fmt.compact(r.likesReceived), 'Likes'),
          ]),
        ),
      ],
    );
  }
}
