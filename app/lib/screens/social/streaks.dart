import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
import '../../providers/social_provider.dart';
import '../../providers/wallet_provider.dart';
import '../store/store_screen.dart';

/// The 🔥 chip after a friend's name: grey until today counted, orange once
/// it has, amber and breathing (+ "ends tonight") when it ends at midnight.
class StreakChip extends StatefulWidget {
  const StreakChip({super.key, required this.streak, this.onTap, this.showEndsTonight = true});
  final StreakView streak;
  final VoidCallback? onTap;

  /// "ends tonight" next to the number when at risk (chats list, chat header).
  final bool showEndsTonight;

  @override
  State<StreakChip> createState() => _StreakChipState();
}

class _StreakChipState extends State<StreakChip> with SingleTickerProviderStateMixin {
  AnimationController? _pulse;

  @override
  void initState() {
    super.initState();
    _syncPulse();
  }

  @override
  void didUpdateWidget(StreakChip old) {
    super.didUpdateWidget(old);
    _syncPulse();
  }

  void _syncPulse() {
    if (widget.streak.atRisk && _pulse == null) {
      _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat(reverse: true);
    } else if (!widget.streak.atRisk && _pulse != null) {
      _pulse!.dispose();
      _pulse = null;
    }
  }

  @override
  void dispose() {
    _pulse?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.streak;
    if (s.count <= 0) return const SizedBox.shrink();
    final color = s.atRisk ? V.warn : (s.today ? V.flame : V.muted);
    final label = s.atRisk && widget.showEndsTonight ? '${s.count} · ends tonight' : '${s.count}';
    Widget chip = Container(
      height: 22,
      padding: const EdgeInsets.only(left: 5, right: 7),
      decoration: BoxDecoration(color: color.withValues(alpha: s.today || s.atRisk ? 0.16 : 0.1), borderRadius: BorderRadius.circular(11)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.local_fire_department_rounded, size: 15, color: color),
          const SizedBox(width: 2),
          Text(label, style: VT.number(11.5, color: color, weight: FontWeight.w700)),
        ],
      ),
    );
    final p = _pulse;
    // "Reduce motion": amber, but still.
    if (p != null && !(MediaQuery.maybeDisableAnimationsOf(context) ?? false)) chip = FadeTransition(opacity: Tween(begin: 0.55, end: 1.0).animate(p), child: chip);
    final semantics = '${s.count}-day streak${s.atRisk ? ', ends tonight' : s.today ? '' : ', not counted yet today'}';
    return Semantics(
      label: semantics,
      button: widget.onTap != null,
      excludeSemantics: true,
      child: GestureDetector(behavior: HitTestBehavior.opaque, onTap: widget.onTap, child: chip),
    );
  }
}

/// "Streak lost · Restore 🔥 12" — in the chats list and the chat header.
class RestoreStreakButton extends StatelessWidget {
  const RestoreStreakButton({super.key, required this.friend});
  final Friend friend;

  @override
  Widget build(BuildContext context) {
    final s = friend.streak;
    return Semantics(
      button: true,
      label: 'Restore your ${s.lostCount}-day streak',
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => restoreStreakFlow(context, friend),
        child: Container(
          height: 24,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(color: V.flame.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(12), border: Border.all(color: V.flame.withValues(alpha: 0.4))),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Restore ', style: VT.label(11.5, color: V.flame)),
              const Icon(Icons.local_fire_department_rounded, size: 14, color: V.flame),
              Text('${s.lostCount}', style: VT.number(11.5, color: V.flame)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Confirm the price, restore, explain the outcome.
Future<void> restoreStreakFlow(BuildContext context, Friend f) async {
  final social = context.read<SocialProvider>();
  final s = f.streak;
  if (!s.restorable) return;
  final cost = s.restoreCost;
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('Restore your ${s.lostCount}-day streak?'),
      content: Text(cost == 0 ? 'Your streak with ${f.profile.name} broke yesterday. With VIP, bringing it back is free.' : 'Your streak with ${f.profile.name} broke yesterday. Bring it back for $cost coins — then message each other today to keep it going.'),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Not now', style: TextStyle(color: V.text2))),
        TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(cost == 0 ? 'Restore free' : 'Restore · $cost', style: TextStyle(color: cost == 0 ? V.flame : V.gold))),
      ],
    ),
  );
  if (ok != true || !context.mounted) return;
  try {
    if (await social.restoreStreak(f.profile.id)) {
      if (context.mounted) toast(context, 'Streak restored · ${s.lostCount} days');
      return;
    }
    if (!context.mounted) return;
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Not enough coins'),
        content: Text('Restoring costs $cost coins.\n\nTop up, or earn free coins in the store.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Not now', style: TextStyle(color: V.text2))),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Get coins')),
        ],
      ),
    );
    if (go == true && context.mounted) Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StoreScreen(asPage: true)));
  } on ApiException catch (e) {
    if (context.mounted) toast(context, e.code == 'STREAK_NOT_RESTORABLE' ? 'Too late — this streak can no longer be restored.' : e.message, error: true);
  }
}

/// What a streak is and where yours stands (tap on the chat header chip).
Future<void> showStreakSheet(BuildContext context, Friend f) {
  final s = f.streak;
  final name = f.profile.name;
  final vip = context.read<WalletProvider>().isVip;
  Widget side(String who, bool done) => Row(
        children: [
          Icon(done ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded, size: 18, color: done ? V.flame : V.muted),
          const SizedBox(width: 8),
          Text(who, style: VT.body(14, color: done ? V.text : V.text2)),
          const Spacer(),
          Text(done ? 'Sent today' : 'Not yet today', style: VT.label(12, color: done ? V.flame : V.muted, weight: FontWeight.w500)),
        ],
      );
  return showVibeSheet<void>(
    context,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: V.flame.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(16)),
                child: Icon(Icons.local_fire_department_rounded, size: 28, color: s.atRisk ? V.warn : V.flame),
              ),
              const SizedBox(width: 14),
              Expanded(child: Headline(s.count > 0 ? '${s.count}-day ' : 'Start a ', accent: 'streak', size: 26)),
            ],
          ),
          const SizedBox(height: 12),
          Text('Message each other every day to keep it going — a call of a minute or more counts too.${s.best > 0 ? ' Best: ${s.best}.' : ''}', style: VT.body(14, color: V.text2, height: 1.5)),
          if (s.atRisk) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: V.warn.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(14), border: Border.all(color: V.warn.withValues(alpha: 0.3))),
              child: Row(children: [
                const Icon(Icons.hourglass_bottom_rounded, size: 18, color: V.warn),
                const SizedBox(width: 8),
                Expanded(child: Text('Ends at midnight unless you both send something today.', style: VT.body(13, color: V.text))),
              ]),
            ),
          ],
          const SizedBox(height: 16),
          GroupCard(
            dividerInset: 16,
            children: [
              Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12), child: side('You', s.mineToday)),
              Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12), child: side(name, s.theirsToday)),
            ],
          ),
          const SizedBox(height: 12),
          Text('Every 7th day you both get ${Economy.streakWeeklyCoins} coins. A streak that breaks can be restored the next day${vip ? ' — free with VIP' : ' for ${Economy.streakRestoreCost} coins'}.', style: VT.body(12.5, color: V.muted, height: 1.45)),
        ],
      ),
    ),
  );
}
