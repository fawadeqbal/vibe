import '../../models/follows.dart';
import '../../models/models.dart';
import '../mock/mock_data.dart';

/// JSON from the Vibe API → the app's models. One place, so a field rename
/// on the server is a one-line change here.
class ApiMap {
  ApiMap._();

  static DateTime? date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
  static int i(Object? v) => (v as num?)?.toInt() ?? 0;

  static Gender gender(Object? g) => switch (g) {
    'male' => Gender.male,
    'female' => Gender.female,
    _ => Gender.other,
  };
  static String genderOut(Gender g) => switch (g) {
    Gender.male => 'male',
    Gender.female => 'female',
    Gender.other => 'other',
  };

  static Profile profile(Map<String, dynamic> m) => Profile(
    id: m['id'] as String,
    name: m['name'] as String? ?? '',
    age: i(m['age']),
    gender: gender(m['gender']),
    country: MockData.country(m['countryCode'] as String? ?? 'PK'),
    avatarUrl: m['avatarUrl'] as String? ?? '',
    bio: m['bio'] as String? ?? '',
    interests: (m['interests'] as List?)?.cast<String>() ?? const [],
    verified: m['verified'] as bool? ?? false,
    vip: m['vip'] as bool? ?? false,
    matches: i(m['matches']),
    likes: i(m['likes']),
  );

  /// The server's wallet view, folded back into the app's [Wallet] so the
  /// existing getters (ads left, free requests left…) keep working.
  static Wallet wallet(Map<String, dynamic> m) {
    final now = DateTime.now();
    final checkIn = Map<String, dynamic>.from(m['checkIn'] as Map? ?? const {});
    final ads = Map<String, dynamic>.from(m['ads'] as Map? ?? const {});
    final perDay = i(ads['perDay']);
    final adsLeft = i(ads['leftToday']);
    final freeLeft = i(m['freeFriendRequestsLeft']);
    return Wallet(
      coins: i(m['coins']),
      gems: i(m['gems']),
      vipUntil: date((m['vip'] as Map?)?['until']),
      boostUntil: date((m['boost'] as Map?)?['until']),
      streakDay: i(checkIn['streakDay']),
      lastCheckIn: date(checkIn['lastAt']),
      adsWatchedToday: perDay - adsLeft,
      adsDay: now,
      freeFriendRequestsToday: Economy.freeFriendRequestsPerDay - freeLeft,
      friendRequestsDay: now,
      profileBonusClaimed: m['profileBonusClaimed'] as bool? ?? false,
    );
  }

  static PaymentMethod? method(Object? m) => switch (m) {
    'GOOGLE_PLAY' => PaymentMethod.googlePlay,
    'APP_STORE' => PaymentMethod.appStore,
    'JAZZCASH' => PaymentMethod.jazzCash,
    'EASYPAISA' => PaymentMethod.easypaisa,
    'CARD' => PaymentMethod.card,
    'BANK' => PaymentMethod.bank,
    _ => null,
  };

  static String methodOut(PaymentMethod m) => switch (m) {
    PaymentMethod.googlePlay => 'GOOGLE_PLAY',
    PaymentMethod.appStore => 'APP_STORE',
    PaymentMethod.jazzCash => 'JAZZCASH',
    PaymentMethod.easypaisa => 'EASYPAISA',
    PaymentMethod.card => 'CARD',
    PaymentMethod.bank => 'BANK',
  };

  static Transaction transaction(Map<String, dynamic> m) => Transaction(
    id: m['id'] as String,
    kind: switch (m['kind']) {
      'purchase' => TxKind.purchase,
      'spend' => TxKind.spend,
      'gift' => TxKind.gift,
      'cashout' => TxKind.cashout,
      'vip' => TxKind.vip,
      _ => TxKind.earn,
    },
    title: m['title'] as String? ?? '',
    coins: i(m['coins']),
    gems: i(m['gems']),
    usd: (m['usd'] as num?)?.toDouble() ?? 0,
    at: date(m['at']) ?? DateTime.now(),
    method: method(m['method']),
    receipt: m['receipt'] as String?,
  );

  static Gift? gift(Object? id) {
    for (final g in MockData.gifts) {
      if (g.id == id) return g;
    }
    return null;
  }

