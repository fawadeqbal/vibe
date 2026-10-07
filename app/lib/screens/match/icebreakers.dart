import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
import '../../providers/match_provider.dart';

/// "Play": pick one of the three icebreaker games.
Future<IcebreakerGame?> showGamePicker(BuildContext context) {
  return showVibeSheet<IcebreakerGame>(
    context,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Headline('Break the ', accent: 'ice', size: 24),
          const SizedBox(height: 6),
          Text('A question pops up for both of you. Either of you can skip or close it.', style: VT.body(13, color: V.text2)),
          const SizedBox(height: 16),
          GroupCard(
            children: [
              for (final g in IcebreakerGame.values)
                GroupRow(
                  icon: switch (g) { IcebreakerGame.wyr => SolarIconsBold.routing, IcebreakerGame.thisOrThat => SolarIconsBold.bolt, IcebreakerGame.questions => SolarIconsBold.dialog2 },
                  iconColor: V.lavender,
                  iconBg: V.violet.withValues(alpha: 0.14),
                  title: g.label,
                  subtitle: g.blurb,
                  trailing: Text(g.emoji, style: const TextStyle(fontSize: 20)),
                  onTap: () => Navigator.of(context).pop(g),
                ),
            ],
          ),
        ],
      ),
    ),
  );
}

/// The prompt over the video (bottom third, above the composer): two option
/// pills, then both picks once you've both answered. Next and ✕ for either.
class GameCard extends StatelessWidget {
  const GameCard({super.key, required this.m, required this.round});
  final MatchProvider m;
  final GameRound round;

  Future<void> _run(BuildContext context, Future<void> Function() fn) async {
    try {
      await fn();
    } on ApiException catch (e) {
      if (context.mounted) toast(context, e.code == 'RATE_LIMITED' ? 'One moment…' : e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = round;
    final name = m.partner?.name ?? 'Them';
    final String status;
    if (r.revealed) {
      status = r.hasOptions ? (r.same ? 'You both picked ${r.options![r.mine!]}!' : 'Different picks — talk it out') : 'Both in — your turn to talk';
    } else if (r.iAnswered) {
      status = 'Waiting for $name…';
    } else if (r.partnerAnswered) {
      status = '$name answered — your pick?';
    } else {
      status = r.byMe ? 'You started this one' : '$name started a game';
    }
    return Glass(
      radius: 24,
      color: V.bg2.withValues(alpha: 0.62),
      border: V.violet.withValues(alpha: 0.35),
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Text('${r.game.emoji}  ${r.game.label.toUpperCase()}', style: VT.overline(color: V.lavender)),
              const Spacer(),
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => _run(context, m.nextGame),
                child: Padding(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), child: Text('Next', style: VT.label(13, color: Colors.white))),
              ),
              Semantics(
                button: true,
                label: 'Close game',
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => _run(context, m.closeGame),
                  child: const Padding(padding: EdgeInsets.all(4), child: Icon(Icons.close_rounded, size: 20, color: V.text2)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Padding(padding: const EdgeInsets.only(right: 8), child: Text(r.text, style: VT.title(17, color: Colors.white, height: 1.3))),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: r.hasOptions
                ? Row(
                    children: [
                      for (var i = 0; i < 2; i++) ...[
                        if (i > 0) const SizedBox(width: 8),
                        Expanded(child: _Option(text: r.options![i], mine: r.mine == i, theirs: r.revealed && r.theirs == i, partner: name, onTap: r.iAnswered ? null : () => _run(context, () => m.answerGame(i)))),
                      ],
                    ],
                  )
                : _Option(text: r.iAnswered ? 'Answered' : 'I answered', mine: r.iAnswered, theirs: false, partner: name, onTap: r.iAnswered ? null : () => _run(context, () => m.answerGame(null))),
          ),
          const SizedBox(height: 10),
          Semantics(liveRegion: true, child: Text(status, style: VT.label(12.5, color: r.same ? V.pinkSoft : Colors.white.withValues(alpha: 0.75), weight: FontWeight.w500))),
        ],
      ),
    );
  }
}

