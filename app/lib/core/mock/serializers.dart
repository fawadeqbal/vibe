import '../../models/models.dart';
import 'mock_data.dart';

/// JSON in/out for the handful of shapes the mock persists between runs.
/// Kept out of the models so they stay plain.
class Json {
  Json._();

  static Map<String, dynamic> profile(Profile p) => {
        'id': p.id,
        'name': p.name,
        'age': p.age,
        'gender': p.gender.index,
        'country': p.country.code,
        'avatarUrl': p.avatarUrl,
        'bio': p.bio,
        'interests': p.interests,
        'verified': p.verified,
        'vip': p.vip,
        'gemsEarned': p.gemsEarned,
        'matches': p.matches,
        'likes': p.likes,
      };

  static Profile toProfile(Map<String, dynamic> m) => Profile(
        id: m['id'] as String,
        name: m['name'] as String? ?? '',
        age: (m['age'] as num?)?.toInt() ?? 18,
        gender: Gender.values[(m['gender'] as num?)?.toInt() ?? 2],
        country: MockData.country(m['country'] as String? ?? 'PK'),
        avatarUrl: m['avatarUrl'] as String? ?? '',
        bio: m['bio'] as String? ?? '',
        interests: (m['interests'] as List?)?.cast<String>() ?? const [],
        verified: m['verified'] as bool? ?? false,
        vip: m['vip'] as bool? ?? false,
        gemsEarned: (m['gemsEarned'] as num?)?.toInt() ?? 0,
        matches: (m['matches'] as num?)?.toInt() ?? 0,
        likes: (m['likes'] as num?)?.toInt() ?? 0,
      );

  static Map<String, dynamic> wallet(Wallet w) => {
        'coins': w.coins,
        'gems': w.gems,
        'vipUntil': w.vipUntil?.toIso8601String(),
        'boostUntil': w.boostUntil?.toIso8601String(),
        'streakDay': w.streakDay,
        'lastCheckIn': w.lastCheckIn?.toIso8601String(),
        'adsWatchedToday': w.adsWatchedToday,
        'adsDay': w.adsDay?.toIso8601String(),
        'freeFriendRequestsToday': w.freeFriendRequestsToday,
        'friendRequestsDay': w.friendRequestsDay?.toIso8601String(),
        'profileBonusClaimed': w.profileBonusClaimed,
      };

  static Wallet toWallet(Map<String, dynamic> m) => Wallet(
        coins: (m['coins'] as num?)?.toInt() ?? 0,
        gems: (m['gems'] as num?)?.toInt() ?? 0,
        vipUntil: _date(m['vipUntil']),
        boostUntil: _date(m['boostUntil']),
        streakDay: (m['streakDay'] as num?)?.toInt() ?? 0,
        lastCheckIn: _date(m['lastCheckIn']),
        adsWatchedToday: (m['adsWatchedToday'] as num?)?.toInt() ?? 0,
        adsDay: _date(m['adsDay']),
        freeFriendRequestsToday: (m['freeFriendRequestsToday'] as num?)?.toInt() ?? 0,
        friendRequestsDay: _date(m['friendRequestsDay']),
        profileBonusClaimed: m['profileBonusClaimed'] as bool? ?? false,
      );

  static Map<String, dynamic> transaction(Transaction t) => {
        'id': t.id,
        'kind': t.kind.index,
        'title': t.title,
        'coins': t.coins,
        'gems': t.gems,
        'usd': t.usd,
        'at': t.at.toIso8601String(),
        'method': t.method?.index,
        'receipt': t.receipt,
      };

  static Transaction toTransaction(Map<String, dynamic> m) => Transaction(
        id: m['id'] as String,
        kind: TxKind.values[(m['kind'] as num).toInt()],
        title: m['title'] as String,
        coins: (m['coins'] as num).toInt(),
        gems: (m['gems'] as num?)?.toInt() ?? 0,
        usd: (m['usd'] as num?)?.toDouble() ?? 0,
        at: DateTime.parse(m['at'] as String),
        method: m['method'] == null ? null : PaymentMethod.values[(m['method'] as num).toInt()],
        receipt: m['receipt'] as String?,
      );

  static Map<String, dynamic> friend(Friend f) => {
        'profile': profile(f.profile),
        'state': f.state.index,
        'since': f.since.toIso8601String(),
        'lastMessage': f.lastMessage,
        'unread': f.unread,
        'online': f.online,
      };

  static Friend toFriend(Map<String, dynamic> m) => Friend(
        profile: toProfile(Map<String, dynamic>.from(m['profile'] as Map)),
        state: FriendState.values[(m['state'] as num).toInt()],
        since: DateTime.parse(m['since'] as String),
        lastMessage: m['lastMessage'] as String?,
        unread: (m['unread'] as num?)?.toInt() ?? 0,
        online: m['online'] as bool? ?? false,
      );

  static Map<String, dynamic> message(ChatMessage c) => {
        'id': c.id,
        'fromMe': c.fromMe,
        'text': c.text,
        'at': c.at.toIso8601String(),
        'gift': c.gift?.id,
      };

  static ChatMessage toMessage(Map<String, dynamic> m) => ChatMessage(
        id: m['id'] as String,
        fromMe: m['fromMe'] as bool,
        text: m['text'] as String,
        at: DateTime.parse(m['at'] as String),
        gift: m['gift'] == null ? null : MockData.gifts.firstWhere((g) => g.id == m['gift'], orElse: () => MockData.gifts.first),
      );

  static Map<String, dynamic> matchRecord(MatchRecord r) => {
        'id': r.id,
        'partner': profile(r.partner),
        'startedAt': r.startedAt.toIso8601String(),
        'endedAt': r.endedAt?.toIso8601String(),
        'liked': r.liked,
        'likedMe': r.likedMe,
        'giftsSent': r.giftsSent,
        'giftsReceived': r.giftsReceived,
        'coinsSpent': r.coinsSpent,
      };

  static MatchRecord toMatchRecord(Map<String, dynamic> m) => MatchRecord(
        id: m['id'] as String,
        partner: toProfile(Map<String, dynamic>.from(m['partner'] as Map)),
        startedAt: DateTime.parse(m['startedAt'] as String),
        endedAt: _date(m['endedAt']),
        liked: m['liked'] as bool? ?? false,
        likedMe: m['likedMe'] as bool? ?? false,
        giftsSent: (m['giftsSent'] as num?)?.toInt() ?? 0,
        giftsReceived: (m['giftsReceived'] as num?)?.toInt() ?? 0,
        coinsSpent: (m['coinsSpent'] as num?)?.toInt() ?? 0,
      );

  static DateTime? _date(dynamic v) => v is String && v.isNotEmpty ? DateTime.tryParse(v) : null;
}
