import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/mock/mock_data.dart';
import '../../core/theme/vibe_theme.dart';
import '../../models/filters.dart';
import '../../providers/filters_provider.dart';

/// Anything changed from "everyone, any age, anywhere"?
bool filtersSet(SharedFilters f) => f != SharedFilters.defaults;

/// The round Filters button (Discover header, Home's camera buttons). A pink
/// dot shows when something is set. Opens the one filters sheet ([onOpen]).
/// (web: features/filters/filter-chips.tsx)
class FilterButton extends StatelessWidget {
  const FilterButton({super.key, required this.onOpen, this.glass = false, this.size = 40});
  final VoidCallback onOpen;
  final bool glass;
  final double size;

  @override
  Widget build(BuildContext context) {
    final on = context.select<FiltersProvider, bool>((p) => filtersSet(p.filters));
    final body = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: glass ? V.bg2.withValues(alpha: 0.5) : Colors.white.withValues(alpha: 0.08),
        border: glass ? Border.all(color: Colors.white.withValues(alpha: 0.10)) : null,
      ),
      child: Icon(SolarIconsOutline.tuning, size: 20, color: on ? V.pinkSoft : V.text),
    );
    return Semantics(
      button: true,
      label: on ? 'Filters (some are on)' : 'Filters',
      excludeSemantics: true,
      child: Tooltip(
        message: 'Filters',
        child: GestureDetector(
          onTap: onOpen,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              glass ? ClipOval(child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16), child: body)) : body,
              if (on)
                Positioned(
                  top: 6,
                  right: 6,
                  child: Container(width: 9, height: 9, decoration: BoxDecoration(shape: BoxShape.circle, color: V.pink, border: Border.all(color: V.bg, width: 2))),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Only what you changed, as tags: tap × to drop one, Clear to drop all.
/// Nothing at all when every filter is at its default. A lock shows on
/// gender/country while they're set but not open (no pass, no VIP).
class FilterTags extends StatelessWidget {
  const FilterTags({super.key, required this.onOpen, this.glass = false, this.padding = const EdgeInsets.symmetric(horizontal: 16), this.bottom = 0});
  final VoidCallback onOpen;
  final bool glass;
  final EdgeInsets padding;

  /// Space under the row (only when there is a row).
  final double bottom;

  @override
  Widget build(BuildContext context) {
    final p = context.watch<FiltersProvider>();
    final f = p.filters;
    if (!filtersSet(f)) return const SizedBox.shrink();
    final locked = f.usesExtra && !p.access.unlocked;
    void save(SharedFilters next) {
      HapticFeedback.selectionClick();
      p.save(next);
    }

    final tags = <(String, bool, SharedFilters)>[
      if (f.gender != WantedGender.anyone) (f.gender == WantedGender.women ? 'Women' : 'Men', locked, f.copyWith(gender: WantedGender.anyone)),
      if (f.minAge != 18 || f.maxAge != 99) (f.ageLabel, false, f.copyWith(minAge: 18, maxAge: 99)),
      if (f.countryCode != null) (MockData.country(f.countryCode!).name, locked, f.copyWith(clearCountry: true)),
      if (f.verifiedOnly) ('Verified', false, f.copyWith(verifiedOnly: false)),
    ];
    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: SizedBox(
        height: 32,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: padding,
          children: [
            for (final (label, lock, without) in tags) _Tag(label: label, locked: lock, glass: glass, onOpen: onOpen, onRemove: () => save(without)),
            Semantics(
              button: true,
              child: GestureDetector(
                onTap: () => save(SharedFilters.defaults),
                child: Padding(padding: const EdgeInsets.symmetric(horizontal: 10), child: Center(child: Text('Clear', style: VT.label(13, color: V.text2, weight: FontWeight.w600)))),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.label, required this.locked, required this.glass, required this.onOpen, required this.onRemove});
  final String label;
  final bool locked;
  final bool glass;
  final VoidCallback onOpen;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final tag = Container(
      height: 32,
      decoration: BoxDecoration(color: V.pink.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(999), border: Border.all(color: V.pink.withValues(alpha: 0.4))),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Semantics(
            button: true,
            label: locked ? '$label (needs the filter pass)' : label,
            excludeSemantics: true,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: onOpen,
              child: Padding(
                padding: const EdgeInsets.only(left: 11),
                child: Row(children: [
                  if (locked) ...[const Icon(SolarIconsBold.lockKeyhole, size: 14, color: V.pinkSoft), const SizedBox(width: 4)],
                  Text(label, style: VT.label(13, color: V.pinkSoft, weight: FontWeight.w600)),
                ]),
              ),
            ),
          ),
          Semantics(
            button: true,
            label: 'Remove $label',
            excludeSemantics: true,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: onRemove,
              child: const Padding(padding: EdgeInsets.fromLTRB(4, 0, 8, 0), child: Icon(Icons.close_rounded, size: 14, color: V.pinkSoft)),
            ),
          ),
        ],
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: glass ? ClipRRect(borderRadius: BorderRadius.circular(999), child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16), child: tag)) : tag,
    );
  }
}
