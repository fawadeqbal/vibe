import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/follows.dart';
import '../../providers/engagement_provider.dart';
import '../../providers/follows_provider.dart';
import '../../providers/inbox_provider.dart';
import '../../providers/match_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/social_provider.dart';
import '../../providers/wallet_provider.dart';
import '../../services/app_services.dart';
import '../../services/push/push_route.dart';
import '../../services/wellbeing/break_reminder.dart';
import '../match/match_screen.dart';
import '../profile/follow_lists_screen.dart';
import '../profile/profile_screen.dart';
import '../profile/progress.dart';
import '../profile/user_profile_screen.dart';
import '../social/chat_screen.dart';
import '../social/chats_screen.dart';
import '../social/inbox_screen.dart';
import '../store/store_screen.dart';
import '../store/wallet_screen.dart';

/// Tells [HomeShell] when a page is pushed over it (so the lobby camera can
/// close). Dialogs and bottom sheets are not pages: the preview stays on
/// behind the filters sheet.
final vibeRouteObserver = RouteObserver<PageRoute<dynamic>>();

/// Four tabs. Match is the app; the other three exist to keep people
/// coming back to it (friends), to pay (store) and to trust it (profile).
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> with RouteAware {
  int _index = 0;
  StreamSubscription<PushRoute>? _taps;
  StreamSubscription<FollowNotice>? _followNotices;
  StreamSubscription<int>? _levelUps;
  StreamSubscription<int>? _goals;
  late final MatchProvider _match;
  late final WalletProvider _wallet;
  late final SessionProvider _session;
  final _breaks = BreakReminder();
  Timer? _breakTimer;
  bool _breakOpen = false;
  int? _lastGems;
  late final AppLifecycleListener _lifecycle;
  PageRoute<dynamic>? _route;
  bool _covered = false; // a page (store, chat, profile…) is on top of the tabs
  bool _foreground = true;

  void go(int i) {
    setState(() => _index = i);
    _syncCamera();
  }

  /// The lobby camera may only run while you're looking at it: Match tab,
  /// nothing pushed on top, app in the foreground.
  void _syncCamera() => _match.setLobbyVisible(_index == 0 && !_covered && _foreground);

  void _onLifecycle(AppLifecycleState s) {
    switch (s) {
      case AppLifecycleState.resumed:
        _foreground = true;
      case AppLifecycleState.hidden || AppLifecycleState.paused || AppLifecycleState.detached:
        _foreground = false;
      case AppLifecycleState.inactive:
        // A permission prompt, the notification shade, an incoming-call banner:
        // the app is still on screen, keep things as they are.
        return;
    }
    _match.setAppInBackground(!_foreground);
    _breaks.setForeground(_foreground);
    _syncCamera();
    // Back in the app: Vibe Hour, level and streaks may have moved on.
    if (s == AppLifecycleState.resumed) unawaited(context.read<EngagementProvider>().load());
  }

  /// Searching or in a call counts toward the break reminder.
  void _onMatchChanged() {
    _breaks.setActive(_match.isSearching || _match.isConnected);
  }

  void _onSessionChanged() {
    _breaks.minutes = _session.wellbeing.breakReminderMinutes;
  }

  /// Offline demo: the server announces reached goals; locally we notice.
  void _onWalletChanged() {
    final gems = _wallet.gems;
    final goal = _wallet.gemGoal;
    final before = _lastGems;
    _lastGems = gems;
    if (_wallet.isRemote || before == null || goal == null) return;
    if (before < goal && gems >= goal) _goalReached(goal);
  }

  void _goalReached(int goal) {
    if (mounted) toast(context, 'Goal reached 🎯 ${goal >= 1000 ? '${(goal / 1000).toStringAsFixed(goal % 1000 == 0 ? 0 : 1)}k' : goal} gems');
  }

  Future<void> _checkBreak() async {
    if (_breakOpen || !mounted || !_breaks.due) return;
    _breakOpen = true;
    final minutes = _breaks.minutes ?? 60;
    final takeBreak = await showVibeSheet<bool>(
      context,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(color: V.trust.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(18)),
              child: const Icon(Icons.self_improvement_rounded, size: 30, color: V.trust),
            ),
            const SizedBox(height: 14),
            Headline("You've been vibing for $minutes minutes. ", accent: 'Time for a break?', size: 24, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text('Stretch, drink some water. Your friends and coins will be here.', textAlign: TextAlign.center, style: VT.body(14, color: V.text2)),
            const SizedBox(height: 20),
            GhostButton(label: 'Take a break', icon: Icons.self_improvement_rounded, color: V.trust, expand: true, onTap: () => Navigator.of(context).pop(true)),
            const SizedBox(height: 10),
            GhostButton(label: 'Keep going', expand: true, color: V.text2, onTap: () => Navigator.of(context).pop(false)),
          ],
        ),
      ),
    );
    _breakOpen = false;
    _breaks.reset();
    if (takeBreak == true && mounted) {
      _match.stop();
      _match.dismissEnded();
      go(0);
    }
  }

  @override
  void didPushNext() {
    _covered = true;
    _syncCamera();
  }

  @override
  void didPopNext() {
    _covered = false;
    _syncCamera();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route is PageRoute<dynamic> && route != _route) {
      if (_route != null) vibeRouteObserver.unsubscribe(this);
      _route = route;
      vibeRouteObserver.subscribe(this, route);
    }
  }

  @override
  void initState() {
    super.initState();
    _match = context.read<MatchProvider>();
    _wallet = context.read<WalletProvider>();
    _session = context.read<SessionProvider>();
    _lastGems = _wallet.gems;
    _match.addListener(_onMatchChanged);
    _wallet.addListener(_onWalletChanged);
    _session.addListener(_onSessionChanged);
    _onSessionChanged();
    _breakTimer = Timer.periodic(const Duration(seconds: 20), (_) => _checkBreak());
    final engagement = context.read<EngagementProvider>();
    _levelUps = engagement.levelUps.listen((level) {
      if (mounted) showLevelUpSheet(context, level);
    });
    _goals = engagement.goalsReached.listen(_goalReached);
    _lifecycle = AppLifecycleListener(onStateChange: _onLifecycle);
    final life = WidgetsBinding.instance.lifecycleState;
    _foreground = life == null || life == AppLifecycleState.resumed || life == AppLifecycleState.inactive;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _syncCamera();
    });
    final push = context.read<AppServices>().push;
    _taps = push.taps.listen(_open);
    final launch = push.takeLaunchRoute();
    if (launch != null) WidgetsBinding.instance.addPostFrameCallback((_) => _open(launch));
    _followNotices = context.read<FollowsProvider>().notices.listen((n) {
      if (mounted) toast(context, n.text);
    });
  }

  @override
  void dispose() {
    _taps?.cancel();
    _followNotices?.cancel();
    _levelUps?.cancel();
    _goals?.cancel();
    _breakTimer?.cancel();
    _match.removeListener(_onMatchChanged);
    _wallet.removeListener(_onWalletChanged);
    _session.removeListener(_onSessionChanged);
    _lifecycle.dispose();
    vibeRouteObserver.unsubscribe(this);
    // Signed out / left the tabs: close the lobby camera (after this frame,
    // listeners can't rebuild while the tree is being torn down).
    final match = _match;
    scheduleMicrotask(() => match.setLobbyVisible(false));
    super.dispose();
  }

  /// A tapped notification: chat → that chat (streak at risk too),
  /// friends/inbox → Chats (the weekly recap is an inbox message),
  /// wallet → Wallet (win-back boost, goal reached), store → Store,
  /// match → the lobby (Vibe Hour).
  void _open(PushRoute r) {
    if (!mounted) return;
    final nav = Navigator.of(context);
    switch (r.target) {
      case PushTarget.chat:
        go(1);
        if (context.read<SocialProvider>().friend(r.friendId!) != null) nav.push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: r.friendId!)));
      case PushTarget.friends:
        go(1);
      case PushTarget.inbox:
        go(1);
        nav.push(MaterialPageRoute(builder: (_) => const InboxScreen()));
      case PushTarget.wallet:
        nav.push(MaterialPageRoute(builder: (_) => const WalletScreen()));
      case PushTarget.store:
        go(2);
      case PushTarget.match:
        // Vibe Hour started: the lobby, with the banner.
        nav.popUntil((route) => route.isFirst);
        go(0);
      case PushTarget.profile:
        nav.push(MaterialPageRoute(builder: (_) => UserProfileScreen(userId: r.userId!)));
      case PushTarget.followRequests:
        nav.push(MaterialPageRoute(builder: (_) => const FollowListsScreen(initial: FollowList.requests)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final unread = context.select<SocialProvider, int>((s) => s.unreadTotal + s.incoming.length);
    final teamUnread = context.select<InboxProvider, int>((i) => i.unread);
    final live = context.select<MatchProvider, bool>((m) => m.isConnected || m.isSearching);
    final onVideo = _index == 0;
    // While a match is live the tab bar hides: the match owns the screen.
    return Scaffold(
      // On Match the bar floats, frosted, over your camera.
      extendBody: onVideo,
      // Any touch keeps the lobby preview from timing out.
      body: Listener(
        behavior: HitTestBehavior.translucent,
        onPointerDown: (_) => _match.touchPreview(),
        child: IndexedStack(
          index: _index,
          children: [
            MatchScreen(onOpenStore: () => go(2), onOpenChats: () => go(1)),
            ChatsScreen(onFindPeople: () => go(0)),
            const StoreScreen(),
            ProfileScreen(onOpenStore: () => go(2)),
          ],
        ),
      ),
      bottomNavigationBar: live && onVideo
          ? null
          : _NavBar(
              index: _index,
              frosted: onVideo,
              onTap: go,
              items: [
                const _NavItem(Icons.videocam_outlined, Icons.videocam_rounded, 'Match'),
                _NavItem(Icons.chat_bubble_outline_rounded, Icons.chat_bubble_rounded, 'Chats', badge: unread + teamUnread),
                const _NavItem(Icons.storefront_outlined, Icons.storefront_rounded, 'Store'),
                const _NavItem(Icons.person_outline_rounded, Icons.person_rounded, 'Me'),
              ],
            ),
    );
  }
}

