import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/mock/mock_data.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
import '../../providers/match_provider.dart';
import '../../providers/wallet_provider.dart';
import '../store/vip_screen.dart';

/// Who to match with. Paid filters show their price in gold; VIP shows
/// "free"; the trust filter (verified only) is teal and always free.
Future<void> showFiltersSheet(BuildContext context) {
  return showVibeSheet(context, scrollable: true, child: const _FiltersSheet());
}

class _FiltersSheet extends StatefulWidget {
  const _FiltersSheet();

  @override
  State<_FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends State<_FiltersSheet> {
  late MatchFilters _f;
  late bool _autoBlur;

  @override
  void initState() {
    super.initState();
    final m = context.read<MatchProvider>();
    _f = m.filters;
    _autoBlur = m.autoBlur;
  }

  @override
  Widget build(BuildContext context) {
    final isVip = context.watch<WalletProvider>().isVip;
    // Vibe Hour makes every filter free for everyone, like VIP.
    final vibeHour = Economy.filtersFree;
    final vip = isVip || vibeHour;
    final cost = _f.costFor(vip: isVip);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Headline('Who do you want to ', accent: 'meet?', size: 24),
          const SizedBox(height: 6),
          Text(vibeHour && !isVip ? 'Vibe Hour: every filter is free right now.' : (isVip ? 'VIP: every filter is free.' : 'Gender and country filters cost coins per match. VIP makes them free.'), style: VT.body(13, color: V.text2, height: 1.45)),
          const SectionTitle('Gender', top: 22),
          Row(
            children: [
              _seg('Anyone', Icons.group_rounded, GenderFilter.anyone, null, vip),
              const SizedBox(width: 8),
              _seg('Women', Icons.female_rounded, GenderFilter.women, Economy.genderFilterCost, vip),
              const SizedBox(width: 8),
              _seg('Men', Icons.male_rounded, GenderFilter.men, Economy.genderFilterCost, vip),
            ],
          ),
          SectionTitle('Country', top: 22, note: isVip ? 'Free with VIP' : (vibeHour ? 'Free during Vibe Hour' : '${Economy.regionFilterCost} coins per match')),
          Container(
            decoration: BoxDecoration(color: V.surface2, borderRadius: BorderRadius.circular(18), border: Border.all(color: V.line)),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _f.countryCode ?? '',
                isExpanded: true,
                dropdownColor: V.surface2,
                icon: const Icon(Icons.expand_more_rounded, color: V.text2),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
                borderRadius: BorderRadius.circular(18),
                items: [
                  DropdownMenuItem(value: '', child: Text('🌍  Anywhere', style: VT.body(15))),
                  for (final c in MockData.countries) DropdownMenuItem(value: c.code, child: Text('${c.flag}  ${c.name}', style: VT.body(15))),
                ],
                onChanged: (v) => setState(() => _f = v == null || v.isEmpty ? _f.copyWith(clearCountry: true) : _f.copyWith(countryCode: v)),
              ),
            ),
          ),
          const SectionTitle('Safety', top: 22),
          GroupCard(
            border: V.trust.withValues(alpha: 0.22),
            children: [
              GroupRow(
                icon: Icons.verified_rounded,
                iconColor: V.trust,
                iconBg: V.trust.withValues(alpha: 0.12),
                title: 'Verified only',
                subtitle: 'Only match with selfie-verified people. Free.',
                trailing: Switch(value: _f.safeMode, onChanged: (v) => setState(() => _f = _f.copyWith(safeMode: v))),
              ),
              GroupRow(
                icon: Icons.blur_on_rounded,
                title: 'Blur the first 3 seconds',
                subtitle: isVip ? 'Off for VIP by default; you can keep it on.' : 'Both videos start blurred, so nobody gets flashed.',
                trailing: Switch(value: _autoBlur, onChanged: (v) => setState(() => _autoBlur = v)),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              if (cost == 0) ...[const Icon(Icons.check_circle_rounded, size: 18, color: V.ok), const SizedBox(width: 6), Text('Free to match', style: VT.title(15, color: V.ok, weight: FontWeight.w600))] else ...[CoinAmount(cost, size: 15), const SizedBox(width: 6), Text('per match', style: VT.body(14, color: V.text2))],
              const Spacer(),
              if (!isVip && cost > 0)
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () {
                    Navigator.of(context).pop();
                    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VipScreen()));
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(children: [const Icon(Icons.workspace_premium_rounded, size: 16, color: V.gold), const SizedBox(width: 4), Text('VIP · filters free', style: VT.label(13, color: V.gold))]),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          GradientButton(
            label: 'Apply',
            onTap: () {
              final m = context.read<MatchProvider>();
              m.setFilters(_f);
              m.setAutoBlur(_autoBlur);
              Navigator.of(context).pop();
            },
          ),
        ],
      ),
    );
  }

  Widget _seg(String label, IconData icon, GenderFilter g, int? cost, bool vip) {
    final on = _f.gender == g;
    return Expanded(
      child: Semantics(
        selected: on,
        button: true,
        child: GestureDetector(
          onTap: () => setState(() => _f = _f.copyWith(gender: g)),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            height: 72,
            decoration: BoxDecoration(
              color: on ? V.surfaceSel : V.surface2,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: on ? V.pink : V.lineSoft, width: on ? 1.5 : 1),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 20, color: on ? V.pinkSoft : V.text2),
                const SizedBox(height: 4),
                Text(label, style: VT.title(14, weight: FontWeight.w600, color: on ? V.text : V.text2)),
                const SizedBox(height: 2),
                if (cost == null) Text('free', style: VT.label(11, color: V.ok)) else if (vip) Text('free', style: VT.label(11, color: V.ok)) else CoinAmount(cost, size: 11),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
