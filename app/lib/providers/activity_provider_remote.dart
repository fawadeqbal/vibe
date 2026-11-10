part of 'activity_provider.dart';

/// Server mode: `/activity` on the Vibe API. `activity:new` adds a line and
/// bumps the badge; `activity:read` keeps every device's badge in step.
class RemoteActivityProvider extends ActivityProvider {
  RemoteActivityProvider(this._api, this._rt) : super.base() {
    _subs = [
      _rt.on(Ev.activityNew).listen((e) {
        final item = e['item'] is Map ? ApiMap.activityItem(Map<String, dynamic>.from(e['item'] as Map)) : null;
        // A collapsed line (one per chat) comes back with the same id: move it to the top with its new text.
        if (item != null) _items = [item, ..._items.where((x) => x.id != item.id)];
        _unread = e['unread'] is num ? (e['unread'] as num).toInt() : _unread + (item == null ? 0 : 1);
        notifyListeners();
      }),
      _rt.on(Ev.activityRead).listen((e) {
        if (e['unread'] is! num) return;
        _unread = (e['unread'] as num).toInt();
        notifyListeners();
      }),
    ];
  }

  static const _pageSize = 30;

  final ApiClient _api;
  final RealtimeClient _rt;
  late final List<StreamSubscription<dynamic>> _subs;
  String? _cursor;

  ({List<ActivityItem> items, String? cursor, int unread}) _parse(Object? raw) {
    final page = Map<String, dynamic>.from(raw as Map);
    return (
      items: [for (final e in (page['items'] as List? ?? const [])) ApiMap.activityItem(Map<String, dynamic>.from(e as Map))],
      cursor: page['nextCursor'] as String?,
      unread: ApiMap.i(page['unread']),
    );
  }

  @override
  Future<void> load() async {
    if (!_api.hasSession) return;
    // The newest notifications from last time, at once (see ApiCache).
    if (!_loaded) {
      final cached = await _api.cache.read('activity');
      if (cached != null && !_loaded) {
        try {
          final p = _parse(cached);
          _items = p.items;
          _unread = p.unread;
          notifyListeners();
        } catch (_) {}
      }
    }
    try {
      final p = _parse(await _api.get('/activity', query: {'limit': '$_pageSize'}, cacheKey: 'activity'));
      _items = p.items;
      _cursor = p.cursor;
      _hasMore = _cursor != null;
      _unread = p.unread;
      _loaded = true;
      notifyListeners();
    } on ApiException catch (_) {
      // Secondary: the rest of the app works without it.
    }
  }

  @override
  Future<void> loadMore() async {
    final cursor = _cursor;
    if (cursor == null || _loadingMore) return;
    _loadingMore = true;
    notifyListeners();
    try {
      final p = _parse(await _api.get('/activity', query: {'limit': '$_pageSize', 'cursor': cursor}));
      _items = [..._items, ...p.items.where((i) => !_items.any((x) => x.id == i.id))];
      _cursor = p.cursor;
      _hasMore = _cursor != null;
    } on ApiException catch (_) {
    } finally {
      _loadingMore = false;
      notifyListeners();
    }
  }

  @override
  Future<void> markAllRead() async {
    if (_unread == 0) return;
    _unread = 0;
    notifyListeners();
    try {
      final r = await _api.post('/activity/read', const <String, dynamic>{});
      if (r is Map && r['unread'] is num) _unread = (r['unread'] as num).toInt();
      notifyListeners();
    } on ApiException catch (_) {}
  }

  @override
  Future<void> refresh() async {
    if (!_api.hasSession) return;
    try {
      final shown = {for (final i in _items) i.id: i.read};
      final p = _parse(await _api.get('/activity', query: {'limit': '${_items.length < _pageSize ? _pageSize : _items.length}'}));
      _items = [for (final i in p.items) i.copyWith(read: i.read && (shown[i.id] ?? true))];
      _unread = p.unread;
      notifyListeners();
    } on ApiException catch (_) {}
  }

  /// GET [path], or null when it's gone (404 / not yours).
  Future<Map<String, dynamic>?> _one(String path) async {
    try {
      final r = await _api.get(path);
      return r is Map ? Map<String, dynamic>.from(r) : null;
    } on ApiException catch (e) {
      if (e.status == 404 || e.status == 403) return null;
      rethrow;
    }
  }

  @override
  Future<Cashout?> cashout(String id) async {
    final m = await _one('/wallet/cashouts/${Uri.encodeComponent(id)}');
    return m == null ? null : Cashout.fromJson(m);
  }

  @override
  Future<AccountStatus> accountStatus() async => AccountStatus.fromJson(Map<String, dynamic>.from(await _api.get('/me/status') as Map));

  @override
  Future<TeamMessage?> teamMessage(String id) async {
    final m = await _one('/inbox/${Uri.encodeComponent(id)}');
    if (m == null) return null;
    final msg = ApiMap.teamMessage(m);
    if (!msg.read) unawaited(_api.post('/inbox/${Uri.encodeComponent(msg.id)}/read', const <String, dynamic>{}).then((_) {}, onError: (_) {}));
    return msg;
  }

  @override
  Future<CallHistory?> callHistory(String userId) async {
    final m = await _one('/friends/${Uri.encodeComponent(userId)}/calls/history');
    return m == null ? null : CallHistory.fromJson(m);
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }
}
