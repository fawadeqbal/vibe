import 'package:flutter/material.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';

class ReportChoice {
  const ReportChoice(this.reason, this.block, this.note);
  final ReportReason reason;
  final bool block;
  final String? note;
}

/// Two taps to report: pick a reason, submit. Block is on by default —
/// nobody reports someone they want to meet again.
Future<ReportChoice?> showReportSheet(BuildContext context, {required String name, bool afterCall = false}) {
  return showVibeSheet<ReportChoice>(context, scrollable: true, child: _ReportSheet(name: name, afterCall: afterCall));
}

class _ReportSheet extends StatefulWidget {
  const _ReportSheet({required this.name, required this.afterCall});
  final String name;
  final bool afterCall;

  @override
  State<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<_ReportSheet> {
  ReportReason? _reason;
  bool _block = true;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  IconData _icon(ReportReason r) => switch (r) {
        ReportReason.nudity => SolarIconsBold.forbidden,
        ReportReason.harassment => SolarIconsBold.userSpeakRounded,
        ReportReason.underage => SolarIconsBold.smileCircle,
        ReportReason.spam => SolarIconsBold.handMoney,
        ReportReason.scam => Icons.money_off_rounded,
        ReportReason.other => SolarIconsBold.menuDots,
      };

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: V.bad.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(14)),
                child: const Icon(SolarIconsBold.flag, color: V.bad),
              ),
              const SizedBox(width: 14),
              Expanded(child: Text('Report ${widget.name}', style: VT.title(22))),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            widget.afterCall ? 'The call is over. Our team reviews every report; three in a day removes the account.' : 'The match ends now. Our team reviews every report; three in a day removes the account.',
            style: VT.body(13, color: V.text2, height: 1.45),
          ),
          const SizedBox(height: 16),
          for (final r in ReportReason.values)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Semantics(
                selected: _reason == r,
                child: Panel(
                  color: _reason == r ? V.bad.withValues(alpha: 0.1) : V.surface2,
                  border: _reason == r ? V.bad.withValues(alpha: 0.7) : V.lineSoft,
                  radius: 18,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  onTap: () => setState(() => _reason = r),
                  child: Row(
                    children: [
                      Icon(_icon(r), size: 20, color: _reason == r ? V.bad : V.text2),
                      const SizedBox(width: 12),
                      Expanded(child: Text(r.label, style: VT.body(15, weight: _reason == r ? FontWeight.w600 : FontWeight.w400))),
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        width: 20,
                        height: 20,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: _reason == r ? V.bad : Colors.transparent,
                          border: _reason == r ? null : Border.all(color: V.muted, width: 2),
                        ),
                        child: _reason == r ? Center(child: Container(width: 8, height: 8, decoration: const BoxDecoration(shape: BoxShape.circle, color: V.bg))) : null,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          if (_reason == ReportReason.other) ...[
            const SizedBox(height: 2),
            TextField(controller: _note, maxLines: 2, decoration: const InputDecoration(hintText: 'What happened?')),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 4),
          GroupCard(
            children: [
              GroupRow(
                icon: SolarIconsBold.forbiddenCircle,
                title: 'Also block ${widget.name}',
                subtitle: 'You will never be matched again.',
                trailing: Switch(value: _block, onChanged: (v) => setState(() => _block = v)),
              ),
            ],
          ),
          const SizedBox(height: 16),
          GradientButton(
            label: _reason == null ? 'Pick a reason' : 'Submit report',
            gradient: const LinearGradient(colors: [V.bad, Color(0xFFE11D48)]),
            glow: V.bad,
            onTap: _reason == null ? null : () => Navigator.of(context).pop(ReportChoice(_reason!, _block, _note.text.trim().isEmpty ? null : _note.text.trim())),
          ),
        ],
      ),
    );
  }
}
