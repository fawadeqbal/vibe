part of 'session_provider.dart';

/// The offline mock: any e-mail and any 4-digit code sign you in.
class LocalSessionProvider extends SessionProvider {
  LocalSessionProvider(this._backend, {super.invites}) : super.base();

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
  Future<void> signIn({required String method, String? email, String? code}) => _busyWhile(() async {
        final extra = await _signUpFields();
        _me = await _backend.signIn(method: method, email: email);
        // Like the server: a known code makes the referral at sign-up; with
        // none (or an unknown one) "Have an invite code?" shows for 48 h.
        final known = MockData.inviteCodes[extra['inviteCode']];
        _invitedBy = known == null ? null : InvitedBy(name: known.$1);
        _referralClaimable = known == null;
        await invites?.consumed();
      });

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

  /// Offline demo: one turn and one other move, like the server.
  @override
  Future<LivenessChallenge> verificationChallenge() async {
    final r = Random();
    final turn = r.nextBool() ? LivenessStep.turnLeft : LivenessStep.turnRight;
    final others = LivenessStep.values.where((s) => s != turn).toList();
    final other = others[r.nextInt(others.length)];
    return LivenessChallenge(id: 'local-${DateTime.now().microsecondsSinceEpoch}', steps: r.nextBool() ? [turn, other] : [other, turn]);
  }

  /// Mocked selfie verification: grants the badge after a short "review".
  @override
  Future<VerificationState> verifySelfie(SelfieCheck check) async {
    if (_me == null) return VerificationState.none;
    return _busyWhile(() async {
      final ok = await _backend.verifySelfie();
      if (ok) await saveProfile(_me!.copyWith(verified: true));
      _verification = VerificationState(ok ? VerificationStatus.approved : VerificationStatus.rejected, reason: ok ? null : 'Try again in good light.');
      return _verification;
    });
  }

  // ── social sign-in (mock: any provider signs straight in) ─────────────

  final List<LinkedIdentity> _identities = [];

  @override
  Future<List<String>> socialProviders() async => const ['google', 'apple'];

  @override
  Future<void> signInWith(SocialCredential credential) async {
    await signIn(method: credential.provider);
    _identities
      ..clear()
      ..add(LinkedIdentity(provider: credential.provider, linkedAt: DateTime.now()));
  }

  @override
  Future<IdentitiesView> identities() async => IdentitiesView(email: 'you@example.com', identities: List.of(_identities), available: const ['google', 'apple', 'facebook']);

  @override
  Future<IdentitiesView> linkIdentity(SocialCredential c) async {
    if (!_identities.any((i) => i.provider == c.provider)) _identities.add(LinkedIdentity(provider: c.provider, linkedAt: DateTime.now()));
    return identities();
  }

  @override
  Future<IdentitiesView> unlinkIdentity(String provider) async {
    _identities.removeWhere((i) => i.provider == provider);
    return identities();
  }

  /// The mock keeps no files: a new photo is a fresh stock portrait.
  @override
  Future<void> uploadAvatar(List<int> bytes, {String contentType = 'image/jpeg'}) async {
    if (_me == null) return;
    await saveProfile(_me!.copyWith(avatarUrl: 'https://i.pravatar.cc/400?img=${1 + DateTime.now().millisecond % 70}'));
  }

  @override
  Future<bool> setEmailUpdates(bool on) async {
    _emailUpdates = on;
    notifyListeners();
    return true;
  }

  @override
  Future<bool> saveWellbeing(WellbeingSettings w) async {
    _wellbeing = WellbeingSettings(quietHoursStart: w.quietHoursStart, quietHoursEnd: w.quietHoursEnd, breakReminderMinutes: w.breakReminderMinutes, tzOffsetMinutes: SessionProvider.deviceTzOffsetMinutes());
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
    await _runSignOutHooks();
    _identities.clear();
    _verification = VerificationState.none;
    _wellbeing = const WellbeingSettings();
    _invitedBy = null;
    _referralClaimable = false;
    await _backend.signOut();
    _me = null;
    _onboarded = false;
    notifyListeners();
  }
}
