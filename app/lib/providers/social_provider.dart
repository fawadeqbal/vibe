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
  Future<void> sendMessage(String friendId, String text);
  Future<bool> sendGift(String friendId, Gift gift);
  void markRead(String friendId);
}
