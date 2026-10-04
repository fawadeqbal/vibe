import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../providers/match_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/wallet_provider.dart';

/// The lobby's Safety shortcut: every trust control in one place, in teal.
Future<void> showSafetySheet(BuildContext context) {
  return showVibeSheet(context, scrollable: true, child: const _SafetySheet());
}

class _SafetySheet extends StatelessWidget {
  const _SafetySheet();

  @override
  Widget build(BuildContext context) {
    final m = context.watch<MatchProvider>();
    final session = context.watch<SessionProvider>();
    final vip = context.watch<WalletProvider>().isVip;
    final me = session.me;
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
                decoration: BoxDecoration(color: V.trust.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(14)),
                child: const Icon(Icons.shield_rounded, color: V.trust),
              ),
              const SizedBox(width: 14),
              const Expanded(child: Headline('Safety, ', accent: 'built in', size: 24)),
            ],
          ),
          const SizedBox(height: 10),
          Text('Report and block are always top-right during a call. Our team reviews every report.', style: VT.body(13, color: V.text2, height: 1.45)),
          const SectionTitle('Who you meet', top: 22),
          GroupCard(
            border: V.trust.withValues(alpha: 0.22),
            children: [
              GroupRow(
                icon: Icons.verified_rounded,
                iconColor: V.trust,
                iconBg: V.trust.withValues(alpha: 0.12),
                title: 'Verified only',
                subtitle: 'Only match with selfie-verified people. Free.',
                trailing: Switch(value: m.filters.safeMode, onChanged: (v) => m.setFilters(m.filters.copyWith(safeMode: v))),
              ),
              GroupRow(
                icon: Icons.blur_on_rounded,
                title: 'Blur the first 3 seconds',
                subtitle: vip ? 'Off for VIP by default; you can keep it on.' : 'Both videos start blurred.',
                trailing: Switch(value: m.autoBlur, onChanged: m.setAutoBlur),
              ),
            ],
          ),
          const SectionTitle('Your profile', top: 22),
          GroupCard(
            children: [
              GroupRow(
                icon: me?.verified == true ? Icons.verified_rounded : Icons.verified_outlined,
                iconColor: V.trust,
                iconBg: V.trust.withValues(alpha: 0.12),
                title: me?.verified == true ? 'You are verified' : 'Verify your profile',
                subtitle: me?.verified == true ? 'People in safe mode can match with you.' : 'Quick selfie check. More matches.',
                trailing: me?.verified == true
                    ? const Icon(Icons.check_circle_rounded, color: V.trust)
                    : VerifyPill(
                        busy: session.busy,
                        onTap: () async {
                          final ok = await session.verifySelfie();
                          if (context.mounted) toast(context, ok ? 'Verified — badge added' : 'Could not verify, try again', error: !ok);
                        },
                      ),
              ),
              GroupRow(
                icon: Icons.support_agent_rounded,
                title: 'Help and safety',
                trailing: const Icon(Icons.chevron_right_rounded, color: V.muted),
                onTap: () => toast(context, 'Opens the help centre in the real app'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The teal "Verify" pill used wherever verification is offered.
class VerifyPill extends StatelessWidget {
  const VerifyPill({super.key, required this.onTap, this.busy = false});
  final VoidCallback onTap;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: V.trust,
      shape: const StadiumBorder(),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: busy ? null : onTap,
        child: Container(
          height: 34,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          alignment: Alignment.center,
          child: busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: V.onGem)) : Text('Verify', style: VT.label(13, color: V.onGem, weight: FontWeight.w700)),
        ),
      ),
    );
  }
}
