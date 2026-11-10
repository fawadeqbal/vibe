import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api/api_config.dart';
import '../core/theme/vibe_theme.dart';
import '../core/theme/vibe_widgets.dart';
import '../services/app_services.dart';

/// The only screen people see where Vibe isn't offered (the API answered
/// 451 REGION_UNAVAILABLE; admin → Settings → Region). Nothing leads into the
/// app: every other screen would fail the same way.
class RegionUnavailableScreen extends StatelessWidget {
  const RegionUnavailableScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final share = context.read<AppServices?>()?.share;
    Widget link(String label, String path) => TextButton(
          onPressed: share == null ? null : () => share.openUrl('${ApiConfig.siteUrl}$path'),
          child: Text(label, style: VT.body(13.5, color: V.text2)),
        );
    return Scaffold(
      backgroundColor: V.bg,
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: RadialGradient(center: Alignment(0, -0.4), radius: 1.2, colors: [Color(0xFF1B0F2E), V.bg], stops: [0, 0.62]),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 40),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 360),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const VibeMark(size: 64),
                    const SizedBox(height: 36),
                    Text('NOT AVAILABLE', style: VT.overline(color: V.lavender)),
                    const SizedBox(height: 12),
                    const Headline("Vibe isn't available in your ", accent: 'region', size: 28, textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    Text(
                      "We don't offer Vibe in your country right now, so it can't be used from here. We're sorry for the trouble.",
                      textAlign: TextAlign.center,
                      style: VT.body(14.5, color: V.text2, height: 1.55),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Have an account? It stays as it is, and you can ask us to delete it any time.',
                      textAlign: TextAlign.center,
                      style: VT.body(13, color: V.muted, height: 1.5),
                    ),
                    const SizedBox(height: 24),
                    Wrap(
                      alignment: WrapAlignment.center,
                      children: [link('Delete my account', '/delete-account/'), link('Privacy', '/privacy/'), link('Terms', '/terms/')],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
