import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../models/models.dart';

part 'inbox_provider_local.dart';
part 'inbox_provider_remote.dart';

/// "Messages from Vibe": messages the team sends from the admin panel.
///
/// [LocalInboxProvider] holds a welcome note for the offline mock;
/// [RemoteInboxProvider] reads the inbox from the Vibe API and picks up new
/// messages live.
abstract class InboxProvider extends ChangeNotifier {
  InboxProvider.base();

  factory InboxProvider() = LocalInboxProvider;

  List<TeamMessage> _items = [];
  int _unread = 0;
  bool _loaded = false;
  bool _hasMore = false;
  bool _loadingMore = false;

  /// Newest first.
  List<TeamMessage> get messages => List.unmodifiable(_items);
  TeamMessage? get latest => _items.isEmpty ? null : _items.first;
  int get unread => _unread;
  bool get loaded => _loaded;
  bool get hasMore => _hasMore;
  bool get loadingMore => _loadingMore;

  Future<void> load();

  /// Older messages, when [hasMore].
  Future<void> loadMore() async {}

  Future<void> markRead(String id);

  Future<void> markAllRead();

  /// Optimistic local update shared by both implementations.
  bool _setRead(String id) {
    final i = _items.indexWhere((m) => m.id == id);
    if (i < 0 || _items[i].read) return false;
    _items = [..._items]..[i] = _items[i].copyWith(read: true);
    _unread = (_unread - 1).clamp(0, 1 << 30);
    notifyListeners();
    return true;
  }

  void _setAllRead() {
    _items = [for (final m in _items) m.read ? m : m.copyWith(read: true)];
    _unread = 0;
    notifyListeners();
  }
}
