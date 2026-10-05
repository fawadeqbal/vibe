import 'package:flutter/foundation.dart';

/// Every third-party key the app uses, read at build time:
///
///   flutter build apk --dart-define-from-file=.env
///
/// Nothing here is a secret (they all ship inside the app binary); server
/// secrets live in the backend's environment. Each integration says whether
/// it [isConfigured]; when it is not, the app hides or stubs that feature,
/// so a build with no keys at all still runs. See `INTEGRATIONS_APP.md`.
///
/// Tests build one with explicit values; the app uses [IntegrationsConfig.fromEnvironment].
@immutable
class IntegrationsConfig {
  const IntegrationsConfig({
    this.storeBuild = '',
    this.google = const GoogleSignInConfig(),
    this.apple = const AppleSignInConfig(),
    this.facebook = const FacebookConfig(),
    this.firebase = const FirebaseConfig(),
    this.ads = const AdsConfig(),
    this.debug = false,
  });

  /// From `--dart-define`s. In debug builds, AdMob falls back to Google's
  /// public test ad units so rewarded ads can be tried without an account.
  factory IntegrationsConfig.fromEnvironment() => const IntegrationsConfig(
        storeBuild: String.fromEnvironment('VIBE_STORE_BUILD'),
        google: GoogleSignInConfig(
          serverClientId: String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID'),
          iosClientId: String.fromEnvironment('GOOGLE_IOS_CLIENT_ID'),
        ),
        apple: AppleSignInConfig(
          serviceId: String.fromEnvironment('APPLE_SERVICE_ID'),
          redirectUri: String.fromEnvironment('APPLE_REDIRECT_URI'),
        ),
        facebook: FacebookConfig(
          appId: String.fromEnvironment('FACEBOOK_APP_ID'),
          clientToken: String.fromEnvironment('FACEBOOK_CLIENT_TOKEN'),
        ),
        firebase: FirebaseConfig(
          apiKey: String.fromEnvironment('FIREBASE_API_KEY'),
          projectId: String.fromEnvironment('FIREBASE_PROJECT_ID'),
          messagingSenderId: String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID'),
          androidAppId: String.fromEnvironment('FIREBASE_ANDROID_APP_ID'),
          iosAppId: String.fromEnvironment('FIREBASE_IOS_APP_ID'),
          iosBundleId: String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID'),
          storageBucket: String.fromEnvironment('FIREBASE_STORAGE_BUCKET'),
        ),
        ads: AdsConfig(
          rewardedAndroid: String.fromEnvironment('ADMOB_REWARDED_ANDROID'),
          rewardedIos: String.fromEnvironment('ADMOB_REWARDED_IOS'),
        ),
        debug: kDebugMode,
      );

  /// 'play' or 'appstore' when this binary is uploaded to that store (only
  /// store billing is offered there, per store rules); '' for side-loaded /
  /// direct builds. Sent to the server as `X-App-Store`.
  final String storeBuild;
  final GoogleSignInConfig google;
  final AppleSignInConfig apple;
  final FacebookConfig facebook;
  final FirebaseConfig firebase;
  final AdsConfig ads;

  /// Debug build: dev stand-ins (test ad units, dev sign-in tokens) are allowed.
  final bool debug;

  /// The `X-App-Store` header value, or null for a direct build.
  String? get appStoreHeader => storeBuild == 'play' || storeBuild == 'appstore' ? storeBuild : null;
  bool get isStoreBuild => appStoreHeader != null;

  /// The rewarded unit for [platform]: the configured one, else (debug only)
  /// Google's test unit, else null (ads off).
  String? rewardedUnit(TargetPlatform platform) {
    final configured = switch (platform) {
      TargetPlatform.android => ads.rewardedAndroid,
      TargetPlatform.iOS => ads.rewardedIos,
      _ => '',
    };
    if (configured.isNotEmpty) return configured;
    if (!debug) return null;
    return switch (platform) {
      TargetPlatform.android => AdsConfig.testRewardedAndroid,
      TargetPlatform.iOS => AdsConfig.testRewardedIos,
      _ => null,
    };
  }

  /// Whether the app can run a provider's native sign-in on [platform].
  bool socialConfigured(String provider, TargetPlatform platform) => switch (provider) {
        'google' => google.isConfigured(platform),
        'apple' => apple.isConfigured(platform),
        'facebook' => facebook.isConfigured(platform),
        _ => false,
      };
}

/// Google sign-in (google_sign_in 7). `serverClientId` is the **Web** OAuth
/// client id (the ID token's audience the server checks); iOS also needs its
/// own iOS client id (and its reversed id as a URL scheme, see Info.plist).
@immutable
class GoogleSignInConfig {
  const GoogleSignInConfig({this.serverClientId = '', this.iosClientId = ''});
  final String serverClientId;
  final String iosClientId;

  bool isConfigured(TargetPlatform p) => switch (p) {
        TargetPlatform.android => serverClientId.isNotEmpty,
        TargetPlatform.iOS => serverClientId.isNotEmpty && iosClientId.isNotEmpty,
        _ => false,
      };
}

/// Sign in with Apple. iOS uses the native sheet (needs only the Xcode
/// capability); Android uses Apple's web flow with a Services ID and a
/// redirect URI on the Vibe server.
@immutable
class AppleSignInConfig {
  const AppleSignInConfig({this.serviceId = '', this.redirectUri = ''});
  final String serviceId;
  final String redirectUri;

  bool isConfigured(TargetPlatform p) => switch (p) {
        TargetPlatform.iOS || TargetPlatform.macOS => true,
        TargetPlatform.android => serviceId.isNotEmpty && redirectUri.isNotEmpty,
        _ => false,
      };
}

/// Facebook Login. The same values must also reach the native side
/// (gradle properties / xcconfig) — the SDK reads them from the manifest/plist.
@immutable
class FacebookConfig {
  const FacebookConfig({this.appId = '', this.clientToken = ''});
  final String appId;
  final String clientToken;

  bool isConfigured(TargetPlatform p) => (p == TargetPlatform.android || p == TargetPlatform.iOS) && appId.isNotEmpty && clientToken.isNotEmpty;
}

/// Firebase (push only), from the values in the Firebase console's
/// "Project settings → Your apps" — no google-services.json needed.
@immutable
class FirebaseConfig {
  const FirebaseConfig({this.apiKey = '', this.projectId = '', this.messagingSenderId = '', this.androidAppId = '', this.iosAppId = '', this.iosBundleId = '', this.storageBucket = ''});
  final String apiKey;
  final String projectId;
  final String messagingSenderId;
  final String androidAppId;
  final String iosAppId;
  final String iosBundleId;
  final String storageBucket;

  String appIdFor(TargetPlatform p) => switch (p) {
        TargetPlatform.android => androidAppId,
        TargetPlatform.iOS => iosAppId,
        _ => '',
      };

  bool isConfigured(TargetPlatform p) => apiKey.isNotEmpty && projectId.isNotEmpty && messagingSenderId.isNotEmpty && appIdFor(p).isNotEmpty;
}

/// AdMob rewarded ad units. The AdMob *app* ids live natively (manifest /
/// Info.plist) and default to Google's public test app ids.
@immutable
class AdsConfig {
  const AdsConfig({this.rewardedAndroid = '', this.rewardedIos = ''});
  final String rewardedAndroid;
  final String rewardedIos;

  /// Google's official sample rewarded units (always fill, never pay).
  static const testRewardedAndroid = 'ca-app-pub-3940256099942544/5224354917';
  static const testRewardedIos = 'ca-app-pub-3940256099942544/1712485313';
}
