import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_dock.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/calls.dart';
import '../../models/follows.dart';
import '../../providers/calls_provider.dart';
import '../../providers/discover_provider.dart';
import '../../providers/engagement_provider.dart';
import '../../providers/follows_provider.dart';
import '../../providers/inbox_provider.dart';
import '../../providers/match_provider.dart';
import '../../providers/referrals_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/social_provider.dart';
import '../../providers/wallet_provider.dart';
import '../../services/app_services.dart';
import '../../services/invite/invite_capture.dart';
import '../../services/push/push_route.dart';
import '../../services/wellbeing/break_reminder.dart';
import '../discover/discover_screen.dart';
import '../discover/match_dialog.dart';
import '../invite/invite_screen.dart';
import '../invite/invite_share.dart';
import '../match/match_screen.dart';
import '../profile/follow_lists_screen.dart';
import '../profile/profile_screen.dart';
import '../profile/progress.dart';
import '../profile/user_profile_screen.dart';
import '../social/call_screens.dart';
import '../social/chat_screen.dart';
import '../social/chats_screen.dart';
import '../social/inbox_screen.dart';
import '../store/store_screen.dart';
import '../store/wallet_screen.dart';

/// Tells [HomeShell] when a page is pushed over it (so the lobby camera can
/// close). Dialogs and bottom sheets are not pages: the preview stays on
/// behind the filters sheet.
final vibeRouteObserver = RouteObserver<PageRoute<dynamic>>();

/// Five tabs. Match is the app; Discover fills the gaps when nobody's live;
/// the other three keep people coming back (friends), pay (store) and
/// build trust (profile).
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

/// Tab positions.
abstract final class Tabs {
  static const match = 0;
  static const discover = 1;
  static const chats = 2;
  static const store = 3;
  static const me = 4;
}

class _HomeShellState extends State<HomeShell> with RouteAware {
  int _index = 0;
  late final DiscoverProvider _discover;
  late final CallsProvider _calls;
  StreamSubscription<String>? _friendCallEnded;
  bool _matchOpen = false;
  String? _incomingShown;
  bool _outgoingShown = false;
  StreamSubscription<PushRoute>? _taps;
  StreamSubscription<FollowNotice>? _followNotices;
  StreamSubscription<int>? _levelUps;
  StreamSubscription<int>? _goals;
  final List<StreamSubscription<dynamic>> _inviteSubs = [];
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

  /// One scroll controller per tab, so tapping the tab you're already on
  /// can take that page back to the top (as on iOS).
  final _scrollers = [for (var i = 0; i < 5; i++) ScrollController()];

