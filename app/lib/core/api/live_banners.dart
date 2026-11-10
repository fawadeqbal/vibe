import 'dart:async';

import 'package:flutter/foundation.dart';

import 'realtime_client.dart';

/// One live notification while you're in the app (`notification:show`):
/// the server sends it instead of a push while you're using Vibe.
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

/// The live notifications stacked at the top (web: stores/banners.ts),
/// newest first. Nothing goes away by itself or because another came: each
/// stays until it's tapped, closed, cleared, or what it's about is opened.
class LiveBanners extends ChangeNotifier {
  /// Kept at most (the oldest beyond this go; they're all on the Notifications page anyway).
  static const max = 20;

  final List<LiveBanner> _items = [];
  StreamSubscription<Map<String, dynamic>>? _sub;

  /// Newest first.
  List<LiveBanner> get items => List.unmodifiable(_items);

  /// Listens to the socket. [skip]: you're already looking at it (that chat).
  void start(RealtimeClient rt, {bool Function(Map<String, dynamic> data)? skip}) {
    _sub?.cancel();
    _sub = rt.on(Ev.notificationShow).listen((d) {
      final b = LiveBanner.from(d, skip: skip);
      if (b != null) push(b);
    });
  }

  void push(LiveBanner b) {
    _items.insert(0, b);
    if (_items.length > max) _items.removeRange(max, _items.length);
    notifyListeners();
  }

  void dismiss(LiveBanner b) {
    if (_items.remove(b)) notifyListeners();
  }

  /// Opened what some of them are about (that chat): those are read.
  void dismissWhere(bool Function(LiveBanner b) test) {
    final before = _items.length;
    _items.removeWhere(test);
    if (_items.length != before) notifyListeners();
  }

  void clear() {
    if (_items.isEmpty) return;
    _items.clear();
    notifyListeners();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
