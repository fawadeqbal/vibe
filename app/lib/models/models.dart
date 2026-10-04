/// Every data shape the app works with. Plain immutable classes with
/// `copyWith`, so the mock backend and a future HTTP backend can hand the
/// same objects to the same screens.
library;

enum Gender { male, female, other }

extension GenderLabel on Gender {
  String get label => switch (this) {
        Gender.male => 'Man',
        Gender.female => 'Woman',
        Gender.other => 'Non-binary',
      };
}

/// Who the matcher should look for. `anyone` is free; the others cost coins
/// unless the user is VIP (see Economy).
enum GenderFilter { anyone, women, men }

class Country {
  const Country(this.code, this.name, this.flag);
  final String code;
  final String name;
  final String flag;
}

class Profile {
  const Profile({
    required this.id,
    required this.name,
    required this.age,
    required this.gender,
    required this.country,
    required this.avatarUrl,
    this.bio = '',
    this.interests = const [],
    this.verified = false,
    this.vip = false,
    this.gemsEarned = 0,
    this.matches = 0,
    this.likes = 0,
  });

  final String id;
  final String name;
  final int age;
  final Gender gender;
  final Country country;
  final String avatarUrl;
  final String bio;
  final List<String> interests;
  final bool verified;
  final bool vip;
  final int gemsEarned;
  final int matches;
  final int likes;

  Profile copyWith({
    String? name,
    int? age,
    Gender? gender,
    Country? country,
    String? avatarUrl,
    String? bio,
    List<String>? interests,
    bool? verified,
    bool? vip,
    int? gemsEarned,
    int? matches,
    int? likes,
  }) {
    return Profile(
      id: id,
      name: name ?? this.name,
      age: age ?? this.age,
      gender: gender ?? this.gender,
      country: country ?? this.country,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      bio: bio ?? this.bio,
      interests: interests ?? this.interests,
      verified: verified ?? this.verified,
      vip: vip ?? this.vip,
      gemsEarned: gemsEarned ?? this.gemsEarned,
      matches: matches ?? this.matches,
      likes: likes ?? this.likes,
    );
  }

  /// "Photo, bio and 3 interests" is what unlocks the profile-completion bonus.
  bool get isComplete => bio.trim().isNotEmpty && interests.length >= 3 && avatarUrl.isNotEmpty;
}

class CoinPack {
  const CoinPack({required this.id, required this.name, required this.coins, required this.usd, this.bonusPercent = 0, this.tag});
  final String id;
  final String name;
  final int coins;
  final double usd;
  final int bonusPercent;
  final String? tag;

  double get usdPer100 => usd / coins * 100;
}

class VipPlan {
  const VipPlan({required this.id, required this.label, required this.days, required this.usd, this.savePercent = 0, this.trialDays = 0, this.highlighted = false});
  final String id;

  /// "Weekly", "Monthly"… as named in the admin panel.
  final String label;
  final int days;
  final double usd;
  final int savePercent;
  final int trialDays;
  final bool highlighted;

  Duration get length => Duration(days: days);

  /// "week", "month", "year" — or "90 days" for anything else.
  String get periodWord => switch (days) {
        7 => 'week',
        30 || 31 => 'month',
        365 || 366 => 'year',
        _ => '$days days',
      };
}

class Gift {
  const Gift({required this.id, required this.name, required this.emoji, required this.coins});
  final String id;
  final String name;
  final String emoji;
  final int coins;

  /// What the receiver earns (Economy.giftGemShare of the coin value).
  int get gems => (coins * Economy.giftGemShare).round();
}

enum TxKind { purchase, spend, earn, gift, cashout, vip }

class Transaction {
  const Transaction({
    required this.id,
    required this.kind,
    required this.title,
    required this.coins,
    required this.at,
    this.gems = 0,
    this.usd = 0,
    this.method,
    this.receipt,
  });

  final String id;
  final TxKind kind;
  final String title;

  /// Positive = coins in, negative = coins out.
  final int coins;
  final int gems;
  final double usd;
  final DateTime at;
  final PaymentMethod? method;
  final String? receipt;
}

enum PaymentMethod { googlePlay, appStore, jazzCash, easypaisa, card, bank }

