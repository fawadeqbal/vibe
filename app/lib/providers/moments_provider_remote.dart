part of 'moments_provider.dart';

/// Server mode: `/moments` on the Vibe API; a `moments:new` push reloads the feed.
class RemoteMomentsProvider extends MomentsProvider {
  RemoteMomentsProvider(this._api, this._rt, SessionProvider session) : super.base(session) {
    _sub = _rt.on(Ev.momentNew).listen((_) {
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 500), load);
    });
  }

  final ApiClient _api;
  final RealtimeClient _rt;
  late final StreamSubscription<Map<String, dynamic>> _sub;
  Timer? _debounce;
  final Set<String> _viewed = {};

  @override
  Future<void> load() async {
    if (!_api.hasSession) return;
    try {
      final feed = Map<String, dynamic>.from(await _api.get('/moments/feed') as Map);
      final groups = ApiMap.momentFeed(feed, _session.me);
      _mine = groups.isNotEmpty && groups.first.mine ? groups.first.moments : [];
      setPeople([for (final g in groups) if (!g.mine) g]);
      _loaded = true;
      notifyListeners();
    } on ApiException catch (_) {}
  }

  @override
  Future<void> post(List<int> bytes, {String contentType = 'image/jpeg', String caption = ''}) async {
    _posting = true;
    notifyListeners();
    try {
      final ext = switch (contentType) { 'image/png' => 'png', 'image/webp' => 'webp', _ => 'jpg' };
      final m = Moment.fromJson(Map<String, dynamic>.from(await _api.upload('/moments', field: 'photo', bytes: bytes, filename: 'moment.$ext', contentType: contentType, fields: {if (caption.trim().isNotEmpty) 'caption': caption.trim()}) as Map));
      _mine = [..._mine, m];
    } finally {
      _posting = false;
      notifyListeners();
    }
  }

  @override
  Future<void> markSeen(Moment m) async {
    setSeen(m.id);
    if (!_viewed.add(m.id)) return;
    try {
      await _api.post('/moments/${m.id}/view');
    } on ApiException catch (_) {
      _viewed.remove(m.id);
    }
  }

  @override
  Future<List<MomentViewer>> viewers(String momentId) async {
    final list = await _api.get('/moments/$momentId/viewers') as List;
    final out = [
      for (final v in list) MomentViewer(profile: ApiMap.profile(Map<String, dynamic>.from((v as Map)['profile'] as Map)), at: ApiMap.date(v['at']) ?? DateTime.now()),
    ];
    _mine = [for (final m in _mine) m.id == momentId ? m.copyWith(viewsCount: out.length) : m];
    notifyListeners();
    return out;
  }

  @override
  Future<void> delete(String momentId) async {
    await _api.delete('/moments/$momentId');
    _mine = _mine.where((m) => m.id != momentId).toList();
    notifyListeners();
  }

  @override
  Future<void> report(String momentId, ReportReason reason, {String? note, bool block = true}) async {
    await _api.post('/moments/$momentId/report', {'reason': ApiMap.reportReasonOut(reason), if (note != null && note.trim().isNotEmpty) 'note': note.trim(), 'block': block});
    if (block) await load();
  }

  @override
  void dispose() {
    _sub.cancel();
    _debounce?.cancel();
    super.dispose();
  }
}
