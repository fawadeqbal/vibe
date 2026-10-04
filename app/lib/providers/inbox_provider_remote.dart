part of 'inbox_provider.dart';

/// Server mode: the inbox on the Vibe API. A push on `inbox:message`
/// re-reads the newest page (the banner itself is shown by SystemNotices).
class RemoteInboxProvider extends InboxProvider {
  RemoteInboxProvider(this._api, this._rt) : super.base() {
    _sub = _rt.on(Ev.inboxMessage).listen((_) => load());
  }

  static const _pageSize = 30;

  final ApiClient _api;
  final RealtimeClient _rt;
  late final StreamSubscription<dynamic> _sub;
  String? _cursor;

  @override
  Future<void> load() async {
    if (!_api.hasSession) return;
    try {
      final results = await Future.wait([
        _api.get('/inbox', query: {'limit': '$_pageSize'}),
        _api.get('/inbox/unread'),
      ]);
      final page = Map<String, dynamic>.from(results[0] as Map);
      _items = (page['items'] as List).map((e) => ApiMap.teamMessage(Map<String, dynamic>.from(e as Map))).toList();
      _cursor = page['nextCursor'] as String?;
      _hasMore = _cursor != null;
      _unread = ApiMap.i((results[1] as Map)['count']);
      _loaded = true;
      notifyListeners();
    } on ApiException catch (_) {
      // The inbox is secondary; Chats still works without it.
    }
  }

  @override
  Future<void> loadMore() async {
    final cursor = _cursor;
    if (cursor == null || _loadingMore) return;
    _loadingMore = true;
    notifyListeners();
    try {
      final page = Map<String, dynamic>.from(await _api.get('/inbox', query: {'limit': '$_pageSize', 'cursor': cursor}) as Map);
      _items = [..._items, ...(page['items'] as List).map((e) => ApiMap.teamMessage(Map<String, dynamic>.from(e as Map)))];
      _cursor = page['nextCursor'] as String?;
      _hasMore = _cursor != null;
    } on ApiException catch (_) {
    } finally {
      _loadingMore = false;
      notifyListeners();
    }
  }

  @override
  Future<void> markRead(String id) async {
    if (!_setRead(id)) return;
    try {
      await _api.post('/inbox/$id/read');
    } on ApiException catch (_) {}
  }

  @override
  Future<void> markAllRead() async {
    if (_unread == 0) return;
    _setAllRead();
    try {
      await _api.post('/inbox/read-all');
    } on ApiException catch (_) {}
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}
