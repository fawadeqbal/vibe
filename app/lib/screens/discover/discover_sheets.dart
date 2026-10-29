import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/discover.dart';
import '../../providers/discover_provider.dart';

/// What "out of likes" offers.
enum OutOfLikesChoice { vip, buy }

/// "You're out of likes": wait for tomorrow, buy a few more, or go VIP.
Future<OutOfLikesChoice?> showOutOfLikes(BuildContext context) {
  final s = context.read<DiscoverProvider>().status;
  final resets = s?.resetsAt != null ? comesBackIn(s!.resetsAt!) : 'the morning';
  return showVibeSheet<OutOfLikesChoice>(
    context,
    child: Builder(
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(color: V.pink.withValues(alpha: 0.14), shape: BoxShape.circle),
              child: const Icon(SolarIconsBold.heart, size: 30, color: V.pink),
            ),
            const SizedBox(height: 16),
            const Headline("You're out of ", accent: 'likes', size: 26, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              "You used today's ${s?.freeLikesPerDay ?? 30} free likes. They come back in $resets. Passing is always free.",
              textAlign: TextAlign.center,
              style: VT.body(14, color: V.text2, height: 1.5),
            ),
            const SizedBox(height: 24),
            GradientButton(
              label: 'Get VIP — unlimited likes',
              icon: SolarIconsBold.crown,
              gradient: V.goldGrad,
              foreground: V.onGold,
              onTap: () => Navigator.of(ctx).pop(OutOfLikesChoice.vip),
            ),
            const SizedBox(height: 10),
            GhostButton(
              label: '${s?.packSize ?? 30} more likes',
              expand: true,
              trailing: CoinAmount(s?.packCost ?? 20),
              onTap: () => Navigator.of(ctx).pop(OutOfLikesChoice.buy),
            ),
            const SizedBox(height: 6),
            TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text('Wait for tomorrow', style: VT.label(14, color: V.text2))),
          ],
        ),
      ),
    ),
  );
}

/// Who shows up in your deck.
Future<void> showDiscoverFilters(BuildContext context) => showVibeSheet<void>(context, scrollable: true, child: const _FiltersSheet());

class _FiltersSheet extends StatefulWidget {
  const _FiltersSheet();

  @override
  State<_FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends State<_FiltersSheet> {
  late DiscoverFilters _f = context.read<DiscoverProvider>().filters;

  @override
  Widget build(BuildContext context) {
    final status = context.watch<DiscoverProvider>().status;
    final ages = [for (var a = 18; a <= 99; a++) a];
    Widget seg(WantedGender g, String label, IconData icon) {
      final on = _f.gender == g;
      return Expanded(
        child: Semantics(
          button: true,
          selected: on,
          label: label,
          excludeSemantics: true,
          child: GestureDetector(
            onTap: () => setState(() => _f = DiscoverFilters(gender: g, minAge: _f.minAge, maxAge: _f.maxAge)),
            child: AnimatedContainer(
              duration: VMotion.fast,
              height: 64,
              decoration: BoxDecoration(
                color: on ? V.surfaceSel : V.surface2,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: on ? V.pink : V.lineSoft, width: on ? 1.5 : 1),
              ),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(icon, size: 20, color: on ? V.pinkSoft : V.text2),
                const SizedBox(height: 4),
                Text(label, style: VT.title(14, color: on ? V.text : V.text2, weight: FontWeight.w600)),
              ]),
            ),
          ),
        ),
      );
    }

    Widget ageBox(String label, int value, ValueChanged<int> onChanged, {int min = 18}) => Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: VT.label(12, color: V.muted)),
            const SizedBox(height: 4),
            Container(
              height: 48,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(color: V.surface2, borderRadius: BorderRadius.circular(14), border: Border.all(color: V.line)),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<int>(
                  value: value,
                  isExpanded: true,
                  dropdownColor: V.surface2,
                  style: VT.body(15),
                  items: [for (final a in ages) if (a >= min) DropdownMenuItem(value: a, child: Text(a == 99 ? '99+' : '$a'))],
                  onChanged: (v) => v == null ? null : onChanged(v),
                ),
              ),
            ),
          ]),
        );

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Headline('Who do you want to ', accent: 'see?', size: 24),
          const SizedBox(height: 6),
          Text('Filters in Discover are free for everyone.', style: VT.body(13, color: V.text2)),
          const SizedBox(height: 20),
          Text('SHOW ME', style: VT.overline()),
          const SizedBox(height: 8),
          Row(children: [
            seg(WantedGender.anyone, 'Everyone', SolarIconsBold.usersGroupRounded),
            const SizedBox(width: 8),
            seg(WantedGender.women, 'Women', Icons.female_rounded),
            const SizedBox(width: 8),
            seg(WantedGender.men, 'Men', Icons.male_rounded),
          ]),
          const SizedBox(height: 20),
          Text('AGE', style: VT.overline()),
          const SizedBox(height: 8),
          Row(children: [
            ageBox('From', _f.minAge, (v) => setState(() => _f = DiscoverFilters(gender: _f.gender, minAge: v, maxAge: _f.maxAge < v ? v : _f.maxAge))),
            const SizedBox(width: 12),
            ageBox('To', _f.maxAge, (v) => setState(() => _f = DiscoverFilters(gender: _f.gender, minAge: _f.minAge, maxAge: v)), min: _f.minAge),
          ]),
          if (status != null) ...[
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
              decoration: BoxDecoration(color: V.surface2, borderRadius: BorderRadius.circular(18), border: Border.all(color: V.line)),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Show me in Discover', style: VT.title(14, weight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(
                      !status.hasPhoto ? "Add a photo first — people without one aren't shown." : 'Off: nobody new sees your card. Your matches stay.',
                      style: VT.body(12.5, color: V.muted),
                    ),
                  ]),
                ),
                Switch(value: status.showInDiscover, onChanged: (v) => context.read<DiscoverProvider>().setVisible(v)),
              ]),
            ),
          ],
          const SizedBox(height: 24),
          GradientButton(
            label: 'Show people',
            onTap: () {
              context.read<DiscoverProvider>().setFilters(_f);
              Navigator.of(context).pop();
            },
          ),
        ],
      ),
    );
  }
}
