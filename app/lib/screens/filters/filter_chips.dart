import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/mock/mock_data.dart';
import '../../core/theme/vibe_theme.dart';
import '../../models/filters.dart';
import '../../providers/filters_provider.dart';

/// The same chips on Home and Discover: who, age, where, verified, Filters.
/// Each opens the one filters sheet ([onOpen]); Verified only switches right
/// here (it's free). A lock shows on gender/country while they're set but
/// not open.
class FilterChips extends StatelessWidget {
  const FilterChips({super.key, required this.onOpen, this.glass = false, this.padding = const EdgeInsets.symmetric(horizontal: 16)});
  final VoidCallback onOpen;
  final bool glass;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final p = context.watch<FiltersProvider>();
    final f = p.filters;
    final locked = f.usesExtra && !p.access.unlocked;
    final country = f.countryCode == null ? null : MockData.country(f.countryCode!);
    return SizedBox(
      height: 36,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: padding,
        children: [
          _Chip(
            glass: glass,
            icon: SolarIconsBold.usersGroupRounded,
            label: switch (f.gender) {
              WantedGender.women => 'Women',
              WantedGender.men => 'Men',
              _ => 'Anyone',
            },
            on: f.gender != WantedGender.anyone,
            locked: locked && f.gender != WantedGender.anyone,
            caret: true,
            onTap: onOpen,
          ),
          _Chip(glass: glass, icon: SolarIconsBold.userRounded, label: f.ageLabel == 'Any age' ? '18–99' : f.ageLabel, on: f.minAge != 18 || f.maxAge != 99, caret: true, onTap: onOpen),
          _Chip(glass: glass, icon: SolarIconsBold.global, label: country?.name ?? 'Anywhere', on: country != null, locked: locked && country != null, caret: true, onTap: onOpen),
          _Chip(
            glass: glass,
            icon: SolarIconsBold.verifiedCheck,
            label: 'Verified only',
            on: f.verifiedOnly,
            onTap: () {
              HapticFeedback.selectionClick();
              p.save(f.copyWith(verifiedOnly: !f.verifiedOnly));
            },
          ),
          _Chip(glass: glass, icon: SolarIconsOutline.tuning, label: 'Filters', onTap: onOpen),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.icon, required this.label, required this.onTap, required this.glass, this.on = false, this.locked = false, this.caret = false});
  final IconData icon;
  final String label;
  final bool on;
  final bool locked;
  final bool caret;
  final bool glass;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fg = on ? V.pinkSoft : V.text;
    final chip = Container(
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 13),
      decoration: BoxDecoration(
        color: on ? V.pink.withValues(alpha: 0.16) : (glass ? V.bg2.withValues(alpha: 0.5) : Colors.white.withValues(alpha: 0.06)),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: on ? V.pink.withValues(alpha: 0.45) : Colors.white.withValues(alpha: 0.12)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(locked ? SolarIconsBold.lockKeyhole : icon, size: 17, color: fg),
          const SizedBox(width: 6),
          Text(label, style: VT.label(13.5, color: fg)),
          if (caret) ...[const SizedBox(width: 4), const Icon(SolarIconsOutline.altArrowDown, size: 16, color: V.text2)],
        ],
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Semantics(
        button: true,
        selected: on,
        child: GestureDetector(
          onTap: onTap,
          child: glass ? ClipRRect(borderRadius: BorderRadius.circular(999), child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16), child: chip)) : chip,
        ),
      ),
    );
  }
}
