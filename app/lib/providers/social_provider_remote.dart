part of 'social_provider.dart';

/// Server mode: friends and chats on the Vibe API; requests, acceptances and
/// messages arrive live over the socket.
class RemoteSocialProvider extends SocialProvider {
  RemoteSocialProvider(this._api, this._rt) : super.base() {
    _subs = [
      _rt.on(Ev.message).listen(_onMessage),
      _rt.on(Ev.friendRequest).listen((_) => _reloadFriends()),
      _rt.on(Ev.friendAccepted).listen((_) => _reloadFriends()),
      _rt.on(Ev.friendRemoved).listen((_) => _reloadFriends()),
      _rt.on(Ev.matchEnded).listen((_) => _reloadLikes()),
      _rt.on(Ev.streak).listen((e) {
        final id = e['friendId'] as String?;
        if (id != null && e['streak'] is Map) setStreak(id, StreakView.fromJson(Map<String, dynamic>.from(e['streak'] as Map)));
      }),
      _rt.on(Ev.presence).listen(_onPresence),
    ];
  }

  final ApiClient _api;
  final RealtimeClient _rt;
  late final List<StreamSubscription> _subs;
  final Set<String> _loadedChats = {};
  String? _openChat;

  @override
  Future<void> load() async {
    if (!_api.hasSession) return;
    await Future.wait([_reloadFriends(), _reloadLikes(), _reloadBlocks()]);
    _loaded = true;
    notifyListeners();
  }

  Future<void> _reloadFriends() async {
    try {
      final list = await _api.get('/friends') as List;
      _friends = list.map((e) => ApiMap.friend(Map<String, dynamic>.from(e as Map))).toList();
      notifyListeners();
    } on ApiException catch (_) {}
  }

  Future<void> _reloadLikes() async {
    try {
      final r = Map<String, dynamic>.from(await _api.get('/likes/received') as Map);
      _likedYouCount = (r['count'] as num).toInt();
      _likedYou = (r['people'] as List).isNotEmpty
          ? (r['people'] as List).map((e) => ApiMap.profile(Map<String, dynamic>.from(e as Map))).toList()
          : [
              for (final (i, url) in (r['previews'] as List).cast<String>().indexed)
                Profile(id: 'hidden-$i', name: '•••••', age: 0, gender: Gender.other, country: const Country('', '', ''), avatarUrl: url),
            ];
      notifyListeners();
    } on ApiException catch (_) {}
  }

  Future<void> _reloadBlocks() async {
    try {
      final list = await _api.get('/blocks') as List;
      _blocked = list.map((e) => (e as Map)['id'] as String).toSet();
      notifyListeners();
    } on ApiException catch (_) {}
  }

  void _onMessage(Map<String, dynamic> m) {
    final friendId = m['friendId'] as String;
    final msg = ApiMap.message(m);
    final list = _chats.putIfAbsent(friendId, () => []);
    if (list.any((x) => x.id == msg.id)) return;
    list.add(msg);
    final f = friend(friendId);
    if (f != null) {
      final unread = !msg.fromMe && _openChat != friendId ? f.unread + 1 : f.unread;
      _replace(f.copyWith(lastMessage: msg.gift != null ? '${msg.gift!.emoji} ${msg.gift!.name}' : msg.text, unread: unread));
    }
    if (_openChat == friendId && !msg.fromMe) markRead(friendId);
    notifyListeners();
  }

  /// `{ userId, online }` — a friend came online or left.
  void _onPresence(Map<String, dynamic> e) {
    final id = (e['userId'] ?? e['friendId']) as String?;
    final online = e['online'];
    final f = id == null ? null : friend(id);
    if (f == null || online is! bool || f.online == online) return;
    _replace(f.copyWith(online: online));
    notifyListeners();
  }

  @override
  Future<bool> restoreStreak(String friendId) async {
    try {
      final r = Map<String, dynamic>.from(await _api.post('/friends/$friendId/streak/restore') as Map);
      if (r['streak'] is Map) setStreak(friendId, StreakView.fromJson(Map<String, dynamic>.from(r['streak'] as Map)));
      return true;
    } on ApiException catch (e) {
      if (e.isInsufficientCoins) return false;
      rethrow;
    }
  }

  void _replace(Friend f) {
    final i = _friends.indexWhere((x) => x.profile.id == f.profile.id);
    if (i >= 0) _friends[i] = f;
  }

  @override
  Future<void> ensureMessages(String friendId) async {
    _openChat = friendId;
    if (_loadedChats.contains(friendId)) return;
    try {
      final page = await _api.get('/friends/$friendId/messages', query: {'limit': '100'}) as Map;
      _chats[friendId] = (page['items'] as List).map((e) => ApiMap.message(Map<String, dynamic>.from(e as Map))).toList().reversed.toList();
      _loadedChats.add(friendId);
      notifyListeners();
    } on ApiException catch (_) {}
  }

  @override
  Future<bool> sendRequest(Profile p) async {
    try {
      await _api.post('/friends/${p.id}/request');
      await _reloadFriends();
      return true;
    } on ApiException catch (e) {
      if (e.isInsufficientCoins) return false;
      rethrow;
    }
  }

  @override
  void receiveRequest(Profile p) => _reloadFriends();

  @override
  Future<bool> accept(String id) async {
    await _api.post('/friends/$id/accept');
    await _reloadFriends();
    return true;
  }

  @override
  Future<void> decline(String id) async {
    await _api.post('/friends/$id/decline');
    await _reloadFriends();
  }

  @override
  Future<void> remove(String id) async {
    await _api.delete('/friends/$id');
    _chats.remove(id);
    await _reloadFriends();
  }

  @override
  Future<void> block(Profile p) async {
    await _api.post('/blocks/${p.id}');
    _blocked.add(p.id);
    _chats.remove(p.id);
    await _reloadFriends();
  }

  @override
  Future<void> unblock(String id) async {
    await _api.delete('/blocks/$id');
    _blocked.remove(id);
    notifyListeners();
  }

  @override
  Future<void> sendMessage(String friendId, String text) async {
    if (text.trim().isEmpty) return;
    _onMessage(Map<String, dynamic>.from(await _api.post('/friends/$friendId/messages', {'text': text.trim()}) as Map));
  }

  @override
  Future<bool> sendGift(String friendId, Gift gift) async {
    try {
      _onMessage(Map<String, dynamic>.from(await _api.post('/friends/$friendId/gifts', {'giftId': gift.id}, {'Idempotency-Key': ApiClient.newIdempotencyKey()}) as Map));
      return true;
    } on ApiException catch (e) {
      if (e.isInsufficientCoins) return false;
      rethrow;
    }
  }

  @override
  void markRead(String friendId) {
    final f = friend(friendId);
    if (f != null && f.unread > 0) {
      _replace(f.copyWith(unread: 0));
      notifyListeners();
    }
    _api.post('/friends/$friendId/read').catchError((_) => null);
  }

  @override
  void leaveChat(String friendId) {
    if (_openChat == friendId) _openChat = null;
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }
}
