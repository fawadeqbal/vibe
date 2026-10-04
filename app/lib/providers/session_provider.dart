import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/mock/mock_backend.dart';
import '../models/models.dart';

part 'session_provider_local.dart';
part 'session_provider_remote.dart';

/// Who is signed in, and how far through first-run they are.
///
/// Flow: splash (restore) → welcome → sign-in → profile setup → permissions
/// → home. `onboarded` flips only when the profile is complete enough to
/// match (name, age, gender) and the permission step was passed.
///
/// [LocalSessionProvider] is the offline mock; [RemoteSessionProvider]
/// signs in against the Vibe API (e-mailed code, tokens kept in the keystore).
abstract class SessionProvider extends ChangeNotifier {
  SessionProvider.base();

  factory SessionProvider(MockBackend backend) = LocalSessionProvider;

  Profile? _me;
  bool _booting = true;
  bool _onboarded = false;
  bool _busy = false;
  bool _cameraGranted = false;
  bool _micGranted = false;
  bool _emailUpdates = true;

  Profile? get me => _me;
  bool get booting => _booting;
  bool get signedIn => _me != null;
  bool get onboarded => _onboarded;
  bool get busy => _busy;
  bool get cameraGranted => _cameraGranted;
  bool get micGranted => _micGranted;
  bool get permissionsGranted => _cameraGranted && _micGranted;

  /// News and offers by e-mail. Sign-in codes and important account notices
  /// arrive either way.
  bool get emailUpdates => _emailUpdates;

  /// True once the profile has the three things the matcher needs.
  bool get profileReady => _me != null && _me!.name.trim().isNotEmpty && _me!.age >= 18;

  /// Server mode only: the code to share in invite links.
  String? get inviteCode => null;

  Future<void> restore();

  /// E-mails the sign-in code (no-op in the mock: any 4 digits work).
  Future<void> requestCode(String email);

  /// `method`: 'email' (with [email] and [code]), 'google' or 'apple'.
  Future<void> signIn({required String method, String? email, String? code});

  Future<void> saveProfile(Profile p);

  Future<void> finishOnboarding();

  Future<bool> verifySelfie();

  /// False when the change could not be saved (the switch flips back).
  Future<bool> setEmailUpdates(bool on);

  /// Re-reads the profile (counts change after matches).
  Future<void> refreshMe() async {}

  void bumpStats({int matches = 0, int likes = 0});

  Future<void> signOut();

  Future<void> refreshPermissions() async {
    try {
      _cameraGranted = await Permission.camera.isGranted;
      _micGranted = await Permission.microphone.isGranted;
    } catch (_) {
      // Desktop / web / test: no permission plugin. Treat as granted so the
      // flow can be walked through.
      _cameraGranted = true;
      _micGranted = true;
    }
    notifyListeners();
  }

  Future<bool> requestPermissions() async {
    try {
      final results = await [Permission.camera, Permission.microphone].request();
      _cameraGranted = results[Permission.camera]?.isGranted ?? false;
      _micGranted = results[Permission.microphone]?.isGranted ?? false;
    } catch (_) {
      _cameraGranted = true;
      _micGranted = true;
    }
    notifyListeners();
    return permissionsGranted;
  }

  Future<T> _busyWhile<T>(Future<T> Function() fn) async {
    _busy = true;
    notifyListeners();
    try {
      return await fn();
    } finally {
      _busy = false;
      notifyListeners();
    }
  }
}
