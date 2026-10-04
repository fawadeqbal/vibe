import 'dart:math';

import '../../models/models.dart';

/// Static catalogue data: countries, packs, plans, gifts, interests and the
/// pool of people the mock matcher draws from. A real backend serves the
/// same shapes.
class MockData {
  MockData._();

  static const countries = <Country>[
    Country('PK', 'Pakistan', '🇵🇰'),
    Country('IN', 'India', '🇮🇳'),
    Country('US', 'United States', '🇺🇸'),
    Country('GB', 'United Kingdom', '🇬🇧'),
    Country('TR', 'Türkiye', '🇹🇷'),
    Country('BR', 'Brazil', '🇧🇷'),
    Country('DE', 'Germany', '🇩🇪'),
    Country('FR', 'France', '🇫🇷'),
    Country('AE', 'UAE', '🇦🇪'),
    Country('SA', 'Saudi Arabia', '🇸🇦'),
    Country('ID', 'Indonesia', '🇮🇩'),
    Country('PH', 'Philippines', '🇵🇭'),
    Country('KR', 'South Korea', '🇰🇷'),
    Country('JP', 'Japan', '🇯🇵'),
    Country('MX', 'Mexico', '🇲🇽'),
    Country('NG', 'Nigeria', '🇳🇬'),
    Country('EG', 'Egypt', '🇪🇬'),
    Country('CA', 'Canada', '🇨🇦'),
    Country('AU', 'Australia', '🇦🇺'),
    Country('ES', 'Spain', '🇪🇸'),
  ];

  static Country country(String code) => countries.firstWhere((c) => c.code == code, orElse: () => countries.first);

  static const interests = <String>[
    'Music', 'Gaming', 'Travel', 'Movies', 'Cricket', 'Football', 'Anime', 'Cooking', 'Fitness', 'Art', 'Photography', 'Books', 'Tech', 'Fashion', 'Dance', 'Languages', 'Pets', 'Cars', 'Coffee', 'Memes',
  ];

  // Packs, plans and gifts start as the defaults; in server mode
  // CatalogProvider replaces them with what the admin panel set.
  static List<CoinPack> packs = const <CoinPack>[
    CoinPack(id: 'starter', name: 'Starter', coins: 100, usd: 0.99),
    CoinPack(id: 'popular', name: 'Popular', coins: 550, usd: 4.99, tag: 'Most popular'),
    CoinPack(id: 'value', name: 'Value', coins: 1200, usd: 9.99, tag: 'Best value'),
    CoinPack(id: 'pro', name: 'Pro', coins: 3000, usd: 24.99, bonusPercent: 10),
    CoinPack(id: 'whale', name: 'Big spender', coins: 6500, usd: 49.99, bonusPercent: 30),
  ];

  static List<VipPlan> plans = const <VipPlan>[
    VipPlan(id: 'vip_week', label: 'Weekly', days: 7, usd: 2.99),
    VipPlan(id: 'vip_month', label: 'Monthly', days: 30, usd: 7.99, trialDays: 3, highlighted: true),
    VipPlan(id: 'vip_year', label: 'Yearly', days: 365, usd: 49.99, savePercent: 48),
  ];

  static List<Gift> gifts = const <Gift>[
    Gift(id: 'rose', name: 'Rose', emoji: '🌹', coins: 5),
    Gift(id: 'heart', name: 'Heart', emoji: '💖', coins: 20),
    Gift(id: 'coffee', name: 'Coffee', emoji: '☕', coins: 50),
    Gift(id: 'fireworks', name: 'Fireworks', emoji: '🎆', coins: 100),
    Gift(id: 'crown', name: 'Crown', emoji: '👑', coins: 500),
    Gift(id: 'rocket', name: 'Rocket', emoji: '🚀', coins: 1000),
  ];

