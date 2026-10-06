part of 'moments_provider.dart';

/// The offline mock: a few demo people with stock photos; your own posts get
/// a stock photo too (the mock keeps no files) and a few "viewers".
class LocalMomentsProvider extends MomentsProvider {
  LocalMomentsProvider(this._backend, SessionProvider session) : super.base(session);

  final MockBackend _backend;
  final Map<String, List<MomentViewer>> _viewers = {};

  static const _captions = ['sunset run 🌅', 'chai o clock', '', 'new haircut, thoughts?', 'Lahore nights ✨', '', 'study grind 📚'];

  @override
  Future<void> load() async {
    if (_loaded) return;
    final now = DateTime.now();
    final people = _backend.people.take(5).toList();
    final groups = <MomentGroup>[];
    for (var i = 0; i < people.length; i++) {
      final p = people[i];
      final n = 1 + p.id.hashCode.abs() % 3;
      groups.add(MomentGroup(author: p, moments: [
        for (var k = 0; k < n; k++)
          Moment(
            id: 'lm-${p.id}-$k',
            mediaUrl: 'https://picsum.photos/seed/vibe${p.id}$k/720/1280',
            caption: _captions[(i + k) % _captions.length],
            createdAt: now.subtract(Duration(minutes: 30 + i * 70 + (n - k) * 40)),
            expiresAt: now.add(Duration(hours: 20 - i)),
            seen: i >= 3, // the last two were already watched
          ),
      ]));
    }
    setPeople(groups);
    _loaded = true;
    notifyListeners();
  }

  @override
  Future<void> post(List<int> bytes, {String contentType = 'image/jpeg', String caption = ''}) async {
    if (_mine.length >= 10) throw ApiException('MOMENT_LIMIT', 'You can have 10 moments at a time. Delete one or wait for one to expire.', status: 429);
    _posting = true;
    notifyListeners();
    try {
      final now = DateTime.now();
      final id = 'mine-${now.microsecondsSinceEpoch}';
      _mine = [..._mine, Moment(id: id, mediaUrl: 'https://picsum.photos/seed/$id/720/1280', caption: caption.trim(), createdAt: now, expiresAt: now.add(const Duration(hours: 24)), seen: true, viewsCount: 0)];
      // A few demo people "watch" it.
      _viewers[id] = [for (final p in _backend.people.skip(2).take(3)) MomentViewer(profile: p, at: now)];
      _mine = [for (final m in _mine) m.id == id ? m.copyWith(viewsCount: 3) : m];
    } finally {
      _posting = false;
      notifyListeners();
    }
  }

  @override
  Future<void> markSeen(Moment m) async => setSeen(m.id);

  @override
  Future<List<MomentViewer>> viewers(String momentId) async => _viewers[momentId] ?? const [];

  @override
  Future<void> delete(String momentId) async {
    _mine = _mine.where((m) => m.id != momentId).toList();
    _viewers.remove(momentId);
    notifyListeners();
  }

  @override
  Future<void> report(String momentId, ReportReason reason, {String? note, bool block = true}) async {
    if (block) {
      _people = [for (final g in _people) if (!g.moments.any((m) => m.id == momentId)) g];
      notifyListeners();
    }
  }
}
