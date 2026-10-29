import 'package:flutter/material.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/discover.dart';

/// One filter that's on, with what turning it off sets.
class ActiveFilter {
  const ActiveFilter(this.key, this.label, this.without);
  final String key;
  final String label;
  final DiscoverFilters without;
}

/// The filters that narrow the deck, each removable on its own.
List<ActiveFilter> activeFilters(DiscoverFilters f) {
  const d = DiscoverFilters();
  return [
    if (f.gender != WantedGender.anyone)
      ActiveFilter('gender', f.gender == WantedGender.women ? 'Women' : 'Men', DiscoverFilters(minAge: f.minAge, maxAge: f.maxAge)),
    if (f.minAge != d.minAge || f.maxAge != d.maxAge) ActiveFilter('age', 'Ages ${f.minAge}–${f.maxAge}', DiscoverFilters(gender: f.gender)),
  ];
}

BoxDecoration _frame({bool dashed = false}) => BoxDecoration(
      color: dashed ? null : V.bg2,
      borderRadius: BorderRadius.circular(28),
      border: Border.all(color: dashed ? V.line : Colors.white.withValues(alpha: 0.08)),
    );

/// While the deck loads: the shape of a card, not a spinner.
class DeckSkeleton extends StatefulWidget {
  const DeckSkeleton({super.key});

  @override
  State<DeckSkeleton> createState() => _DeckSkeletonState();
}

class _DeckSkeletonState extends State<DeckSkeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    Widget bar(double w, double h, [double r = 8]) => Container(width: w, height: h, decoration: BoxDecoration(color: V.surface3, borderRadius: BorderRadius.circular(r)));
    final reduce = MediaQuery.of(context).disableAnimations;
    return Semantics(
      label: 'Finding people for you',
      child: Stack(fit: StackFit.expand, children: [
        Positioned(left: 14, right: 14, top: -8, bottom: 12, child: DecoratedBox(decoration: BoxDecoration(color: V.bg2, borderRadius: BorderRadius.circular(28)))),
        FadeTransition(
          opacity: reduce ? const AlwaysStoppedAnimation(1) : Tween(begin: 0.55, end: 1.0).animate(_c),
          child: Container(
            decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(28)),
            padding: const EdgeInsets.all(20),
            child: Column(mainAxisAlignment: MainAxisAlignment.end, crossAxisAlignment: CrossAxisAlignment.start, children: [
              bar(150, 22),
              const SizedBox(height: 10),
              bar(110, 14, 6),
              const SizedBox(height: 14),
              Row(children: [bar(72, 24, 12), const SizedBox(width: 6), bar(56, 24, 12), const SizedBox(width: 6), bar(64, 24, 12)]),
            ]),
          ),
        ),
        Align(alignment: const Alignment(0, -0.15), child: Text('Finding people for you…', style: VT.body(14, color: V.text2, weight: FontWeight.w600))),
      ]),
    );
  }
}

/// The deck couldn't load: offline or the server didn't answer.
class DeckOffline extends StatelessWidget {
  const DeckOffline({super.key, required this.offline, required this.onRetry});
  final bool offline;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: _frame(dashed: true),
      padding: const EdgeInsets.symmetric(horizontal: 22),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Container(
          width: 72,
          height: 72,
          decoration: const BoxDecoration(color: V.surface, shape: BoxShape.circle),
          child: Icon(offline ? Icons.wifi_off_rounded : Icons.cloud_off_rounded, size: 32, color: V.text2),
        ),
        const SizedBox(height: 16),
        Headline(offline ? "You're " : "Can't reach ", accent: offline ? 'offline' : 'Vibe', accentColor: V.pinkSoft, size: 24, textAlign: TextAlign.center),
        const SizedBox(height: 8),
        Text(
          offline ? "Discover needs the internet to show people. Try again when you're back online." : 'Something went wrong on our side. Give it a moment and try again.',
          textAlign: TextAlign.center,
          style: VT.body(14, color: V.text2, height: 1.5),
        ),
        const SizedBox(height: 20),
        SizedBox(width: 260, child: GhostButton(label: 'Try again', icon: SolarIconsOutline.refresh, expand: true, onTap: onRetry)),
        const SizedBox(height: 12),
        Text('Your likes and matches are safe.', style: VT.body(12.5, color: V.text2)),
      ]),
    );
  }
}

/// No photo: nobody can see you. Add one, or just look around.
class NoPhotoPanel extends StatelessWidget {
  const NoPhotoPanel({super.key, required this.onAddPhoto, required this.onLookAround});
  final VoidCallback onAddPhoto;
  final VoidCallback onLookAround;

