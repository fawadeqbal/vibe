import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../core/mock/mock_backend.dart';
import '../models/models.dart';
import 'wallet_provider.dart';

part 'social_provider_local.dart';
part 'social_provider_remote.dart';

/// Friends, requests, blocks, chats with friends, and the "liked you" list.
///
/// [LocalSocialProvider] simulates the other side; [RemoteSocialProvider]
/// talks to the Vibe API and receives requests and messages live.
abstract class SocialProvider extends ChangeNotifier {
  SocialProvider.base();

  factory SocialProvider(MockBackend backend, WalletProvider wallet) = LocalSocialProvider;

  List<Friend> _friends = [];
  Map<String, List<ChatMessage>> _chats = {};
  Set<String> _blocked = {};
  List<Profile> _likedYou = [];
  int? _likedYouCount;
  bool _loaded = false;
  final Map<String, DateTime> _typing = {};
  final Map<String, DateTime> _seenAt = {};
  final Map<String, Timer> _typingTimers = {};

  List<Friend> get friends =>
      _friends.where((f) => f.state == FriendState.friends).toList()..sort((a, b) => (b.lastMessage == null ? b.since : _lastAt(b)).compareTo(a.lastMessage == null ? a.since : _lastAt(a)));
  List<Friend> get incoming => _friends.where((f) => f.state == FriendState.incoming).toList();
  List<Friend> get requested => _friends.where((f) => f.state == FriendState.requested).toList();
  Set<String> get blocked => _blocked;

  /// People who liked you. Free users on the server only get blurred faces
  /// (placeholder profiles); [likedYouCount] is the real number.
  List<Profile> get likedYou => _likedYou;
  int get likedYouCount => _likedYouCount ?? _likedYou.length;
  bool get loaded => _loaded;
  int get unreadTotal => _friends.fold(0, (a, f) => a + f.unread);

  /// Friends online right now (the lobby's "3 friends online" row).
  List<Friend> get onlineFriends => friends.where((f) => f.online).toList();

  /// Streaks that end tonight unless you both talk.
  int get streaksAtRisk => friends.where((f) => f.streak.atRisk).length;

  DateTime _lastAt(Friend f) {
    final list = _chats[f.profile.id];
    return list == null || list.isEmpty ? f.since : list.last.at;
  }

  FriendState stateOf(String userId) {
    if (_blocked.contains(userId)) return FriendState.blocked;
    for (final f in _friends) {
      if (f.profile.id == userId) return f.state;
    }
    return FriendState.none;
  }

  List<ChatMessage> messages(String friendId) => List.unmodifiable(_chats[friendId] ?? const []);

  Friend? friend(String id) {
    for (final f in _friends) {
      if (f.profile.id == id) return f;
    }
    return null;
  }

  Future<void> load();

  /// Loads a conversation from the server the first time it is opened.
  Future<void> ensureMessages(String friendId) async {}

  /// The chat screen for [friendId] closed.
  void leaveChat(String friendId) {}

  /// Sends a request. False when it could not be paid for.
  Future<bool> sendRequest(Profile p);

  /// The partner asked first (mock only — the server pushes these).
  void receiveRequest(Profile p);
  Future<bool> accept(String id);
  Future<void> decline(String id);
  Future<void> remove(String id);
  Future<void> block(Profile p);
  Future<void> unblock(String id);
  Future<void> sendMessage(String friendId, String text, {String? replyToId});
  Future<bool> sendGift(String friendId, Gift gift);
  void markRead(String friendId);

  /// A photo (`MessageKind.photo`) or voice note (`MessageKind.voice`).
  /// Throws [ApiException] `FEATURE_DISABLED` when it's switched off.
  Future<void> sendMedia(String friendId, MessageKind kind, Uint8List bytes, {required String contentType, int? seconds, int? w, int? h, String? replyToId});

  /// Your one reaction on a message; the same again (or null) removes it.
  Future<void> react(String friendId, String messageId, String? emoji);

  /// Takes back your own message (within `Economy.chatUnsendMinutes`).
  Future<void> unsend(String friendId, String messageId);

  /// Tell them you're typing (throttled: at most every 3 s).
  void typingTo(String friendId) {}

  /// They're typing to you right now.
  bool isTyping(String friendId) => _typing[friendId]?.isAfter(DateTime.now()) ?? false;

  /// When they last read the chat (live `message:read`).
  DateTime? seenAt(String friendId) => _seenAt[friendId];

