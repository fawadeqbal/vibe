import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/follows.dart';
import '../../providers/follows_provider.dart';
import '../../providers/inbox_provider.dart';
import '../../providers/match_provider.dart';
import '../../providers/social_provider.dart';
import '../../services/app_services.dart';
import '../../services/push/push_route.dart';
import '../match/match_screen.dart';
import '../profile/follow_lists_screen.dart';
import '../profile/profile_screen.dart';
import '../profile/user_profile_screen.dart';
import '../social/chat_screen.dart';
import '../social/chats_screen.dart';
import '../social/inbox_screen.dart';
import '../store/store_screen.dart';
import '../store/wallet_screen.dart';

/// Four tabs. Match is the app; the other three exist to keep people
/// coming back to it (friends), to pay (store) and to trust it (profile).
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  StreamSubscription<PushRoute>? _taps;
  StreamSubscription<FollowNotice>? _followNotices;

  void go(int i) => setState(() => _index = i);

  @override
  void initState() {
    super.initState();
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
    super.dispose();
  }

  /// A tapped notification: chat → that chat, friends/inbox → Chats,
  /// wallet → Wallet, store → Store.
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
      body: IndexedStack(
        index: _index,
        children: [
          MatchScreen(onOpenStore: () => go(2), onOpenChats: () => go(1)),
          ChatsScreen(onFindPeople: () => go(0)),
          const StoreScreen(),
          ProfileScreen(onOpenStore: () => go(2)),
        ],
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
