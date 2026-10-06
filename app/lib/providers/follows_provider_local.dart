part of 'follows_provider.dart';

/// Offline demo: every account is public and follows are instant. Numbers
/// come from the profile id so they stay the same between screens.
class LocalFollowsProvider extends FollowsProvider {
  LocalFollowsProvider(this._backend, this._social) : super.base();

  final MockBackend _backend;
  final SocialProvider _social;
  final Map<String, DateTime> _since = {};

  int _seed(String id, int mod) => id.hashCode.abs() % mod;
  int get _followingCount => _states.values.where((s) => s == FollowState.following).length;

  Profile? _person(String id) {
    for (final p in _backend.people) {
      if (p.id == id) return p;
    }
    return _social.friend(id)?.profile;
  }

  @override
  Future<void> load() async {
    _settings = _settings.copyWith(followers: 12, following: _followingCount);
    notifyListeners();
  }

  @override
  Future<ProfileView?> view(String userId) async {
    final p = _person(userId);
    final friend = _social.stateOf(userId);
    if (p == null || friend == FriendState.blocked) return null;
    final follow = stateOf(userId);
    final tier = friend == FriendState.friends ? ProfileTier.friends : (follow == FollowState.following ? ProfileTier.following : ProfileTier.matched);
    final open = tier != ProfileTier.matched;
    return ProfileView(
      profile: p,
      tier: tier,
      follow: follow,
      followsYou: _seed(userId, 3) == 0,
      friend: friend,
      followers: open ? 20 + _seed(userId, 400) : null,
      following: open ? 5 + _seed(userId, 90) : null,
      stats: open ? ProfileStats(matches: p.matches, likes: p.likes, gifts: _seed(userId, 30)) : null,
      online: tier == ProfileTier.friends ? (_social.friend(userId)?.online ?? false) : null,
      level: p.level,
      badges: [if (p.verified) 'verified', if (p.matches >= 10) 'first_vibes', if (p.matches >= 100) 'social_butterfly', if (p.likes >= 50) 'loved', if (_seed(userId, 4) == 0) 'night_owl', if (_seed(userId, 7) == 3) 'ambassador'],
    );
  }

  @override
  Future<FollowState> follow(String userId) async {
    _since[userId] = DateTime.now();
    _states[userId] = FollowState.following;
    _settings = _settings.copyWith(following: _followingCount);
    notifyListeners();
    return FollowState.following;
  }

  @override
  Future<void> unfollow(String userId) async {
    _since.remove(userId);
    _states[userId] = FollowState.none;
    _settings = _settings.copyWith(following: _followingCount);
    notifyListeners();
  }

  @override
  Future<FollowPage> list(FollowList which, {String? cursor}) async {
    final items = switch (which) {
      FollowList.following => [
          for (final e in _since.entries)
            if (_person(e.key) case final p?) FollowEntry(profile: p, since: e.value, followsBack: _seed(p.id, 3) == 0),
        ],
      FollowList.followers => [
          for (final p in _backend.people.take(12)) FollowEntry(profile: p, since: DateTime.now().subtract(Duration(hours: 3 + _seed(p.id, 200))), followsBack: stateOf(p.id) == FollowState.following),
        ],
      FollowList.requests => <FollowEntry>[],
    };
    return FollowPage(items, null);
  }

  @override
  Future<void> accept(String userId) async {}

  @override
  Future<void> decline(String userId) async {}

  @override
  Future<void> removeFollower(String userId) async {}

  @override
  Future<void> report(String userId, ReportReason reason, {String? note, bool block = true}) async {
    final p = _person(userId);
    if (block && p != null) await _social.block(p);
  }

  @override
  Future<bool> setPrivacy({bool? privateAccount, bool? hideStats}) async {
    _settings = _settings.copyWith(privateAccount: privateAccount, hideStats: hideStats);
    notifyListeners();
    return true;
  }
}
