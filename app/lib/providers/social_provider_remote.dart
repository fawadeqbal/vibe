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
      _rt.on(Ev.messageUpdated).listen((m) {
        final id = m['friendId'] as String?;
        if (id != null) replaceMessage(id, ApiMap.message(m));
      }),
      _rt.on(Ev.chatTyping).listen((e) {
        final id = e['friendId'] as String?;
        if (id != null) noteTyping(id);
      }),
      _rt.on(Ev.messagesRead).listen((e) {
        final id = e['friendId'] as String?;
        final at = DateTime.tryParse('${e['at']}');
        if (id != null && at != null) noteSeen(id, at);
      }),
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
    if (!msg.fromMe && !msg.isSystem) noteTyping(friendId, on: false);
    final f = friend(friendId);
    if (f != null) {
      final unread = !msg.fromMe && !msg.isSystem && _openChat != friendId ? f.unread + 1 : f.unread;
      _replace(f.copyWith(lastMessage: SocialProvider.lastLine(msg), unread: unread));
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
  Future<void> addMatched(Friend f) => _reloadFriends();

  /// Re-reads the friends list (presence, calls) — e.g. after a match.
  Future<void> refreshFriends() => _reloadFriends();

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
  Future<List<BlockedPerson>> blockedPeople() async {
    final list = await _api.get('/blocks') as List;
    final people = [for (final e in list) BlockedPerson(ApiMap.profile(Map<String, dynamic>.from(e as Map)), DateTime.tryParse('${e['blockedAt'] ?? ''}')?.toLocal())];
    _blocked = people.map((p) => p.profile.id).toSet();
    notifyListeners();
    return people;
  }

  @override
  Future<void> unblock(String id) async {
    await _api.delete('/blocks/$id');
    _blocked.remove(id);
    notifyListeners();
  }

  @override
  Future<void> sendMessage(String friendId, String text, {String? replyToId}) async {
    if (text.trim().isEmpty) return;
    _onMessage(Map<String, dynamic>.from(await _api.post('/friends/$friendId/messages', {'text': text.trim(), 'replyToId': ?replyToId}) as Map));
  }

  @override
  Future<void> sendMedia(String friendId, MessageKind kind, Uint8List bytes, {required String contentType, int? seconds, int? w, int? h, String? replyToId}) async {
    final photo = kind == MessageKind.photo;
    // Shows at once, greyed, until the upload is done.
    final tempId = 'up${DateTime.now().microsecondsSinceEpoch}';
    final list = _chats.putIfAbsent(friendId, () => []);
    list.add(ChatMessage(
      id: tempId,
      fromMe: true,
      text: photo ? '📷 Photo' : '🎤 Voice message',
      at: DateTime.now(),
      kind: kind,
      meta: {'seconds': ?seconds, 'w': ?w, 'h': ?h},
      pending: true,
      localBytes: bytes,
    ));
    notifyListeners();
    final ext = switch (contentType) { 'image/png' => 'png', 'image/webp' => 'webp', 'image/jpeg' => 'jpg', 'audio/mp4' || 'audio/m4a' || 'audio/aac' => 'm4a', 'audio/ogg' => 'ogg', _ => photo ? 'jpg' : 'webm' };
    try {
      final r = Map<String, dynamic>.from(await _api.upload(
        '/friends/$friendId/messages/media',
        field: 'file',
        bytes: bytes,
        filename: '${photo ? 'photo' : 'voice'}.$ext',
        contentType: contentType,
        fields: {'kind': kind.name, 'seconds': ?seconds?.toString(), 'w': ?w?.toString(), 'h': ?h?.toString(), 'replyToId': ?replyToId},
      ) as Map);
      final m = ApiMap.message(r);
      if (list.any((x) => x.id == m.id)) {
        list.removeWhere((x) => x.id == tempId);
        notifyListeners();
      } else {
        replaceMessage(friendId, m, oldId: tempId);
        final f = friend(friendId);
        if (f != null) _replace(f.copyWith(lastMessage: m.text));
      }
    } catch (_) {
      list.removeWhere((x) => x.id == tempId);
      notifyListeners();
      rethrow;
    }
  }

  @override
  Future<void> react(String friendId, String messageId, String? emoji) async {
    final r = await _api.put('/friends/$friendId/messages/$messageId/reaction', {'emoji': emoji ?? ''});
    if (r is Map) replaceMessage(friendId, ApiMap.message(Map<String, dynamic>.from(r)));
  }

  @override
  Future<void> unsend(String friendId, String messageId) async {
    final r = await _api.delete('/friends/$friendId/messages/$messageId');
    if (r is Map) replaceMessage(friendId, ApiMap.message(Map<String, dynamic>.from(r)));
  }

  final Map<String, DateTime> _typingSent = {};

  @override
  void typingTo(String friendId) {
    final now = DateTime.now();
    final last = _typingSent[friendId];
    if (last != null && now.difference(last).inMilliseconds < 3000) return;
    _typingSent[friendId] = now;
    _api.post('/friends/$friendId/typing').catchError((_) => null);
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
