part of 'session_provider.dart';

/// Server mode: e-mailed code sign-in, tokens in the keystore, profile on the API.
class RemoteSessionProvider extends SessionProvider {
  RemoteSessionProvider(this._api) : super.base() {
    _api.onSessionExpired = () {
      _me = null;
      _onboarded = false;
      notifyListeners();
    };
  }

  final ApiClient _api;
  String? _inviteCode;

  @override
  String? get inviteCode => _inviteCode;

  void _applyMe(Map<String, dynamic> m) {
    _me = ApiMap.profile(m);
    _onboarded = m['onboarded'] as bool? ?? false;
    _inviteCode = m['inviteCode'] as String?;
    _emailUpdates = m['marketingEmails'] as bool? ?? true;
  }

  @override
  Future<void> restore() async {
    try {
      await _api.restore();
      if (_api.hasSession) {
        try {
          _applyMe(Map<String, dynamic>.from(await _api.get('/me') as Map));
        } on ApiException catch (e) {
          if (e.isUnauthenticated) await _api.clearSession();
          // Offline at launch: stay signed out of the UI until we can reach the server.
        }
      }
      await refreshPermissions();
    } finally {
      _booting = false;
      notifyListeners();
    }
  }

  @override
  Future<void> requestCode(String email) => _busyWhile(() => _api.post('/auth/otp/request', {'email': email.trim().toLowerCase()}));

  @override
  Future<void> signIn({required String method, String? email, String? code}) => _busyWhile(() async {
    final Map res;
    if (method == 'email') {
      res = await _api.post('/auth/otp/verify', {'email': email?.trim().toLowerCase(), 'code': code}) as Map;
    } else {
      // Debug builds sign in with a dev token; release builds pass the
      // ID token from google_sign_in / sign_in_with_apple here.
      res = await _api.post('/auth/social', {'provider': method, 'idToken': 'dev:$method-${ApiClient.newIdempotencyKey().substring(0, 12)}'}) as Map;
    }
    await _api.setTokens(Map<String, dynamic>.from(res['tokens'] as Map));
    _applyMe(Map<String, dynamic>.from(res['user'] as Map));
  });

  @override
  Future<void> saveProfile(Profile p) async {
    final res = await _api.patch('/me', {
      'name': p.name,
      'age': p.age,
      'gender': ApiMap.genderOut(p.gender),
      'countryCode': p.country.code,
      'bio': p.bio,
      'interests': p.interests,
      if (p.avatarUrl.isNotEmpty) 'avatarUrl': p.avatarUrl,
    });
    _applyMe(Map<String, dynamic>.from(res as Map));
    notifyListeners();
  }

  @override
  Future<void> finishOnboarding() async {
    _applyMe(Map<String, dynamic>.from(await _api.post('/me/onboarding/complete') as Map));
    notifyListeners();
  }

  @override
  Future<bool> verifySelfie() => _busyWhile(() async {
    try {
      _applyMe(Map<String, dynamic>.from(await _api.post('/me/verification') as Map));
      return _me?.verified ?? false;
    } on ApiException {
      return false;
    }
  });

  @override
  Future<bool> setEmailUpdates(bool on) async {
    final before = _emailUpdates;
    _emailUpdates = on;
    notifyListeners();
    try {
      _applyMe(Map<String, dynamic>.from(await _api.patch('/me', {'marketingEmails': on}) as Map));
      notifyListeners();
      return true;
    } on ApiException catch (_) {
      _emailUpdates = before;
      notifyListeners();
      return false;
    }
  }

  @override
  Future<void> refreshMe() async {
    if (!_api.hasSession) return;
    try {
      _applyMe(Map<String, dynamic>.from(await _api.get('/me') as Map));
      notifyListeners();
    } on ApiException catch (_) {}
  }

  /// The server counts matches and likes itself; just re-read.
  @override
  void bumpStats({int matches = 0, int likes = 0}) => refreshMe();

  @override
  Future<void> signOut() async {
    final t = await _api.tokens.read();
    if (t != null) {
      try {
        await _api.post('/auth/logout', {'refreshToken': t.refresh});
      } on ApiException catch (_) {}
    }
    await _api.clearSession();
    _me = null;
    _onboarded = false;
    notifyListeners();
  }
}
