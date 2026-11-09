import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/mock/mock_data.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/filters.dart';
import '../../providers/filters_provider.dart';
import '../../providers/session_provider.dart';

/// The one filters sheet, the same on Home (random matches) and Discover:
/// who, how old, from where, verified only. Gender and country need VIP or
/// the filter pass; Done offers the pass when they're on but not open.
/// Resolves 'vip' / 'coins' when the person picked that from the pass sheet.
Future<String?> showFiltersSheet(BuildContext context) async {
  final r = await showVibeSheet<String>(context, scrollable: true, child: const _FiltersSheet());
  if (r == 'pass' && context.mounted) return showFilterPass(context);
  return r;
}

class _FiltersSheet extends StatefulWidget {
  const _FiltersSheet();

  @override
  State<_FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends State<_FiltersSheet> {
  late SharedFilters _f = context.read<FiltersProvider>().filters;
  bool _picking = false;

  Future<void> _done() async {
    final p = context.read<FiltersProvider>();
    if (!await p.save(_f)) {
      if (mounted) toast(context, "Couldn't save your filters, try again", error: true);
      return;
    }
    if (!mounted) return;
    Navigator.of(context).pop(_f.usesExtra && !p.access.unlocked ? 'pass' : null);
  }

  @override
  Widget build(BuildContext context) {
    final access = context.watch<FiltersProvider>().access;
    final myCode = context.read<SessionProvider>().me?.country.code ?? 'PK';
    final mine = MockData.country(myCode);
    final other = _f.countryCode != null && _f.countryCode != myCode ? MockData.country(_f.countryCode!) : null;
    Widget divider() => const Padding(padding: EdgeInsets.only(left: 46), child: Divider(height: 1, color: V.lineSoft));

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Filters', style: VT.title(18)),
          const SizedBox(height: 4),
          Text('One set of filters for random matches and Discover.', style: VT.body(13, color: V.text2)),
          _label('Show me', 16),
          _Segmented(
            value: _f.gender,
            onChanged: (g) => setState(() => _f = _f.copyWith(gender: g)),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(child: _label('Age', 0)),
              Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_f.maxAge >= 99 ? '${_f.minAge} – 99+' : '${_f.minAge} – ${_f.maxAge}', style: VT.label(13, color: V.text2))),
            ],
          ),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(activeTrackColor: V.pink, inactiveTrackColor: V.surface3, thumbColor: Colors.white, overlayColor: V.pink.withValues(alpha: 0.12), trackHeight: 4),
            child: RangeSlider(
              min: 18,
              max: 99,
              divisions: 81,
              values: RangeValues(_f.minAge.toDouble(), _f.maxAge.toDouble()),
              labels: RangeLabels('${_f.minAge}', _f.maxAge >= 99 ? '99+' : '${_f.maxAge}'),
              onChanged: (v) => setState(() => _f = _f.copyWith(minAge: v.start.round(), maxAge: v.end.round())),
            ),
          ),
          _label('From', 8),
          _Box(
            children: [
              _RadioRow(icon: SolarIconsBold.global, title: 'Anywhere', on: _f.countryCode == null, onTap: () => setState(() => _f = _f.copyWith(clearCountry: true))),
              divider(),
              _RadioRow(icon: SolarIconsBold.flag, title: mine.name, sub: 'Your country', on: _f.countryCode == myCode, onTap: () => setState(() => _f = _f.copyWith(countryCode: myCode))),
              divider(),
              if (_picking)
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 6, 14, 6),
                  child: DropdownButtonFormField<String>(
                    initialValue: _f.countryCode,
                    isExpanded: true,
                    dropdownColor: V.surface2,
                    decoration: const InputDecoration(hintText: 'Choose a country…', isDense: true),
                    items: [for (final c in MockData.countries) DropdownMenuItem(value: c.code, child: Text('${c.flag}  ${c.name}', style: VT.body(15)))],
                    onChanged: (v) => setState(() {
                      _f = v == null ? _f.copyWith(clearCountry: true) : _f.copyWith(countryCode: v);
                      _picking = false;
                    }),
                  ),
                )
              else
                _RadioRow(
                  icon: SolarIconsOutline.transferHorizontal,
                  title: other != null ? '${other.flag} ${other.name}' : 'Choose a country',
                  on: other != null,
                  chevron: other == null,
                  onTap: () => setState(() => _picking = true),
                ),
            ],
          ),
          const SizedBox(height: 12),
          _Box(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Row(
                  children: [
                    const Icon(SolarIconsBold.verifiedCheck, size: 20, color: V.text2),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Verified people only', style: VT.title(15, weight: FontWeight.w600)),
                          Text('People who passed the selfie check · always free', style: VT.body(12, color: V.text2)),
                        ],
                      ),
                    ),
                    Switch(value: _f.verifiedOnly, onChanged: (v) => setState(() => _f = _f.copyWith(verifiedOnly: v))),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(color: V.gold.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(16), border: Border.all(color: V.gold.withValues(alpha: 0.22))),
            child: Row(
              children: [
                const Icon(SolarIconsBold.crown, size: 20, color: V.gold),
                const SizedBox(width: 10),
                Expanded(child: Text(passNote(access), style: VT.body(12.5, color: V.text2, height: 1.45))),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              SizedBox(
                width: 110,
                child: TextButton(onPressed: () => setState(() => _f = SharedFilters.defaults), child: Text('Reset', style: VT.label(15, color: V.text2))),
              ),
              const SizedBox(width: 10),
              Expanded(child: GradientButton(label: 'Done', height: 52, onTap: _done)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _label(String t, double top) => Padding(padding: EdgeInsets.only(top: top, bottom: 8, left: 2), child: Text(t.toUpperCase(), style: VT.overline()));
}

/// What the gold note under the filters says.
String passNote(FilterAccess a) => switch (a.reason) {
      'vip' => "You're VIP: every filter is free.",
      'pass' when a.passUntil != null => 'Your filter pass is on until ${TimeOfDay.fromDateTime(a.passUntil!).format24}.',
      'vibe_hour' => 'Vibe Hour: every filter is free right now.',
      'free' => 'Every filter is free right now.',
      _ => 'Age and verified only are always free. Women or men, or a country: free with VIP, or a ${a.passCost}-coin filter pass for ${a.passHours} hours.',
    };

extension on TimeOfDay {
  String get format24 => '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';
}

/// Gender or country are on but not open: the pass, VIP, or keep the free filters for now.
/// Resolves 'ok' (bought), 'vip', 'coins' (short) or null (not now).
Future<String?> showFilterPass(BuildContext context) => showVibeSheet<String>(context, child: const _PassSheet());

class _PassSheet extends StatefulWidget {
  const _PassSheet();

  @override
  State<_PassSheet> createState() => _PassSheetState();
}

class _PassSheetState extends State<_PassSheet> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final a = context.watch<FiltersProvider>().access;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Turn on gender and country', style: VT.title(18)),
          const SizedBox(height: 6),
          Text(
            "These filters need VIP or a filter pass. The pass works in random matches and Discover for ${a.passHours} hours. Until then you'll meet anyone, with your age range and verified only.",
            style: VT.body(13.5, color: V.text2, height: 1.5),
          ),
          const SizedBox(height: 16),
          GradientButton(
            label: 'Filter pass · ${a.passCost} coins',
            gradient: V.goldGrad,
            foreground: V.onGold,
            height: 52,
            busy: _busy,
            onTap: () async {
              setState(() => _busy = true);
              final r = await context.read<FiltersProvider>().buyPass();
              if (!context.mounted) return;
              setState(() => _busy = false);
              if (r == 'ok') {
                toast(context, 'Filters on for ${a.passHours} hours');
                Navigator.of(context).pop('ok');
              } else if (r == 'coins') {
                toast(context, 'Not enough coins for the pass', error: true);
                Navigator.of(context).pop('coins');
              } else {
                toast(context, "Couldn't buy the pass, try again", error: true);
              }
            },
          ),
          const SizedBox(height: 10),
          GhostButton(label: 'Get VIP · every filter free', icon: SolarIconsBold.crown, color: V.gold, expand: true, height: 48, onTap: () => Navigator.of(context).pop('vip')),
          const SizedBox(height: 4),
          TextButton(onPressed: () => Navigator.of(context).pop(), child: Text('Not now', style: VT.label(14.5, color: V.text2))),
        ],
      ),
    );
  }
}

