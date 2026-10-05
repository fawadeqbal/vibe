import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import '../../core/api/api_client.dart';
import '../../core/mock/mock_backend.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';

enum AdOutcome {
  /// Watched to the end: claim with [AdResult.token].
  rewarded,

  /// Closed early: no reward.
  dismissed,

  /// No ad to show right now.
  noFill,

  /// Ads are not set up in this build.
  unavailable,
}

class AdResult {
  const AdResult(this.outcome, {this.token, this.message});
  final AdOutcome outcome;

  /// The nonce passed to AdMob as SSV `customData` — the server matches it
  /// with AdMob's signed callback (`POST /wallet/rewards/ad {adToken}`).
  final String? token;
  final String? message;
}

/// Rewarded video ads. [AdMobRewardedAds] when an ad unit is configured,
/// [MockRewardedAds] for the offline demo (and debug against a dev server),
/// [NoRewardedAds] otherwise (the "watch an ad" row hides).
abstract class RewardedAds {
  bool get available;

  /// Plays one ad. [userId] goes to AdMob's server-side verification.
  Future<AdResult> show(BuildContext context, {required String userId});
}

class NoRewardedAds implements RewardedAds {
  const NoRewardedAds();
  @override
  bool get available => false;
  @override
  Future<AdResult> show(BuildContext context, {required String userId}) async => const AdResult(AdOutcome.unavailable);
}

/// Google AdMob with server-side verification. Initialised on first use.
class AdMobRewardedAds implements RewardedAds {
  AdMobRewardedAds(this.adUnitId);

  final String adUnitId;
  Future<void>? _init;
  bool _showing = false;

  @override
  bool get available => true;

  @override
  Future<AdResult> show(BuildContext context, {required String userId}) async {
    if (_showing) return const AdResult(AdOutcome.dismissed);
    _showing = true;
    try {
      _init ??= MobileAds.instance.initialize().then((_) {});
      await _init;
      final ad = await _load();
      if (ad == null) return const AdResult(AdOutcome.noFill, message: 'No ad available right now. Try again in a minute.');
      final nonce = ApiClient.newIdempotencyKey();
      await ad.setServerSideOptions(ServerSideVerificationOptions(userId: userId, customData: nonce));
      var earned = false;
      final closed = Completer<AdResult>();
      ad.fullScreenContentCallback = FullScreenContentCallback(
        onAdDismissedFullScreenContent: (ad) {
          ad.dispose();
          if (!closed.isCompleted) closed.complete(earned ? AdResult(AdOutcome.rewarded, token: nonce) : const AdResult(AdOutcome.dismissed));
        },
        onAdFailedToShowFullScreenContent: (ad, err) {
          ad.dispose();
          if (!closed.isCompleted) closed.complete(AdResult(AdOutcome.noFill, message: err.message));
        },
      );
      await ad.show(onUserEarnedReward: (_, _) => earned = true);
      return await closed.future;
    } catch (e) {
      return AdResult(AdOutcome.noFill, message: 'Ads are not available right now.');
    } finally {
      _showing = false;
    }
  }

  Future<RewardedAd?> _load() {
    final done = Completer<RewardedAd?>();
    RewardedAd.load(
      adUnitId: adUnitId,
      request: const AdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(onAdLoaded: done.complete, onAdFailedToLoad: (_) => done.complete(null)),
    );
    return done.future.timeout(const Duration(seconds: 20), onTimeout: () => null);
  }
}

/// The offline demo's 5-second "video" (also used in debug builds against a
/// dev server, which accepts any unique token).
class MockRewardedAds implements RewardedAds {
  MockRewardedAds(this._backend, {Random? random}) : _rnd = random ?? Random();
  final MockBackend _backend;
  final Random _rnd;

  @override
  bool get available => true;

  @override
  Future<AdResult> show(BuildContext context, {required String userId}) async {
    final filled = await _backend.loadRewardedAd();
    if (!filled) return const AdResult(AdOutcome.noFill, message: 'No ad available right now. Try again in a minute.');
    if (!context.mounted) return const AdResult(AdOutcome.dismissed);
    final watched = await showDialog<bool>(context: context, barrierDismissible: false, builder: (_) => const MockAdDialog());
    if (watched != true) return const AdResult(AdOutcome.dismissed);
    return AdResult(AdOutcome.rewarded, token: 'dev-ad-${DateTime.now().microsecondsSinceEpoch}-${_rnd.nextInt(1 << 30)}');
  }
}

/// A 5-second "video ad" with a skip lock, the way rewarded ads behave.
class MockAdDialog extends StatefulWidget {
  const MockAdDialog({super.key});

  @override
  State<MockAdDialog> createState() => _MockAdDialogState();
}

class _MockAdDialogState extends State<MockAdDialog> {
  int _left = 5;
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => _left--);
      if (_left <= 0) t.cancel();
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.black,
      insetPadding: const EdgeInsets.all(16),
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      child: AspectRatio(
        aspectRatio: 9 / 14,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Container(decoration: const BoxDecoration(gradient: LinearGradient(colors: [Color(0xFF3A1D70), Color(0xFF0B0A10)], begin: Alignment.topLeft, end: Alignment.bottomRight))),
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.local_pizza_rounded, size: 72, color: V.gold),
                  const SizedBox(height: 12),
                  Text('Mock advertiser', style: VT.title(20, color: Colors.white)),
                  const SizedBox(height: 4),
                  Text('A real rewarded ad plays here (AdMob).', style: VT.body(13, color: Colors.white70)),
                ],
              ),
            ),
            Positioned(
              top: 12,
              right: 12,
              child: _left > 0
                  ? GlassPill(label: 'Reward in ${_left}s', height: 32)
                  : GlassPill(label: 'Claim reward', icon: Icons.check_rounded, tint: V.gold, textColor: V.gold, height: 32, onTap: () => Navigator.of(context).pop(true)),
            ),
            const Positioned(bottom: 12, left: 12, child: GlassPill(label: 'Ad', height: 26, fontSize: 10.5)),
          ],
        ),
      ),
    );
  }
}