extension PaymentMethodInfo on PaymentMethod {
  String get label => switch (this) {
        PaymentMethod.googlePlay => 'Google Play',
        PaymentMethod.appStore => 'App Store',
        PaymentMethod.jazzCash => 'JazzCash',
        PaymentMethod.easypaisa => 'Easypaisa',
        PaymentMethod.card => 'Debit / credit card',
        PaymentMethod.bank => 'Bank transfer',
      };

  String get hint => switch (this) {
        PaymentMethod.googlePlay => 'Billed by Google. Fastest.',
        PaymentMethod.appStore => 'Billed by Apple.',
        PaymentMethod.jazzCash => 'Pay from your JazzCash wallet.',
        PaymentMethod.easypaisa => 'Pay from your Easypaisa wallet.',
        PaymentMethod.card => 'Visa, Mastercard.',
        PaymentMethod.bank => 'Manual transfer, verified within a day.',
      };

  /// Wallet methods ask for a phone number and an OTP.
  bool get needsPhone => this == PaymentMethod.jazzCash || this == PaymentMethod.easypaisa;
}

class Wallet {
  const Wallet({required this.coins, required this.gems, this.vipUntil, this.boostUntil, this.streakDay = 0, this.lastCheckIn, this.adsWatchedToday = 0, this.adsDay, this.freeFriendRequestsToday = 0, this.friendRequestsDay, this.profileBonusClaimed = false});

  final int coins;
  final int gems;
  final DateTime? vipUntil;
  final DateTime? boostUntil;
  final int streakDay;
  final DateTime? lastCheckIn;
  final int adsWatchedToday;
  final DateTime? adsDay;
  final int freeFriendRequestsToday;
  final DateTime? friendRequestsDay;
  final bool profileBonusClaimed;

  bool get isVip => vipUntil != null && vipUntil!.isAfter(DateTime.now());
  bool get isBoosted => boostUntil != null && boostUntil!.isAfter(DateTime.now());

  Wallet copyWith({
    int? coins,
    int? gems,
    DateTime? vipUntil,
    bool clearVip = false,
    DateTime? boostUntil,
    int? streakDay,
    DateTime? lastCheckIn,
    int? adsWatchedToday,
    DateTime? adsDay,
    int? freeFriendRequestsToday,
    DateTime? friendRequestsDay,
    bool? profileBonusClaimed,
  }) {
    return Wallet(
      coins: coins ?? this.coins,
      gems: gems ?? this.gems,
      vipUntil: clearVip ? null : (vipUntil ?? this.vipUntil),
      boostUntil: boostUntil ?? this.boostUntil,
      streakDay: streakDay ?? this.streakDay,
      lastCheckIn: lastCheckIn ?? this.lastCheckIn,
      adsWatchedToday: adsWatchedToday ?? this.adsWatchedToday,
      adsDay: adsDay ?? this.adsDay,
      freeFriendRequestsToday: freeFriendRequestsToday ?? this.freeFriendRequestsToday,
      friendRequestsDay: friendRequestsDay ?? this.friendRequestsDay,
      profileBonusClaimed: profileBonusClaimed ?? this.profileBonusClaimed,
    );
  }
}

class MatchFilters {
  const MatchFilters({this.gender = GenderFilter.anyone, this.countryCode, this.safeMode = false});
  final GenderFilter gender;

  /// null = anywhere.
  final String? countryCode;
  final bool safeMode;

  MatchFilters copyWith({GenderFilter? gender, String? countryCode, bool clearCountry = false, bool? safeMode}) {
    return MatchFilters(
      gender: gender ?? this.gender,
      countryCode: clearCountry ? null : (countryCode ?? this.countryCode),
      safeMode: safeMode ?? this.safeMode,
    );
  }

  /// Coins a single match costs with these filters (0 for VIP).
  int costFor({required bool vip}) {
    if (vip) return 0;
    var cost = 0;
    if (gender != GenderFilter.anyone) cost += Economy.genderFilterCost;
    if (countryCode != null) cost += Economy.regionFilterCost;
    return cost;
  }
}

enum FriendState { none, requested, incoming, friends, blocked }

class Friend {
  const Friend({required this.profile, required this.state, required this.since, this.lastMessage, this.unread = 0, this.online = false});
  final Profile profile;
  final FriendState state;
  final DateTime since;
  final String? lastMessage;
  final int unread;
  final bool online;

