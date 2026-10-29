part of 'social_provider.dart';

/// The offline mock: the other side is simulated — requests get accepted
/// after a moment, messages get a reply.
class LocalSocialProvider extends SocialProvider {
  LocalSocialProvider(this._backend, this._wallet) : super.base();

  final MockBackend _backend;
  final WalletProvider _wallet;
  final List<Timer> _timers = [];

  @override
  Future<void> load() async {
    _friends = await _backend.loadFriends();
    _chats = await _backend.loadChats();
    _blocked = await _backend.loadBlocked();
    _likedYou = _backend.likedYou(exclude: _friends.map((f) => f.profile.id).toSet());
    _loaded = true;
    notifyListeners();
  }

  // ── requests ──────────────────────────────────────────────────────────

  /// Sends a request; the mock partner accepts within a few seconds (most
  /// of the time). Returns false when the request could not be paid for.
  @override
  Future<bool> sendRequest(Profile p) async {
    final existing = stateOf(p.id);
    if (existing == FriendState.friends || existing == FriendState.requested) return true;
    if (existing == FriendState.incoming) return accept(p.id);
    if (!await _wallet.payFriendRequest(p.name)) return false;
    _upsert(Friend(profile: p, state: FriendState.requested, since: DateTime.now()));
    _timers.add(
      Timer(Duration(seconds: 2 + p.id.hashCode.abs() % 4), () {
        final f = friend(p.id);
        if (f == null || f.state != FriendState.requested) return;
        if (p.id.hashCode.abs() % 5 == 0) {
          _friends.removeWhere((x) => x.profile.id == p.id); // declined, quietly
        } else {
          _upsert(f.copyWith(state: FriendState.friends, online: true));
        }
        _persist();
      }),
    );
    await _persist();
    return true;
  }

  /// The partner asked first (a scripted PartnerAction.friendRequest).
  @override
  void receiveRequest(Profile p) {
    if (stateOf(p.id) != FriendState.none) return;
    _upsert(Friend(profile: p, state: FriendState.incoming, since: DateTime.now()));
    _persist();
  }

  @override
  Future<void> addMatched(Friend f) async {
    if (friend(f.profile.id) == null) _upsert(f);
    addSystemLine(f.profile.id, 'You matched in Discover', 'matched', extra: {'via': 'discover'});
    await _persist();
  }

  @override
  Future<bool> accept(String id) async {
    final f = friend(id);
    if (f == null) return false;
    _upsert(f.copyWith(state: FriendState.friends, online: true));
    await _persist();
    return true;
  }

  @override
  Future<void> decline(String id) async {
    _friends.removeWhere((f) => f.profile.id == id);
    await _persist();
  }

  @override
  Future<void> remove(String id) async {
    _friends.removeWhere((f) => f.profile.id == id);
    _chats.remove(id);
    await _persist();
  }

  // ── blocks ────────────────────────────────────────────────────────────

  @override
  Future<void> block(Profile p) async {
    _blocked.add(p.id);
    _friends.removeWhere((f) => f.profile.id == p.id);
    _chats.remove(p.id);
    await _backend.saveBlocked(_blocked);
    await _persist();
  }

  @override
  Future<void> unblock(String id) async {
    _blocked.remove(id);
    await _backend.saveBlocked(_blocked);
    notifyListeners();
  }

  // ── chat ──────────────────────────────────────────────────────────────

  @override
  Future<void> sendMessage(String friendId, String text, {String? replyToId}) async {
    final t = text.trim();
    if (t.isEmpty) return;
    _append(friendId, ChatMessage(id: 'm${DateTime.now().microsecondsSinceEpoch}', fromMe: true, text: t, at: DateTime.now(), replyTo: _ref(friendId, replyToId)));
    _noteStreak(friendId, mine: true);
    await _persist();
    _scheduleReply(friendId);
  }

  ReplyRef? _ref(String friendId, String? id) {
    if (id == null) return null;
    for (final m in _chats[friendId] ?? const <ChatMessage>[]) {
      if (m.id == id) return ReplyRef(id: m.id, fromMe: m.fromMe, kind: m.kind.name, text: m.unsent ? '' : m.text, unsent: m.unsent);
    }
    return null;
  }

  @override
  Future<void> sendMedia(String friendId, MessageKind kind, Uint8List bytes, {required String contentType, int? seconds, int? w, int? h, String? replyToId}) async {
    final photo = kind == MessageKind.photo;
    if (photo ? !Economy.chatPhotosEnabled : !Economy.chatVoiceNotesEnabled) {
      throw ApiException('FEATURE_DISABLED', photo ? 'Photos are off right now' : 'Voice messages are off right now', status: 403);
    }
    _append(
      friendId,
      ChatMessage(
        id: 'p${DateTime.now().microsecondsSinceEpoch}',
        fromMe: true,
        text: photo ? '📷 Photo' : '🎤 Voice message',
        at: DateTime.now(),
        kind: kind,
        meta: {'seconds': ?seconds, 'w': ?w, 'h': ?h},
        localBytes: bytes,
        replyTo: _ref(friendId, replyToId),
      ),
    );
    _noteStreak(friendId, mine: true);
    notifyListeners();
    _scheduleReply(friendId);
  }