  static Friend friend(Map<String, dynamic> m) => Friend(
    profile: profile(Map<String, dynamic>.from(m['profile'] as Map)),
    state: switch (m['state']) {
      'friends' => FriendState.friends,
      'requested' => FriendState.requested,
      _ => FriendState.incoming,
    },
    since: date(m['since']) ?? DateTime.now(),
    lastMessage: m['lastMessage'] as String?,
    unread: i(m['unread']),
    online: m['online'] as bool? ?? false,
  );

  static FollowState followState(Object? s) => switch (s) {
        'following' => FollowState.following,
        'requested' => FollowState.requested,
        _ => FollowState.none,
      };

  static FriendState friendState(Object? s) => switch (s) {
        'friends' => FriendState.friends,
        'requested' => FriendState.requested,
        'incoming' => FriendState.incoming,
        _ => FriendState.none,
      };

  static ProfileView profileView(Map<String, dynamic> m) {
    final rel = Map<String, dynamic>.from((m['rel'] as Map?) ?? const {});
    final counts = m['counts'] is Map ? Map<String, dynamic>.from(m['counts'] as Map) : null;
    final stats = m['stats'];
    return ProfileView(
      profile: profile(Map<String, dynamic>.from(m['profile'] as Map)),
      tier: switch (m['tier']) {
        'self' => ProfileTier.self,
        'following' => ProfileTier.following,
        'friends' => ProfileTier.friends,
        _ => ProfileTier.matched,
      },
      follow: followState(rel['follow']),
      followsYou: rel['followsYou'] == true,
      friend: friendState(rel['friend']),
      followers: counts == null ? null : i(counts['followers']),
      following: counts == null ? null : i(counts['following']),
      stats: stats is Map ? ProfileStats(matches: i(stats['matches']), likes: i(stats['likes']), gifts: i(stats['gifts'])) : null,
      statsHidden: stats == 'hidden',
      online: m['online'] as bool?,
    );
  }

  static FollowEntry followEntry(Map<String, dynamic> m) => FollowEntry(
        profile: profile(Map<String, dynamic>.from(m['profile'] as Map)),
        since: date(m['since']) ?? DateTime.now(),
        followsBack: m['followsBack'] == true,
      );

  /// The follow part of GET/PATCH /me.
  static FollowSettings followSettings(Map<String, dynamic> me) => FollowSettings(
        followers: i(me['followers']),
        following: i(me['following']),
        privateAccount: me['privateAccount'] == true,
        hideStats: me['hideStats'] == true,
      );

  static String reportReasonOut(ReportReason r) => switch (r) {
        ReportReason.nudity => 'NUDITY',
        ReportReason.harassment => 'HARASSMENT',
        ReportReason.underage => 'UNDERAGE',
        ReportReason.spam => 'SPAM',
        ReportReason.scam => 'SCAM',
        ReportReason.other => 'OTHER',
      };

  static TeamMessage teamMessage(Map<String, dynamic> m) => TeamMessage(
        id: m['id'] as String,
        title: m['title'] as String? ?? '',
        body: m['body'] as String? ?? '',
        at: date(m['createdAt']) ?? DateTime.now(),
        buttonLabel: m['buttonLabel'] as String?,
        buttonUrl: m['buttonUrl'] as String?,
        read: m['read'] as bool? ?? false,
      );

  static ChatMessage message(Map<String, dynamic> m) =>
      ChatMessage(id: m['id'] as String, fromMe: m['fromMe'] as bool? ?? false, text: m['text'] as String? ?? '', at: date(m['at']) ?? DateTime.now(), gift: gift(m['giftId']));

  static MatchRecord? matchRecord(Map<String, dynamic> m) {
    final p = m['partner'];
    if (p is! Map) return null;
    return MatchRecord(
      id: m['id'] as String,
      partner: profile(Map<String, dynamic>.from(p)),
      startedAt: date(m['startedAt']) ?? DateTime.now(),
      endedAt: date(m['endedAt']),
      liked: m['liked'] as bool? ?? false,
      likedMe: m['likedMe'] as bool? ?? false,
      giftsSent: i(m['giftsSent']),
      giftsReceived: i(m['giftsReceived']),
      coinsSpent: i(m['coinsSpent']),
    );
  }
}