  /// Whether your [m] can still be unsent.
  static bool canUnsend(ChatMessage m) =>
      m.fromMe && !m.unsent && !m.isSystem && m.kind != MessageKind.gift && DateTime.now().difference(m.at).inMinutes < Economy.chatUnsendMinutes;

  /// They're typing (for about 4 s unless it's renewed).
  @protected
  void noteTyping(String friendId, {bool on = true}) {
    _typingTimers.remove(friendId)?.cancel();
    if (!on) {
      if (_typing.remove(friendId) != null) notifyListeners();
      return;
    }
    _typing[friendId] = DateTime.now().add(const Duration(seconds: 4));
    _typingTimers[friendId] = Timer(const Duration(seconds: 4), () {
      _typing.remove(friendId);
      notifyListeners();
    });
    notifyListeners();
  }

  @protected
  void noteSeen(String friendId, DateTime at) {
    _seenAt[friendId] = at;
    notifyListeners();
  }

  /// Replaces one message (reaction, unsend, upload done).
  @protected
  void replaceMessage(String friendId, ChatMessage m, {String? oldId}) {
    final list = _chats[friendId];
    if (list == null) return;
    final i = list.indexWhere((x) => x.id == (oldId ?? m.id));
    if (i < 0) return;
    list[i] = m;
    if (i == list.length - 1) {
      final fi = _friends.indexWhere((x) => x.profile.id == friendId);
      if (fi >= 0) _friends[fi] = _friends[fi].copyWith(lastMessage: lastLine(m));
    }
    notifyListeners();
  }

  /// The chats-list preview of a message.
  static String lastLine(ChatMessage m) => m.unsent ? 'Message unsent' : m.gift != null ? '${m.gift!.emoji} ${m.gift!.name}' : m.text;

  @override
  void dispose() {
    for (final t in _typingTimers.values) {
      t.cancel();
    }
    super.dispose();
  }

  /// Brings back a streak that broke yesterday for `restoreCost` coins (free
  /// for VIP). False when it could not be paid for; throws [ApiException]
  /// `STREAK_NOT_RESTORABLE` when it is too late.
  Future<bool> restoreStreak(String friendId);

  /// Replaces one friend's streak (server push, restore answer).
  @protected
  void setStreak(String friendId, StreakView streak) {
    final i = _friends.indexWhere((x) => x.profile.id == friendId);
    if (i < 0) return;
    _friends[i] = _friends[i].copyWith(streak: streak);
    notifyListeners();
  }

  /// Video calls in one chat changed (consent answer, `call:consent`).
  void setCalls(String friendId, CallsView calls) {
    final i = _friends.indexWhere((x) => x.profile.id == friendId);
    final c = i < 0 ? null : _friends[i].calls;
    if (c == null || (c.mine == calls.mine && c.theirs == calls.theirs && c.mineVideo == calls.mineVideo && c.theirsVideo == calls.theirsVideo)) return;
    _friends[i] = _friends[i].copyWith(calls: calls);
    notifyListeners();
  }

  /// A new friend from a Discover match: refreshes the list (server) or
  /// adds them with a "You matched" line (offline demo).
  Future<void> addMatched(Friend f);

  /// Adds a line to a chat that isn't sent anywhere (offline demo: call
  /// events, "You matched"; the server sends its own).
  @protected
  void appendLocal(String friendId, ChatMessage m) {
    final list = _chats.putIfAbsent(friendId, () => []);
    if (list.any((x) => x.id == m.id)) return;
    list.add(m);
    final i = _friends.indexWhere((x) => x.profile.id == friendId);
    if (i >= 0) _friends[i] = _friends[i].copyWith(lastMessage: m.text);
    notifyListeners();
  }

  /// Offline demo: a system line from Vibe in a chat.
  void addSystemLine(String friendId, String text, String event, {bool fromMe = false, Map<String, dynamic> extra = const {}}) =>
      appendLocal(friendId, ChatMessage(id: 'sys${DateTime.now().microsecondsSinceEpoch}', fromMe: fromMe, text: text, at: DateTime.now(), kind: MessageKind.system, meta: {'event': event, ...extra}));

  /// Test seam: a message as if it arrived.
  @visibleForTesting
  void debugAppend(String friendId, ChatMessage m) => appendLocal(friendId, m);

  /// Test seam.
  @visibleForTesting
  void debugSetStreak(String friendId, StreakView streak) => setStreak(friendId, streak);
}