  static const _names = <List<String>>[
    // name, gender m/f, country, age
    ['Ayesha', 'f', 'PK', '23'], ['Bilal', 'm', 'PK', '27'], ['Sara', 'f', 'PK', '21'], ['Hamza', 'm', 'PK', '24'],
    ['Priya', 'f', 'IN', '25'], ['Arjun', 'm', 'IN', '28'], ['Neha', 'f', 'IN', '22'],
    ['Emily', 'f', 'US', '26'], ['Jake', 'm', 'US', '29'], ['Sofia', 'f', 'US', '24'],
    ['Olivia', 'f', 'GB', '27'], ['Liam', 'm', 'GB', '25'],
    ['Elif', 'f', 'TR', '23'], ['Mert', 'm', 'TR', '26'],
    ['Julia', 'f', 'BR', '22'], ['Lucas', 'm', 'BR', '30'],
    ['Lena', 'f', 'DE', '28'], ['Max', 'm', 'DE', '31'],
    ['Chloé', 'f', 'FR', '24'], ['Louis', 'm', 'FR', '27'],
    ['Noor', 'f', 'AE', '25'], ['Omar', 'm', 'AE', '29'],
    ['Reem', 'f', 'SA', '23'], ['Faisal', 'm', 'SA', '32'],
    ['Dewi', 'f', 'ID', '21'], ['Rizky', 'm', 'ID', '24'],
    ['Angel', 'f', 'PH', '22'], ['Miguel', 'm', 'PH', '26'],
    ['Ji-woo', 'f', 'KR', '25'], ['Min-jun', 'm', 'KR', '27'],
    ['Yui', 'f', 'JP', '24'], ['Haruto', 'm', 'JP', '28'],
    ['Valentina', 'f', 'MX', '23'], ['Diego', 'm', 'MX', '25'],
    ['Amara', 'f', 'NG', '26'], ['Chidi', 'm', 'NG', '29'],
    ['Mariam', 'f', 'EG', '22'], ['Youssef', 'm', 'EG', '27'],
    ['Ava', 'f', 'CA', '25'], ['Noah', 'm', 'CA', '30'],
    ['Mia', 'f', 'AU', '24'], ['Oliver', 'm', 'AU', '28'],
    ['Lucía', 'f', 'ES', '23'], ['Pablo', 'm', 'ES', '26'],
  ];

  static const _bios = <String>[
    'Here for good conversations, not small talk.',
    'Night owl. Ask me about my playlist.',
    'Learning three languages badly at once.',
    'Coffee first, then we talk.',
    'Travel stories welcome. Will trade one for one.',
    'Just moved cities, know nobody yet.',
    'Gamer by night, designer by day.',
    'Tell me a joke and I will rate it honestly.',
    'Football on weekends, memes on weekdays.',
    'Introvert practising being an extrovert.',
  ];

  /// 44 people. Deterministic, so the same "person" comes back the same way.
  static List<Profile> people() {
    final rnd = Random(7);
    return List.generate(_names.length, (i) {
      final n = _names[i];
      final gender = n[1] == 'f' ? Gender.female : Gender.male;
      final shuffled = [...interests]..shuffle(rnd);
      final photoIndex = 10 + i; // pravatar has 70 portraits
      return Profile(
        id: 'p${i.toString().padLeft(3, '0')}',
        name: n[0],
        age: int.parse(n[3]),
        gender: gender,
        country: country(n[2]),
        avatarUrl: 'https://i.pravatar.cc/400?img=${photoIndex % 70 + 1}',
        bio: _bios[i % _bios.length],
        interests: shuffled.take(3 + rnd.nextInt(3)).toList(),
        verified: i % 3 == 0,
        vip: i % 5 == 0,
        gemsEarned: rnd.nextInt(20000),
        matches: 40 + rnd.nextInt(900),
        likes: rnd.nextInt(400),
      );
    });
  }

  static const openers = <String>[
    'hey! where are you from?',
    'nice to meet you 😄',
    'what are you up to tonight?',
    'your background looks cool',
    'first time on Vibe?',
    'haha hi',
    'do you play any games?',
    'what music do you like?',
    'omg your accent',
    'ok you seem fun',
  ];

  static const replies = <String>[
    'haha same',
    'that is actually so true',
    'wait really?',
    'send me your playlist later',
    'I have to go in 5 min but this was fun',
    'add me, let’s talk more',
    'no way, me too',
    'lol',
    'tell me more',
    'brb, dog is barking',
  ];
}
