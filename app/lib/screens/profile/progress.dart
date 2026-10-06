import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/engagement_provider.dart';
import '../../providers/session_provider.dart';
import '../invite/share_cards.dart';
import 'leaderboard_screen.dart';

/// "Lv 7" — next to a name on profiles, and on the partner in a call
/// ([glass] over video).
class LevelChip extends StatelessWidget {
  const LevelChip({super.key, required this.level, this.glass = false, this.size = 11});
  final int level;
  final bool glass;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (level <= 0) return const SizedBox.shrink();
    return Semantics(
      label: 'Level $level',
      excludeSemantics: true,
      child: Container(
        height: size + 9,
        padding: EdgeInsets.symmetric(horizontal: size * 0.6),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: glass ? V.bg2.withValues(alpha: 0.55) : V.level.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular((size + 9) / 2),
          border: Border.all(color: V.level.withValues(alpha: glass ? 0.5 : 0.25)),
        ),
        child: Text('Lv $level', style: VT.number(size, color: V.level, weight: FontWeight.w700)),
      ),
    );
  }
}

/// A ring that fills with the XP into the current level.
class LevelRing extends StatelessWidget {
  const LevelRing({super.key, required this.progress, this.size = 64});
  final LevelProgress progress;
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _RingPainter(progress.fraction),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('LV', style: VT.overline(color: V.text2).copyWith(fontSize: 9, letterSpacing: 1)),
              Text('${progress.level}', style: VT.number(size * 0.34)),
            ],
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.fraction);
  final double fraction;

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 5.0;
    final rect = Offset.zero & size;
    final r = rect.deflate(stroke / 2);
    canvas.drawArc(r, 0, math.pi * 2, false, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = V.surface3);
    if (fraction <= 0) return;
    canvas.drawArc(r, -math.pi / 2, math.pi * 2 * fraction, false, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = V.level);
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.fraction != fraction;
}

/// A round emoji tile for a badge (dimmed while locked).
class BadgeMedal extends StatelessWidget {
  const BadgeMedal({super.key, required this.badge, this.size = 40, this.locked = false});
  final ProgressBadge badge;
  final double size;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: badge.name,
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: locked ? V.surface2 : V.level.withValues(alpha: 0.12),
          border: Border.all(color: locked ? V.lineSoft : V.level.withValues(alpha: 0.3)),
        ),
        child: Opacity(opacity: locked ? 0.35 : 1, child: Text(badge.emoji, style: TextStyle(fontSize: size * 0.48))),
      ),
    );
  }
}

/// Earned badges on someone's profile (ids only).
class BadgesRow extends StatelessWidget {
  const BadgesRow({super.key, required this.ids});
  final List<String> ids;

  @override
  Widget build(BuildContext context) {
    if (ids.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final id in ids)
          Builder(builder: (context) {
            final b = Badges.info(id);
            return Container(
              height: 30,
              padding: const EdgeInsets.only(left: 6, right: 10),
              decoration: BoxDecoration(color: V.level.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(15), border: Border.all(color: V.level.withValues(alpha: 0.22))),
              child: Row(mainAxisSize: MainAxisSize.min, children: [Text(b.emoji, style: const TextStyle(fontSize: 15)), const SizedBox(width: 5), Text(b.name, style: VT.label(12, color: V.text))]),
            );
          }),
      ],
    );
  }
}

/// Me → Progress: level ring, XP to the next level, earned badges, and the
/// way into the badges sheet and this week's leaderboard.
class ProgressCard extends StatefulWidget {
  const ProgressCard({super.key});

  @override
  State<ProgressCard> createState() => _ProgressCardState();
}

