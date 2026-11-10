import '../../core/cache/cached_image.dart';
import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/discover.dart';
import '../../providers/discover_provider.dart';
import '../store/vip_screen.dart';

/// People who liked you in Discover and are waiting for an answer. VIP
/// sees who they are and can like back (a match) or pass; everyone else
/// sees the count and blurred faces, and an invitation to VIP.
class LikedYouScreen extends StatefulWidget {
  const LikedYouScreen({super.key});

  @override
  State<LikedYouScreen> createState() => _LikedYouScreenState();
}

class _LikedYouScreenState extends State<LikedYouScreen> {
  final Set<String> _answered = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final d = context.read<DiscoverProvider>();
      unawaited(d.loadLikedYou());
      d.markLikesSeen();
    });
  }

  Future<void> _answer(DiscoverCard c, SwipeKind kind) async {
    final d = context.read<DiscoverProvider>();
    setState(() => _answered.add(c.profile.id));
    final r = await d.swipe(c, kind);
    if (!mounted) return;
    if (!r.ok) {
      setState(() => _answered.remove(c.profile.id));
      toast(context, r.failure == SwipeFailure.outOfLikes ? "You're out of likes for today" : (r.message ?? 'Try again'), error: true);
    }
    unawaited(d.loadStatus());
  }

  @override
  Widget build(BuildContext context) {
    final liked = context.watch<DiscoverProvider>().likedYou;
    final people = (liked?.people ?? const <DiscoverCard>[]).where((p) => !_answered.contains(p.profile.id)).toList();
    return Scaffold(
      appBar: vibeAppBar(context, 'Liked you'),
      body: liked == null
          ? const Center(child: CircularProgressIndicator())
          : liked.count == 0 || (liked.unlocked && people.isEmpty)
              ? const EmptyState(icon: SolarIconsBold.heart, title: 'No likes ', accent: 'waiting', body: "When someone likes you in Discover, they show up here. Like them back and it's a match.")
              : liked.unlocked
                  ? ListView(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                      children: [
                        Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: Text("Like them back and it's a match: the chat opens right away.", style: VT.body(14, color: V.text2, height: 1.45))),
                        const SizedBox(height: 14),
                        GridView.count(
                          crossAxisCount: 2,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          mainAxisSpacing: 10,
                          crossAxisSpacing: 10,
                          mainAxisExtent: 200,
                          children: [for (final c in people) _LikedTile(card: c, onAnswer: (k) => _answer(c, k))],
                        ),
                      ],
                    )
                  : Stack(
                      children: [
                        ListView(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 220),
                          children: [
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 4),
                              child: Text(
                                "${liked.count} ${liked.count == 1 ? 'person' : 'people'} liked you. Like them back in Discover and it's a match, or see who they are now.",
                                style: VT.body(14, color: V.text2, height: 1.45),
                              ),
                            ),
                            const SizedBox(height: 14),
                            GridView.count(
                              crossAxisCount: 2,
                              shrinkWrap: true,
                              physics: const NeverScrollableScrollPhysics(),
                              mainAxisSpacing: 10,
                              crossAxisSpacing: 10,
                              mainAxisExtent: 200,
                              children: [
                                for (final u in (liked.previews.isEmpty ? const [''] : liked.previews).take(liked.count.clamp(1, 6)))
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(20),
                                    child: Stack(fit: StackFit.expand, children: [
                                      ImageFiltered(
                                        imageFilter: ImageFilter.blur(sigmaX: 14, sigmaY: 14, tileMode: TileMode.decal),
                                        child: Transform.scale(scale: 1.2, child: u.startsWith('http') ? Image(image: netImage(u), fit: BoxFit.cover, errorBuilder: (_, _, _) => const ColoredBox(color: V.surface)) : const ColoredBox(color: V.surface)),
                                      ),
                                      const Align(
                                        alignment: Alignment.bottomCenter,
                                        child: SizedBox(height: 70, width: double.infinity, child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [Color(0xCC0B0A10), Color(0x000B0A10)])))),
                                      ),
                                      const Positioned(top: 10, right: 10, child: Icon(SolarIconsBold.lock, size: 18, color: Colors.white70)),
                                    ]),
                                  ),
                              ],
                            ),
                          ],
                        ),
                        Positioned(
                          left: 16,
                          right: 16,
                          bottom: MediaQuery.of(context).padding.bottom + 24,
                          child: Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(color: V.surface.withValues(alpha: 0.94), borderRadius: BorderRadius.circular(24), border: Border.all(color: V.gold.withValues(alpha: 0.3))),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Row(children: [
                                  const Icon(SolarIconsBold.crown, size: 22, color: V.gold),
                                  const SizedBox(width: 8),
                                  Text('See who liked you', style: VT.title(16, weight: FontWeight.w700)),
                                ]),
                                const SizedBox(height: 10),
                                Text('With VIP: see everyone who liked you, unlimited likes and free filters.', style: VT.body(13, color: V.text2)),
                                const SizedBox(height: 10),
                                GradientButton(
                                  label: 'Get VIP',
                                  height: 48,
                                  gradient: V.goldGrad,
                                  foreground: V.onGold,
                                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VipScreen())),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
    );
  }
}

class _LikedTile extends StatelessWidget {
  const _LikedTile({required this.card, required this.onAnswer});
  final DiscoverCard card;
  final ValueChanged<SwipeKind> onAnswer;

  @override
  Widget build(BuildContext context) {
    final p = card.profile;
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: Stack(fit: StackFit.expand, children: [
        if (p.avatarUrl.startsWith('http')) Image(image: netImage(p.avatarUrl), fit: BoxFit.cover, errorBuilder: (_, _, _) => const DecoratedBox(decoration: BoxDecoration(gradient: V.brand))) else const DecoratedBox(decoration: BoxDecoration(gradient: V.brand)),
        const DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, stops: [0.4, 1], colors: [Color(0x000B0A10), Color(0xE60B0A10)]))),
        if (card.superLikedMe)
          Positioned(
            top: 8,
            left: 8,
            child: Container(
              height: 24,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(color: const Color(0xFF60A5FA), borderRadius: BorderRadius.circular(12)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.star_rounded, size: 14, color: Colors.white), const SizedBox(width: 4), Text('Super Like', style: VT.label(11, color: Colors.white))]),
            ),
          ),
        Positioned(
          left: 10,
          right: 10,
          bottom: 10,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${p.name.split(' ').first}${p.age > 0 ? ', ${p.age}' : ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.title(14, color: Colors.white, weight: FontWeight.w700)),
            Text(card.activeLabel.isEmpty ? p.country.name : card.activeLabel, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(11.5, color: Colors.white70)),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: Semantics(
                  button: true,
                  label: 'Pass on ${p.name}',
                  excludeSemantics: true,
                  child: GestureDetector(
                    onTap: () => onAnswer(SwipeKind.pass),
                    child: Container(height: 36, decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(18), border: Border.all(color: Colors.white24)), child: const Icon(Icons.close_rounded, size: 18, color: Colors.white)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Semantics(
                  button: true,
                  label: 'Like ${p.name} back',
                  excludeSemantics: true,
                  child: GestureDetector(
                    onTap: () => onAnswer(SwipeKind.like),
                    child: Container(height: 36, decoration: BoxDecoration(gradient: V.brand, borderRadius: BorderRadius.circular(18)), child: const Icon(SolarIconsBold.heart, size: 18, color: Colors.white)),
                  ),
                ),
              ),
            ]),
          ]),
        ),
      ]),
    );
  }
}
