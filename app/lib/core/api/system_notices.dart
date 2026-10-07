import 'dart:async';

import 'package:flutter/material.dart';
import 'package:solar_icons/solar_icons.dart';

import '../theme/vibe_theme.dart';
import 'api_client.dart';
import 'realtime_client.dart';

/// Messages from the Vibe team, shown as a banner at the bottom:
/// announcements (published in the admin panel), messages sent to this
/// person from Messages (also kept in Chats → Messages from Vibe), and
/// moderation warnings.
/// Server mode only; the offline mock has none.
class SystemNotices {
  SystemNotices(this._api, this._rt, this._messenger);

  final ApiClient _api;
  final RealtimeClient _rt;
  final GlobalKey<ScaffoldMessengerState> _messenger;
  final _seen = <String>{};
  final _subs = <StreamSubscription<dynamic>>[];

  void start() {
    _subs
      ..add(_rt.on(Ev.announcement).listen(_showAnnouncement))
      ..add(_rt.on(Ev.inboxMessage).listen((d) => _show(
            icon: SolarIconsBold.letterUnread,
            color: V.pinkSoft,
            title: '${d['title'] ?? ''}',
            body: 'New message from the Vibe team — open Chats to read it.',
            seconds: 8,
          )))
      ..add(_rt.on(Ev.accountWarning).listen((d) => _show(
            icon: SolarIconsBold.dangerTriangle,
            color: V.gold,
            title: 'A message from the Vibe team',
            body: '${d['message'] ?? ''}',
            seconds: 10,
          )));
  }

  /// After sign-in: the newest live announcement, if this run hasn't shown it.
  Future<void> catchUp() async {
    try {
      final list = await _api.get('/announcements') as List;
      if (list.isNotEmpty) _showAnnouncement(Map<String, dynamic>.from(list.first as Map));
    } catch (_) {
      // Announcements are nice-to-have; never block the app on them.
    }
  }

  void stop() {
    for (final s in _subs) {
      s.cancel();
    }
    _subs.clear();
  }

  void _showAnnouncement(Map<String, dynamic> a) {
    final id = '${a['id']}';
    if (!_seen.add(id)) return;
    _show(icon: SolarIconsBold.handMoney, color: V.lavender, title: '${a['title'] ?? ''}', body: '${a['body'] ?? ''}', seconds: 8);
  }

  void _show({required IconData icon, required Color color, required String title, required String body, required int seconds}) {
    final m = _messenger.currentState;
    if (m == null) return;
    m.hideCurrentSnackBar();
    m.showSnackBar(SnackBar(
      behavior: SnackBarBehavior.floating,
      duration: Duration(seconds: seconds),
      content: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(title, style: VT.title(14, weight: FontWeight.w600)),
                if (body.isNotEmpty) ...[const SizedBox(height: 2), Text(body, style: VT.body(13, color: V.text2, height: 1.35))],
              ],
            ),
          ),
        ],
      ),
      action: SnackBarAction(label: 'OK', textColor: V.pinkSoft, onPressed: () {}),
    ));
  }
}
