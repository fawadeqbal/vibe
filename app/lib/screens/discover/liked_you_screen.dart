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
                      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                      children: [
                        Text("Like them back and it's a match — the chat opens right away.", style: VT.body(14, color: V.text2)),
                        const SizedBox(height: 16),
                        GridView.count(
                          crossAxisCount: 2,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          childAspectRatio: 3 / 4,
                          children: [for (final c in people) _LikedTile(card: c, onAnswer: (k) => _answer(c, k))],
                        ),
                      ],
                    )
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                      children: [
                        GridView.count(
                          crossAxisCount: 3,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          mainAxisSpacing: 10,
                          crossAxisSpacing: 10,
                          childAspectRatio: 3 / 4,
                          children: [
                            for (final u in liked.previews.take(6))
                              ClipRRect(
                                borderRadius: BorderRadius.circular(18),
                                child: Stack(fit: StackFit.expand, children: [
                                  ImageFiltered(
                                    imageFilter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                                    child: u.startsWith('http') ? Image.network(u, fit: BoxFit.cover, errorBuilder: (_, _, _) => const ColoredBox(color: V.surface2)) : const ColoredBox(color: V.surface2),
                                  ),
                                  const Center(child: Icon(SolarIconsBold.lock, size: 20, color: Colors.white70)),
                                ]),
                              ),
                          ],
                        ),
                        const SizedBox(height: 24),
                        Text.rich(
                          TextSpan(children: [
                            TextSpan(text: '${liked.count} ${liked.count == 1 ? 'person likes' : 'people like'} ', style: VT.display(26)),
                            TextSpan(text: 'you', style: VT.serif(30, color: V.gold)),
                          ]),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        Text('With VIP you see who they are and can like them back — instant match. Or keep swiping: they may show up in your deck.', textAlign: TextAlign.center, style: VT.body(14, color: V.text2)),
                        const SizedBox(height: 24),
                        GradientButton(
                          label: 'See who with VIP',
                          icon: SolarIconsBold.crown,
                          gradient: V.goldGrad,
                          foreground: V.onGold,
                          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VipScreen())),
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
        if (p.avatarUrl.startsWith('http')) Image.network(p.avatarUrl, fit: BoxFit.cover, errorBuilder: (_, _, _) => const DecoratedBox(decoration: BoxDecoration(gradient: V.brand))) else const DecoratedBox(decoration: BoxDecoration(gradient: V.brand)),
        const DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, stops: [0.35, 1], colors: [Color(0x00000000), Color(0xE6000000)]))),
        if (card.superLikedMe)
          Positioned(
            top: 8,
            left: 8,
            child: Container(
              height: 24,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(color: V.violet, borderRadius: BorderRadius.circular(12)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.star_rounded, size: 14, color: Colors.white), const SizedBox(width: 4), Text('Super Like', style: VT.label(11, color: Colors.white))]),
            ),
          ),
        Positioned(
          left: 12,
          right: 12,
          bottom: 12,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${p.name.split(' ').first}${p.age > 0 ? ', ${p.age}' : ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.title(16, color: Colors.white, weight: FontWeight.w600)),
            Text('${p.country.flag} ${card.activeLabel}', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(11.5, color: Colors.white70)),
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
