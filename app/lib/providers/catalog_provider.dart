import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/realtime_client.dart';
import '../core/mock/mock_data.dart';
import '../models/models.dart';

/// Prices, packs, plans, gifts and rules.
///
/// The values live in [Economy] and [MockData] (so every screen reads them
/// the same way). The offline mock keeps the built-in defaults; in server
/// mode [RemoteCatalogProvider] loads `GET /catalog` and reloads it when staff
/// change something in the admin panel (`catalog:updated`). Screens that show
/// prices `watch` this provider so they redraw with the new numbers.
class CatalogProvider extends ChangeNotifier {
  CatalogProvider();

  String _version = 'default';
  String get version => _version;

  Future<void> load() async {}

  /// Applies a `GET /catalog` body. Unknown or missing fields keep their value.
  @visibleForTesting
  void apply(Map<String, dynamic> c) {
    final version = '${c['version'] ?? ''}';
    final e = Map<String, dynamic>.from((c['economy'] as Map?) ?? const {});
    int i(String k, int fallback) => (e[k] as num?)?.toInt() ?? fallback;
    double d(String k, double fallback) => (e[k] as num?)?.toDouble() ?? fallback;

    Economy.genderFilterCost = i('genderFilterCost', Economy.genderFilterCost);
    Economy.regionFilterCost = i('regionFilterCost', Economy.regionFilterCost);
    Economy.reconnectCost = i('reconnectCost', Economy.reconnectCost);
    Economy.friendRequestCost = i('friendRequestCost', Economy.friendRequestCost);
    Economy.freeFriendRequestsPerDay = i('freeFriendRequestsPerDay', Economy.freeFriendRequestsPerDay);
    Economy.skipCooldownBypassCost = i('skipCooldownBypassCost', Economy.skipCooldownBypassCost);
    Economy.skipsBeforeCooldown = i('skipsBeforeCooldown', Economy.skipsBeforeCooldown);
    Economy.skipCooldown = Duration(seconds: i('skipCooldownSeconds', Economy.skipCooldown.inSeconds));
    Economy.boostCost = i('boostCost', Economy.boostCost);
    Economy.boostLength = Duration(minutes: i('boostMinutes', Economy.boostLength.inMinutes));
    Economy.giftGemShare = d('giftGemShare', Economy.giftGemShare);
    if (e['usdCentsPerGem'] is num) Economy.usdPerGem = (e['usdCentsPerGem'] as num).toDouble() / 100;
    Economy.cashoutMinGems = i('cashoutMinGems', Economy.cashoutMinGems);
    Economy.vipMonthlyBonusCoins = i('vipMonthlyBonusCoins', Economy.vipMonthlyBonusCoins);
    if (e['checkInRewards'] is List) Economy.checkInRewards = List.unmodifiable((e['checkInRewards'] as List).map((n) => (n as num).toInt()));
    Economy.rewardedAdCoins = i('rewardedAdCoins', Economy.rewardedAdCoins);
    Economy.rewardedAdsPerDay = i('rewardedAdsPerDay', Economy.rewardedAdsPerDay);
    Economy.inviteRewardCoins = i('inviteRewardCoins', Economy.inviteRewardCoins);
    Economy.profileCompleteCoins = i('profileCompleteCoins', Economy.profileCompleteCoins);
    Economy.inviteeRewardCoins = i('inviteeRewardCoins', Economy.inviteeRewardCoins);
    Economy.referralActivationCalls = i('referralActivationCalls', Economy.referralActivationCalls);
    Economy.referralRequireVerified = i('referralRequireVerified', Economy.referralRequireVerified ? 1 : 0) != 0;
    Economy.referralHoldHours = i('referralHoldHours', Economy.referralHoldHours);
    final ms = Economy.referralMilestones;
    ReferralMilestone milestone(int n, ReferralMilestone before, String amountKey) =>
        ReferralMilestone(count: i('referralMilestone$n', before.count), kind: before.kind, amount: i(amountKey, before.amount));
    if (ms.length == 3) {
      Economy.referralMilestones = List.unmodifiable([
        milestone(1, ms[0], 'referralMilestone1VipDays'),
        milestone(2, ms[1], 'referralMilestone2VipDays'),
        milestone(3, ms[2], 'referralMilestone3Coins'),
      ]);
    }
    Economy.affiliateRevSharePercent = i('affiliateRevSharePercent', Economy.affiliateRevSharePercent);
    Economy.affiliateCommissionMonths = i('affiliateCommissionMonths', Economy.affiliateCommissionMonths);
    Economy.affiliateCpaUsdCents = i('affiliateCpaUsdCents', Economy.affiliateCpaUsdCents);
    Economy.affiliateHoldDays = i('affiliateHoldDays', Economy.affiliateHoldDays);
    Economy.affiliateMinPayoutUsdCents = i('affiliateMinPayoutUsdCents', Economy.affiliateMinPayoutUsdCents);
    Economy.welcomeCoins = i('welcomeCoins', Economy.welcomeCoins);
    Economy.streakRestoreCost = i('streakRestoreCost', Economy.streakRestoreCost);
    Economy.streakWeeklyCoins = i('streakWeeklyCoins', Economy.streakWeeklyCoins);
    Economy.freeReconnectMinutes = i('freeReconnectMinutes', Economy.freeReconnectMinutes);
    Economy.vibeHourStart = i('vibeHourStart', Economy.vibeHourStart);
    Economy.vibeHourMinutes = i('vibeHourMinutes', Economy.vibeHourMinutes);
    Economy.vibeHourGemBonusPercent = i('vibeHourGemBonusPercent', Economy.vibeHourGemBonusPercent);
    Economy.xpPerGoodCall = i('xpPerGoodCall', Economy.xpPerGoodCall);
    Economy.xpPerLikeReceived = i('xpPerLikeReceived', Economy.xpPerLikeReceived);
    Economy.xpPerGiftReceived = i('xpPerGiftReceived', Economy.xpPerGiftReceived);
    Economy.xpPerCheckIn = i('xpPerCheckIn', Economy.xpPerCheckIn);
    Economy.xpPerStreakDay = i('xpPerStreakDay', Economy.xpPerStreakDay);
    Economy.maxEngagementPushesPerDay = i('maxEngagementPushesPerDay', Economy.maxEngagementPushesPerDay);

    List<Map<String, dynamic>> list(String k) => [for (final x in (c[k] as List? ?? const [])) Map<String, dynamic>.from(x as Map)];
    final packs = [
      for (final p in list('packs'))
        CoinPack(
          id: p['id'] as String,
          name: p['name'] as String,
          coins: (p['coins'] as num).toInt(),
          usd: (p['usdCents'] as num) / 100,
          bonusPercent: (p['bonusPercent'] as num?)?.toInt() ?? 0,
          tag: p['tag'] as String?,
        ),
    ];
    final plans = [
      for (final p in list('plans'))
        VipPlan(
          id: p['id'] as String,
          label: p['label'] as String,
          days: (p['days'] as num).toInt(),
          usd: (p['usdCents'] as num) / 100,
          savePercent: (p['savePercent'] as num?)?.toInt() ?? 0,
          trialDays: (p['trialDays'] as num?)?.toInt() ?? 0,
          highlighted: p['highlighted'] as bool? ?? false,
        ),
    ];
    final gifts = [for (final g in list('gifts')) Gift(id: g['id'] as String, name: g['name'] as String, emoji: g['emoji'] as String, coins: (g['coins'] as num).toInt())];
    // Never leave the store empty because of a bad response.
    if (packs.isNotEmpty) MockData.packs = List.unmodifiable(packs);
    if (plans.isNotEmpty) MockData.plans = List.unmodifiable(plans);
    if (gifts.isNotEmpty) MockData.gifts = List.unmodifiable(gifts);

    _version = version.isEmpty ? _version : version;
    notifyListeners();
  }
}

/// Server mode: the catalog from the Vibe API, kept live.
class RemoteCatalogProvider extends CatalogProvider {
  RemoteCatalogProvider(this._api, this._rt) {
    _sub = _rt.on(Ev.catalogUpdated).listen((d) {
      if ('${d['version']}' != version) load();
    });
  }

  final ApiClient _api;
  final RealtimeClient _rt;
  late final StreamSubscription<dynamic> _sub;

  @override
  Future<void> load() async {
    try {
      apply(Map<String, dynamic>.from(await _api.get('/catalog') as Map));
    } on ApiException catch (_) {
      // Keep the values we have; prices are re-checked by the server anyway.
    }
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}