  Friend copyWith({FriendState? state, String? lastMessage, int? unread, bool? online}) {
    return Friend(profile: profile, state: state ?? this.state, since: since, lastMessage: lastMessage ?? this.lastMessage, unread: unread ?? this.unread, online: online ?? this.online);
  }
}

class ChatMessage {
  const ChatMessage({required this.id, required this.fromMe, required this.text, required this.at, this.gift});
  final String id;
  final bool fromMe;
  final String text;
  final DateTime at;
  final Gift? gift;
}

enum ReportReason { nudity, harassment, underage, spam, scam, other }

extension ReportReasonLabel on ReportReason {
  String get label => switch (this) {
        ReportReason.nudity => 'Nudity or sexual content',
        ReportReason.harassment => 'Harassment or hate',
        ReportReason.underage => 'Looks under 18',
        ReportReason.spam => 'Spam or advertising',
        ReportReason.scam => 'Scam or asking for money',
        ReportReason.other => 'Something else',
      };
}

/// One finished (or running) match, for history and stats.
class MatchRecord {
  const MatchRecord({required this.id, required this.partner, required this.startedAt, this.endedAt, this.liked = false, this.likedMe = false, this.giftsSent = 0, this.giftsReceived = 0, this.coinsSpent = 0});
  final String id;
  final Profile partner;
  final DateTime startedAt;
  final DateTime? endedAt;
  final bool liked;
  final bool likedMe;
  final int giftsSent;
  final int giftsReceived;
  final int coinsSpent;

  Duration get length => (endedAt ?? DateTime.now()).difference(startedAt);

  MatchRecord copyWith({DateTime? endedAt, bool? liked, bool? likedMe, int? giftsSent, int? giftsReceived, int? coinsSpent}) {
    return MatchRecord(
      id: id,
      partner: partner,
      startedAt: startedAt,
      endedAt: endedAt ?? this.endedAt,
      liked: liked ?? this.liked,
      likedMe: likedMe ?? this.likedMe,
      giftsSent: giftsSent ?? this.giftsSent,
      giftsReceived: giftsReceived ?? this.giftsReceived,
      coinsSpent: coinsSpent ?? this.coinsSpent,
    );
  }
}

/// Every price and rule in one place — the numbers from BUSINESS.md.
/// Prices and rules. Starts with the defaults (the offline demo uses these);
/// in server mode `CatalogProvider` overwrites them from `GET /catalog`,
/// so staff changes in the admin panel reach the app live. The server still
/// computes every charge — these are for display.
class Economy {
  Economy._();

  // Filters and match actions
  static int genderFilterCost = 10;
  static int regionFilterCost = 5;
  static int reconnectCost = 20;
  static int friendRequestCost = 10;
  static int freeFriendRequestsPerDay = 3;
  static int skipCooldownBypassCost = 5;
  static int skipsBeforeCooldown = 5;
  static Duration skipCooldown = const Duration(seconds: 10);
  static int boostCost = 50;
  static Duration boostLength = const Duration(minutes: 30);

  // Gifts and gems
  static double giftGemShare = 0.5;
  static double usdPerGem = 0.005;
  static int cashoutMinGems = 5000;

  // VIP
  static int vipMonthlyBonusCoins = 200;

  // Free coins
  static List<int> checkInRewards = const [5, 10, 15, 20, 25, 30, 50];
  static int rewardedAdCoins = 10;
  static int rewardedAdsPerDay = 10;
  static int inviteRewardCoins = 100;
  static int profileCompleteCoins = 50;

  // Sign-up
  static int welcomeCoins = 30;

  // Local currency for the payment mock
  static const double pkrPerUsd = 280;
}

/// A message from the Vibe team ("Messages from Vibe" in Chats), sent from
/// the admin panel. Optional button opens a link.
class TeamMessage {
  const TeamMessage({required this.id, required this.title, required this.body, required this.at, this.buttonLabel, this.buttonUrl, this.read = false});
  final String id;
  final String title;
  final String body;
  final DateTime at;
  final String? buttonLabel;
  final String? buttonUrl;
  final bool read;

  TeamMessage copyWith({bool? read}) => TeamMessage(id: id, title: title, body: body, at: at, buttonLabel: buttonLabel, buttonUrl: buttonUrl, read: read ?? this.read);
}
