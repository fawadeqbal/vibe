import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
import '../../providers/session_provider.dart';

/// "9:00 PM" for minutes after midnight.
String clockLabel(int minutes) {
  final h = (minutes ~/ 60) % 24;
  final m = minutes % 60;
  final h12 = h % 12 == 0 ? 12 : h % 12;
  return '$h12:${m.toString().padLeft(2, '0')} ${h < 12 ? 'AM' : 'PM'}';
}

/// Me → Notifications & wellbeing: quiet hours (teal — wellbeing is trust)
/// and a gentle break reminder.
class WellbeingSection extends StatelessWidget {
  const WellbeingSection({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final w = session.wellbeing;

    Future<void> save(WellbeingSettings next) async {
      final ok = await session.saveWellbeing(next);
      if (!ok && context.mounted) toast(context, "Couldn't save that, try again", error: true);
    }

    WellbeingSettings withQuiet(int? start, int? end) => WellbeingSettings(quietHoursStart: start, quietHoursEnd: end, breakReminderMinutes: w.breakReminderMinutes, tzOffsetMinutes: w.tzOffsetMinutes);

    Future<void> pickTime({required bool from}) async {
      final current = (from ? w.quietHoursStart : w.quietHoursEnd) ?? (from ? WellbeingSettings.defaultQuietStart : WellbeingSettings.defaultQuietEnd);
      final t = await showTimePicker(context: context, initialTime: TimeOfDay(hour: current ~/ 60, minute: current % 60), helpText: from ? 'QUIET FROM' : 'QUIET UNTIL');
      if (t == null) return;
      final v = t.hour * 60 + t.minute;
      await save(from ? withQuiet(v, w.quietHoursEnd) : withQuiet(w.quietHoursStart, v));
    }

    final on = w.quietHoursOn;
    return GroupCard(
      border: V.trust.withValues(alpha: 0.22),
      children: [
        GroupRow(
          icon: SolarIconsBold.moonSleep,
          iconColor: V.trust,
          iconBg: V.trust.withValues(alpha: 0.12),
          title: 'Quiet hours',
          subtitle: on ? 'No friend, streak or Vibe Hour pushes ${clockLabel(w.quietHoursStart!)} – ${clockLabel(w.quietHoursEnd!)}. Messages still arrive.' : 'Pause friend, streak and Vibe Hour pushes at night.',
          trailing: Switch(
            value: on,
            onChanged: (v) => save(v ? withQuiet(w.quietHoursStart ?? WellbeingSettings.defaultQuietStart, w.quietHoursEnd ?? WellbeingSettings.defaultQuietEnd) : withQuiet(null, null)),
          ),
        ),
        if (on) ...[
          _TimeRow(label: 'From', value: clockLabel(w.quietHoursStart!), onTap: () => pickTime(from: true)),
          _TimeRow(label: 'To', value: clockLabel(w.quietHoursEnd!), onTap: () => pickTime(from: false)),
        ],
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(color: V.trust.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                    child: const Icon(SolarIconsBold.meditationRound, size: 22, color: V.trust),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Break reminder', style: VT.title(15, weight: FontWeight.w600)),
                        Text(w.breakReminderMinutes == null ? 'Off' : 'A nudge after ${w.breakReminderMinutes} minutes of matching', style: VT.body(12, color: V.text2)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  for (final (i, m) in <int?>[null, ...WellbeingSettings.breakChoices].indexed) ...[
                    if (i > 0) const SizedBox(width: 6),
                    Expanded(
                      child: _Choice(
                        label: m == null ? 'Off' : '$m',
                        selected: w.breakReminderMinutes == m,
                        semantics: m == null ? 'Break reminder off' : 'Break reminder after $m minutes',
                        onTap: () => save(WellbeingSettings(quietHoursStart: w.quietHoursStart, quietHoursEnd: w.quietHoursEnd, breakReminderMinutes: m, tzOffsetMinutes: w.tzOffsetMinutes)),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TimeRow extends StatelessWidget {
  const _TimeRow({required this.label, required this.value, required this.onTap});
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(70, 12, 16, 12),
        child: Row(
          children: [
            Expanded(child: Text(label, style: VT.body(14, color: V.text2))),
            Text(value, style: VT.mono(14, color: V.text)),
            const SizedBox(width: 6),
            const Icon(SolarIconsOutline.altArrowRight, size: 18, color: V.muted),
          ],
        ),
      ),
    );
  }
}

class _Choice extends StatelessWidget {
  const _Choice({required this.label, required this.selected, required this.onTap, required this.semantics});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final String semantics;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: selected,
      button: true,
      label: semantics,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? V.trust.withValues(alpha: 0.16) : V.surface2,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: selected ? V.trust.withValues(alpha: 0.6) : V.lineSoft),
          ),
          child: Text(label, style: VT.label(13, color: selected ? V.trust : V.text2)),
        ),
      ),
    );
  }
}
