import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../models/activity.dart';
import '../models/models.dart';

part 'activity_provider_local.dart';
part 'activity_provider_remote.dart';

/// The Notifications page: friend and follow requests, new followers,
/// matches, missed calls, money and account news. [unread] is the bell's
/// badge.
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

  /// Clears the badge. Lines keep their "new" look until the page is left.
  Future<void> markAllRead();

  /// After acting on a line (accept, follow back…): re-read who's who,
  /// keeping this visit's "new" highlight.
  Future<void> refresh() => load();
}
