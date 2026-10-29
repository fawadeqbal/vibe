part of 'discover_provider.dart';

/// The offline demo: the deck is the mock people; some of them "liked you"
/// already, so liking them back is a match. Same limits and prices as the
/// server (Economy), paid from the local wallet.
class LocalDiscoverProvider extends DiscoverProvider {
  LocalDiscoverProvider(SocialProvider social, this._wallet) : super.base(social);

  final WalletProvider _wallet;
  final Map<String, SwipeKind> _swiped = {};
  int _likesToday = 0;
  int _supersToday = 0;
  int _extra = 0;
  DateTime _day = _today();

  static DateTime _today() {
    final n = DateTime.now();
    return DateTime(n.year, n.month, n.day);
  }

  void _rollDay() {
    if (_today() != _day) {
      _day = _today();
      _likesToday = 0;
      _supersToday = 0;
      _extra = 0;
    }
  }

  /// Every third mock person already liked you (every ninth Super Liked).
  bool _likesMe(Profile p) => p.id.hashCode.abs() % 3 == 0;
  bool _superLikesMe(Profile p) => p.id.hashCode.abs() % 9 == 0;

  List<Profile> get _pool {
    final connected = {for (final f in [..._social.friends, ..._social.incoming, ..._social.requested]) f.profile.id, ..._social.blocked};
    return MockData.people().where((p) => !connected.contains(p.id)).toList();
  }

  DiscoverCard _card(Profile p) => DiscoverCard(
        profile: p,
        online: p.id.hashCode.abs() % 4 == 0,
        lastSeenAt: DateTime.now().subtract(Duration(minutes: p.id.hashCode.abs() % 600)),
        superLikedMe: _superLikesMe(p),
      );

  void _refreshStatus() {
    _rollDay();
    final vip = _wallet.isVip;
    final pending = _pool.where((p) => _likesMe(p) && !_swiped.containsKey(p.id)).length;
    _status = DiscoverStatus(
      enabled: Economy.discoverEnabled,
      vip: vip,
      likesLeft: vip ? null : (Economy.discoverFreeLikesPerDay + _extra - _likesToday).clamp(0, 100000),
      freeLikesPerDay: Economy.discoverFreeLikesPerDay,
      resetsAt: _day.add(const Duration(days: 1)),
      freeSuperLikesLeft: vip ? (Economy.discoverVipFreeSuperLikes - _supersToday).clamp(0, 100) : 0,
      superLikeCost: Economy.discoverSuperLikeCost,
      undoCost: vip ? 0 : Economy.discoverUndoCost,
      packSize: Economy.discoverLikePackSize,
      packCost: Economy.discoverLikePackCost,
      likedYouCount: pending,
      likedYouUnseen: _status?.likedYouUnseen ?? pending,
    );
  }

  @override
  Future<void> loadStatus() async {
    _refreshStatus();
    notifyListeners();
  }

  @override
  Future<List<DiscoverCard>> fetchCards() async {
    final f = _filters;
    final have = {for (final c in _deck) c.profile.id};
    final cards = _pool
        .where((p) => !_swiped.containsKey(p.id) && !have.contains(p.id))
        .where((p) => p.age >= f.minAge && p.age <= f.maxAge)
        .where((p) => f.gender == WantedGender.anyone || (f.gender == WantedGender.women ? p.gender == Gender.female : p.gender == Gender.male))
        .map(_card)
        .toList()
      ..sort((a, b) => (b.superLikedMe ? 1 : 0) - (a.superLikedMe ? 1 : 0));
    return cards.take(20).toList();
  }

  @override
  Future<SwipeOutcome> doSwipe(DiscoverCard c, SwipeKind kind) async {
    _rollDay();
    final vip = _wallet.isVip;
    if (kind == SwipeKind.like && !vip && _likesToday >= Economy.discoverFreeLikesPerDay + _extra) {
      return const SwipeOutcome.failed(SwipeFailure.outOfLikes);
    }
    if (kind == SwipeKind.superLike) {
      final free = vip && _supersToday < Economy.discoverVipFreeSuperLikes;
      if (!free && !await _wallet.spend(Economy.discoverSuperLikeCost, 'Super Like')) return const SwipeOutcome.failed(SwipeFailure.coins);
      _supersToday++;
    }
    if (kind == SwipeKind.like) _likesToday++;
    _swiped[c.profile.id] = kind;
    _refreshStatus();
    if (kind != SwipeKind.pass && _likesMe(c.profile)) {
      return SwipeOutcome.ok(Friend(profile: c.profile, state: FriendState.friends, since: DateTime.now(), online: c.online));
    }
    return const SwipeOutcome.ok();
  }

  @override
  Future<DiscoverCard?> doUndo() async {
    final c = _lastPassed;
    if (c == null) return null;
    if (!_wallet.isVip && !await _wallet.spend(Economy.discoverUndoCost, 'Undo in Discover')) return null;
    _swiped.remove(c.profile.id);
    _refreshStatus();
    return c;
  }

  @override
  Future<bool> buyLikes() async {
    if (!await _wallet.spend(Economy.discoverLikePackCost, '${Economy.discoverLikePackSize} more likes')) return false;
    _extra += Economy.discoverLikePackSize;
    _refreshStatus();
    notifyListeners();
    return true;
  }

  @override
  Future<void> loadLikedYou() async {
    final people = _pool.where((p) => _likesMe(p) && !_swiped.containsKey(p.id)).map(_card).toList();
    final vip = _wallet.isVip;
    _likedYou = LikedYou(unlocked: vip, people: vip ? people : const [], previews: people.take(4).map((c) => c.profile.avatarUrl).toList(), count: people.length);
    notifyListeners();
  }

  @override
  Future<void> sendLikesSeen() async {}

  @override
  Future<void> setVisible(bool visible) async {
    final s = _status ?? const DiscoverStatus();
    _status = DiscoverStatus(
      enabled: s.enabled,
      vip: s.vip,
      likesLeft: s.likesLeft,
      freeLikesPerDay: s.freeLikesPerDay,
      resetsAt: s.resetsAt,
      freeSuperLikesLeft: s.freeSuperLikesLeft,
      superLikeCost: s.superLikeCost,
      undoCost: s.undoCost,
      packSize: s.packSize,
      packCost: s.packCost,
      visible: visible && s.hasPhoto,
      showInDiscover: visible,
      hasPhoto: s.hasPhoto,
      likedYouCount: s.likedYouCount,
      likedYouUnseen: s.likedYouUnseen,
    );
    notifyListeners();
  }
}
