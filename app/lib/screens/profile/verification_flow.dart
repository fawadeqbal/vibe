import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/payments.dart';
import '../../providers/session_provider.dart';
import '../../providers/wallet_provider.dart';
import '../../services/app_services.dart';

/// Selfie verification, from anywhere (profile, safety sheet, a cash-out
/// that needs KYC): explain → front camera → upload → result.
Future<VerificationState?> startSelfieVerification(BuildContext context) async {
  final session = context.read<SessionProvider>();
  final media = context.read<AppServices>().media;
  final remote = context.read<WalletProvider>().isRemote;
  var bytes = const <int>[];
  if (media.available) {
    final go = await showVibeSheet<bool>(context, child: const _SelfieIntro());
    if (go != true || !context.mounted) return null;
    try {
      final shot = await media.takeSelfie();
      if (shot == null) return null;
      bytes = shot.bytes;
    } on FormatException catch (e) {
      if (context.mounted) toast(context, e.message, error: true);
      return null;
    } catch (_) {
      if (context.mounted) toast(context, "Couldn't open the camera. Check Vibe's camera permission.", error: true);
      return null;
    }
  } else if (remote && !kDebugMode) {
    toast(context, 'Selfie verification needs a camera.', error: true);
    return null;
  }
  try {
    final v = await session.verifySelfie(bytes);
    if (!context.mounted) return v;
    switch (v.status) {
      case VerificationStatus.approved:
        toast(context, 'Verified — badge added');
      case VerificationStatus.pending:
        toast(context, "Thanks! A person will check your selfie shortly — we'll let you know.");
      case VerificationStatus.rejected:
        toast(context, v.reason ?? 'We could not verify you. Try again in good light.', error: true);
      case VerificationStatus.none:
        break;
    }
    return v;
  } on ApiException catch (e) {
    if (context.mounted) toast(context, e.message, error: true);
    return null;
  }
}

/// One line for the profile's verification row.
String verificationSubtitle(VerificationState v, {required bool verified}) {
  if (verified) return 'People in safe mode can match with you.';
  return switch (v.status) {
    VerificationStatus.pending => "Selfie in review — we'll let you know.",
    VerificationStatus.rejected => 'Not verified: ${v.reason ?? 'try again in good light'}. Try again.',
    _ => 'Quick selfie check. More matches, and you show up in safe mode.',
  };
}

class _SelfieIntro extends StatelessWidget {
  const _SelfieIntro();

  @override
  Widget build(BuildContext context) {
    Widget tip(IconData i, String t) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(children: [Icon(i, size: 18, color: V.trust), const SizedBox(width: 10), Expanded(child: Text(t, style: VT.body(14, color: V.text2)))]),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.verified_user_rounded, size: 40, color: V.trust),
          const SizedBox(height: 10),
          Text('Take a quick selfie', textAlign: TextAlign.center, style: VT.title(20)),
          const SizedBox(height: 6),
          Text('We compare it with your profile photo. It is never shown to anyone.', textAlign: TextAlign.center, style: VT.body(14, color: V.text2)),
          const SizedBox(height: 18),
          tip(Icons.wb_sunny_rounded, 'Face the light, no sunglasses or mask.'),
          tip(Icons.face_rounded, 'Just you, looking at the camera.'),
          tip(Icons.photo_rounded, 'Your profile photo should show your face too.'),
          const SizedBox(height: 10),
          GradientButton(label: 'Open camera', icon: Icons.photo_camera_front_rounded, gradient: V.gemGrad, foreground: V.onGem, glow: V.gem, onTap: () => Navigator.of(context).pop(true)),
        ],
      ),
    );
  }
}
