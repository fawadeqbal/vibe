import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_facebook_auth/flutter_facebook_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../../core/config/integrations_config.dart';
import '../../models/payments.dart';
import 'nonce.dart';

/// A provider SDK reported an error (not a cancel).
class SocialSignInException implements Exception {
  SocialSignInException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Google / Apple / Facebook on the device → a [SocialCredential] the Vibe
/// server verifies. `null` from [signIn] means the person cancelled.
abstract class SocialSignIn {
  /// This build can run the provider's real SDK on this device.
  bool canUse(String provider);

  /// Debug builds: a server in dev mode accepts `dev:<subject>:<name>` tokens,
  /// so providers without app keys can still be tried.
  bool get allowsDev;

  Future<SocialCredential?> signIn(String provider);

  /// A dev token credential (only when [allowsDev]).
  SocialCredential devCredential(String provider);

  /// Forget SDK sessions so the next sign-in shows the account picker.
  Future<void> signOut();
}

/// Which buttons to show: providers the server offers AND this build can run
/// (or, in debug, can fake). Order follows [server].
List<String> visibleProviders({required List<String> server, required SocialSignIn social}) =>
    [for (final p in server) if (social.canUse(p) || social.allowsDev) p];

class NoSocialSignIn implements SocialSignIn {
  const NoSocialSignIn();
  @override
  bool canUse(String provider) => false;
  @override
  bool get allowsDev => false;
  @override
  Future<SocialCredential?> signIn(String provider) async => null;
  @override
  SocialCredential devCredential(String provider) => throw UnsupportedError('No dev sign-in in this build');
  @override
  Future<void> signOut() async {}
}

/// The real SDKs, switched on by [IntegrationsConfig].
class PlatformSocialSignIn implements SocialSignIn {
  PlatformSocialSignIn(this.config, {TargetPlatform? platform, bool? allowDev, Random? random})
      : platform = platform ?? defaultTargetPlatform,
        allowsDev = allowDev ?? kDebugMode,
        _rnd = random ?? Random.secure();

  final IntegrationsConfig config;
  final TargetPlatform platform;
  @override
  final bool allowsDev;
  final Random _rnd;
  Future<void>? _googleReady;

  bool get _ios => platform == TargetPlatform.iOS;

  @override
  bool canUse(String provider) => config.socialConfigured(provider, platform);

  @override
  SocialCredential devCredential(String provider) {
    if (!allowsDev) throw UnsupportedError('Dev sign-in is for debug builds only');
    final subject = List.generate(12, (_) => _rnd.nextInt(16).toRadixString(16)).join();
    return SocialCredential(provider: provider, idToken: 'dev:$provider-$subject:Dev ${socialProviderLabel(provider)} user');
  }

  @override
  Future<SocialCredential?> signIn(String provider) {
    if (!canUse(provider)) {
      if (allowsDev) return Future.value(devCredential(provider));
      throw SocialSignInException('${socialProviderLabel(provider)} sign-in is not set up in this build.');
    }
    return switch (provider) {
      'google' => _google(),
      'apple' => _apple(),
      'facebook' => _facebook(),
      _ => throw SocialSignInException('Unknown sign-in provider'),
    };
  }

  Future<SocialCredential?> _google() async {
    final g = GoogleSignIn.instance;
    // google_sign_in 7: initialize exactly once. serverClientId = the Web
    // client id, which becomes the ID token audience the server checks.
    _googleReady ??= g.initialize(clientId: _ios ? config.google.iosClientId : null, serverClientId: config.google.serverClientId);
    await _googleReady;
    if (!g.supportsAuthenticate()) throw SocialSignInException('Google sign-in is not supported here.');
    try {
      final account = await g.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null) throw SocialSignInException('Google did not return an ID token. Check GOOGLE_SERVER_CLIENT_ID.');
      return SocialCredential(provider: 'google', idToken: idToken, name: account.displayName);
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled || e.code == GoogleSignInExceptionCode.interrupted) return null;
      throw SocialSignInException(e.description ?? 'Google sign-in failed (${e.code.name}).');
    }
  }

  Future<SocialCredential?> _apple() async {
    final raw = Nonce.generate(32, _rnd);
    try {
      final c = await SignInWithApple.getAppleIDCredential(
        scopes: [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName],
        nonce: Nonce.sha256Hex(raw),
        // Android has no native Apple sheet: Apple's web flow with our Services ID.
        webAuthenticationOptions: _ios ? null : WebAuthenticationOptions(clientId: config.apple.serviceId, redirectUri: Uri.parse(config.apple.redirectUri)),
      );
      final name = [c.givenName, c.familyName].whereType<String>().where((s) => s.trim().isNotEmpty).join(' ');
      if (c.identityToken == null) throw SocialSignInException('Apple did not return an identity token.');
      // Apple shares the name only on the very first sign-in: pass it on.
      return SocialCredential(provider: 'apple', idToken: c.identityToken, authorizationCode: c.authorizationCode, nonce: raw, name: name.isEmpty ? null : name);
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) return null;
      throw SocialSignInException(e.message.isEmpty ? 'Sign in with Apple failed.' : e.message);
    }
  }

  Future<SocialCredential?> _facebook() async {
    final raw = Nonce.generate(32, _rnd);
    // iOS: Limited Login (an OIDC token, no tracking permission needed).
    // Android: classic login (an access token the server checks with Graph).
    final r = await FacebookAuth.instance.login(
      permissions: const ['public_profile', 'email'],
      loginTracking: _ios ? LoginTracking.limited : LoginTracking.enabled,
      nonce: _ios ? Nonce.sha256Hex(raw) : null,
    );
    switch (r.status) {
      case LoginStatus.cancelled:
        return null;
      case LoginStatus.failed:
      case LoginStatus.operationInProgress:
        throw SocialSignInException(r.message ?? 'Facebook login failed.');
      case LoginStatus.success:
        final t = r.accessToken;
        if (t is LimitedToken) return SocialCredential(provider: 'facebook', idToken: t.tokenString, nonce: raw, name: t.userName);
        if (t != null) return SocialCredential(provider: 'facebook', accessToken: t.tokenString);
        throw SocialSignInException('Facebook did not return a token.');
    }
  }

  @override
  Future<void> signOut() async {
    if (_googleReady != null) {
      try {
        await GoogleSignIn.instance.signOut();
      } catch (_) {}
    }
    if (canUse('facebook')) {
      try {
        await FacebookAuth.instance.logOut();
      } catch (_) {}
    }
  }
}
