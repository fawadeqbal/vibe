import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../core/api/api_client.dart';
import '../../core/config/integrations_config.dart';
import 'push_route.dart';

/// Push notifications. [FirebasePush] when the Firebase options are set,
/// [NoPush] otherwise (everything still works; the app just isn't woken up).
abstract class PushService {
  bool get enabled;

  /// App start (not awaited: never delays the first frame). Never throws.
  Future<void> init();

  /// After sign-in: ask permission, register this device's token.
  Future<void> register(ApiClient api);

  /// Before sign-out (while the session still works): forget this device.
  Future<void> unregister(ApiClient api);

  /// Notification taps while the app runs (or resumes from background).
  Stream<PushRoute> get taps;

  /// The tap that launched the app, once.
  PushRoute? takeLaunchRoute();
}

class NoPush implements PushService {
  @override
  bool get enabled => false;
  @override
  Future<void> init() async {}
  @override
  Future<void> register(ApiClient api) async {}
  @override
  Future<void> unregister(ApiClient api) async {}
  @override
  Stream<PushRoute> get taps => const Stream.empty();
  @override
  PushRoute? takeLaunchRoute() => null;
}

/// Firebase Cloud Messaging, initialised from `--dart-define`s (no
/// google-services.json / GoogleService-Info.plist). Notification channels
/// are created natively in `MainActivity.kt`.
class FirebasePush implements PushService {
  FirebasePush(this.config, {TargetPlatform? platform}) : platform = platform ?? defaultTargetPlatform;

  final IntegrationsConfig config;
  final TargetPlatform platform;
  bool _ready = false;
  String? _token;
  PushRoute? _launch;
  StreamSubscription<String>? _refresh;
  StreamSubscription<RemoteMessage>? _opened;
  final _taps = StreamController<PushRoute>.broadcast();

  @override
  bool get enabled => _ready;

  @override
  Stream<PushRoute> get taps => _taps.stream;

  @override
  PushRoute? takeLaunchRoute() {
    final r = _launch;
    _launch = null;
    return r;
  }

  FirebaseOptions get _options {
    final f = config.firebase;
    return FirebaseOptions(
      apiKey: f.apiKey,
      appId: f.appIdFor(platform),
      messagingSenderId: f.messagingSenderId,
      projectId: f.projectId,
      storageBucket: f.storageBucket.isEmpty ? null : f.storageBucket,
      iosBundleId: f.iosBundleId.isEmpty ? null : f.iosBundleId,
    );
  }

  @override
  Future<void> init() async {
    if (!config.firebase.isConfigured(platform)) return;
    try {
      if (Firebase.apps.isEmpty) await Firebase.initializeApp(options: _options);
      final m = FirebaseMessaging.instance;
      _opened = FirebaseMessaging.onMessageOpenedApp.listen((msg) {
        final r = PushRoute.fromData(msg.data);
        if (r != null) _taps.add(r);
      });
      _ready = true;
      final initial = await m.getInitialMessage();
      final route = initial == null ? null : PushRoute.fromData(initial.data);
      if (route != null) {
        // Init runs in the background: hand the launch tap to whoever is
        // already listening, else keep it for [takeLaunchRoute].
        if (_taps.hasListener) {
          _taps.add(route);
        } else {
          _launch = route;
        }
      }
    } catch (e) {
      debugPrint('push: Firebase init failed: $e');
    }
  }

  @override
  Future<void> register(ApiClient api) async {
    if (!_ready) return;
    try {
      final m = FirebaseMessaging.instance;
      // Android 13+ shows the POST_NOTIFICATIONS prompt; iOS the system prompt.
      final s = await m.requestPermission(alert: true, badge: true, sound: true);
      if (s.authorizationStatus == AuthorizationStatus.denied) return;
      if (platform == TargetPlatform.iOS) {
        // getToken needs the APNs token first; it can take a moment after launch.
        for (var i = 0; i < 10 && await m.getAPNSToken() == null; i++) {
          await Future<void>.delayed(const Duration(seconds: 1));
        }
      }
      final token = await m.getToken();
      if (token == null) return;
      await _send(api, token);
      _refresh ??= m.onTokenRefresh.listen((t) => _send(api, t));
    } catch (e) {
      debugPrint('push: register failed: $e');
    }
  }

  Future<void> _send(ApiClient api, String token) async {
    String? version;
    try {
      version = (await PackageInfo.fromPlatform()).version;
    } catch (_) {}
    final locale = PlatformDispatcher.instance.locale.toLanguageTag();
    await api.post('/me/push-tokens', {
      'token': token,
      'platform': platform == TargetPlatform.iOS ? 'ios' : 'android',
      if (version != null && version.isNotEmpty) 'appVersion': version.length > 32 ? version.substring(0, 32) : version,
      if (locale.length >= 2 && locale.length <= 16) 'locale': locale,
    });
    _token = token;
  }

  @override
  Future<void> unregister(ApiClient api) async {
    await _refresh?.cancel();
    _refresh = null;
    final t = _token;
    _token = null;
    if (t == null) return;
    try {
      await api.delete('/me/push-tokens/${Uri.encodeComponent(t)}');
    } catch (_) {}
  }

  void dispose() {
    _opened?.cancel();
    _refresh?.cancel();
    _taps.close();
  }
}
