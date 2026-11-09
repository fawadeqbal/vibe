import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
import '../../providers/session_provider.dart';
import '../../providers/wallet_provider.dart';
import '../../services/ads/rewarded_ads.dart';
import '../../services/app_services.dart';

enum VideoPhase { ready, loading, adding, noFill }

/// "Watch a short video" in the Store — the only place Vibe shows ads.
/// Opt-in, a daily limit (Economy → Free coins), coins only after the network
/// confirms the view. The network comes from Settings → Ads; off hides it.
class VideoCoinsCard extends StatefulWidget {
  const VideoCoinsCard({super.key});

  @override
  State<VideoCoinsCard> createState() => _VideoCoinsCardState();
}

class _VideoCoinsCardState extends State<VideoCoinsCard> {
  VideoPhase _phase = VideoPhase.ready;
  String? _note;

  @override
  void initState() {
    super.initState();
    final ads = context.read<AppServices>().ads;
    ads.refresh().then((_) {
      if (mounted) setState(() {});
    });
  }

  Future<void> _watch() async {
    final wallet = context.read<WalletProvider>();
    final ads = context.read<AppServices>().ads;
    if (wallet.adsLeftToday <= 0 || _phase == VideoPhase.loading || _phase == VideoPhase.adding) return;
    setState(() {
      _phase = VideoPhase.loading;
      _note = null;
    });
    final r = await ads.show(context, userId: context.read<SessionProvider>().me?.id ?? '');
    if (!mounted) return;
    if (r.outcome == AdOutcome.dismissed) return setState(() => _phase = VideoPhase.ready);
    if (r.outcome != AdOutcome.rewarded) {
      return setState(() {
        _phase = VideoPhase.noFill;
        _note = r.message;
      });
    }
    setState(() => _phase = VideoPhase.adding);
    try {
      final coins = await wallet.rewardAd(adToken: r.token);
      if (!mounted) return;
      toast(context, coins == null ? "You've watched all of today's videos" : '+$coins coins added', error: coins == null);
      setState(() => _phase = VideoPhase.ready);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _phase = VideoPhase.noFill;
        _note = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ads = context.read<AppServices>().ads;
    final perDay = Economy.rewardedAdsPerDay;
    if (!ads.available || perDay <= 0) return const SizedBox.shrink();
    final left = context.watch<WalletProvider>().adsLeftToday;
    final coins = Economy.rewardedAdCoins;
    final watched = (perDay - left).clamp(0, perDay);
    final busy = _phase == VideoPhase.loading || _phase == VideoPhase.adding;
    final limit = left <= 0 && _phase != VideoPhase.adding;

    final label = limit
        ? 'All $perDay watched today'
        : switch (_phase) {
            VideoPhase.loading => 'Getting a video…',
            VideoPhase.adding => 'Adding your coins…',
            VideoPhase.noFill => 'Try again',
            VideoPhase.ready => watched > 0 ? 'Watch another · +$coins' : 'Watch · +$coins coins',
          };
    final note = _note ??
        (limit
            ? 'Come back after midnight for more.'
            : switch (_phase) {
                VideoPhase.ready => 'You choose when. Coins land after the video ends.',
                VideoPhase.loading => 'This takes a second or two.',
                VideoPhase.adding => 'Checking the view with the ad network…',
                VideoPhase.noFill => 'No video to show right now. Try again in a minute.',
              });

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: V.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: limit || busy ? V.line : V.gold.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(color: V.gold.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(16)),
                child: const Icon(SolarIconsBold.play, color: V.gold, size: 24),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Watch a short video', style: VT.title(16, weight: FontWeight.w700)),
                    const SizedBox(height: 3),
                    Text(limit ? 'All done for today' : 'Get +$coins coins each time · $left of $perDay left today', style: VT.body(13, color: V.muted)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Semantics(
            label: '$watched of $perDay watched today',
            excludeSemantics: true,
            child: Row(
              children: [
                for (var i = 0; i < perDay; i++) ...[
                  if (i > 0) const SizedBox(width: 4),
                  Expanded(child: Container(height: 6, decoration: BoxDecoration(color: i < watched ? V.gold : V.surface2, borderRadius: BorderRadius.circular(3)))),
                ],
              ],
            ),
          ),
          const SizedBox(height: 14),
          if (limit || busy)
            GhostButton(
              label: label,
              height: 50,
              expand: true,
              trailing: busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: V.gold)) : null,
            )
          else if (_phase == VideoPhase.noFill)
            GhostButton(label: label, icon: Icons.refresh_rounded, height: 50, expand: true, onTap: _watch)
          else
            GradientButton(label: label, icon: SolarIconsBold.play, height: 50, gradient: V.goldGrad, foreground: V.onGold, onTap: _watch),
          const SizedBox(height: 10),
          Text(note, textAlign: TextAlign.center, style: VT.body(12, color: V.muted)),
        ],
      ),
    );
  }
}
