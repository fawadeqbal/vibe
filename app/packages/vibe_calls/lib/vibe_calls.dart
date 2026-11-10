import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Vibe's Android call plumbing (`vibe/calls`): the incoming-call screen
/// over the lock screen, which works from the push's background isolate so
/// a call rings with Vibe closed and Vibe itself opens only on Answer; and
/// the proximity sensor for calls on the earpiece. Every call is a no-op
/// (false / null) off Android or when the native side isn't there.
class VibeCalls {
  VibeCalls._();

  static const _channel = MethodChannel('vibe/calls');
  static final _answered = StreamController<({String callId, String payload})>.broadcast();
  static bool _listening = false;

  static bool get supported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  /// The notification id of a call: the same as the native side (FNV-1a, 31 bits).
  static int notificationId(String callId) {
    var h = 0x811c9dc5;
    for (final c in callId.codeUnits) {
      h ^= c;
      h = (h * 0x01000193) & 0xffffffff;
    }
    return h & 0x7fffffff;
  }

  /// Rings: the call notification and the full-screen call screen. False when
  /// it couldn't (no permission, an old phone): draw something else then.
  static Future<bool> showIncoming({
    required String callId,
    required String name,
    required String avatar,
    required bool video,
    required DateTime expiresAt,
    required String to,
    required String ack,
    required String restBase,
    required String payload,
  }) async {
    if (!supported) return false;
    try {
      final ok = await _channel.invokeMethod<bool>('show', {
        'callId': callId,
        'name': name,
        'avatar': avatar,
        'video': video,
        'expiresAt': expiresAt.millisecondsSinceEpoch,
        'to': to,
        'ack': ack,
        'restBase': restBase,
        'payload': payload,
      });
      return ok ?? false;
    } catch (_) {
      return false;
    }
  }

  /// The call is over however it ended: the ring stops; a call screen on it
  /// says why for a moment ([reason]: cancelled, no_answer, declined,
  /// accepted) and closes.
  static Future<void> stop(String callId, {String? reason}) async {
    if (!supported) return;
    try {
      await _channel.invokeMethod<void>('stop', {'callId': callId, 'reason': reason});
    } catch (_) {}
  }

  /// The call answered on the call screen that opened Vibe, once (then null):
  /// its id and the push data (JSON) it rang with.
  static Future<({String callId, String payload})?> takeAnswered() async {
    if (!supported) return null;
    try {
      final m = await _channel.invokeMapMethod<String, dynamic>('takeAnswered');
      final id = m?['callId'] as String?;
      return id == null ? null : (callId: id, payload: (m?['payload'] as String?) ?? '');
    } catch (_) {
      return null;
    }
  }

  /// A call answered on the call screen while Vibe was already running.
  static Stream<({String callId, String payload})> get answered {
    if (!_listening && supported) {
      _listening = true;
      _channel.setMethodCallHandler((call) async {
        if (call.method == 'answered') {
          final id = await takeAnswered();
          if (id != null) _answered.add(id);
        }
      });
    }
    return _answered.stream;
  }

  /// Screen off at your ear (earpiece voice calls). False without a sensor.
  static Future<bool> proximity(bool on) async {
    if (!supported) return false;
    try {
      return await _channel.invokeMethod<bool>('proximity', {'on': on}) ?? false;
    } catch (_) {
      return false;
    }
  }
}
