import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'core/api/api_client.dart';
import 'core/api/api_config.dart';
import 'core/api/realtime_client.dart';
import 'core/config/integrations_config.dart';
import 'core/mock/mock_backend.dart';
import 'providers/catalog_provider.dart';
import 'providers/engagement_provider.dart';
import 'providers/follows_provider.dart';
import 'providers/inbox_provider.dart';
import 'providers/match_provider.dart';
import 'providers/moments_provider.dart';
import 'providers/session_provider.dart';
import 'providers/social_provider.dart';
import 'providers/wallet_provider.dart';
import 'services/ads/rewarded_ads.dart';
import 'services/app_services.dart';
import 'services/auth/social_sign_in.dart';
import 'services/media/media_picker.dart';
import 'services/media/selfie_camera.dart';
import 'services/payments/payment_links.dart';
import 'services/payments/store_billing.dart';
import 'services/push/push_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: Color(0xFF0B0A10),
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  // The mock still powers the rewarded-ad simulation in both modes.
  final backend = MockBackend();

  // Third-party keys from --dart-define(-from-file); every integration
  // without its keys is hidden or stubbed (see INTEGRATIONS_APP.md).
  final config = IntegrationsConfig.fromEnvironment();

  // With --dart-define=VIBE_API=… the app talks to the Vibe server;
  // without it, everything runs offline on the mock.
  final ApiClient? api = ApiConfig.enabled ? ApiClient(defaultHeaders: {if (config.appStoreHeader != null) 'X-App-Store': config.appStoreHeader!}) : null;
  final RealtimeClient? realtime = api == null ? null : RealtimeClient(api);

  final SessionProvider session;
  final WalletProvider wallet;
  final SocialProvider social;
  final MatchProvider match;
  final InboxProvider inbox;
  final CatalogProvider catalog;
  final FollowsProvider follows;
  final EngagementProvider engagement;
  final MomentsProvider moments;
  if (api != null && realtime != null) {
    session = RemoteSessionProvider(api);
    wallet = RemoteWalletProvider(api, realtime);
    social = RemoteSocialProvider(api, realtime);
    match = RemoteMatchProvider(api, realtime, wallet, social, session);
    inbox = RemoteInboxProvider(api, realtime);
    catalog = RemoteCatalogProvider(api, realtime);
    follows = RemoteFollowsProvider(api, realtime);
    engagement = RemoteEngagementProvider(api, realtime);
    moments = RemoteMomentsProvider(api, realtime, session);
  } else {
    session = SessionProvider(backend);
    wallet = WalletProvider(backend);
    social = SocialProvider(backend, wallet);
    match = MatchProvider(backend, wallet, social, session);
    inbox = InboxProvider();
    catalog = CatalogProvider();
    follows = FollowsProvider(backend, social);
    engagement = EngagementProvider(backend);
    moments = MomentsProvider(backend, session);
  }

  final services = _buildServices(config, api: api, backend: backend, wallet: wallet);
  if (api != null) {
    // While the token still works: forget this device for push, drop SDK sessions.
    session.addSignOutHook(() => services.push.unregister(api));
    session.addSignOutHook(services.social.signOut);
    session.addSignOutHook(() async => follows.clear());
    session.addSignOutHook(() async => engagement.clear());
    session.addSignOutHook(() async => moments.clear());
  }

  runApp(
    MultiProvider(
      providers: [
        Provider<MockBackend>.value(value: backend),
        Provider<AppServices>.value(value: services),
        if (api != null) Provider<ApiClient>.value(value: api),
        if (realtime != null) Provider<RealtimeClient>.value(value: realtime),
        ChangeNotifierProvider.value(value: session),
        ChangeNotifierProvider.value(value: wallet),
        ChangeNotifierProvider.value(value: social),
        ChangeNotifierProvider.value(value: follows),
        ChangeNotifierProvider.value(value: match),
        ChangeNotifierProvider.value(value: inbox),
        ChangeNotifierProvider.value(value: catalog),
        ChangeNotifierProvider.value(value: engagement),
        ChangeNotifierProvider.value(value: moments),
      ],
      child: VibeApp(realtime: realtime),
    ),
  );
}

/// Picks each integration's real implementation when its keys are set (and
/// the platform supports it), else its stand-in.
AppServices _buildServices(IntegrationsConfig config, {required ApiClient? api, required MockBackend backend, required WalletProvider wallet}) {
  final platform = defaultTargetPlatform;
  final mobile = !kIsWeb && (platform == TargetPlatform.android || platform == TargetPlatform.iOS);
  final server = api != null;

  StoreBilling billing = NoStoreBilling();
  if (server && mobile) {
    // Listens from launch so unfinished/redelivered purchases get verified.
    billing = InAppStoreBilling(wallet, android: platform == TargetPlatform.android)..start();
  }

  final adUnit = config.rewardedUnit(platform);
  final RewardedAds ads = !server
      ? MockRewardedAds(backend) // offline demo: nothing to verify against
      : (mobile && adUnit != null)
          ? AdMobRewardedAds(adUnit)
          : (kDebugMode ? MockRewardedAds(backend) : const NoRewardedAds());

  final PushService push = server && mobile ? FirebasePush(config, platform: platform) : NoPush();
  unawaited(push.init());

  return AppServices(
    config: config,
    platform: platform,
    billing: billing,
    links: mobile ? AppLinksPaymentLinks() : ManualPaymentLinks(),
    social: server && mobile ? PlatformSocialSignIn(config, platform: platform) : const NoSocialSignIn(),
    ads: ads,
    push: push,
    media: mobile ? DeviceMediaPicker() : const NoMediaPicker(),
    selfieCamera: mobile ? const WebRtcSelfieCamera() : const NoSelfieCamera(),
  );
}
