import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'core/api/api_client.dart';
import 'core/api/api_config.dart';
import 'core/api/realtime_client.dart';
import 'core/mock/mock_backend.dart';
import 'providers/catalog_provider.dart';
import 'providers/inbox_provider.dart';
import 'providers/match_provider.dart';
import 'providers/session_provider.dart';
import 'providers/social_provider.dart';
import 'providers/wallet_provider.dart';

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

  // With --dart-define=VIBE_API=… the app talks to the Vibe server;
  // without it, everything runs offline on the mock.
  final ApiClient? api = ApiConfig.enabled ? ApiClient() : null;
  final RealtimeClient? realtime = api == null ? null : RealtimeClient(api);

  final SessionProvider session;
  final WalletProvider wallet;
  final SocialProvider social;
  final MatchProvider match;
  final InboxProvider inbox;
  final CatalogProvider catalog;
  if (api != null && realtime != null) {
    session = RemoteSessionProvider(api);
    wallet = RemoteWalletProvider(api, realtime);
    social = RemoteSocialProvider(api, realtime);
    match = RemoteMatchProvider(api, realtime, wallet, social, session);
    inbox = RemoteInboxProvider(api, realtime);
    catalog = RemoteCatalogProvider(api, realtime);
  } else {
    session = SessionProvider(backend);
    wallet = WalletProvider(backend);
    social = SocialProvider(backend, wallet);
    match = MatchProvider(backend, wallet, social, session);
    inbox = InboxProvider();
    catalog = CatalogProvider();
  }

  runApp(
    MultiProvider(
      providers: [
        Provider<MockBackend>.value(value: backend),
        if (api != null) Provider<ApiClient>.value(value: api),
        if (realtime != null) Provider<RealtimeClient>.value(value: realtime),
        ChangeNotifierProvider.value(value: session),
        ChangeNotifierProvider.value(value: wallet),
        ChangeNotifierProvider.value(value: social),
        ChangeNotifierProvider.value(value: match),
        ChangeNotifierProvider.value(value: inbox),
        ChangeNotifierProvider.value(value: catalog),
      ],
      child: VibeApp(realtime: realtime),
    ),
  );
}
