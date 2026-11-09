import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../models/discover.dart';
import '../../models/models.dart';

const superBlue = Color(0xFF60A5FA);

/// What they're here for, as a short line: "Here for friends".
String intentLine(ProfileIntent i) => switch (i) {
      ProfileIntent.chat => 'Here to chat',
      ProfileIntent.friends => 'Here for friends',
      ProfileIntent.dating => 'Here for dating',
      ProfileIntent.open => 'Not sure yet',
    };

/// "Pakistan · Here for friends".
String placeLine(Profile p) => [p.country.name, if (p.intent != null) intentLine(p.intent!)].join(' · ');

/// Interests, the ones you share first.
List<String> sortedInterests(Profile p, List<String> shared) {
  final s = shared.toSet();
  return [...p.interests]..sort((a, b) => (s.contains(b) ? 1 : 0) - (s.contains(a) ? 1 : 0));
}

/// One interest: shared ones are pink with a check.
class InterestChip extends StatelessWidget {
  const InterestChip({super.key, required this.label, required this.shared, this.glass = true});
  final String label;
  final bool shared;
  final bool glass;

  @override
  Widget build(BuildContext context) {
    final chip = Container(
      height: 28,
      padding: const EdgeInsets.symmetric(horizontal: 11),
      color: shared ? V.pink.withValues(alpha: 0.26) : Colors.white.withValues(alpha: glass ? 0.14 : 0.08),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (shared) ...[const Icon(Icons.check_rounded, size: 13, color: Colors.white), const SizedBox(width: 5)],
          Text(label, style: VT.label(12.5, color: Colors.white, weight: FontWeight.w600)),
        ],
      ),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: glass ? BackdropFilter(filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12), child: chip) : chip,
    );
  }
}

/// One person in the deck: their photo full-bleed, Verified, then at the
/// bottom whether they're active, name and age (ⓘ opens the full profile),
/// where they are and what they're here for, their bio and interests (the
/// ones you share first). Stamps show while dragging ([drag] −1…1, [up] 0…1).
/// (web: features/discover/discover-card.tsx)
class DiscoverCardView extends StatelessWidget {
  const DiscoverCardView({super.key, required this.card, this.drag = 0, this.up = 0, this.shadow = true, this.onInfo});
  final DiscoverCard card;
  final double drag;
  final double up;
  final bool shadow;
  final VoidCallback? onInfo;

  @override
  Widget build(BuildContext context) {
    final p = card.profile;
    final shared = card.sharedInterests.toSet();
    final interests = sortedInterests(p, card.sharedInterests).take(4).toList();
    final active = card.activeLabel;
    final first = p.name.split(' ').first;
    return Semantics(
      label: '${p.name}${p.age > 0 ? ', ${p.age}' : ''}',
      container: true,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(28),
          color: V.surface,
          boxShadow: shadow ? const [BoxShadow(color: Color(0x73000000), blurRadius: 40, offset: Offset(0, 18))] : null,
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            _Photo(url: p.avatarUrl, name: p.name),
            Align(
              alignment: Alignment.bottomCenter,
              child: FractionallySizedBox(
                heightFactor: 0.7,
                widthFactor: 1,
                child: Container(
                  constraints: const BoxConstraints(maxHeight: 300),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      stops: [0, 0.5, 1],
                      colors: [Color(0xF20B0A10), Color(0x8C0B0A10), Color(0x000B0A10)],
                    ),
                  ),
                ),
              ),
            ),
            if (card.superLikedMe)
              Positioned(
                top: 16,
                left: 12,
                child: Container(
                  height: 28,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: BoxDecoration(color: superBlue, borderRadius: BorderRadius.circular(999), boxShadow: V.lift),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.star_rounded, size: 15, color: Colors.white),
                    const SizedBox(width: 5),
                    Text('Super Liked you', style: VT.label(12, color: Colors.white, weight: FontWeight.w600)),
                  ]),
                ),
              ),
            if (p.verified)
              Positioned(
                top: 16,
                right: 12,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
                    child: Container(
                      height: 28,
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      decoration: BoxDecoration(color: V.bg2.withValues(alpha: 0.52), border: Border.all(color: Colors.white.withValues(alpha: 0.1)), borderRadius: BorderRadius.circular(999)),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(SolarIconsBold.verifiedCheck, size: 15, color: V.trust),
                        const SizedBox(width: 5),
                        Text('Verified', style: VT.label(12, color: Colors.white, weight: FontWeight.w600)),
                      ]),
                    ),
                  ),
                ),
              ),
            Positioned(top: 60, left: 22, child: _Stamp('LIKE', V.ok, -0.24, (drag * 1.6).clamp(0, 1))),
            Positioned(top: 60, right: 22, child: _Stamp('NOPE', V.bad, 0.24, (-drag * 1.6).clamp(0, 1))),
            Align(alignment: const Alignment(0, 0.05), child: _Stamp('SUPER LIKE', superBlue, 0, (up * 1.6).clamp(0, 1), size: 26)),
            Positioned(
              left: 18,
              right: 18,
              bottom: 18,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (active.isNotEmpty) ...[
                    Row(children: [
                      Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: active == 'Active now' ? V.ok : Colors.white.withValues(alpha: 0.4))),
                      const SizedBox(width: 6),
                      Text(active, style: VT.body(12.5, color: Colors.white.withValues(alpha: 0.85))),
                    ]),
                    const SizedBox(height: 8),
                  ],
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Text('$first${p.age > 0 ? ', ${p.age}' : ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.title(30, weight: FontWeight.w700, color: Colors.white)),
                      ),
                      if (onInfo != null)
                        Semantics(
                          button: true,
                          label: 'More about $first',
                          excludeSemantics: true,
                          child: GestureDetector(
                            onTap: onInfo,
                            child: ClipOval(
                              child: BackdropFilter(
                                filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
                                child: Container(
                                  width: 36,
                                  height: 36,
                                  color: V.bg2.withValues(alpha: 0.52),
                                  child: const Icon(SolarIconsBold.infoCircle, size: 20, color: Colors.white),
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(children: [
                    Icon(SolarIconsBold.global, size: 14, color: Colors.white.withValues(alpha: 0.8)),
                    const SizedBox(width: 6),
                    Flexible(child: Text(placeLine(p), maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(13, color: Colors.white.withValues(alpha: 0.8)))),
                  ]),
                  if (p.bio.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(p.bio, maxLines: 3, overflow: TextOverflow.ellipsis, style: VT.body(14, color: Colors.white, height: 1.4)),
                  ],
                  if (interests.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(spacing: 6, runSpacing: 6, children: [for (final i in interests) InterestChip(label: i, shared: shared.contains(i))]),
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
    return Image.network(url, fit: BoxFit.cover, alignment: const Alignment(0, -0.4), gaplessPlayback: true, errorBuilder: (_, _, _) => fallback, loadingBuilder: (_, child, progress) => progress == null ? child : fallback);
  }
}

class _Stamp extends StatelessWidget {
  const _Stamp(this.text, this.color, this.angle, this.opacity, {this.size = 30});
  final String text;
  final Color color;
  final double angle;
  final double opacity;
  final double size;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Opacity(
        opacity: opacity.toDouble(),
        child: Transform.rotate(
          angle: angle,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            decoration: BoxDecoration(border: Border.all(color: color, width: 3), borderRadius: BorderRadius.circular(12)),
            child: Text(text, style: VT.title(size, weight: FontWeight.w800, color: color).copyWith(letterSpacing: 1, height: 1)),
          ),
        ),
      ),
    );
  }
}
