import 'dart:async';

import 'package:flutter/foundation.dart';

import 'realtime_client.dart';

/// One live notification while you're in the app (`notification:show`):
/// the server sends it instead of a push when you're online.
class LiveBanner {
  const LiveBanner({required this.id, required this.key, required this.group, required this.title, required this.body, required this.data});
  final int id;
  final String key;
  final String group;
  final String title;
  final String body;
  final Map<String, dynamic> data;

  static int _seq = 0;

  /// Null when there's nothing to show or [skip] says you're already looking at it.
  static LiveBanner? from(Map<String, dynamic> d, {bool Function(Map<String, dynamic> data)? skip}) {
    final title = '${d['title'] ?? ''}';
    if (title.isEmpty) return null;
    final data = d['data'] is Map ? Map<String, dynamic>.from(d['data'] as Map) : <String, dynamic>{};
    if (skip?.call(data) ?? false) return null;
    return LiveBanner(id: ++_seq, key: '${d['key'] ?? ''}', group: '${d['group'] ?? ''}', title: title, body: '${d['body'] ?? ''}', data: data);
  }
}

/// The banner queue (web: stores/banners.ts): one at a time for
/// [showFor], at most 3 waiting; a newer one about the same thing (another
/// message from Sara) replaces the waiting one.
class LiveBanners extends ChangeNotifier {
  LiveBanners({this.showFor = const Duration(seconds: 5)});

  final Duration showFor;
  LiveBanner? _current;
  final List<LiveBanner> _queue = [];
  Timer? _timer;
  StreamSubscription<Map<String, dynamic>>? _sub;

  LiveBanner? get current => _current;
  int get waiting => _queue.length;

  /// Listens to the socket. [skip]: you're already looking at it (that chat).
  void start(RealtimeClient rt, {bool Function(Map<String, dynamic> data)? skip}) {
    _sub?.cancel();
    _sub = rt.on(Ev.notificationShow).listen((d) {
      final b = LiveBanner.from(d, skip: skip);
      if (b != null) push(b);
    });
  }

  void push(LiveBanner b) {
    if (_current == null) {
      _current = b;
      _timer?.cancel();
      _timer = Timer(showFor, dismiss);
      notifyListeners();
      return;
    }
    _queue.removeWhere((q) => q.key == b.key && q.data['friendId'] == b.data['friendId']);
    _queue.add(b);
    if (_queue.length > 3) _queue.removeAt(0);
  }

  void dismiss() {
    _timer?.cancel();
    _current = _queue.isEmpty ? null : _queue.removeAt(0);
    if (_current != null) _timer = Timer(showFor, dismiss);
    notifyListeners();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _sub?.cancel();
    super.dispose();
  }
}