class _Segmented extends StatelessWidget {
  const _Segmented({required this.value, required this.onChanged});
  final WantedGender value;
  final ValueChanged<WantedGender> onChanged;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(999), border: Border.all(color: V.line)),
        child: Row(
          children: [
            for (final (g, label) in [(WantedGender.anyone, 'Anyone'), (WantedGender.women, 'Women'), (WantedGender.men, 'Men')])
              Expanded(
                child: Semantics(
                  selected: value == g,
                  button: true,
                  child: GestureDetector(
                    onTap: () => onChanged(g),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 160),
                      height: 38,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: value == g ? V.surface3 : Colors.transparent, borderRadius: BorderRadius.circular(999)),
                      child: Text(label, style: VT.label(14, color: value == g ? V.text : V.text2)),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
}

class _Box extends StatelessWidget {
  const _Box({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(18), border: Border.all(color: V.line)),
        clipBehavior: Clip.antiAlias,
        child: Column(children: children),
      );
}

class _RadioRow extends StatelessWidget {
  const _RadioRow({required this.icon, required this.title, required this.on, required this.onTap, this.sub, this.chevron = false});
  final IconData icon;
  final String title;
  final String? sub;
  final bool on;
  final bool chevron;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Icon(icon, size: 20, color: V.text2),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: VT.title(15, weight: FontWeight.w600)),
                    if (sub != null) Text(sub!, style: VT.body(12, color: V.text2)),
                  ],
                ),
              ),
              if (chevron)
                const Icon(SolarIconsOutline.altArrowRight, size: 18, color: V.muted)
              else
                Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: on ? V.pink : Colors.white.withValues(alpha: 0.25), width: 2)),
                  alignment: Alignment.center,
                  child: on ? Container(width: 10, height: 10, decoration: const BoxDecoration(shape: BoxShape.circle, color: V.pink)) : null,
                ),
            ],
          ),
        ),
      );
}
