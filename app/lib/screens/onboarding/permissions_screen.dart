import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../providers/session_provider.dart';

/// Camera and microphone, explained before the system asks.
class PermissionsScreen extends StatefulWidget {
  const PermissionsScreen({super.key});

  @override
  State<PermissionsScreen> createState() => _PermissionsScreenState();
}

class _PermissionsScreenState extends State<PermissionsScreen> {
  bool _busy = false;
  bool _denied = false;

  Future<void> _ask() async {
    setState(() => _busy = true);
    final session = context.read<SessionProvider>();
    final ok = await session.requestPermissions();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _denied = !ok;
    });
    if (ok) await _finish();
  }

  Future<void> _finish() async {
    try {
      await context.read<SessionProvider>().finishOnboarding();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Headline('Vibe needs your camera and ', accent: 'mic', size: 32, accentColor: V.pinkSoft),
              const SizedBox(height: 10),
              Text('That is the whole app. Nothing is recorded; the stream goes to the person you are talking to and nowhere else.', style: VT.body(15, color: V.text2, height: 1.5)),
              const SizedBox(height: 28),
              _row(Icons.videocam_rounded, 'Camera', 'So they can see you. You can turn it off any time.', session.cameraGranted),
              const SizedBox(height: 12),
              _row(Icons.mic_rounded, 'Microphone', 'So they can hear you. Mute is one tap away.', session.micGranted),
              const SizedBox(height: 18),
              Row(
                children: [
                  const Icon(Icons.shield_rounded, size: 16, color: V.trust),
                  const SizedBox(width: 8),
                  Expanded(child: Text('Nothing is recorded. Both videos start blurred.', style: VT.label(12.5, color: V.text2, weight: FontWeight.w500))),
                ],
              ),
              const Spacer(),
              if (_denied) ...[
                Panel(
                  color: V.bad.withValues(alpha: 0.1),
                  border: V.bad.withValues(alpha: 0.4),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline_rounded, color: V.bad, size: 20),
                      const SizedBox(width: 10),
                      Expanded(child: Text('Without both, matches cannot start. You can grant them in the phone settings.', style: VT.body(13))),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                GhostButton(label: 'Open settings', icon: Icons.settings_rounded, expand: true, onTap: openAppSettings),
                const SizedBox(height: 12),
              ],
              GradientButton(label: session.permissionsGranted ? 'Continue' : 'Allow access', onTap: session.permissionsGranted ? _finish : _ask, busy: _busy),
            ],
          ),
        ),
      ),
    );
  }

  Widget _row(IconData icon, String title, String body, bool granted) {
    return Panel(
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: V.pink.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
            child: Icon(icon, color: V.pinkSoft),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [Text(title, style: VT.title(15)), const SizedBox(height: 2), Text(body, style: VT.body(13, color: V.text2))],
            ),
          ),
          Icon(granted ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded, color: granted ? V.trust : V.muted),
        ],
      ),
    );
  }
}