  void _onDockTap(int i) {
    if (i != _index) return go(i);
    final reduce = MediaQuery.of(context).disableAnimations;
    for (final p in _scrollers[i].positions) {
      if (p.pixels <= p.minScrollExtent) continue;
      if (reduce) {
        p.jumpTo(p.minScrollExtent);
      } else {
        p.animateTo(p.minScrollExtent, duration: VMotion.travel, curve: VMotion.out);
      }
    }
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

  /// Searching or in a call counts toward the break reminder. A friend
  /// picked up: the call screen (Match tab, nothing on top).
  void _onMatchChanged() {
    _breaks.setActive(_match.isSearching || _match.isConnected);
    if (_match.isConnected && _match.friendCall && (_index != Tabs.match || _covered)) {
      Navigator.of(context).popUntil((r) => r.isFirst);
      go(Tabs.match);
    }
  }

  /// Two likes met: "It's a match!" over whatever is on screen.
  Future<void> _onDiscoverChanged() async {
    final f = _discover.matched;
    if (f == null || _matchOpen || !mounted) return;
    _matchOpen = true;
    await showMatchDialog(context, f);
    _matchOpen = false;
    _discover.dismissMatch();
  }

  /// A friend calling, or your own call ringing: their full-screen pages.
  void _onCallsChanged() {
    if (!mounted) return;
    final nav = Navigator.of(context);
    final inc = _calls.incoming;
    if (inc != null && _incomingShown != inc.callId) {
      _incomingShown = inc.callId;
      nav.push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => IncomingCallScreen(call: inc))).then((_) => _incomingShown = null);
    }
    final out = _calls.outgoing;
    if (out != null && !_outgoingShown && out.status == OutgoingStatus.ringing) {
      _outgoingShown = true;
      nav
          .push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => OutgoingCallScreen(onMessage: _openChat)))
          .then((_) => _outgoingShown = false);
    }
  }

  void _openChat(String friendId) {
    if (!mounted) return;
    go(Tabs.chats);
    if (context.read<SocialProvider>().friend(friendId) != null) Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: friendId)));
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
              child: const Icon(SolarIconsBold.meditationRound, size: 30, color: V.trust),
            ),
            const SizedBox(height: 14),
            Headline("You've been vibing for $minutes minutes. ", accent: 'Time for a break?', size: 24, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text('Stretch, drink some water. Your friends and coins will be here.', textAlign: TextAlign.center, style: VT.body(14, color: V.text2)),
            const SizedBox(height: 20),
            GhostButton(label: 'Take a break', icon: SolarIconsBold.meditationRound, color: V.trust, expand: true, onTap: () => Navigator.of(context).pop(true)),
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
    _discover = context.read<DiscoverProvider>();
    _discover.addListener(_onDiscoverChanged);
    _calls = context.read<CallsProvider>();
    _calls.addListener(_onCallsChanged);
    // A friend call ended: back to that chat.
    _friendCallEnded = _match.friendCallEnded.listen((id) {
      if (!mounted) return;
      Navigator.of(context).popUntil((r) => r.isFirst);
      _openChat(id);
    });
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
    // Invites: a friend joined / got active, a milestone, partner news, and
    // invite links opened while signed in.
    final referrals = context.read<ReferralsProvider>();
    _inviteSubs.addAll([
      referrals.updates.listen((u) {
        final text = u.notice;
        if (mounted && text != null) toast(context, text);
      }),
      referrals.milestonesReached.listen((m) {
        if (mounted) showMilestoneSheet(context, m);
      }),
      referrals.partnerNotices.listen((text) {
        if (mounted) toast(context, text);
      }),
      context.read<InviteCapture>().signedInLinks.listen((invite) {
        if (!mounted) return;
        final claimable = _session.referralClaimable;
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => InviteScreen(claimCode: claimable ? invite.code : null)));
      }),
    ]);
  }

  @override
  void dispose() {
    _taps?.cancel();
    _followNotices?.cancel();
    _levelUps?.cancel();
    _goals?.cancel();
    for (final sub in _inviteSubs) {
      sub.cancel();
    }
    _breakTimer?.cancel();
    _match.removeListener(_onMatchChanged);
    _discover.removeListener(_onDiscoverChanged);
    _calls.removeListener(_onCallsChanged);
    _friendCallEnded?.cancel();
    _wallet.removeListener(_onWalletChanged);
    _session.removeListener(_onSessionChanged);
    _lifecycle.dispose();
    vibeRouteObserver.unsubscribe(this);
    for (final c in _scrollers) {
      c.dispose();
    }
    // Signed out / left the tabs: close the lobby camera (after this frame,
    // listeners can't rebuild while the tree is being torn down).
    final match = _match;
    scheduleMicrotask(() => match.setLobbyVisible(false));
    super.dispose();
  }

  /// A tapped notification: chat → that chat (streak at risk too),
  /// friends/inbox → Chats (the weekly recap is an inbox message),
  /// wallet → Wallet (win-back boost, goal reached), store → Store,
  /// match → the lobby (Vibe Hour), invite → Invite friends, partner → the
  /// partner dashboard in the browser.
  void _open(PushRoute r) {
    if (!mounted) return;
    final nav = Navigator.of(context);
    switch (r.target) {
      case PushTarget.chat:
        go(Tabs.chats);
        if (context.read<SocialProvider>().friend(r.friendId!) != null) nav.push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: r.friendId!)));
      case PushTarget.friends:
        go(Tabs.chats);
      case PushTarget.inbox:
        go(Tabs.chats);
        nav.push(MaterialPageRoute(builder: (_) => const InboxScreen()));
      case PushTarget.wallet:
        nav.push(MaterialPageRoute(builder: (_) => const WalletScreen()));
      case PushTarget.store:
        go(Tabs.store);
      case PushTarget.discover:
        nav.popUntil((route) => route.isFirst);
        go(Tabs.discover);
      case PushTarget.call:
        // The ring itself comes over the socket; make sure we have it.
        unawaited(_calls.checkIncoming());
      case PushTarget.match:
        // Vibe Hour started: the lobby, with the banner.
        nav.popUntil((route) => route.isFirst);
        go(0);
      case PushTarget.profile:
        nav.push(MaterialPageRoute(builder: (_) => UserProfileScreen(userId: r.userId!)));
      case PushTarget.followRequests:
        nav.push(MaterialPageRoute(builder: (_) => const FollowListsScreen(initial: FollowList.requests)));
      case PushTarget.invite:
        nav.push(MaterialPageRoute(builder: (_) => const InviteScreen()));
      case PushTarget.partner:
        openPartnerPage(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final unread = context.select<SocialProvider, int>((s) => s.unreadTotal + s.incoming.length);
    final teamUnread = context.select<InboxProvider, int>((i) => i.unread);
    final live = context.select<MatchProvider, bool>((m) => m.isConnected || m.isSearching);
    final likes = context.select<DiscoverProvider, int>((d) => d.badge);
    final discoverOn = context.select<DiscoverProvider, bool>((d) => d.enabled);
    final onVideo = _index == 0;
    // While a match is live the tab bar hides: the match owns the screen.
    return Scaffold(
      // The dock floats over every tab: over your camera on Match, over the
      // page (which scrolls under it) everywhere else.
      extendBody: true,
      // Any touch keeps the lobby preview from timing out.
      body: Listener(
        behavior: HitTestBehavior.translucent,
        onPointerDown: (_) => _match.touchPreview(),
        child: IndexedStack(
          index: _index,
          children: [
            MatchScreen(onOpenStore: () => go(Tabs.store), onOpenChats: () => go(Tabs.chats)),
            DiscoverScreen(onOpenMatch: () => go(Tabs.match)),
            PrimaryScrollController(controller: _scrollers[Tabs.chats], child: ChatsScreen(onFindPeople: () => go(Tabs.match))),
            PrimaryScrollController(controller: _scrollers[Tabs.store], child: const StoreScreen()),
            PrimaryScrollController(controller: _scrollers[Tabs.me], child: ProfileScreen(onOpenStore: () => go(Tabs.store))),
          ],
        ),
      ),
      bottomNavigationBar: live && onVideo
          ? null
          : VibeDock(
              // Without Discover (switched off in admin) the dock has four items.
              index: discoverOn || _index < Tabs.discover ? _index : _index - 1,
              overVideo: onVideo,
              onTap: (i) => _onDockTap(discoverOn || i < Tabs.discover ? i : i + 1),
              items: [
                const VibeDockItem(icon: SolarIconsOutline.videocamera, activeIcon: SolarIconsBold.videocamera, label: 'Match'),
                if (discoverOn) VibeDockItem(icon: SolarIconsOutline.userHeartRounded, activeIcon: SolarIconsBold.userHeartRounded, label: 'Discover', badge: likes),
                VibeDockItem(icon: SolarIconsOutline.chatRoundDots, activeIcon: SolarIconsBold.chatRoundDots, label: 'Chats', badge: unread + teamUnread),
                const VibeDockItem(icon: SolarIconsOutline.bagSmile, activeIcon: SolarIconsBold.bagSmile, label: 'Store'),
                const VibeDockItem(icon: SolarIconsOutline.userRounded, activeIcon: SolarIconsBold.userRounded, label: 'Me'),
              ],
            ),
    );
  }
}
