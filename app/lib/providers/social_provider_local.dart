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
  Future<void> sendMessage(String friendId, String text) async {
    final t = text.trim();
    if (t.isEmpty) return;
    _append(friendId, ChatMessage(id: 'm${DateTime.now().microsecondsSinceEpoch}', fromMe: true, text: t, at: DateTime.now()));
    _noteStreak(friendId, mine: true);
    await _persist();
    _scheduleReply(friendId);
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
    _timers.add(
      Timer(Duration(seconds: 2 + friendId.hashCode.abs() % 5), () {
        if (friend(friendId) == null) return;
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
    if (f != null) _upsert(f.copyWith(lastMessage: m.gift != null ? '${m.gift!.emoji} ${m.gift!.name}' : m.text, unread: unread ? f.unread + 1 : f.unread));
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
