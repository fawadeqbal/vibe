import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
import '../../providers/referrals_provider.dart';
import '../../services/invite/invite_capture.dart';

/// "Ali invited you · finish setup to earn 50 coins" — on the welcome and
/// sign-in screens once a code was captured (link or Play install
/// referrer). Unknown codes show nothing.
class InviteWelcomeBanner extends StatefulWidget {
  const InviteWelcomeBanner({super.key});

  @override
  State<InviteWelcomeBanner> createState() => _InviteWelcomeBannerState();
}

class _InviteWelcomeBannerState extends State<InviteWelcomeBanner> {
  String? _for;
  InvitePreview? _preview;

  Future<void> _load(CapturedInvite c) async {
    _for = c.code;
    try {
      final p = await context.read<ReferralsProvider>().preview(c.code, source: c.source);
      if (mounted && _for == c.code) setState(() => _preview = p);
    } catch (_) {
      // Offline: no banner; the code still goes out with sign-up.
    }
  }

  @override
  Widget build(BuildContext context) {
    final captured = context.watch<InviteCapture>().captured;
    if (captured == null) return const SizedBox.shrink();
    if (captured.code != _for) {
      _preview = null;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && captured.code != _for) _load(captured);
      });
      return const SizedBox.shrink();
    }
    final p = _preview;
    if (p == null || !p.valid || (p.name ?? '').isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: InviteBannerRow(name: p.name!, avatarUrl: p.avatarUrl, coins: p.inviteeCoins > 0 ? p.inviteeCoins : Economy.inviteeRewardCoins),
    );
  }
}

/// The banner itself (also on profile setup, from `user.invitedBy`).
class InviteBannerRow extends StatelessWidget {
  const InviteBannerRow({super.key, required this.name, this.avatarUrl, required this.coins});
  final String name;
  final String? avatarUrl;
  final int coins;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$name invited you. Finish setup to earn $coins coins.',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.fromLTRB(8, 8, 14, 8),
        decoration: BoxDecoration(color: V.surface.withValues(alpha: 0.9), borderRadius: BorderRadius.circular(20), border: Border.all(color: V.gold.withValues(alpha: 0.3))),
        child: Row(
          children: [
            if ((avatarUrl ?? '').isNotEmpty)
              VAvatar(url: avatarUrl!, name: name, size: 34, gapColor: V.surface)
            else
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(shape: BoxShape.circle, color: V.gold.withValues(alpha: 0.14)),
                child: const Icon(SolarIconsBold.gift, size: 18, color: V.gold),
              ),
            const SizedBox(width: 10),
            Expanded(
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(text: '$name invited you', style: VT.title(13.5, weight: FontWeight.w600)),
                  TextSpan(text: ' · finish setup to earn ', style: VT.body(13, color: V.text2)),
                  TextSpan(text: '$coins coins', style: VT.label(13, color: V.gold, weight: FontWeight.w700)),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
