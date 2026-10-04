part of 'session_provider.dart';

/// The offline mock: any e-mail and any 4-digit code sign you in.
class LocalSessionProvider extends SessionProvider {
  LocalSessionProvider(this._backend) : super.base();

  final MockBackend _backend;

  @override
  Future<void> restore() async {
    try {
      await _backend.init();
      _me = await _backend.restoreProfile();
      _onboarded = _backend.onboarded;
      await refreshPermissions();
    } finally {
      _booting = false;
      notifyListeners();
    }
  }

  @override
  Future<void> requestCode(String email) async {}

  @override
  Future<void> signIn({required String method, String? email, String? code}) => _busyWhile(() async => _me = await _backend.signIn(method: method, email: email));

  @override
  Future<void> saveProfile(Profile p) async {
    _me = p;
    await _backend.saveProfile(p);
    notifyListeners();
  }

  @override
  Future<void> finishOnboarding() async {
    _onboarded = true;
    await _backend.setOnboarded(true);
    notifyListeners();
  }

  /// Mocked selfie verification: grants the badge after a short "review".
  @override
  Future<bool> verifySelfie() async {
    if (_me == null) return false;
    return _busyWhile(() async {
      final ok = await _backend.verifySelfie();
      if (ok) await saveProfile(_me!.copyWith(verified: true));
      return ok;
    });
  }

  @override
  Future<bool> setEmailUpdates(bool on) async {
    _emailUpdates = on;
    notifyListeners();
    return true;
  }

  @override
  void bumpStats({int matches = 0, int likes = 0}) {
    if (_me == null) return;
    _me = _me!.copyWith(matches: _me!.matches + matches, likes: _me!.likes + likes);
    _backend.saveProfile(_me!);
    notifyListeners();
  }

  @override
  Future<void> signOut() async {
    await _backend.signOut();
    _me = null;
    _onboarded = false;
    notifyListeners();
  }
}
