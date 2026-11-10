import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../models/activity.dart';
import '../models/models.dart';
import '../models/payments.dart';

part 'activity_provider_local.dart';
part 'activity_provider_remote.dart';

/// The Notifications page: friend and follow requests, new followers,
/// matches, missed calls, money and account news.
///
/// Two kinds of "read", like on any social app: [unread] (the bell) counts
/// what came since the page was last opened, and opening it clears the bell
/// ([seen]); each line stays highlighted until it's opened: tapped there, its
/// push or banner tapped, or what it's about opened (that chat, answering that
/// request; the server does those), or "Mark all read".
///
/// [LocalActivityProvider] has a couple of sample lines for the offline
/// mock; [RemoteActivityProvider] reads `/activity` and adds lines live.
abstract class ActivityProvider extends ChangeNotifier {
  ActivityProvider.base();

  factory ActivityProvider() = LocalActivityProvider;

  List<ActivityItem> _items = [];
  int _unread = 0;
  bool _loaded = false;
  bool _hasMore = false;
  bool _loadingMore = false;

  /// Newest first.
  List<ActivityItem> get items => List.unmodifiable(_items);
  int get unread => _unread;
  bool get loaded => _loaded;
  bool get hasMore => _hasMore;
  bool get loadingMore => _loadingMore;

  Future<void> load();

  /// Older lines, when [hasMore].
  Future<void> loadMore() async {}

  /// Opened the page: the bell goes to 0; lines stay highlighted.
  Future<void> seen() async {
    if (_unread == 0) return;
    _unread = 0;
    notifyListeners();
  }

  /// Opened these lines (a tap on the line, its push or its banner).
  Future<void> markRead(List<String> ids) async => _setRead(ids);

  /// "Mark all read": every line and the bell.
  Future<void> markAllRead();

  /// After acting on a line (accept, follow back…): re-read who's who.
  Future<void> refresh() => load();

  /// Marks lines read here (all of them with [all]); notifies either way (the bell may have moved).
  void _setRead(Iterable<String> ids, {bool all = false}) {
    final set = ids.toSet();
    _items = [for (final i in _items) !i.read && (all || set.contains(i.id)) ? i.copyWith(read: true) : i];
    notifyListeners();
  }

  // ── the pages a notification opens ────────────────────────────────────
  // Null = it's gone (removed, or not yours): the page says so.

  Future<Cashout?> cashout(String id);
  Future<AccountStatus> accountStatus();
  Future<TeamMessage?> teamMessage(String id);
  Future<CallHistory?> callHistory(String userId);
}
