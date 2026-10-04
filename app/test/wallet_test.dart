import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/mock/mock_data.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/wallet_provider.dart';

void main() {
  late DateTime now;
  late WalletProvider wallet;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    now = DateTime(2026, 9, 13, 20);
    wallet = WalletProvider(MockBackend(fast: true), clock: () => now);
    await wallet.load();
  });

  test('a new wallet has the welcome bonus and one ledger line', () {
    expect(wallet.coins, Economy.welcomeCoins);
    expect(wallet.transactions.single.title, 'Welcome bonus');
  });

  test('spend refuses when short and records when not', () async {
    expect(await wallet.spend(1000, 'too much'), isFalse);
    expect(wallet.coins, Economy.welcomeCoins);
    expect(await wallet.spend(10, 'gender filter'), isTrue);
    expect(wallet.coins, Economy.welcomeCoins - 10);
    expect(wallet.transactions.first.coins, -10);
  });

  test('a pack credits coins plus its bonus with a receipt', () async {
    final pro = MockData.packs.firstWhere((p) => p.id == 'pro');
    await wallet.creditPack(pro, PaymentMethod.jazzCash, 'VB-1');
    expect(wallet.coins, Economy.welcomeCoins + 3000 + 300);
    final t = wallet.transactions.first;
    expect(t.kind, TxKind.purchase);
    expect(t.usd, 24.99);
    expect(t.receipt, 'VB-1');
  });

  test('VIP: filters become free, monthly bonus lands, trial extends the period', () async {
    final monthly = MockData.plans.firstWhere((p) => p.id == 'vip_month');
    expect(wallet.filterCost(const MatchFilters(gender: GenderFilter.women, countryCode: 'PK')), 15);
    await wallet.activateVip(monthly, PaymentMethod.googlePlay, 'VB-2');
    expect(wallet.isVip, isTrue);
    expect(wallet.coins, Economy.welcomeCoins + Economy.vipMonthlyBonusCoins);
    expect(wallet.wallet.vipUntil, now.add(const Duration(days: 33)));
    expect(wallet.filterCost(const MatchFilters(gender: GenderFilter.women, countryCode: 'PK')), 0);
    await wallet.cancelVip();
    expect(wallet.isVip, isFalse);
  });

  test('daily check-in follows the 7-day streak and resets after a missed day', () async {
    expect(await wallet.checkIn(), 5);
    expect(await wallet.checkIn(), isNull, reason: 'once a day');
    now = now.add(const Duration(days: 1));
    expect(await wallet.checkIn(), 10);
    now = now.add(const Duration(days: 1));
    expect(await wallet.checkIn(), 15);
    now = now.add(const Duration(days: 3)); // missed two days
    expect(await wallet.checkIn(), 5);
    for (var i = 0; i < 6; i++) {
      now = now.add(const Duration(days: 1));
      await wallet.checkIn();
    }
    // Day 7 paid 50; the wrap-around goes back to day 1.
    now = now.add(const Duration(days: 1));
    expect(await wallet.checkIn(), 5);
  });

  test('rewarded ads are capped per day', () async {
    for (var i = 0; i < Economy.rewardedAdsPerDay; i++) {
      expect(await wallet.rewardAd(), Economy.rewardedAdCoins);
    }
    expect(wallet.adsLeftToday, 0);
    expect(await wallet.rewardAd(), isNull);
    now = now.add(const Duration(days: 1));
    expect(wallet.adsLeftToday, Economy.rewardedAdsPerDay);
  });

  test('friend requests: three free a day, then coins', () async {
    for (var i = 0; i < Economy.freeFriendRequestsPerDay; i++) {
      expect(await wallet.payFriendRequest('x'), isTrue);
      expect(wallet.coins, Economy.welcomeCoins);
    }
    expect(await wallet.payFriendRequest('x'), isTrue);
    expect(wallet.coins, Economy.welcomeCoins - Economy.friendRequestCost);
    wallet.debugSet(wallet.wallet.copyWith(coins: 0));
    expect(await wallet.payFriendRequest('x'), isFalse);
  });

  test('gems: gifts credit half the coin value, cash-out needs the minimum', () async {
    final crown = MockData.gifts.firstWhere((g) => g.id == 'crown');
    expect(crown.gems, 250);
    await wallet.receiveGems(crown.gems, 'Crown from Ayesha');
    expect(wallet.gems, 250);
    expect(wallet.canCashOut, isFalse);
    wallet.debugSet(wallet.wallet.copyWith(gems: 6000));
    expect(wallet.canCashOut, isTrue);
    await wallet.cashOut(5000, PaymentMethod.easypaisa, '03001234567');
    expect(wallet.gems, 1000);
    expect(wallet.transactions.first.kind, TxKind.cashout);
    expect(wallet.transactions.first.usd, closeTo(25, 0.001));
  });

  test('boost costs coins once and lasts 30 minutes', () async {
    wallet.debugSet(wallet.wallet.copyWith(coins: 100));
    expect(await wallet.boost(), isTrue);
    expect(wallet.coins, 50);
    expect(wallet.isBoosted, isTrue);
    expect(await wallet.boost(), isTrue);
    expect(wallet.coins, 50, reason: 'already boosted: no second charge');
    now = now.add(const Duration(minutes: 31));
    expect(wallet.isBoosted, isFalse);
  });

  test('the wallet survives a reload', () async {
    await wallet.spend(5, 'x');
    final again = WalletProvider(MockBackend(fast: true), clock: () => now);
    await again.load();
    expect(again.coins, Economy.welcomeCoins - 5);
    expect(again.transactions.length, 2);
  });
}
