part of 'discover_provider.dart';

/// Server mode: `/discover/*`, plus `discover:match` and `discover:liked`.
class RemoteDiscoverProvider extends DiscoverProvider {
  RemoteDiscoverProvider(this._api, this._rt, SocialProvider social) : super.base(social) {
    _subs = [
      _rt.on(Ev.discoverMatch).listen((e) {
        if (e['friend'] is! Map) return;
        final f = ApiMap.friend(Map<String, dynamic>.from(e['friend'] as Map));
        onMatched(f);
        unawaited(_social.addMatched(f));
        unawaited(loadStatus());
      }),
      // Someone new joined (you asked): fill an empty deck.
      _rt.on(Ev.discoverNewPeople).listen((_) {
        if (exhausted || deck.isEmpty) unawaited(load());
      }),
      _rt.on(Ev.discoverLiked).listen((e) {
        final unseen = (e['unseen'] as num?)?.toInt();
        if (_status != null && unseen != null) {
          _status = _status!.copyWith(likedYouUnseen: unseen, likedYouCount: unseen > _status!.likedYouCount ? unseen : _status!.likedYouCount);
          notifyListeners();
        } else {
          unawaited(loadStatus());
        }
      }),
    ];
  }

  final ApiClient _api;
  final RealtimeClient _rt;
  late final List<StreamSubscription<dynamic>> _subs;

  Map<String, dynamic> _map(Object? r) => Map<String, dynamic>.from(r as Map);

  @override
  Future<void> loadStatus() async {
    if (!_api.hasSession) return;
    try {
      _status = ApiMap.discoverStatus(_map(await _api.get('/discover/status')));
      notifyListeners();
    } on ApiException catch (_) {}
  }

  @override
  Future<List<DiscoverCard>> fetchCards() async {
    final f = _filters;
    final r = _map(await _api.get('/discover/deck', query: {'gender': f.gender.name, 'minAge': '${f.minAge}', 'maxAge': '${f.maxAge}', 'limit': '20'}));
    return (r['items'] as List).map((e) => ApiMap.discoverCard(_map(e))).toList();
  }

  @override
  Future<SwipeOutcome> doSwipe(DiscoverCard c, SwipeKind kind) async {
    try {
      final r = _map(
        await _api.post('/discover/swipes', {
          'userId': c.profile.id,
          'kind': switch (kind) {
            SwipeKind.like => 'like',
            SwipeKind.superLike => 'super',
            SwipeKind.pass => 'pass',
          },
        }),
      );
      if (r['status'] is Map) _status = ApiMap.discoverStatus(_map(r['status']));
      final friend = r['matched'] == true && r['friend'] is Map ? ApiMap.friend(_map(r['friend'])) : null;
      return SwipeOutcome.ok(friend);
    } on ApiException catch (e) {
      if (e.code == 'OUT_OF_LIKES') return const SwipeOutcome.failed(SwipeFailure.outOfLikes);
      if (e.isInsufficientCoins) return const SwipeOutcome.failed(SwipeFailure.coins);
      return SwipeOutcome.failed(SwipeFailure.error, e.message);
    }
  }

  @override
  Future<DiscoverCard?> doUndo() async {
    try {
      final r = _map(await _api.post('/discover/undo'));
      if (r['status'] is Map) _status = ApiMap.discoverStatus(_map(r['status']));
      return ApiMap.discoverCard(_map(r['card']));
    } on ApiException catch (e) {
      if (e.isInsufficientCoins) return null;
      if (e.code == 'NOTHING_TO_UNDO') {
        _lastPassed = null;
        notifyListeners();
      }
      rethrow;
    }
  }

  @override
  Future<bool> buyLikes() async {
    try {
      _status = ApiMap.discoverStatus(_map(await _api.post('/discover/likes/buy')));
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      if (e.isInsufficientCoins) return false;
      rethrow;
    }
  }

  @override
  Future<void> loadLikedYou() async {
    try {
      _likedYou = ApiMap.likedYou(_map(await _api.get('/discover/liked-you')));
      notifyListeners();
    } on ApiException catch (_) {}
  }

  @override
  Future<void> sendLikesSeen() async {
    try {
      await _api.post('/discover/liked-you/seen');
    } on ApiException catch (_) {}
  }

  @override
  Future<void> setVisible(bool visible) async {
    _status = ApiMap.discoverStatus(_map(await _api.put('/discover/visibility', {'visible': visible})));
    notifyListeners();
  }

  @override
  Future<WelcomeBack?> welcomeBack() async {
    try {
      final w = _map(await _api.get('/discover/welcome'));
      if (w['show'] != true) return null;
      return WelcomeBack(awayDays: (w['awayDays'] as num?)?.toInt() ?? 0, likesSince: (w['likesSince'] as num?)?.toInt() ?? 0, newPeople: (w['newPeople'] as num?)?.toInt() ?? 0);
    } on ApiException catch (_) {
      return null;
    }
  }

  @override
  Future<void> loadNotifyNew() async {
    try {
      _notifyNew = _map(await _api.get('/discover/notify-new'))['on'] == true;
      notifyListeners();
    } on ApiException catch (_) {}
  }

  @override
  Future<void> setNotifyNew(bool on) async {
    final was = _notifyNew;
    await super.setNotifyNew(on);
    try {
      await _api.put('/discover/notify-new', {'on': on});
    } on ApiException catch (_) {
      _notifyNew = was;
      notifyListeners();
      rethrow;
    }
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }
}