  @override
  Future<void> react(String friendId, String messageId, String? emoji) async {
    final m = _find(friendId, messageId);
    if (m == null) return;
    final clean = emoji?.trim() ?? '';
    final off = clean.isEmpty || m.reactionMine == clean;
    replaceMessage(friendId, off ? m.copyWith(clearMine: true) : m.copyWith(reactionMine: clean));
    await _persist();
  }

  @override
  Future<void> unsend(String friendId, String messageId) async {
    final m = _find(friendId, messageId);
    if (m == null) return;
    if (!m.fromMe) throw ApiException('FORBIDDEN', "You can only unsend your own messages", status: 403);
    if (!SocialProvider.canUnsend(m)) throw ApiException('CONFLICT', 'Too late to unsend this one', status: 409);
    replaceMessage(friendId, m.copyWith(unsent: true, text: '', clearMine: true, clearTheirs: true));
    await _persist();
  }

  ChatMessage? _find(String friendId, String id) {
    for (final m in _chats[friendId] ?? const <ChatMessage>[]) {
      if (m.id == id) return m;
    }
    return null;
  }

  @override
  Future<bool> sendGift(String friendId, Gift gift) async {
    final f = friend(friendId);
    if (f == null) return false;
    if (!await _wallet.spend(gift.coins, '${gift.name} to ${f.profile.name}', kind: TxKind.gift)) return false;
    _append(friendId, ChatMessage(id: 'g${DateTime.now().microsecondsSinceEpoch}', fromMe: true, text: 'Sent a ${gift.name}', at: DateTime.now(), gift: gift));
    _noteStreak(friendId, mine: true);
    await _persist();
    _scheduleReply(friendId, thanks: true);
    return true;
  }

  @override
  void markRead(String friendId) {
    final f = friend(friendId);
    if (f == null || f.unread == 0) return;
    _upsert(f.copyWith(unread: 0));
    _persist();
  }

  void _scheduleReply(String friendId, {bool thanks = false}) {
    final wait = 2 + friendId.hashCode.abs() % 5;
    // They read it, then type for a moment, then answer.
    _timers.add(Timer(const Duration(milliseconds: 900), () {
      if (friend(friendId) == null) return;
      noteSeen(friendId, DateTime.now());
      noteTyping(friendId);
    }));
    _timers.add(
      Timer(Duration(seconds: wait), () {
        if (friend(friendId) == null) return;
        noteTyping(friendId, on: false);
        final text = thanks ? 'aww thank you!! 🥹' : _backend.friendReply();
        _append(friendId, ChatMessage(id: 'r${DateTime.now().microsecondsSinceEpoch}', fromMe: false, text: text, at: DateTime.now()), unread: true);
        _noteStreak(friendId, mine: false);
        _persist();
      }),
    );
  }

  /// Mock streak day: once both of you sent something today it counts
  /// (the server does the same per business day).
  void _noteStreak(String friendId, {required bool mine}) {
    final f = friend(friendId);
    if (f == null || f.state != FriendState.friends) return;
    var s = f.streak.copyWith(mineToday: mine ? true : null, theirsToday: mine ? null : true);
    if (s.mineToday && s.theirsToday && !s.today) {
      final count = s.atRisk || s.count > 0 ? s.count + 1 : 1;
      s = s.copyWith(count: count, best: count > s.best ? count : s.best, today: true, atRisk: false, restorable: false, lostCount: 0);
      if (count % 7 == 0) unawaited(_wallet.earn(Economy.streakWeeklyCoins, 'Streak · $count days with ${f.profile.name}'));
    }
    _upsert(f.copyWith(streak: s));
  }

  @override
  Future<bool> restoreStreak(String friendId) async {
    final f = friend(friendId);
    if (f == null || !f.streak.restorable) throw ApiException('STREAK_NOT_RESTORABLE', 'This streak can no longer be restored', status: 409);
    final cost = _wallet.isVip ? 0 : Economy.streakRestoreCost;
    if (cost > 0 && !await _wallet.spend(cost, 'Streak restored · ${f.profile.name}')) return false;
    _upsert(f.copyWith(streak: f.streak.copyWith(count: f.streak.lostCount, restorable: false, lostCount: 0, atRisk: true, today: false)));
    await _persist();
    return true;
  }

  void _append(String friendId, ChatMessage m, {bool unread = false}) {
    final list = _chats.putIfAbsent(friendId, () => []);
    list.add(m);
    if (list.length > 300) list.removeRange(0, list.length - 300);
    final f = friend(friendId);
    if (f != null) _upsert(f.copyWith(lastMessage: SocialProvider.lastLine(m), unread: unread ? f.unread + 1 : f.unread));
  }

  void _upsert(Friend f) {
    final i = _friends.indexWhere((x) => x.profile.id == f.profile.id);
    if (i >= 0) {
      _friends[i] = f;
    } else {
      _friends.add(f);
    }
  }

  Future<void> _persist() async {
    await _backend.saveFriends(_friends);
    await _backend.saveChats(_chats);
    notifyListeners();
  }

  @override
  void dispose() {
    for (final t in _timers) {
      t.cancel();
    }
    super.dispose();
  }
}
