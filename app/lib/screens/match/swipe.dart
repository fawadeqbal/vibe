import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/match_provider.dart';
import '../../providers/social_provider.dart';

/// How far up (px) counts as "next person".
const swipeNextPx = 120.0;

/// A quick flick up counts too (px/s).
const _flick = 700.0;

/// Swiping up far or fast enough means "next".
bool isSwipeNext(double dy, double velocity) {
  if (dy >= 0) return false;
  return -dy >= swipeNextPx || (-dy >= 40 && -velocity >= _flick);
}

/// The video stage in a call: swipe up for the next person (it slides up
/// with "Let go for someone new"), double-tap to like. Controls drawn above
/// it keep working; the Next button stays for anyone who doesn't swipe.
class SwipeStage extends StatefulWidget {
  const SwipeStage({super.key, required this.child, required this.onNext, required this.onLike});
  final Widget child;
  final VoidCallback onNext;
  final VoidCallback onLike;

  @override
  State<SwipeStage> createState() => _SwipeStageState();
}

class _SwipeStageState extends State<SwipeStage> {
  double _dy = 0;
  bool _dragging = false;
  int _heart = 0;

  void _end(DragEndDetails d) {
    final next = isSwipeNext(_dy, d.primaryVelocity ?? 0);
    setState(() {
      _dragging = false;
      _dy = next ? -MediaQuery.of(context).size.height : 0;
    });
    if (next) {
      HapticFeedback.mediumImpact();
      widget.onNext();
      Future<void>.delayed(const Duration(milliseconds: 350), () {
        if (mounted) setState(() => _dy = 0);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final pull = (-_dy / swipeNextPx).clamp(0.0, 1.0);
    return Stack(
      fit: StackFit.expand,
      children: [
        AnimatedContainer(
          duration: _dragging ? Duration.zero : const Duration(milliseconds: 300),
          curve: VMotion.out,
          transform: Matrix4.translationValues(0, _dy, 0),
          child: ClipRRect(borderRadius: BorderRadius.circular(_dy == 0 ? 0 : 36), child: widget.child),
        ),
        GestureDetector(
          behavior: HitTestBehavior.translucent,
          onVerticalDragStart: (_) => setState(() => _dragging = true),
          onVerticalDragUpdate: (d) => setState(() => _dy = (_dy + d.delta.dy).clamp(-double.infinity, 0)),
          onVerticalDragEnd: _end,
          onVerticalDragCancel: () => setState(() {
            _dragging = false;
            _dy = 0;
          }),
          onDoubleTap: () {
            HapticFeedback.lightImpact();
            widget.onLike();
            setState(() => _heart++);
          },
        ),
        if (_dy < -12 && _dragging)
          Positioned(
            left: 24,
            right: 24,
            top: MediaQuery.of(context).size.height * 0.3,
            child: IgnorePointer(
              child: Center(
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 320),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
                  decoration: BoxDecoration(color: V.bg.withValues(alpha: 0.72), borderRadius: BorderRadius.circular(24)),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: const BoxDecoration(gradient: V.brand, shape: BoxShape.circle),
                        child: const Icon(Icons.arrow_upward_rounded, size: 28, color: Colors.white),
                      ),
                      const SizedBox(height: 12),
                      Text(pull >= 1 ? 'Let go for someone new' : 'Swipe up for someone new', style: VT.title(19, weight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text('Pull back down to stay', style: VT.body(13, color: V.text2)),
                      const SizedBox(height: 12),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(3),
                        child: SizedBox(
                          width: 140,
                          height: 6,
                          child: LinearProgressIndicator(value: pull, color: V.pink, backgroundColor: V.surface),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        if (_heart > 0) IgnorePointer(child: _HeartPop(key: ValueKey(_heart))),
      ],
    );
  }
}

class _HeartPop extends StatefulWidget {
  const _HeartPop({super.key});

  @override
  State<_HeartPop> createState() => _HeartPopState();
}

class _HeartPopState extends State<_HeartPop> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, _) {
        final t = _c.value;
        final scale = t < 0.3 ? 0.4 + t / 0.3 * 0.75 : (t < 0.6 ? 1.15 - (t - 0.3) / 0.3 * 0.15 : 1.0);
        final opacity = t < 0.3 ? t / 0.3 : (t > 0.7 ? (1 - t) / 0.3 : 1.0);
        return Center(
          child: Opacity(
            opacity: opacity.clamp(0.0, 1.0),
            child: Transform.scale(
              scale: scale,
              child: const Icon(SolarIconsBold.heart, size: 132, color: V.pink),
            ),
          ),
        );
      },
    );
  }
}

const _hintKey = 'vibe.swipeHint.v1';

/// Whether the "swipe up for next" hint was already shown on this device.
Future<bool> swipeHintSeen() async {
  try {
    return (await SharedPreferences.getInstance()).getBool(_hintKey) ?? false;
  } catch (_) {
    return true;
  }
}

Future<void> markSwipeHintSeen() async {
  try {
    await (await SharedPreferences.getInstance()).setBool(_hintKey, true);
  } catch (_) {}
}

/// First call only: how to move on and how to like, then "Got it".
class SwipeHint extends StatefulWidget {
  const SwipeHint({super.key, required this.onDone});
  final VoidCallback onDone;

  @override
  State<SwipeHint> createState() => _SwipeHintState();
}

class _SwipeHintState extends State<SwipeHint> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final still = media.disableAnimations;
    Widget tip(IconData icon, Color c, String title, String sub) => Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: V.surface2.withValues(alpha: 0.92), borderRadius: BorderRadius.circular(16)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: c),
            const SizedBox(height: 4),
            Text(title, style: VT.title(13, weight: FontWeight.w700)),
            Text(sub, style: VT.body(12, color: V.text2)),
          ],
        ),
      ),
    );
    return Semantics(
      scopesRoute: true,
      explicitChildNodes: true,
      label: 'How to move on',
      child: Container(
        color: Colors.black.withValues(alpha: 0.75),
        padding: EdgeInsets.fromLTRB(24, media.padding.top + 24, 24, media.padding.bottom + 28),
        child: Column(
          children: [
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  child: Column(
                    children: [
                      Container(
                        width: 84,
                        height: 200,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: Colors.white30, width: 1.5),
                        ),
                        child: Stack(
                          alignment: Alignment.topCenter,
                          children: [
                            const Positioned(top: 10, child: Icon(Icons.keyboard_arrow_up_rounded, size: 30, color: V.pinkSoft)),
                            AnimatedBuilder(
                              animation: _c,
                              builder: (_, _) {
                                final t = still ? 0.5 : _c.value;
                                final o = t < 0.2 ? t / 0.2 : (t > 0.8 ? (1 - t) / 0.2 : 1.0);
                                return Positioned(
                                  bottom: 24 + t * 110,
                                  child: Opacity(
                                    opacity: o.clamp(0.0, 1.0),
                                    child: Container(
                                      width: 54,
                                      height: 54,
                                      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.9), shape: BoxShape.circle),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 28),
                      Headline('Swipe up for the ', accent: 'next person', accentColor: V.pinkSoft, size: 26, textAlign: TextAlign.center),
                      const SizedBox(height: 8),
                      Text(
                        "Not a vibe? One swipe and you're on to someone new. The Next button works too.",
                        textAlign: TextAlign.center,
                        style: VT.body(14, color: V.text2, height: 1.5),
                      ),
                      const SizedBox(height: 20),
                      Row(
                        children: [
                          tip(SolarIconsBold.heart, V.pinkSoft, 'Double-tap', 'to like them'),
                          const SizedBox(width: 10),
                          tip(SolarIconsBold.skipNext, V.lavender, 'Next button', 'same as a swipe'),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                onPressed: widget.onDone,
                style: FilledButton.styleFrom(backgroundColor: V.text, foregroundColor: V.bg, shape: const StadiumBorder()),
                child: Text(
                  'Got it',
                  style: VT.title(16, color: V.bg, weight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// While finding the next person after a skip: who you just left, with
/// Add friend and Undo (call them back — the reconnect price, or free).
class SkippedBar extends StatelessWidget {
  const SkippedBar({super.key, required this.onUndo, required this.onAddFriend});
  final VoidCallback onUndo;
  final VoidCallback onAddFriend;

  @override
  Widget build(BuildContext context) {
    final m = context.watch<MatchProvider>();
    final p = m.lastPartner;
    if (p == null || m.endReason != EndReason.skipped || !m.isSearching) return const SizedBox.shrink();
    final friend = context.select<SocialProvider, FriendState>((s) => s.stateOf(p.id));
    final last = m.history.isEmpty ? null : m.history.first;
    final together = last?.endedAt == null ? null : Fmt.clock(last!.endedAt!.difference(last.startedAt));
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: V.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 30, offset: const Offset(0, 12))],
        ),
        child: Row(
          children: [
            VAvatar(url: p.avatarUrl, name: p.name, size: 32),
            const SizedBox(width: 10),
            Expanded(
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: p.name,
                      style: VT.body(13, weight: FontWeight.w700),
                    ),
                    if (together != null) TextSpan(text: ' · $together together', style: VT.body(13)),
                  ],
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (friend == FriendState.none || friend == FriendState.incoming) ...[
              const SizedBox(width: 6),
              _pill('Add friend', V.lavender, V.violet.withValues(alpha: 0.24), onAddFriend),
            ] else if (friend == FriendState.requested)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text('Request sent', style: VT.label(12, color: V.text2)),
              ),
            const SizedBox(width: 6),
            _pill(
              m.reconnectFree ? 'Undo · free' : 'Undo · ${m.reconnectPrice}',
              V.gold,
              V.gold.withValues(alpha: 0.14),
              onUndo,
              semantics: m.reconnectFree ? 'Undo, go back to ${p.name}, free' : 'Undo, go back to ${p.name}, ${m.reconnectPrice} coins',
            ),
          ],
        ),
      ),
    );
  }

  Widget _pill(String label, Color fg, Color bg, VoidCallback onTap, {String? semantics}) => Semantics(
    button: true,
    label: semantics ?? label,
    excludeSemantics: true,
    child: TextButton(
      onPressed: onTap,
      style: TextButton.styleFrom(backgroundColor: bg, foregroundColor: fg, shape: const StadiumBorder(), minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 12)),
      child: Text(
        label,
        style: VT.label(12.5, color: fg, weight: FontWeight.w700),
      ),
    ),
  );
}
