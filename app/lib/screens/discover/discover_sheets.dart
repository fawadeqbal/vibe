import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/mock/mock_data.dart';
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
/// Who shows up in your deck. Resolves 'vip' (go to VIP) or 'coins' (short for a pass).
Future<String?> showDiscoverFilters(BuildContext context) => showVibeSheet<String>(context, scrollable: true, child: const _FiltersSheet());

class _FiltersSheet extends StatefulWidget {
  const _FiltersSheet();

  @override
  State<_FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends State<_FiltersSheet> {
  late DiscoverFilters _f = context.read<DiscoverProvider>().filters;
  bool _buying = false;

  void _apply([DiscoverFilters? next]) {
    context.read<DiscoverProvider>().setFilters(next ?? _f);
    Navigator.of(context).pop();
  }

  Future<void> _buyPass(FilterAccess access) async {
    setState(() => _buying = true);
    String? r;
    try {
      r = await context.read<DiscoverProvider>().buyFilterPass();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
    if (!mounted) return;
    setState(() => _buying = false);
    if (r == 'coins') return Navigator.of(context).pop('coins');
    if (r == 'ok') {
      toast(context, 'Filters open for ${access.passHours} hours');
      _apply();
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = context.watch<DiscoverProvider>().status;
    final access = status?.filters;
    final open = access?.unlocked != false;
    final needsPass = !open && _f.usesExtra;
    final lock = open ? null : const Icon(SolarIconsBold.lock, size: 13, color: V.muted);
    final note = switch (access?.reason) {
      'vip' => 'VIP: every filter is open.',
      'vibe_hour' => 'Vibe Hour: every filter is free right now.',
      'pass' => 'Filter pass: every filter is open · ${access?.passUntil != null ? '${comesBackIn(access!.passUntil!)} left' : ''}.',
      'free' => 'Every filter is free.',
      _ => 'Age is free. Gender, country, online now and verified need VIP or a filter pass.',
    };
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
            onTap: () => setState(() => _f = _f.copyWith(gender: g)),
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
                Row(mainAxisSize: MainAxisSize.min, children: [
                  Text(label, style: VT.title(14, color: on ? V.text : V.text2, weight: FontWeight.w600)),
                  if (g != WantedGender.anyone && lock != null) ...[const SizedBox(width: 4), lock],
                ]),
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
          Text(note, style: VT.body(13, color: access?.reason == 'vip' ? V.gold : V.text2, height: 1.45)),
          SectionTitle('Show me', top: 20, note: open ? null : 'VIP or pass'),
          Row(children: [
            seg(WantedGender.anyone, 'Everyone', SolarIconsBold.usersGroupRounded),
            const SizedBox(width: 8),
            seg(WantedGender.women, 'Women', Icons.female_rounded),
            const SizedBox(width: 8),
            seg(WantedGender.men, 'Men', Icons.male_rounded),
          ]),
          const SectionTitle('Age', top: 20, note: 'Free'),
          Row(children: [
            ageBox('From', _f.minAge, (v) => setState(() => _f = _f.copyWith(minAge: v, maxAge: _f.maxAge < v ? v : _f.maxAge))),
            const SizedBox(width: 12),
            ageBox('To', _f.maxAge, (v) => setState(() => _f = _f.copyWith(maxAge: v)), min: _f.minAge),
          ]),
          SectionTitle('Country', top: 20, note: open ? null : 'VIP or pass'),
          Container(
            height: 52,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(color: V.surface2, borderRadius: BorderRadius.circular(14), border: Border.all(color: V.line)),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _f.countryCode,
                isExpanded: true,
                dropdownColor: V.surface2,
                style: VT.body(15),
                icon: const Icon(SolarIconsOutline.altArrowDown, color: V.text2),
                items: [
                  const DropdownMenuItem(value: '', child: Text('🌍  Anywhere')),
                  for (final c in MockData.countries) DropdownMenuItem(value: c.code, child: Text('${c.flag}  ${c.name}')),
                ],
                onChanged: (v) => setState(() => _f = _f.copyWith(countryCode: v ?? '')),
              ),
            ),
          ),
          SectionTitle('More', top: 20, note: open ? null : 'VIP or pass'),
          GroupCard(
            children: [
              GroupRow(
                icon: Icons.radio_button_checked_rounded,
                iconColor: V.ok,
                title: 'Online now',
                subtitle: 'Only people on Vibe right now.',
                trailing: Switch(value: _f.onlineOnly, onChanged: (v) => setState(() => _f = _f.copyWith(onlineOnly: v))),
              ),
              GroupRow(
                icon: SolarIconsBold.verifiedCheck,
                iconColor: V.trust,
                iconBg: V.trust.withValues(alpha: 0.12),
                title: 'Verified only',
                subtitle: 'Only selfie-verified people.',
                trailing: Switch(value: _f.verifiedOnly, onChanged: (v) => setState(() => _f = _f.copyWith(verifiedOnly: v))),
              ),
            ],
          ),
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
          if (needsPass && access != null) ...[
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: V.pink.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(20), border: Border.all(color: V.pink.withValues(alpha: 0.3))),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Open these filters', style: VT.title(15, weight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text('A filter pass opens every filter for ${access.passHours} hours. VIP gets them free, always.', style: VT.body(13, color: V.text2, height: 1.45)),
                  const SizedBox(height: 14),
                  GradientButton(
                    label: _buying ? 'Opening…' : 'Filter pass · ${access.passHours}h',
                    trailing: CoinAmount(access.passCost, size: 13, color: Colors.white),
                    onTap: _buying ? null : () => _buyPass(access),
                  ),
                  const SizedBox(height: 8),
                  GhostButton(label: 'Get VIP — every filter free', icon: SolarIconsBold.crown, expand: true, color: V.gold, onTap: () => Navigator.of(context).pop('vip')),
                  const SizedBox(height: 6),
                  TextButton(onPressed: () => _apply(_f.freeOnly()), child: Text('Just use age', style: VT.label(14, color: V.text2))),
                ],
              ),
            ),
          ] else ...[
            const SizedBox(height: 24),
            GradientButton(label: 'Show people', onTap: () => _apply()),
          ],
        ],
      ),
    );
  }
}
