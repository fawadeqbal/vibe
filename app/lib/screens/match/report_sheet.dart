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

/// Where the report comes from: it changes the one line under the title.
enum ReportContext { call, afterCall, moment, person }

/// The reasons, in the order the design lists them. "Something else" asks what happened.
const reportRows = <(ReportReason, String)>[
  (ReportReason.nudity, 'Nudity or sexual content'),
  (ReportReason.underage, 'Looks under 18'),
  (ReportReason.harassment, 'Harassment or hate'),
  (ReportReason.scam, 'Scam or spam'),
  (ReportReason.other, 'Something else'),
];

/// One tap to report: pick a reason and it is sent. Reporting always blocks —
/// nobody reports someone they want to meet again. (web: components/shared/report-sheet.tsx)
Future<ReportChoice?> showReportSheet(BuildContext context, {required String name, bool afterCall = false, ReportContext? where}) {
  final ctx = where ?? (afterCall ? ReportContext.afterCall : ReportContext.call);
  return showVibeSheet<ReportChoice>(
    context,
    scrollable: true,
    child: _ReportSheet(name: name, where: ctx),
  );
}

String reportIntro(String name, ReportContext where) {
  const review = 'Our team reviews every report.';
  return switch (where) {
    ReportContext.call => "The call ends and you won't meet $name again. $review",
    ReportContext.moment => "We'll look at this moment and $name's account. $review",
    _ => "You won't see or meet $name again. $review",
  };
}

class _ReportSheet extends StatefulWidget {
  const _ReportSheet({required this.name, required this.where});
  final String name;
  final ReportContext where;

  @override
  State<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<_ReportSheet> {
  bool _other = false;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final note = _note.text.trim();
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Report ${widget.name}', style: VT.title(18, weight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text(reportIntro(widget.name, widget.where), style: VT.body(13, color: V.text2, height: 1.45)),
          const SizedBox(height: 6),
          if (_other) ...[
            const SizedBox(height: 6),
            TextField(
              controller: _note,
              autofocus: true,
              minLines: 3,
              maxLines: 4,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(hintText: 'What happened?'),
            ),
            const SizedBox(height: 12),
            GradientButton(
              label: 'Send report',
              gradient: const LinearGradient(colors: [V.bad, Color(0xFFE11D48)]),
              onTap: () => Navigator.of(context).pop(ReportChoice(ReportReason.other, true, note.isEmpty ? null : note)),
            ),
            TextButton(
              onPressed: () => setState(() => _other = false),
              child: Text('Back to reasons', style: VT.label(13.5, color: V.text2)),
            ),
          ] else
            for (var i = 0; i < reportRows.length; i++)
              _ReasonRow(
                label: reportRows[i].$2,
                last: i == reportRows.length - 1,
                onTap: () {
                  final r = reportRows[i].$1;
                  if (r == ReportReason.other) {
                    setState(() => _other = true);
                  } else {
                    Navigator.of(context).pop(ReportChoice(r, true, null));
                  }
                },
              ),
        ],
      ),
    );
  }
}

class _ReasonRow extends StatelessWidget {
  const _ReasonRow({required this.label, required this.onTap, this.last = false});
  final String label;
  final VoidCallback onTap;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 14),
          decoration: BoxDecoration(
            border: last ? null : const Border(bottom: BorderSide(color: V.lineSoft)),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: VT.label(15, color: V.text, weight: FontWeight.w600),
                ),
              ),
              const Icon(SolarIconsOutline.altArrowRight, size: 18, color: V.muted),
            ],
          ),
        ),
      ),
    );
  }
}
