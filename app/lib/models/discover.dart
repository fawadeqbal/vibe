import 'dart:math' as math;

import 'models.dart';

/// One person in the Discover deck.
class DiscoverCard {
  const DiscoverCard({required this.profile, this.online = false, this.lastSeenAt, this.superLikedMe = false, this.sharedInterests = const []});
  final Profile profile;
  final bool online;
  final DateTime? lastSeenAt;

  /// They Super Liked you: shown with a star, first in the deck.
  final bool superLikedMe;
  final List<String> sharedInterests;

  /// "Active now", "Active 3h ago" (empty when unknown).
  String get activeLabel {
    if (online) return 'Active now';
    final t = lastSeenAt;
    if (t == null) return '';
    final d = DateTime.now().difference(t);
    if (d.inMinutes < 1) return 'Active now';
    if (d.inMinutes < 60) return 'Active ${d.inMinutes}m ago';
    if (d.inHours < 24) return 'Active ${d.inHours}h ago';
    return 'Active ${d.inDays}d ago';
  }
}

/// Likes left, prices and "liked you" counts (GET /discover/status).
class DiscoverStatus {
  const DiscoverStatus({
    this.enabled = true,
    this.vip = false,
    this.likesLeft,
    this.freeLikesPerDay = 30,
    this.resetsAt,
    this.freeSuperLikesLeft = 0,
    this.superLikeCost = 10,
    this.undoCost = 5,
    this.packSize = 30,
    this.packCost = 20,
    this.visible = true,
    this.showInDiscover = true,
    this.hasPhoto = true,
    this.likedYouCount = 0,
    this.likedYouUnseen = 0,
    this.filters = const FilterAccess(),
  });
  final bool enabled;
  final bool vip;

  /// Null = unlimited (VIP).
  final int? likesLeft;
  final int freeLikesPerDay;
  final DateTime? resetsAt;
  final int freeSuperLikesLeft;
  final int superLikeCost;
  final int undoCost;
  final int packSize;
  final int packCost;

  /// You appear in other people's decks (a photo, and "Show me in Discover" on).
  final bool visible;
  final bool showInDiscover;
  final bool hasPhoto;
  final int likedYouCount;
  final int likedYouUnseen;
  final FilterAccess filters;

  DiscoverStatus copyWith({int? likesLeft, bool clearLikesLeft = false, int? freeSuperLikesLeft, int? likedYouCount, int? likedYouUnseen}) => DiscoverStatus(
        enabled: enabled,
        vip: vip,
        likesLeft: clearLikesLeft ? null : (likesLeft ?? this.likesLeft),
        freeLikesPerDay: freeLikesPerDay,
        resetsAt: resetsAt,
        freeSuperLikesLeft: freeSuperLikesLeft ?? this.freeSuperLikesLeft,
        superLikeCost: superLikeCost,
        undoCost: undoCost,
        packSize: packSize,
        packCost: packCost,
        visible: visible,
        showInDiscover: showInDiscover,
        hasPhoto: hasPhoto,
        likedYouCount: likedYouCount ?? this.likedYouCount,
        likedYouUnseen: likedYouUnseen ?? this.likedYouUnseen,
        filters: filters,
      );
}

/// "Liked you": VIP gets people, everyone else blurred previews.
class LikedYou {
  const LikedYou({this.unlocked = false, this.people = const [], this.previews = const [], this.count = 0});
  final bool unlocked;
  final List<DiscoverCard> people;
  final List<String> previews;
  final int count;
}

enum WantedGender { anyone, women, men }

class DiscoverFilters {
  const DiscoverFilters({this.gender = WantedGender.anyone, this.minAge = 18, this.maxAge = 60, this.countryCode = '', this.onlineOnly = false, this.verifiedOnly = false});
  final WantedGender gender;
  final int minAge;
  final int maxAge;

  /// Two-letter code; '' = anywhere.
  final String countryCode;
  final bool onlineOnly;
  final bool verifiedOnly;

  static const defaults = DiscoverFilters();

  /// The filters that need VIP, Vibe Hour or a pass (age is free for everyone).
  bool get usesExtra => gender != WantedGender.anyone || countryCode.isNotEmpty || onlineOnly || verifiedOnly;

  /// Anything other than the defaults (the dot on the filter button).
  bool get anyOn => usesExtra || minAge != defaults.minAge || maxAge != defaults.maxAge;

  /// Just the free part (age).
  DiscoverFilters freeOnly() => DiscoverFilters(minAge: minAge, maxAge: maxAge);

  DiscoverFilters copyWith({WantedGender? gender, int? minAge, int? maxAge, String? countryCode, bool? onlineOnly, bool? verifiedOnly}) => DiscoverFilters(
    gender: gender ?? this.gender,
    minAge: minAge ?? this.minAge,
    maxAge: maxAge ?? this.maxAge,
    countryCode: countryCode ?? this.countryCode,
    onlineOnly: onlineOnly ?? this.onlineOnly,
    verifiedOnly: verifiedOnly ?? this.verifiedOnly,
  );
}

/// Gender, country, online now and verified filters: open with VIP, Vibe
/// Hour or a filter pass (`status.filters`).
class FilterAccess {
  const FilterAccess({this.unlocked = true, this.reason = 'free', this.passUntil, this.passCost = 25, this.passHours = 24});
  final bool unlocked;

  /// free · vip · vibe_hour · pass · null (locked).
  final String? reason;
  final DateTime? passUntil;
  final int passCost;
  final int passHours;
}

enum SwipeKind { like, superLike, pass }

/// What a swipe did, so the screen can react.
enum SwipeFailure { outOfLikes, coins, error }

class SwipeOutcome {
  const SwipeOutcome.ok([this.matched, this.status]) : failure = null, message = null;
  const SwipeOutcome.failed(SwipeFailure this.failure, [this.message]) : matched = null, status = null;
  final Friend? matched;

  /// The counters as the server has them after this swipe (applied only if it's the newest swipe).
  final DiscoverStatus? status;
  final SwipeFailure? failure;
  final String? message;
  bool get ok => failure == null;
}

/// The counters right after a swipe, before the server answers (it has the
/// final word). Same as the server: a like uses a daily like, a Super Like
/// uses a free one (VIP) or coins — never a daily like.
DiscoverStatus? afterSwipe(DiscoverStatus? st, SwipeKind kind) {
  if (st == null) return null;
  if (kind == SwipeKind.like && st.likesLeft != null) return st.copyWith(likesLeft: math.max(0, st.likesLeft! - 1));
  if (kind == SwipeKind.superLike && st.freeSuperLikesLeft > 0) return st.copyWith(freeSuperLikesLeft: st.freeSuperLikesLeft - 1);
  return st;
}

/// "3 hours", "40 minutes" — when free likes come back.
String comesBackIn(DateTime t, {DateTime? now}) {
  final m = (t.difference(now ?? DateTime.now()).inSeconds / 60).round().clamp(1, 100000);
  if (m < 60) return '$m minute${m == 1 ? '' : 's'}';
  final h = (m / 60).round();
  return '$h hour${h == 1 ? '' : 's'}';
}
