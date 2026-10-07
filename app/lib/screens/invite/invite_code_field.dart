import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
import '../../providers/referrals_provider.dart';
import '../../providers/session_provider.dart';

/// What to say for each claim error (never the server's raw text for the
/// known codes).
String claimErrorText(ApiException e) => switch (e.code) {
      'INVITE_CODE_INVALID' => "We couldn't find that code. Check the spelling and try again.",
      'INVITE_TOO_LATE' => 'Invite codes can only be added in your first 48 hours on Vibe.',
      'INVITE_ALREADY_USED' => "You've already joined with an invite.",
      'INVITE_SELF' => "That's your own code (or someone you invited). Share it with friends instead.",
      'VALIDATION_FAILED' => 'Invite codes are 3–20 letters or numbers.',
      'RATE_LIMITED' => 'Too many tries. Wait a minute and try again.',
      _ => e.isNetwork ? "Can't reach Vibe. Check your connection." : e.message,
    };

/// "Have an invite code?" — shown on profile setup, Me and the Invite
/// screen while `referralClaimable` (48 h after sign-up, no invite yet).
/// Hides itself once a claim works.
class InviteCodeField extends StatefulWidget {
  const InviteCodeField({super.key, this.initialCode, this.compact = false});

  /// Pre-filled (a link opened after sign-up, or the code sign-up couldn't use).
  final String? initialCode;

  /// Without the card around it (profile setup form).
  final bool compact;

  @override
  State<InviteCodeField> createState() => _InviteCodeFieldState();
}

class _InviteCodeFieldState extends State<InviteCodeField> {
  late final TextEditingController _code = TextEditingController(text: widget.initialCode ?? '');
  bool _busy = false;
  String? _error;
  ClaimResult? _done;
  late bool _open = (widget.initialCode ?? '').isNotEmpty;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _claim() async {
    final code = _code.text.trim();
    if (code.isEmpty) {
      setState(() => _error = 'Type the code your friend sent you.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final referrals = context.read<ReferralsProvider>();
    final session = context.read<SessionProvider>();
    try {
      final r = await referrals.claim(code);
      if (!mounted) return;
      setState(() => _done = r);
      session.applyClaim(r);
      await session.refreshMe();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = claimErrorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final done = _done;
    final claimable = context.select<SessionProvider, bool>((s) => s.referralClaimable);
    if (done == null && !claimable) return const SizedBox.shrink();
    final Widget body;
    if (done != null) {
      final rewards = context.read<ReferralsProvider>().rewards;
      final coins = done.inviteeCoins > 0 ? done.inviteeCoins : rewards.inviteeCoins;
      body = Row(
        key: const ValueKey('invite-claimed'),
        children: [
          const Icon(SolarIconsBold.checkCircle, color: V.ok, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              done.status == ReferralStatus.rejected
                  ? "Thanks — that invite can't earn coins on this phone."
                  : "You joined with ${done.inviterName}'s invite 🎉 ${_activation(rewards, coins)}",
              style: VT.body(13.5, height: 1.45),
            ),
          ),
        ],
      );
    } else if (!_open) {
      body = InkWell(
        key: const ValueKey('invite-closed'),
        onTap: () => setState(() => _open = true),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            children: [
              const Icon(SolarIconsBold.gift, size: 20, color: V.gold),
              const SizedBox(width: 10),
              Expanded(child: Text('Have an invite code?', style: VT.title(14.5, weight: FontWeight.w600))),
              Text('Add it', style: VT.label(13, color: V.pinkSoft)),
            ],
          ),
        ),
      );
    } else {
      body = Column(
        key: const ValueKey('invite-open'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Have an invite code?', style: VT.title(14.5, weight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text('Add it in your first 48 hours — you both get coins when you\'re active.', style: VT.body(12, color: V.text2)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _code,
                  enabled: !_busy,
                  textCapitalization: TextCapitalization.characters,
                  autocorrect: false,
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9_]')), LengthLimitingTextInputFormatter(20)],
                  style: VT.mono(16, color: V.text, weight: FontWeight.w600),
                  decoration: InputDecoration(hintText: 'e.g. ALI123', errorText: null, isDense: true, contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14), enabledBorder: _error == null ? null : OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: const BorderSide(color: V.bad))),
                  onSubmitted: (_) => _claim(),
                ),
              ),
              const SizedBox(width: 8),
              GhostButton(label: 'Apply', height: 48, onTap: _busy ? null : _claim, trailing: _busy ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)) : null),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(padding: EdgeInsets.only(top: 1), child: Icon(SolarIconsOutline.dangerCircle, size: 16, color: V.bad)),
                const SizedBox(width: 6),
                Expanded(child: Text(_error!, key: const ValueKey('invite-error'), style: VT.body(12.5, color: V.bad, height: 1.4))),
              ],
            ),
          ],
        ],
      );
    }
    final content = AnimatedSize(duration: const Duration(milliseconds: 180), alignment: Alignment.topCenter, child: body);
    if (widget.compact) return content;
    return Panel(radius: 20, padding: const EdgeInsets.fromLTRB(16, 14, 16, 14), child: content);
  }

  static String _activation(ReferralRewards r, int coins) {
    final verify = r.requireVerified ? 'verify your selfie and ' : '';
    return 'Your $coins coins arrive once you ${verify}have ${r.activationCalls} calls.';
  }
}
