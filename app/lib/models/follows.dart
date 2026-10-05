import 'models.dart';

/// How much of someone's profile you may see (the server decides).
enum ProfileTier { self, matched, following, friends }

/// Your follow towards someone.
enum FollowState { none, requested, following }

/// Your own lists (nobody else's are ever shown).
enum FollowList { followers, following, requests }

class ProfileStats {
  const ProfileStats({required this.matches, required this.likes, required this.gifts});
  final int matches;
  final int likes;
  final int gifts;
}

/// Someone's profile as the server lets you see it (GET /users/:id/view).
/// [followers], [following] and [stats] are null below the "following" tier.
class ProfileView {
  const ProfileView({
    required this.profile,
    required this.tier,
    this.follow = FollowState.none,
    this.followsYou = false,
    this.friend = FriendState.none,
    this.followers,
    this.following,
    this.stats,
    this.statsHidden = false,
    this.online,
  });

  final Profile profile;
  final ProfileTier tier;
  final FollowState follow;
  final bool followsYou;
  final FriendState friend;
  final int? followers;
  final int? following;
  final ProfileStats? stats;
  final bool statsHidden;
  final bool? online;
}

/// A row in your followers / following / requests list.
class FollowEntry {
  const FollowEntry({required this.profile, required this.since, this.followsBack = false});
  final Profile profile;
  final DateTime since;
  final bool followsBack;
}

class FollowPage {
  const FollowPage(this.items, this.nextCursor);
  final List<FollowEntry> items;
  final String? nextCursor;
}

/// Your follow numbers and privacy switches (from GET /me).
class FollowSettings {
  const FollowSettings({this.followers = 0, this.following = 0, this.privateAccount = false, this.hideStats = false});
  final int followers;
  final int following;
  final bool privateAccount;
  final bool hideStats;

  FollowSettings copyWith({int? followers, int? following, bool? privateAccount, bool? hideStats}) => FollowSettings(
        followers: followers ?? this.followers,
        following: following ?? this.following,
        privateAccount: privateAccount ?? this.privateAccount,
        hideStats: hideStats ?? this.hideStats,
      );
}

enum FollowNoticeKind { newFollower, request, accepted }

/// Something to tell the user right away ("Sana started following you").
class FollowNotice {
  const FollowNotice(this.kind, this.profile);
  final FollowNoticeKind kind;
  final Profile profile;

  String get text => switch (kind) {
        FollowNoticeKind.newFollower => '${profile.name} started following you',
        FollowNoticeKind.request => '${profile.name} wants to follow you',
        FollowNoticeKind.accepted => '${profile.name} accepted your follow request',
      };
}