class _Option extends StatelessWidget {
  const _Option({required this.text, required this.mine, required this.theirs, required this.partner, required this.onTap});
  final String text;
  final bool mine;
  final bool theirs;
  final String partner;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final picked = mine || theirs;
    final who = [if (mine) 'You', if (theirs) partner].join(' + ');
    return Semantics(
      button: onTap != null,
      selected: mine,
      label: who.isEmpty ? text : '$text, $who',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap == null
            ? null
            : () {
                HapticFeedback.selectionClick();
                onTap!();
              },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: picked ? V.violet.withValues(alpha: mine && theirs ? 0.55 : 0.38) : Colors.white.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: picked ? V.lavender.withValues(alpha: 0.7) : Colors.white.withValues(alpha: 0.18)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(text, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: VT.label(13.5, color: Colors.white)),
              if (who.isNotEmpty) Text(who, style: VT.label(10.5, color: V.lavender, weight: FontWeight.w500)),
            ],
          ),
        ),
      ),
    );
  }
}

/// "It's a vibe!" — both liked each other. Rings burst for a moment, with
/// the in-call friend action (hidden when already friends/requested).
class MutualCelebration extends StatefulWidget {
  const MutualCelebration({super.key, required this.name, required this.onDone, this.onAddFriend, this.duration = const Duration(milliseconds: 3000)});
  final String name;
  final VoidCallback onDone;

  /// Null when already friends or requested.
  final VoidCallback? onAddFriend;
  final Duration duration;

  @override
  State<MutualCelebration> createState() => _MutualCelebrationState();
}

class _MutualCelebrationState extends State<MutualCelebration> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..forward();
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    HapticFeedback.heavyImpact();
    _timer = Timer(widget.duration, widget.onDone);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      label: "It's a vibe! You both liked each other",
      child: Stack(
        alignment: Alignment.center,
        children: [
          IgnorePointer(child: CustomPaint(size: const Size(340, 340), painter: _Burst(_c))),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Glass(
              radius: 28,
              color: V.bg2.withValues(alpha: 0.6),
              border: V.pink.withValues(alpha: 0.4),
              padding: const EdgeInsets.fromLTRB(22, 20, 22, 18),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(SolarIconsBold.heart, color: V.pink, size: 34),
                  const SizedBox(height: 6),
                  const Headline("It's a ", accent: 'vibe!', size: 32, textAlign: TextAlign.center, accentColor: V.pinkSoft),
                  const SizedBox(height: 4),
                  Text('You and ${widget.name} liked each other', textAlign: TextAlign.center, style: VT.body(14, color: Colors.white.withValues(alpha: 0.85))),
                  if (widget.onAddFriend != null) ...[
                    const SizedBox(height: 14),
                    GradientButton(
                      label: 'Add friend',
                      icon: SolarIconsBold.userPlusRounded,
                      height: 46,
                      expand: false,
                      onTap: () {
                        widget.onAddFriend!();
                        widget.onDone();
                      },
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Pink → violet rings bursting outward.
class _Burst extends CustomPainter {
  _Burst(this.t) : super(repaint: t);
  final Animation<double> t;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final maxR = size.shortestSide / 2;
    for (var i = 0; i < 3; i++) {
      final v = ((t.value - i * 0.15) / 0.85).clamp(0.0, 1.0);
      if (v <= 0) continue;
      final ease = Curves.easeOutCubic.transform(v);
      final color = Color.lerp(V.pink, V.violet, i / 2)!;
      canvas.drawCircle(c, maxR * (0.35 + 0.65 * ease), Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3 + 5 * (1 - ease)
        ..color = color.withValues(alpha: (1 - ease) * 0.8));
    }
    // A few sparks.
    for (var k = 0; k < 10; k++) {
      final a = k / 10 * math.pi * 2;
      final ease = Curves.easeOut.transform(t.value);
      final p = c + Offset(math.cos(a), math.sin(a)) * maxR * (0.3 + 0.6 * ease);
      canvas.drawCircle(p, 3 * (1 - t.value) + 0.5, Paint()..color = (k.isEven ? V.pinkSoft : V.lavender).withValues(alpha: 1 - t.value));
    }
  }

  @override
  bool shouldRepaint(_Burst old) => false;
}