class _NavItem {
  const _NavItem(this.icon, this.activeIcon, this.label, {this.badge = 0});
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final int badge;
}

class _NavBar extends StatelessWidget {
  const _NavBar({required this.index, required this.items, required this.onTap, required this.frosted});
  final int index;
  final List<_NavItem> items;
  final ValueChanged<int> onTap;
  final bool frosted;

  @override
  Widget build(BuildContext context) {
    final bar = Container(
      decoration: BoxDecoration(
        color: frosted ? V.bg.withValues(alpha: 0.88) : V.bg,
        border: const Border(top: BorderSide(color: V.lineSoft)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Row(children: [for (var i = 0; i < items.length; i++) Expanded(child: _tab(i, items[i]))]),
        ),
      ),
    );
    if (!frosted) return bar;
    return ClipRect(child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20), child: bar));
  }

  Widget _tab(int i, _NavItem it) {
    final on = i == index;
    return Semantics(
      selected: on,
      button: true,
      label: it.badge > 0 ? '${it.label}, ${it.badge} new' : it.label,
      child: InkWell(
        onTap: () => onTap(i),
        splashColor: Colors.transparent,
        highlightColor: Colors.transparent,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOut,
              width: 56,
              height: 30,
              decoration: BoxDecoration(color: on ? V.pink.withValues(alpha: 0.16) : Colors.transparent, borderRadius: BorderRadius.circular(15)),
              child: Stack(
                clipBehavior: Clip.none,
                alignment: Alignment.center,
                children: [
                  Icon(on ? it.activeIcon : it.icon, size: 22, color: on ? V.pink : V.muted),
                  if (it.badge > 0)
                    Positioned(
                      left: 32,
                      top: 1,
                      child: Container(
                        constraints: const BoxConstraints(minWidth: 16),
                        height: 16,
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(color: V.pink, borderRadius: BorderRadius.circular(8)),
                        child: Text(it.badge > 99 ? '99+' : '${it.badge}', style: VT.label(10, color: Colors.white, weight: FontWeight.w700)),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Text(it.label, style: VT.label(11, color: on ? V.text : V.muted, weight: on ? FontWeight.w600 : FontWeight.w500)),
          ],
        ),
      ),
    );
  }
}
