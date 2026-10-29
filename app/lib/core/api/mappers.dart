import '../../models/calls.dart';
import '../../models/discover.dart';
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
    level: i(m['level']),
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
      gemGoal: (m['gemGoal'] as num?)?.toInt(),
      freeBoosts: i(m['freeBoosts']),
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
    streak: m['streak'] is Map ? StreakView.fromJson(Map<String, dynamic>.from(m['streak'] as Map)) : StreakView.none,
    calls: callsView(m['calls']),
  );

  static CallsView callsView(Object? m) => m is Map ? CallsView(mine: m['mine'] == true, theirs: m['theirs'] == true) : CallsView.off;

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
      level: i(m['level']),
      badges: [for (final b in (m['badges'] as List? ?? const [])) '$b'],
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

  static ChatMessage message(Map<String, dynamic> m) {
    final kind = switch (m['kind']) {
      'system' => MessageKind.system,
      'gift' => MessageKind.gift,
      _ => m['giftId'] != null ? MessageKind.gift : MessageKind.text,
    };
    return ChatMessage(
      id: m['id'] as String,
      fromMe: m['fromMe'] as bool? ?? false,
      text: m['text'] as String? ?? '',
      at: date(m['at']) ?? DateTime.now(),
      gift: kind == MessageKind.system ? null : gift(m['giftId']),
      kind: kind,
      meta: m['meta'] is Map ? Map<String, dynamic>.from(m['meta'] as Map) : null,
    );
  }

  // ── Discover ──────────────────────────────────────────────────────────

  static DiscoverCard discoverCard(Map<String, dynamic> m) => DiscoverCard(
        profile: profile(Map<String, dynamic>.from(m['profile'] as Map)),
        online: m['online'] == true,
        lastSeenAt: date(m['lastSeenAt']),
        superLikedMe: m['superLikedMe'] == true,
        sharedInterests: (m['sharedInterests'] as List? ?? const []).whereType<String>().toList(),
      );

  static DiscoverStatus discoverStatus(Map<String, dynamic> m) {
    final liked = m['likedYou'] is Map ? Map<String, dynamic>.from(m['likedYou'] as Map) : const <String, dynamic>{};
    return DiscoverStatus(
      enabled: m['enabled'] != false,
      vip: m['vip'] == true,
      likesLeft: (m['likesLeft'] as num?)?.toInt(),
      freeLikesPerDay: (m['freeLikesPerDay'] as num?)?.toInt() ?? 30,
      resetsAt: date(m['resetsAt']),
      freeSuperLikesLeft: i(m['freeSuperLikesLeft']),
      superLikeCost: (m['superLikeCost'] as num?)?.toInt() ?? 10,
      undoCost: i(m['undoCost']),
      packSize: (m['packSize'] as num?)?.toInt() ?? 30,
      packCost: (m['packCost'] as num?)?.toInt() ?? 20,
      visible: m['visible'] == true,
      showInDiscover: m['showInDiscover'] != false,
      hasPhoto: m['hasPhoto'] == true,
      likedYouCount: i(liked['count']),
      likedYouUnseen: i(liked['unseen']),
      filters: filterAccess(m['filters'] is Map ? Map<String, dynamic>.from(m['filters'] as Map) : const {}),
    );
  }

  static FilterAccess filterAccess(Map<String, dynamic> m) => FilterAccess(
        unlocked: m['unlocked'] != false,
        reason: switch (m['reason']) { 'free' => FilterReason.free, 'vip' => FilterReason.vip, 'vibe_hour' => FilterReason.vibeHour, 'pass' => FilterReason.pass, _ => null },
        passUntil: date(m['passUntil']),
        passCost: (m['passCost'] as num?)?.toInt() ?? 25,
        passHours: (m['passHours'] as num?)?.toInt() ?? 24,
      );

  static LikedYou likedYou(Map<String, dynamic> m) => LikedYou(
        unlocked: m['unlocked'] == true,
        people: (m['people'] as List? ?? const []).map((e) => discoverCard(Map<String, dynamic>.from(e as Map))).toList(),
        previews: (m['previews'] as List? ?? const []).map((e) => '$e').toList(),
        count: i(m['count']),
      );

  // ── calls in chat ─────────────────────────────────────────────────────

  static CallState callState(Map<String, dynamic> m) => CallState(
        mine: m['mine'] == true,
        theirs: m['theirs'] == true,
        canAsk: m['canAsk'] == true,
        askAfter: date(m['askAfter']),
        askBlockedBy: m['askBlockedBy'] as String?,
      );

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

  // ── engagement ──
  static Leaderboard leaderboard(Map<String, dynamic> m) {
    final me = Map<String, dynamic>.from(m['me'] as Map? ?? const {});
    return Leaderboard(
      board: m['board'] == 'gems' ? Board.gems : Board.xp,
      weekStart: date(m['weekStart']),
      weekEnd: date(m['weekEnd']),
      top: [
        for (final r in (m['top'] as List? ?? const []))
          LeaderRow(rank: i((r as Map)['rank']), profile: profile(Map<String, dynamic>.from(r['profile'] as Map)), score: i(r['score'])),
      ],
      myRank: (me['rank'] as num?)?.toInt(),
      myScore: i(me['score']),
    );
  }

  static List<MomentGroup> momentFeed(Map<String, dynamic> m, Profile? me) => [
        if (me != null) MomentGroup(author: me, mine: true, moments: [for (final x in (m['mine'] as List? ?? const [])) Moment.fromJson(Map<String, dynamic>.from(x as Map))]),
        for (final g in (m['people'] as List? ?? const []))
          MomentGroup(
            author: profile(Map<String, dynamic>.from((g as Map)['author'] as Map)),
            moments: [for (final x in (g['moments'] as List? ?? const [])) Moment.fromJson(Map<String, dynamic>.from(x as Map))],
          ),
      ];

  // ── invites ────────────────────────────────────────────────────────────

  static ReferralPerson referralPerson(Map<String, dynamic> m) => ReferralPerson(
        id: '${m['id'] ?? ''}',
        profile: profile(Map<String, dynamic>.from(m['profile'] as Map)),
        status: ReferralStatus.parse(m['status']),
        rejectReason: m['rejectReason'] as String?,
        steps: ReferralSteps.fromJson(Map<String, dynamic>.from(m['steps'] as Map? ?? const {})),
        coins: i(m['coins']),
        createdAt: date(m['createdAt']) ?? DateTime.now(),
        qualifiedAt: date(m['qualifiedAt']),
        rewardedAt: date(m['rewardedAt']),
      );

  /// `GET /referrals`.
  static ReferralsView referrals(Map<String, dynamic> m) {
    final aff = m['affiliate'];
    return ReferralsView(
      code: '${m['code'] ?? ''}',
      link: '${m['link'] ?? ''}',
      rewards: m['rewards'] is Map ? ReferralRewards.fromJson(Map<String, dynamic>.from(m['rewards'] as Map)) : ReferralRewards.fromEconomy(),
      stats: ReferralStats.fromJson(Map<String, dynamic>.from(m['stats'] as Map? ?? const {})),
      milestones: [for (final x in (m['milestones'] as List? ?? const [])) ReferralMilestone.fromJson(Map<String, dynamic>.from(x as Map))],
      people: [for (final x in (m['people'] as List? ?? const [])) referralPerson(Map<String, dynamic>.from(x as Map))],
      affiliate: aff is Map && aff['code'] is String ? PartnerLink(code: aff['code'] as String, link: '${aff['link'] ?? ''}') : null,
    );
  }
}
