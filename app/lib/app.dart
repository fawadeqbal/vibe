import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/api/api_client.dart';
import 'core/api/live_banners.dart';
import 'core/api/realtime_client.dart';
import 'core/api/system_notices.dart';
import 'core/theme/vibe_theme.dart';
import 'models/payments.dart';
import 'providers/filters_provider.dart';
import 'providers/activity_provider.dart';
import 'providers/calls_provider.dart';
import 'providers/catalog_provider.dart';
import 'providers/discover_provider.dart';
import 'providers/engagement_provider.dart';
import 'providers/follows_provider.dart';
import 'providers/inbox_provider.dart';
import 'providers/match_provider.dart';
import 'providers/moments_provider.dart';
import 'providers/partner_provider.dart';
import 'providers/session_provider.dart';
import 'providers/social_provider.dart';
import 'providers/wallet_provider.dart';
import 'services/app_services.dart';
import 'services/invite/invite_capture.dart';
import 'services/payments/store_billing.dart';
import 'screens/calls/call_layer.dart';
import 'screens/home/home_shell.dart';
import 'screens/notifications/live_banner_overlay.dart';
import 'screens/onboarding/permissions_screen.dart';
import 'screens/onboarding/profile_setup_screen.dart';
import 'screens/onboarding/signin_screen.dart';
import 'screens/onboarding/welcome_screen.dart';
import 'screens/region_unavailable_screen.dart';
import 'screens/splash_screen.dart';

class VibeApp extends StatefulWidget {
  const VibeApp({super.key, this.realtime});

  /// Present in server mode: connected while someone is signed in.
  final RealtimeClient? realtime;

  @override
  State<VibeApp> createState() => _VibeAppState();
}

class _VibeAppState extends State<VibeApp> with WidgetsBindingObserver {
  bool _sawWelcome = false;
  bool _sessionLive = false;
  late final SessionProvider _session = context.read<SessionProvider>();
  late final CatalogProvider _catalog = context.read<CatalogProvider>();
  late final AppServices _services = context.read<AppServices>();
  final _messenger = GlobalKey<ScaffoldMessengerState>();
  SystemNotices? _notices;

  /// Live notifications while the app is open (server mode).
  final _banners = LiveBanners();
  SocialProvider? _social;

  void _clearOpenChatBanners() {
    final open = _social?.openChat;
    if (open != null) _banners.dismissWhere((b) => b.data['friendId'] == open && (b.data['open'] ?? b.data['route']) == 'chat');
  }
  StreamSubscription<bool>? _connection;
  DateTime? _pausedAt;
  DateTime _lastCatchUp = DateTime.fromMillisecondsSinceEpoch(0);
  StreamSubscription<StoreDelivery>? _deliveries;

