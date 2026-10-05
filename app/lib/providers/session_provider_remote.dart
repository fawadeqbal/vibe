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
  Future<void> signIn({required String method, String? email, String? code}) {
    if (method != 'email') {
      // A server in dev mode accepts dev tokens; real tokens come through [signInWith].
      return signInWith(SocialCredential(provider: method, idToken: 'dev:$method-${ApiClient.newIdempotencyKey().substring(0, 12)}'));
    }
    return _busyWhile(() async => _signedIn(await _api.post('/auth/otp/verify', {'email': email?.trim().toLowerCase(), 'code': code}) as Map));
  }

  @override
  Future<void> signInWith(SocialCredential credential) => _busyWhile(() async => _signedIn(await _api.post('/auth/social', credential.toJson()) as Map));

  Future<void> _signedIn(Map res) async {
    await _api.setTokens(Map<String, dynamic>.from(res['tokens'] as Map));
    _applyMe(Map<String, dynamic>.from(res['user'] as Map));
    _verification = VerificationState.none;
  }

  List<String>? _providers;

  @override
  Future<List<String>> socialProviders() async {
    try {
      final res = Map<String, dynamic>.from(await _api.get('/auth/providers') as Map);
      return _providers = [for (final p in (res['providers'] as List? ?? const [])) '$p'.toLowerCase()];
    } on ApiException catch (_) {
      return _providers ?? const [];
    }
  }

  @override
  Future<IdentitiesView> identities() async => IdentitiesView.fromJson(Map<String, dynamic>.from(await _api.get('/me/identities') as Map));

  @override
  Future<IdentitiesView> linkIdentity(SocialCredential c) async {
    final body = c.toJson()..remove('name');
    return IdentitiesView.fromJson(Map<String, dynamic>.from(await _api.post('/me/identities', body) as Map));
  }

  @override
  Future<IdentitiesView> unlinkIdentity(String provider) async => IdentitiesView.fromJson(Map<String, dynamic>.from(await _api.delete('/me/identities/$provider') as Map));

  @override
  Future<void> uploadAvatar(List<int> bytes, {String contentType = 'image/jpeg'}) async {
    final ext = switch (contentType) { 'image/png' => 'png', 'image/webp' => 'webp', _ => 'jpg' };
    _applyMe(Map<String, dynamic>.from(await _api.upload('/me/avatar', field: 'file', bytes: bytes, filename: 'avatar.$ext', contentType: contentType) as Map));
    notifyListeners();
  }

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
  Future<VerificationState> verifySelfie(List<int> jpeg) => _busyWhile(() async {
    try {
      final res = Map<String, dynamic>.from(await _api.upload('/me/verification', field: 'selfie', bytes: jpeg, filename: 'selfie.jpg', contentType: 'image/jpeg') as Map);
      _applyMe(res);
      _verification = VerificationState.fromJson(Map<String, dynamic>.from(res['verification'] as Map? ?? const {}));
    } on ApiException catch (e) {
      // A rejected selfie comes back as a 400 with the reason to show.
      if (e.code != 'VALIDATION_FAILED') rethrow;
      _verification = VerificationState(VerificationStatus.rejected, reason: e.message, at: DateTime.now());
    }
    return verification;
  });

  @override
  Future<void> loadVerification() async {
    if (!_api.hasSession) return;
    try {
      _verification = VerificationState.fromJson(Map<String, dynamic>.from(await _api.get('/me/verification') as Map));
      notifyListeners();
    } on ApiException catch (_) {}
  }

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
    await _runSignOutHooks();
    final t = await _api.tokens.read();
    if (t != null) {
      try {
        await _api.post('/auth/logout', {'refreshToken': t.refresh});
      } on ApiException catch (_) {}
    }
    await _api.clearSession();
    _me = null;
    _onboarded = false;
    _verification = VerificationState.none;
    notifyListeners();
  }
}
