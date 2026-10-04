import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/core/mock/mock_data.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/catalog_provider.dart';

void main() {
  test('a server catalog replaces prices, packs, plans and gifts', () {
    final c = CatalogProvider();
    var notified = 0;
    c.addListener(() => notified++);
    c.apply({
      'version': '2026-10-01T10:00:00.000Z',
      'economy': {'genderFilterCost': 12, 'boostMinutes': 45, 'usdCentsPerGem': 0.8, 'giftGemShare': 0.6, 'checkInRewards': [1, 2, 3, 4, 5, 6, 7], 'welcomeCoins': 75},
      'packs': [
        {'id': 'starter', 'name': 'Starter', 'coins': 150, 'usdCents': 149, 'bonusPercent': 0, 'totalCoins': 150},
        {'id': 'mega', 'name': 'Mega', 'coins': 20000, 'usdCents': 9999, 'bonusPercent': 50, 'tag': 'New', 'totalCoins': 30000},
      ],
      'plans': [
        {'id': 'vip_quarter', 'label': 'Quarterly', 'days': 90, 'usdCents': 1999, 'savePercent': 20, 'trialDays': 0, 'highlighted': true},
      ],
      'gifts': [
        {'id': 'star', 'name': 'Star', 'emoji': '⭐', 'coins': 200, 'gems': 120},
      ],
    });
    expect(notified, 1);
    expect(c.version, '2026-10-01T10:00:00.000Z');
    expect(Economy.genderFilterCost, 12);
    expect(Economy.regionFilterCost, 5); // not sent: unchanged
    expect(Economy.boostLength, const Duration(minutes: 45));
    expect(Economy.usdPerGem, closeTo(0.008, 1e-9));
    expect(Economy.checkInRewards, [1, 2, 3, 4, 5, 6, 7]);
    expect(Economy.welcomeCoins, 75);
    expect(MockData.packs.map((p) => p.id), ['starter', 'mega']);
    expect(MockData.packs.last.usd, 99.99);
    expect(MockData.packs.last.tag, 'New');
    expect(MockData.plans.single.periodWord, '90 days');
    expect(MockData.plans.single.length, const Duration(days: 90));
    expect(MockData.gifts.single.gems, 120); // 200 × 0.6
  });

  test('an empty list from the server never empties the store', () {
    final before = MockData.packs;
    CatalogProvider().apply({'economy': <String, dynamic>{}, 'packs': <dynamic>[]});
    expect(MockData.packs, same(before));
  });

  test('VIP periods read naturally', () {
    expect(const VipPlan(id: 'w', label: 'Weekly', days: 7, usd: 1).periodWord, 'week');
    expect(const VipPlan(id: 'm', label: 'Monthly', days: 30, usd: 1).periodWord, 'month');
    expect(const VipPlan(id: 'y', label: 'Yearly', days: 365, usd: 1).periodWord, 'year');
  });
}