  @override
  void initState() {
    super.initState();
    final rt = widget.realtime;
    if (rt != null) {
      _notices = SystemNotices(context.read<ApiClient>(), rt, _messenger)..start();
      // Skip a banner about the chat you have open.
      final social = context.read<SocialProvider>();
      _banners.start(rt, skip: (data) => data['friendId'] != null && data['friendId'] == social.openChat && (data['open'] ?? data['route']) == 'chat');
      // Opened a chat: its message banners are read.
      _social = social;
      social.addListener(_clearOpenChatBanners);
      // A reconnect (not the first connect): live events may have been missed.
      var wasConnected = false;
      _connection = rt.connection.listen((up) {
        if (up && wasConnected) unawaited(_catchUp());
        if (up) wasConnected = true;
      });
      WidgetsBinding.instance.addObserver(this);
    }
    // Store purchases finished in the background (redelivered at launch, Play "pending" that cleared).
    _deliveries = _services.billing.deliveries.listen((d) {
      _messenger.currentState?.showSnackBar(SnackBar(content: Text(d.purchase.productType == ProductKind.vipPlan ? 'Your VIP is active' : 'Purchase complete: coins added')));
    });
    _catalog.addListener(_redrawPrices);
    // Restore everything once; the splash shows meanwhile.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      // The catalog is public: loading it now also tells a visitor from a
      // country Vibe isn't offered in, before they try to sign in.
      if (rt != null) unawaited(_catalog.load());
      await _session.restore();
      // After the restore, so a link opened by someone signed in isn't
      // stored as a sign-up code.
      if (mounted) unawaited(context.read<InviteCapture>().start());
      _session.addListener(_onSessionChanged);
      if (widget.realtime == null) {
        // Offline mock: everything is local, load it all now.
        await _loadAll();
      } else {
        _onSessionChanged();
      }
    });
  }

  @override
  void dispose() {
    _session.removeListener(_onSessionChanged);
    _catalog.removeListener(_redrawPrices);
    _notices?.stop();
    _social?.removeListener(_clearOpenChatBanners);
    _banners.dispose();
    _connection?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _deliveries?.cancel();
    super.dispose();
  }

  /// Server mode: open the socket and load the user's data on sign-in;
  /// close it on sign-out.
  void _onSessionChanged() {
    final rt = widget.realtime;
    if (rt == null) return;
    if (_session.signedIn && !_sessionLive) {
      _sessionLive = true;
      rt.connect();
      _loadAll();
      _notices?.catchUp();
      _services.billing.setSignedIn(true);
      unawaited(_services.push.register(context.read<ApiClient>()));
      unawaited(_session.loadVerification());
    } else if (!_session.signedIn && _sessionLive) {
      _sessionLive = false;
      _services.billing.setSignedIn(false);
      rt.disconnect();
    }
  }

  /// Back from the background after a while: fetch what changed meanwhile.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) _pausedAt ??= DateTime.now();
    // Left the app: pushes go to the phone again (the socket may stay connected for minutes).
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden || state == AppLifecycleState.detached) widget.realtime?.setActive(false);
    if (state == AppLifecycleState.resumed) widget.realtime?.setActive(true);
    if (state == AppLifecycleState.resumed) {
      final away = _pausedAt == null ? Duration.zero : DateTime.now().difference(_pausedAt!);
      _pausedAt = null;
      if (away > const Duration(seconds: 20)) unawaited(_catchUp());
    }
  }

  /// Back online after missing live events (the socket dropped, the phone
  /// slept): chats, presence, notifications and money are fetched again, so
  /// every screen is right without pulling to refresh.
  Future<void> _catchUp() async {
    if (!_sessionLive || DateTime.now().difference(_lastCatchUp) < const Duration(seconds: 3)) return;
    _lastCatchUp = DateTime.now();
    Future<void> safe(Future<void>? f) async {
      try {
        await f;
      } catch (_) {}
    }

    await Future.wait([
      safe(context.read<SocialProvider>().catchUp()),
      safe(context.read<ActivityProvider?>()?.refresh()),
      safe(context.read<WalletProvider>().load()),
      safe(context.read<InboxProvider>().load()),
      safe(context.read<FollowsProvider>().load()),
      safe(_catalog.load()),
    ]);
  }

  /// Staff changed prices: redraw every screen (and open sheet) once, so no
  /// screen has to remember to listen. Rare, so a full rebuild is fine.
  void _redrawPrices() {
    if (!mounted) return;
    void redraw(Element e) {
      e.markNeedsBuild();
      e.visitChildren(redraw);
    }

    (context as Element).visitChildren(redraw);
  }

  Future<void> _loadAll() async {
    await _catalog.load();
    if (!mounted) return;
    await context.read<WalletProvider>().load();
    if (!mounted) return;
    await context.read<SocialProvider>().load();
    if (!mounted) return;
    await context.read<FollowsProvider>().load();
    if (!mounted) return;
    await context.read<MatchProvider>().load();
    if (!mounted) return;
    await context.read<InboxProvider>().load();
    if (!mounted) return;
    await context.read<ActivityProvider?>()?.load();
    if (!mounted) return;
    await context.read<EngagementProvider>().load();
    if (!mounted) return;
    await context.read<MomentsProvider>().load();
    if (!mounted) return;
    await context.read<DiscoverProvider>().loadStatus();
    if (!mounted) return;
    await context.read<FiltersProvider>().load();
    if (!mounted) return;
    await context.read<CallsProvider>().checkIncoming();
    if (!mounted) return;
    // The Me row shows where you are in the creator partner program.
    await context.read<PartnerProvider?>()?.load();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Vibe',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: _messenger,
      navigatorObservers: [vibeRouteObserver],
      // Friend calls over every page: the ringing banner, a call shrunk to the chat.
      // Where Vibe isn't offered (451 from the API), only the region screen.
      builder: (context, child) {
        final page = LiveBannerOverlay(banners: _banners, child: CallLayer(child: child ?? const SizedBox.shrink()));
        final api = context.read<ApiClient?>();
        if (api == null) return page;
        return ValueListenableBuilder<bool>(
          valueListenable: api.regionBlocked,
          builder: (context, blocked, _) => blocked ? const RegionUnavailableScreen() : page,
        );
      },
      theme: V.theme(),
      home: Consumer<SessionProvider>(
        // The animated splash stays up until boot is done and its entrance
        // has played, then fades out into the first real screen.
        builder: (context, session, _) => SplashGate(
          ready: !session.booting,
          builder: (context) {
            if (!session.signedIn) {
              if (!_sawWelcome) return WelcomeScreen(onContinue: () => setState(() => _sawWelcome = true));
              return const SignInScreen();
            }
            if (!session.profileReady) return const ProfileSetupScreen();
            if (!session.onboarded) return const PermissionsScreen();
            return const HomeShell();
          },
        ),
      ),
    );
  }
}
