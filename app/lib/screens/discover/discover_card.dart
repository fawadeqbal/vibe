import 'package:flutter/material.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../models/discover.dart';

/// One person in the deck: their photo full-bleed, name and age, where they
/// are, their bio and interests (the ones you share first). Stamps show
/// while dragging ([drag] −1…1 sideways, [up] 0…1).
class DiscoverCardView extends StatelessWidget {
  const DiscoverCardView({super.key, required this.card, this.drag = 0, this.up = 0, this.shadow = true});
  final DiscoverCard card;
  final double drag;
  final double up;
  final bool shadow;

  @override
  Widget build(BuildContext context) {
    final p = card.profile;
    final shared = card.sharedInterests.toSet();
    final interests = [...p.interests]..sort((a, b) => (shared.contains(b) ? 1 : 0) - (shared.contains(a) ? 1 : 0));
    final active = card.activeLabel;
    final first = p.name.split(' ').first;
    return Semantics(
      label: '${p.name}${p.age > 0 ? ', ${p.age}' : ''}',
      container: true,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: V.line),
          color: V.surface,
          boxShadow: shadow ? const [BoxShadow(color: Color(0x73000000), blurRadius: 60, offset: Offset(0, 20))] : null,
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            _Photo(url: p.avatarUrl, name: p.name),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  stops: [0.38, 0.7, 1],
                  colors: [Color(0x00000000), Color(0x8C000000), Color(0xEB000000)],
                ),
              ),
            ),
            if (card.superLikedMe)
              Positioned(
                top: 16,
                left: 16,
                child: Container(
                  height: 32,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(color: V.violet, borderRadius: BorderRadius.circular(16), boxShadow: V.lift),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.star_rounded, size: 17, color: Colors.white),
                    const SizedBox(width: 6),
                    Text('Super Liked you', style: VT.label(12.5, color: Colors.white)),
                  ]),
                ),
              ),
            if (card.online)
              Positioned(
                top: 16,
                right: 16,
                child: Container(
                  height: 28,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.45), borderRadius: BorderRadius.circular(14)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Container(width: 8, height: 8, decoration: const BoxDecoration(color: V.ok, shape: BoxShape.circle)),
                    const SizedBox(width: 6),
                    Text('Online', style: VT.label(12, color: Colors.white)),
                  ]),
                ),
              ),
            _Stamp(text: 'LIKE', color: V.ok, opacity: (drag * 1.6).clamp(0, 1), alignment: const Alignment(-0.7, -0.78), angle: -0.21),
            _Stamp(text: 'NOPE', color: V.bad, opacity: (-drag * 1.6).clamp(0, 1), alignment: const Alignment(0.7, -0.78), angle: 0.21),
            _Stamp(text: 'SUPER LIKE', color: V.lavender, opacity: (up * 1.6).clamp(0, 1), alignment: const Alignment(0, 0.05), angle: 0, size: 24),
            Positioned(
              left: 20,
              right: 20,
              bottom: 20,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(children: [
                    Flexible(
                      child: Text.rich(
                        TextSpan(children: [
                          TextSpan(text: first, style: VT.display(30, color: Colors.white)),
                          if (p.age > 0) TextSpan(text: ', ${p.age}', style: VT.display(30, color: Colors.white).copyWith(fontWeight: FontWeight.w400)),
                        ]),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (p.verified) const Padding(padding: EdgeInsets.only(left: 8), child: Icon(SolarIconsBold.verifiedCheck, size: 22, color: V.trust)),
                  ]),
                  const SizedBox(height: 2),
                  Text('${p.country.flag} ${p.country.name}${active.isEmpty ? '' : ' · $active'}', style: VT.body(13.5, color: Colors.white.withValues(alpha: 0.8))),
                  if (p.bio.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(p.bio, maxLines: 3, overflow: TextOverflow.ellipsis, style: VT.body(14.5, color: Colors.white.withValues(alpha: 0.95), height: 1.45)),
                  ],
                  if (interests.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Wrap(spacing: 6, runSpacing: 6, children: [
                      for (final i in interests.take(5))
                        Container(
                          height: 28,
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          decoration: BoxDecoration(color: shared.contains(i) ? Colors.white : Colors.white.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(14)),
                          child: Center(widthFactor: 1, child: Text(i, style: VT.label(12, color: shared.contains(i) ? V.bg : Colors.white))),
                        ),
                    ]),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Photo extends StatelessWidget {
  const _Photo({required this.url, required this.name});
  final String url;
  final String name;

  @override
  Widget build(BuildContext context) {
    final fallback = DecoratedBox(
      decoration: const BoxDecoration(gradient: V.brand),
      child: Center(child: Text(name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase(), style: VT.display(120, color: Colors.white.withValues(alpha: 0.35)))),
    );
    if (url.isEmpty || !url.startsWith('http')) return fallback;
    return Image.network(url, fit: BoxFit.cover, gaplessPlayback: true, errorBuilder: (_, _, _) => fallback, loadingBuilder: (_, child, progress) => progress == null ? child : fallback);
  }
}

class _Stamp extends StatelessWidget {
  const _Stamp({required this.text, required this.color, required this.opacity, required this.alignment, required this.angle, this.size = 30});
  final String text;
  final Color color;
  final double opacity;
  final Alignment alignment;
  final double angle;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (opacity <= 0) return const SizedBox.shrink();
    return Align(
      alignment: alignment,
      child: Opacity(
        opacity: opacity,
        child: Transform.rotate(
          angle: angle,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(border: Border.all(color: color, width: 3), borderRadius: BorderRadius.circular(10)),
            child: Text(text, style: VT.title(size, color: color).copyWith(letterSpacing: 1)),
          ),
        ),
      ),
    );
  }
}