  @override
  Widget build(BuildContext context) {
    Widget step(bool done, String label, {String? tag, bool needed = false}) => Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: V.surface,
            borderRadius: BorderRadius.circular(16),
            border: needed ? Border.all(color: V.pink.withValues(alpha: 0.45)) : null,
          ),
          child: Row(children: [
            if (done)
              Container(width: 24, height: 24, decoration: const BoxDecoration(color: V.ok, shape: BoxShape.circle), child: const Icon(Icons.check_rounded, size: 15, color: V.bg))
            else
              Container(width: 24, height: 24, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: needed ? V.pinkSoft : Colors.white24, width: 2))),
            const SizedBox(width: 12),
            Expanded(child: Text(label, style: VT.body(14, color: done ? V.text2 : V.text, weight: done ? FontWeight.w400 : FontWeight.w600))),
            if (tag != null) Text(tag, style: VT.label(12, color: needed ? V.pinkSoft : V.text2)),
          ]),
        );
    return Container(
      decoration: _frame(),
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(
          child: SingleChildScrollView(
            child: Column(children: [
              Semantics(
                button: true,
                label: 'Add a photo',
                excludeSemantics: true,
                child: GestureDetector(
                  onTap: onAddPhoto,
                  child: SizedBox(
                    width: 104,
                    height: 104,
                    child: Stack(children: [
                      Container(
                        decoration: BoxDecoration(color: V.pink.withValues(alpha: 0.08), shape: BoxShape.circle, border: Border.all(color: V.pinkSoft.withValues(alpha: 0.6), width: 2)),
                        alignment: Alignment.center,
                        child: const Icon(SolarIconsBold.user, size: 44, color: V.pinkSoft),
                      ),
                      Positioned(
                        right: 2,
                        bottom: 2,
                        child: Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(color: V.pink, shape: BoxShape.circle, border: Border.all(color: V.bg2, width: 3)),
                          child: const Icon(Icons.add_rounded, size: 18, color: Colors.white),
                        ),
                      ),
                    ]),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Headline('Nobody can see you ', accent: 'yet', accentColor: V.pinkSoft, size: 24, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text('Discover only shows people with a photo. Add one and others can see you — and like you back.', textAlign: TextAlign.center, style: VT.body(14, color: V.text2, height: 1.5)),
              const SizedBox(height: 16),
              step(false, 'Add a clear photo of your face', tag: 'Needed', needed: true),
              step(true, 'Name and age'),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        GradientButton(label: 'Add a photo', onTap: onAddPhoto),
        TextButton(onPressed: onLookAround, child: Text('Just look around for now', style: VT.label(14, color: V.text2))),
      ]),
    );
  }
}

/// Nobody left: with filters on, which to drop; without, all caught up.
class DeckEmpty extends StatelessWidget {
  const DeckEmpty({super.key, required this.filters, required this.onSetFilters, required this.onEditFilters, this.onMeetLive});
  final DiscoverFilters filters;
  final ValueChanged<DiscoverFilters> onSetFilters;
  final VoidCallback onEditFilters;
  final VoidCallback? onMeetLive;

  @override
  Widget build(BuildContext context) {
    final active = activeFilters(filters);
    if (active.isNotEmpty) {
      return Container(
        decoration: _frame(),
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(color: V.violet.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(18)),
            child: const Icon(SolarIconsBold.filter, size: 26, color: V.lavender),
          ),
          const SizedBox(height: 16),
          Headline('No one fits ', accent: 'all of these', accentColor: V.lavender, size: 24),
          const SizedBox(height: 8),
          Text('Your filters are hiding everyone right now. Remove one to see more people.', style: VT.body(14, color: V.text2, height: 1.5)),
          const SizedBox(height: 16),
          for (final a in active)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.only(left: 14, right: 4),
              decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(16)),
              child: Row(children: [
                Expanded(child: Text(a.label, style: VT.body(14, weight: FontWeight.w600))),
                IconButton(tooltip: 'Remove ${a.label}', onPressed: () => onSetFilters(a.without), icon: const Icon(Icons.close_rounded, size: 18, color: V.text2)),
              ]),
            ),
          const Spacer(),
          GradientButton(label: 'Show everyone', onTap: () => onSetFilters(const DiscoverFilters())),
          const SizedBox(height: 8),
          GhostButton(label: 'Edit filters', icon: SolarIconsOutline.tuning, expand: true, onTap: onEditFilters),
        ]),
      );
    }
    return Container(
      decoration: _frame(dashed: true),
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(color: V.pink.withValues(alpha: 0.12), shape: BoxShape.circle),
          child: const Icon(Icons.done_all_rounded, size: 30, color: V.pinkSoft),
        ),
        const SizedBox(height: 16),
        Headline("You're all caught up ", accent: 'for now', accentColor: V.pinkSoft, size: 24, textAlign: TextAlign.center),
        const SizedBox(height: 8),
        Text("You've seen everyone here. New people join all day — come back later, or meet someone live right now.", textAlign: TextAlign.center, style: VT.body(14, color: V.text2, height: 1.5)),
        const SizedBox(height: 20),
        if (onMeetLive != null) GradientButton(label: 'Meet someone live', icon: SolarIconsBold.videocamera, onTap: onMeetLive),
        const SizedBox(height: 8),
        GhostButton(label: 'Change filters', icon: SolarIconsOutline.tuning, expand: true, onTap: onEditFilters),
      ]),
    );
  }
}

/// No likes left today: when they come back, and the way to get more.
class OutOfLikesBanner extends StatelessWidget {
  const OutOfLikesBanner({super.key, required this.resetsAt, required this.onMore});
  final DateTime? resetsAt;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
        decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(18), border: Border.all(color: V.pink.withValues(alpha: 0.3))),
        child: Row(children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: V.pink.withValues(alpha: 0.14), shape: BoxShape.circle),
            child: const Icon(SolarIconsBold.heart, size: 18, color: V.pinkSoft),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text("That's today's likes used up", style: VT.title(14, weight: FontWeight.w600)),
              Text('Free likes back in ${resetsAt != null ? comesBackIn(resetsAt!) : 'the morning'} · you can still pass and Super Like', style: VT.body(12, color: V.text2)),
            ]),
          ),
          const SizedBox(width: 8),
          TextButton(
            onPressed: onMore,
            style: TextButton.styleFrom(backgroundColor: V.gold.withValues(alpha: 0.14), foregroundColor: V.gold, shape: const StadiumBorder(), minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 12)),
            child: Text('Get more', style: VT.label(12.5, color: V.gold, weight: FontWeight.w700)),
          ),
        ]),
      ),
    );
  }
}
