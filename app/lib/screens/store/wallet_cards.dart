import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../providers/engagement_provider.dart';
import '../../providers/wallet_provider.dart';

/// Gems you're saving up for: a bar of gems vs the goal and what it is worth.
class GemGoalCard extends StatelessWidget {
  const GemGoalCard({super.key});

  Future<void> _edit(BuildContext context) async {
    final wallet = context.read<WalletProvider>();
    final current = wallet.gemGoal;
    final result = await showDialog<(int?,)>(context: context, builder: (_) => _GoalDialog(current: current));
    if (result == null || !context.mounted) return;
    try {
      await wallet.setGemGoal(result.$1);
      if (context.mounted) toast(context, result.$1 == null ? 'Goal removed' : 'Goal set · ${Fmt.thousands(result.$1!)} gems');
    } on ApiException catch (e) {
      if (context.mounted) toast(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletProvider>();
    final goal = wallet.gemGoal;
    if (goal == null) {
      return Panel(
        onTap: () => _edit(context),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(width: 40, height: 40, decoration: BoxDecoration(color: V.gem.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.flag_rounded, color: V.gem, size: 22)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Set a goal', style: VT.title(15, weight: FontWeight.w600)),
                  Text("Pick a number of gems to save up for. We'll tell you when you get there.", style: VT.body(12, color: V.text2)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: V.muted),
          ],
        ),
      );
    }
    final gems = wallet.gems;
    final f = (gems / goal).clamp(0.0, 1.0);
    final done = gems >= goal;
    return Panel(
      onTap: () => _edit(context),
      border: V.gem.withValues(alpha: 0.25),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(done ? Icons.emoji_events_rounded : Icons.flag_rounded, size: 18, color: V.gem),
              const SizedBox(width: 8),
              Expanded(child: Text(done ? 'Goal reached 🎯' : 'Gem goal', style: VT.title(15, weight: FontWeight.w600))),
              Text('≈ ${Fmt.gemsAsUsd(goal)}', style: VT.body(12, color: V.text2)),
              const SizedBox(width: 4),
              const Icon(Icons.edit_rounded, size: 15, color: V.muted),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: f, minHeight: 8, backgroundColor: V.surface3, color: V.gem)),
          const SizedBox(height: 8),
          Row(
            children: [
              Text('${Fmt.thousands(gems)} / ${Fmt.thousands(goal)}', style: VT.mono(12.5, color: V.text)),
              const Spacer(),
              Text(done ? 'Set a new goal' : '${Fmt.thousands(goal - gems)} to go', style: VT.label(12, color: done ? V.gem : V.text2, weight: FontWeight.w500)),
            ],
          ),
        ],
      ),
    );
  }
}

class _GoalDialog extends StatefulWidget {
  const _GoalDialog({this.current});
  final int? current;

  @override
  State<_GoalDialog> createState() => _GoalDialogState();
}

class _GoalDialogState extends State<_GoalDialog> {
  late final _c = TextEditingController(text: widget.current?.toString() ?? '');
  String? _error;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _save() {
    final n = int.tryParse(_c.text.replaceAll(',', '').trim());
    if (n == null || n < WalletProvider.minGemGoal || n > WalletProvider.maxGemGoal) {
      setState(() => _error = 'Between ${Fmt.thousands(WalletProvider.minGemGoal)} and ${Fmt.thousands(WalletProvider.maxGemGoal)} gems');
      return;
    }
    Navigator.of(context).pop((n,));
  }

  @override
  Widget build(BuildContext context) {
    final n = int.tryParse(_c.text.replaceAll(',', '').trim());
    return AlertDialog(
      title: const Text('Gem goal'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _c,
            autofocus: true,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(hintText: 'e.g. 10000', errorText: _error, prefixIcon: const Icon(Icons.diamond_rounded, color: V.gem)),
            onChanged: (_) => setState(() => _error = null),
            onSubmitted: (_) => _save(),
          ),
          const SizedBox(height: 8),
          Text(n == null ? 'Gems you get from gifts count toward it.' : '≈ ${Fmt.gemsAsUsd(n)} when you cash out', style: VT.body(12.5, color: V.text2)),
        ],
      ),
      actions: [
        if (widget.current != null) TextButton(onPressed: () => Navigator.of(context).pop((null,)), child: const Text('Remove', style: TextStyle(color: V.bad))),
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel', style: TextStyle(color: V.text2))),
        TextButton(onPressed: _save, child: const Text('Save')),
      ],
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
    Widget cell(String value, String label, {Color color = V.text, Widget? icon}) => Expanded(
          child: Column(
            children: [
              Row(mainAxisSize: MainAxisSize.min, children: [if (icon != null) ...[icon, const SizedBox(width: 4)], Text(value, style: VT.number(18, color: color))]),
              const SizedBox(height: 2),
              Text(label, textAlign: TextAlign.center, style: VT.body(11, color: V.muted, height: 1.2)),
            ],
          ),
        );
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Panel(
        gradient: const LinearGradient(colors: [Color(0xFF1F1830), V.surface], begin: Alignment.topLeft, end: Alignment.bottomRight),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Headline('Your week on ', accent: 'Vibe', size: 20),
            if (r.weekStart != null) Text('${Fmt.date(r.weekStart!)} – ${Fmt.date(r.weekEnd!.subtract(const Duration(days: 1)))}', style: VT.body(12, color: V.muted)),
            const SizedBox(height: 14),
            Row(children: [
              cell(Fmt.thousands(r.gemsEarned), 'Gems earned', color: V.gem, icon: const GemIcon(size: 15)),
              cell(Fmt.thousands(r.giftsReceived), 'Gifts'),
              cell(Fmt.thousands(r.likesReceived), 'Likes'),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              cell(Fmt.thousands(r.newFollowers), 'New followers'),
              cell(Fmt.thousands(r.matches), 'Matches'),
              cell('${r.bestStreak}', 'Best streak', color: r.bestStreak > 0 ? V.flame : V.text),
            ]),
          ],
        ),
      ),
    );
  }
}
