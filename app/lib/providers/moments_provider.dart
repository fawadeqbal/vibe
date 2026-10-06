import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../core/mock/mock_backend.dart';
import '../models/models.dart';
import 'session_provider.dart';

part 'moments_provider_local.dart';
part 'moments_provider_remote.dart';

/// Moments: 24-hour photos from you, the people you follow and your friends.
///
/// [LocalMomentsProvider] fills the bar with demo people (stock photos);
/// [RemoteMomentsProvider] reads `GET /moments/feed` and refreshes when
/// someone posts (`moments:new`).
abstract class MomentsProvider extends ChangeNotifier {
  MomentsProvider.base(this._session);

  factory MomentsProvider(MockBackend backend, SessionProvider session) = LocalMomentsProvider;

  final SessionProvider _session;
  List<Moment> _mine = [];
  List<MomentGroup> _people = [];
  bool _loaded = false;
  bool _posting = false;

  /// Your live moments as a group (oldest → newest); null when signed out.
  MomentGroup? get mine {
    final me = _session.me;
    return me == null ? null : MomentGroup(author: me, moments: List.unmodifiable(_mine), mine: true);
  }

  /// Other people, unseen first, then the newest.
  List<MomentGroup> get people => List.unmodifiable(_people);
  bool get loaded => _loaded;
  bool get posting => _posting;

  Future<void> load();

  /// A new moment (JPEG/PNG/WebP, already resized). Throws [ApiException]
  /// (`MOMENT_LIMIT` at 10 live ones).
  Future<void> post(List<int> bytes, {String contentType = 'image/jpeg', String caption = ''});

  /// You looked at [m] (someone else's): marks it seen, once.
  Future<void> markSeen(Moment m);

  /// Who saw your moment, newest first.
  Future<List<MomentViewer>> viewers(String momentId);

  Future<void> delete(String momentId);

  /// Reports the author (and blocks them unless [block] is false).
  Future<void> report(String momentId, ReportReason reason, {String? note, bool block = true});

  void clear() {
    _mine = [];
    _people = [];
    _loaded = false;
    notifyListeners();
  }

  /// Unseen authors first, then by newest moment.
  @protected
  void setPeople(List<MomentGroup> groups) {
    final live = [for (final g in groups) if (g.moments.isNotEmpty) g];
    DateTime newest(MomentGroup g) => g.moments.map((m) => m.createdAt).reduce((a, b) => a.isAfter(b) ? a : b);
    live.sort((a, b) {
      if (a.allSeen != b.allSeen) return a.allSeen ? 1 : -1;
      return newest(b).compareTo(newest(a));
    });
    _people = live;
  }

  /// Optimistic local "seen" (the order stays put while the viewer is open).
  @protected
  bool setSeen(String momentId) {
    for (var i = 0; i < _people.length; i++) {
      final g = _people[i];
      final j = g.moments.indexWhere((m) => m.id == momentId);
      if (j < 0) continue;
      if (g.moments[j].seen) return false;
      final list = [...g.moments]..[j] = g.moments[j].copyWith(seen: true);
      _people[i] = g.withMoments(list);
      notifyListeners();
      return true;
    }
    return false;
  }
}
