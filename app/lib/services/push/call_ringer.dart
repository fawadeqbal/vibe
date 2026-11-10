import 'dart:convert';
import 'dart:ui' show DartPluginRegistrant;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;

import '../../core/api/api_config.dart';

/// Incoming calls with Vibe in the background or closed (Android): the
/// server sends the call as a data-only, high-priority push; this draws a
/// full-screen call notification (over the lock screen, or a heads-up
/// banner while the phone is in use) with the ringtone, Decline and Answer,
/// and tells the server the phone is ringing so the caller sees "Ringing"
/// instead of "Connecting". The missed-call push stops it.
///
/// Answer and a tap open the app, which loads the call from
/// `GET /calls/incoming` and shows it (Answer picks it up): [CallRinger.opened].
class CallRinger {
  CallRinger._();

  static final FlutterLocalNotificationsPlugin _n = FlutterLocalNotificationsPlugin();
  static bool _ready = false;

  /// The call notification opened (or resumed) the app: show the call; `answer` picks it up.
  static final ValueNotifier<({String callId, bool answer})?> opened = ValueNotifier(null);

  /// A tap on a missed call (its push data): the app opens your calls with them.
  static final ValueNotifier<Map<String, dynamic>?> tapped = ValueNotifier(null);

  static const _channel = AndroidNotificationChannel(
    'calls',
    'Calls',
    description: 'Friends calling you',
    importance: Importance.max,
    sound: UriAndroidNotificationSound('content://settings/system/ringtone'),
    audioAttributesUsage: AudioAttributesUsage.notificationRingtone,
  );
  static const _missedChannel = AndroidNotificationChannel('calls_missed', 'Missed calls', description: 'Calls you missed', importance: Importance.high);

  /// The notification id for a call (stable, so the missed call can stop it).
  static int idFor(String callId) => callId.hashCode & 0x7fffffff;

  static Future<void> init() async {
    if (_ready || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      await _n.initialize(
        settings: const InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher')),
        onDidReceiveNotificationResponse: _onResponse,
        onDidReceiveBackgroundNotificationResponse: onBackgroundResponse,
      );
      final android = _n.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      await android?.createNotificationChannel(_channel);
      await android?.createNotificationChannel(_missedChannel);
      _ready = true;
    } catch (e) {
      debugPrint('calls: notifications init failed: $e');
    }
  }

  /// The app was opened by Answer on a call notification (cold start).
  static Future<void> launchAction() async {
    if (!_ready) return;
    try {
      final d = await _n.getNotificationAppLaunchDetails();
      final r = d?.notificationResponse;
      if (d?.didNotificationLaunchApp == true && r != null) _onResponse(r);
    } catch (_) {}
  }

  static void _onResponse(NotificationResponse r) {
    final data = _decode(r.payload);
    final id = data['callId'];
    if (id == null) return;
    if (r.actionId == 'decline') {
      _post(data, 'decline');
      return;
    }
    if ((data['open'] ?? data['route']) == 'calls') {
      tapped.value = data;
      return;
    }
    // Answer, or a tap on the call: the app shows it (full screen) and Answer picks it up.
    opened.value = (callId: '$id', answer: r.actionId == 'answer');
  }

  /// A push arrived (in the background isolate, or in the app). Returns true when it was a call push.
  static Future<bool> handle(Map<String, dynamic> data, {bool foreground = false}) async {
    final open = data['open'] ?? data['route'];
    final callId = data['callId'] as String?;
    if (callId == null) return false;
    if (open == 'call') {
      // In the app the call shows itself (and says it's ringing over the socket).
      if (!foreground) await _ring(data);
      return true;
    }
    if (open == 'calls') {
      await init();
      await _n.cancel(id: idFor(callId));
      if (!foreground) {
        await _n.show(
          id: idFor(callId) + 1,
          title: data['title'] as String?,
          body: data['body'] as String?,
          notificationDetails: NotificationDetails(android: AndroidNotificationDetails(_missedChannel.id, _missedChannel.name, category: AndroidNotificationCategory.missedCall)),
          payload: jsonEncode(data),
        );
      }
      return true;
    }
    return false;
  }

  static Future<void> _ring(Map<String, dynamic> data) async {
    await init();
    final callId = data['callId'] as String;
    final ends = DateTime.tryParse('${data['expiresAt']}');
    final left = ends == null ? 30000 : ends.difference(DateTime.now()).inMilliseconds;
    if (left <= 0) return;
    final video = data['media'] != 'voice';
    final name = (data['callerName'] as String?)?.trim();
    await _n.show(
      id: idFor(callId),
      title: name == null || name.isEmpty ? 'Incoming call' : name,
      body: video ? 'Incoming video call · Vibe' : 'Incoming voice call · Vibe',
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.max,
          priority: Priority.max,
          category: AndroidNotificationCategory.call,
          fullScreenIntent: true,
          ongoing: true,
          autoCancel: false,
          visibility: NotificationVisibility.public,
          timeoutAfter: left,
          audioAttributesUsage: AudioAttributesUsage.notificationRingtone,
          // FLAG_INSISTENT: the ringtone keeps going until it's answered, declined or rings out.
          additionalFlags: Int32List.fromList(<int>[4]),
          actions: const [
            AndroidNotificationAction('decline', 'Decline', cancelNotification: true),
            AndroidNotificationAction('answer', 'Answer', showsUserInterface: true, cancelNotification: true),
          ],
        ),
      ),
      payload: jsonEncode(data),
    );
    // The caller's "Connecting" becomes "Ringing".
    await _post(data, 'ringing');
  }

  static Map<String, dynamic> _decode(String? payload) {
    if (payload == null || payload.isEmpty) return const {};
    try {
      return Map<String, dynamic>.from(jsonDecode(payload) as Map);
    } catch (_) {
      return const {};
    }
  }

  /// "Ringing" / "Decline" without a session (the push carries a token for this call).
  static Future<void> _post(Map<String, dynamic> data, String action) async {
    final callId = data['callId'], to = data['to'], t = data['ack'];
    if (callId == null || to == null || t == null) return;
    try {
      await http
          .post(
            Uri.parse('${ApiConfig.restBase}/calls/${Uri.encodeComponent('$callId')}/push-action'),
            headers: const {'Content-Type': 'application/json'},
            body: jsonEncode({'userId': to, 't': t, 'action': action}),
          )
          .timeout(const Duration(seconds: 10));
    } catch (e) {
      debugPrint('calls: $action failed: $e');
    }
  }

  /// Decline tapped with the app closed (runs in a background isolate).
  @pragma('vm:entry-point')
  static void onBackgroundResponse(NotificationResponse r) {
    final data = _decode(r.payload);
    if (r.actionId == 'decline') _post(data, 'decline');
  }
}

/// FCM data messages with Vibe in the background or closed (a separate isolate).
@pragma('vm:entry-point')
Future<void> vibeBackgroundPush(RemoteMessage message) async {
  WidgetsFlutterBinding.ensureInitialized();
  DartPluginRegistrant.ensureInitialized();
  await CallRinger.handle(message.data);
}