class _ProgressCardState extends State<ProgressCard> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      try {
        await context.read<EngagementProvider>().loadProgress();
      } on ApiException catch (_) {}
    });
  }

  @override
  Widget build(BuildContext context) {
    final e = context.watch<EngagementProvider>();
    final l = e.level;
    final p = e.progress;
    final earned = p?.earned ?? const <ProgressBadge>[];
    return Container(
      decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(V.r), border: Border.all(color: V.line)),
      child: Material(
        color: Colors.transparent,
        child: Column(
          children: [
            InkWell(
              onTap: p == null ? null : () => showBadgesSheet(context, p),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
                child: Row(
                  children: [
                    LevelRing(progress: l),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(child: Text('Level ${l.level}', style: VT.title(17))),
                              if (l.level > 0)
                                Semantics(
                                  button: true,
                                  label: 'Share your level',
                                  excludeSemantics: true,
                                  child: InkWell(
                                    borderRadius: BorderRadius.circular(14),
                                    onTap: () => showShareCardSheet(context, ShareCardData.level(l.level, me: context.read<SessionProvider>().me?.name ?? '')),
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                                        const Icon(Icons.ios_share_rounded, size: 15, color: V.pinkSoft),
                                        const SizedBox(width: 4),
                                        Text('Share', style: VT.label(12.5, color: V.pinkSoft)),
                                      ]),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text('${Fmt.thousands(l.xpToNext)} XP to Level ${l.level + 1}', style: VT.body(12.5, color: V.text2)),
                          const SizedBox(height: 8),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(3),
                            child: LinearProgressIndicator(value: l.fraction, minHeight: 5, backgroundColor: V.surface3, color: V.level),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const Divider(height: 1, color: V.lineSoft),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 10, 12),
              child: Row(
                children: [
                  if (earned.isEmpty)
                    Expanded(child: Text(p == null ? 'Badges' : 'No badges yet — talk, like, gift', style: VT.body(13, color: V.text2)))
                  else
                    Expanded(
                      child: SizedBox(
                        height: 34,
                        child: ListView(scrollDirection: Axis.horizontal, children: [for (final b in earned) Padding(padding: const EdgeInsets.only(right: 6), child: BadgeMedal(badge: b, size: 34))]),
                      ),
                    ),
                  TextButton(onPressed: p == null ? null : () => showBadgesSheet(context, p), child: const Text('See all')),
                ],
              ),
            ),
            const Divider(height: 1, color: V.lineSoft),
            GroupRow(
              icon: Icons.emoji_events_rounded,
              iconColor: V.level,
              iconBg: V.level.withValues(alpha: 0.12),
              title: "This week's top",
              subtitle: p == null ? 'Weekly leaderboards' : 'You earned ${Fmt.thousands(p.weekXp)} XP this week',
              trailing: const Icon(Icons.chevron_right_rounded, color: V.muted),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LeaderboardScreen())),
            ),
          ],
        ),
      ),
    );
  }
}

/// Every badge, earned first; locked ones show how close you are.
Future<void> showBadgesSheet(BuildContext context, ProgressView p) {
  final list = [...p.badges]..sort((a, b) => (a.earned == b.earned) ? 0 : (a.earned ? -1 : 1));
  return showVibeSheet<void>(
    context,
    scrollable: true,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Badges · ${p.earned.length}/${p.badges.length}', style: VT.title(20)),
          const SizedBox(height: 4),
          Text('XP comes from good calls, likes and gifts you receive, check-ins and streaks.', style: VT.body(13, color: V.text2)),
          const SizedBox(height: 14),
          for (final b in list)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 7),
              child: Row(
                children: [
                  BadgeMedal(badge: b, size: 44, locked: !b.earned),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Expanded(child: Text(b.name, style: VT.title(15, weight: FontWeight.w600, color: b.earned ? V.text : V.text2))),
                          if (b.earned) const Icon(Icons.check_circle_rounded, size: 18, color: V.level) else Text('${Fmt.thousands(b.progress)}/${Fmt.thousands(b.target)}', style: VT.mono(12)),
                        ]),
                        Text(Badges.how(b), style: VT.body(12, color: V.muted)),
                        if (!b.earned) ...[
                          const SizedBox(height: 6),
                          ClipRRect(borderRadius: BorderRadius.circular(2), child: LinearProgressIndicator(value: b.fraction, minHeight: 4, backgroundColor: V.surface3, color: V.level)),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    ),
  );
}

/// "Level 8!" after `progress:level-up`.
Future<void> showLevelUpSheet(BuildContext context, int level) {
  return showVibeSheet<void>(
    context,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          PulseRings(size: 150, color: V.violet, child: LevelRing(progress: LevelProgress(level: level, xp: LevelProgress.xpForLevel(level), levelXp: LevelProgress.xpForLevel(level), nextLevelXp: LevelProgress.xpForLevel(level + 1)), size: 84)),
          const SizedBox(height: 8),
          Headline('Level ', accent: '$level!', size: 32, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text('Good calls, likes and gifts got you here. Keep vibing.', textAlign: TextAlign.center, style: VT.body(14, color: V.text2)),
          const SizedBox(height: 20),
          GhostButton(label: 'Nice', expand: true, onTap: () => Navigator.of(context).pop()),
        ],
      ),
    ),
  );
}
