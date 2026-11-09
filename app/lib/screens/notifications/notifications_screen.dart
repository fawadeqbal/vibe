import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/activity.dart';
import '../../models/follows.dart';
import '../../models/models.dart';
import '../../providers/activity_provider.dart';
import '../../providers/follows_provider.dart';
import '../../providers/social_provider.dart';
import '../invite/invite_screen.dart';
import '../profile/follow_lists_screen.dart';
import '../profile/user_profile_screen.dart';
import '../social/chat_screen.dart';
import '../social/inbox_screen.dart';
import '../store/wallet_screen.dart';

/// Notifications: friend and follow requests (answer them right here), new
/// followers (follow back), matches and accepted requests (say hi), missed
/// calls, money and account news. Opening the page clears the badge; this
/// visit still shows which lines are new. Mirror of the web's
/// `NotificationsView`.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _scroll = ScrollController();

  /// What was unread when the page opened: stays "New" for this visit, whatever reloads come later.
  Set<String> _freshIds = const {};

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      final a = context.read<ActivityProvider>();
      if (a.hasMore && _scroll.position.extentAfter < 400) a.loadMore();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final a = context.read<ActivityProvider>();
      await (a.loaded ? a.refresh() : a.load());
      if (!mounted) return;
      setState(() => _freshIds = {for (final i in a.items) if (!i.read) i.id});
      await a.markAllRead();
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final a = context.watch<ActivityProvider>();
    final items = a.items;
    bool isNew(ActivityItem i) => !i.read || _freshIds.contains(i.id);
    final fresh = [for (final i in items) if (isNew(i)) i];
    final earlier = [for (final i in items) if (!isNew(i)) i];
    return Scaffold(
      appBar: vibeAppBar(context, 'Notifications'),
      body: !a.loaded
          ? const Center(child: CircularProgressIndicator(color: V.pink))
          : items.isEmpty
          ? const EmptyState(icon: SolarIconsOutline.bell, title: 'Nothing ', accent: 'yet', body: 'Friend requests, new followers, matches and news about your coins show up here.')
          : RefreshIndicator(
              color: V.pink,
              onRefresh: a.refresh,
              child: ListView(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 32),
                children: [
                  if (fresh.isNotEmpty) ...[_header('New'), for (final i in fresh) ActivityRow(item: i, isNew: true)],
                  if (earlier.isNotEmpty) ...[_header(fresh.isEmpty ? 'All' : 'Earlier'), for (final i in earlier) ActivityRow(item: i)],
                  if (a.hasMore)
                    const Padding(
                      padding: EdgeInsets.all(16),
                      child: Center(child: SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2, color: V.pink))),
                    ),
                ],
              ),
            ),
    );
  }

  Widget _header(String text) => Padding(padding: const EdgeInsets.fromLTRB(8, 14, 8, 6), child: Text(text, style: VT.label(13)));
}

/// One notification: who / what, when, and the button that fits now.
class ActivityRow extends StatefulWidget {
  const ActivityRow({super.key, required this.item, this.isNew = false});
  final ActivityItem item;

  /// Unread when the page opened (highlighted, with a dot).
  final bool isNew;

  @override
  State<ActivityRow> createState() => _ActivityRowState();
}

class _ActivityRowState extends State<ActivityRow> {
  bool _busy = false;

  Future<void> _act(Future<void> Function() fn, [String? done]) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await fn();
      if (mounted && done != null) toast(context, done);
      if (mounted) await context.read<ActivityProvider>().refresh();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Same places a tapped push opens (see `PushRoute`); tab destinations go back to the tabs.
  void _open() {
    final d = widget.item.data;
    final nav = Navigator.of(context);
    final user = d['userId'];
    final friendId = d['friendId'];
    Widget? page = switch (d['route']) {
      'chat' || 'call' when friendId != null && context.read<SocialProvider>().friend(friendId) != null => ChatScreen(friendId: friendId),
      'friends' || 'profile' when user != null => UserProfileScreen(userId: user),
      'follow-requests' => const FollowListsScreen(initial: FollowList.requests),
      'wallet' => const WalletScreen(),
      'invite' => const InviteScreen(),
      'inbox' => const InboxScreen(),
      _ => null,
    };
    if (page != null) {
      nav.push(MaterialPageRoute(builder: (_) => page));
    } else {
      nav.maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final i = widget.item;
    final a = i.actor;
    return Container(
      margin: const EdgeInsets.only(bottom: 2),
      decoration: BoxDecoration(color: widget.isNew ? V.pink.withValues(alpha: 0.06) : null, borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
        child: Row(
          children: [
            Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: _open,
                child: Row(
                  children: [
                    Stack(
                      clipBehavior: Clip.none,
                      children: [
                        if (a != null) VAvatar(url: a.avatarUrl, name: a.name, size: 48) else const TeamAvatar(size: 48),
                        Positioned(
                          right: -2,
                          bottom: -2,
                          child: Container(
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(shape: BoxShape.circle, color: V.surface2, border: Border.all(color: V.bg, width: 2)),
                            child: Icon(_icon(i.type), size: 12, color: V.text),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text.rich(
                            TextSpan(children: [
                              TextSpan(text: i.title, style: VT.body(13.5, weight: FontWeight.w600)),
                              if (i.body.isNotEmpty) TextSpan(text: ' ${i.body}', style: VT.body(13.5, color: V.text2)),
                            ]),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(Fmt.agoShort(i.at), style: VT.label(11.5, color: V.muted, weight: FontWeight.w500)),
                        ],
                      ),
                    ),
                    if (widget.isNew)
                      Semantics(
                        label: 'New',
                        child: Container(margin: const EdgeInsets.only(left: 6), width: 8, height: 8, decoration: const BoxDecoration(color: V.pink, shape: BoxShape.circle)),
                      ),
                  ],
                ),
              ),
            ),
            if (a != null && i.rel != null) _actions(a, i.rel!),
          ],
        ),
      ),
    );
  }

  /// The one or two buttons that fit where you stand with them now.
  Widget _actions(Profile a, ActivityRel rel) {
    final i = widget.item;
    final social = context.read<SocialProvider>();
    final follows = context.read<FollowsProvider>();
    final first = a.name.split(' ').first;
    Widget pair(Future<void> Function() yes, Future<void> Function() no, String done) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextButton(onPressed: _busy ? null : () => _act(no), child: Text('Decline', style: VT.label(12.5, color: V.text2))),
            SizedBox(width: 84, child: GradientButton(label: 'Accept', height: 34, busy: _busy, onTap: () => _act(yes, done))),
          ],
        );

    if (i.type == 'friend.request' && rel.friend == FriendState.incoming) {
      return pair(() async => social.accept(a.id), () => social.decline(a.id), 'You and $first are friends now');
    }
    if (i.type == 'follow.request' && rel.followRequest) {
      return pair(() => follows.accept(a.id), () => follows.decline(a.id), '$first can see your profile now');
    }
    if (i.type == 'follow.new' && rel.follow == FollowState.none) {
      return SizedBox(width: 104, child: GradientButton(label: rel.followsYou ? 'Follow back' : 'Follow', height: 34, busy: _busy, onTap: () => _act(() async => follows.follow(a.id))));
    }
    if ({'friend.accepted', 'discover.match', 'friend.request'}.contains(i.type) && rel.friend == FriendState.friends) {
      return GhostButton(label: 'Message', height: 34, onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: a.id))));
    }
    return const SizedBox.shrink();
  }

  static IconData _icon(String type) {
    if (type.startsWith('friend.')) return SolarIconsBold.userPlusRounded;
    if (type.startsWith('follow.')) return SolarIconsBold.usersGroupRounded;
    if (type.startsWith('discover.')) return SolarIconsBold.heart;
    if (type.startsWith('wave.')) return SolarIconsBold.handShake;
    if (type.startsWith('call.')) return SolarIconsBold.phoneCallingRounded;
    if (type.startsWith('referral.')) return SolarIconsBold.gift;
    if (type.startsWith('account.')) return SolarIconsBold.shieldCheck;
    return SolarIconsBold.wallet;
  }
}

/// The bell on the Match and Chats headers, with the unread count. [glass]: over the camera on Match.
class NotificationsBell extends StatelessWidget {
  const NotificationsBell({super.key, this.glass = false});
  final bool glass;

  @override
  Widget build(BuildContext context) {
    // Nullable: screens shown in tests (or before sign-in) may have no ActivityProvider.
    final unread = context.select<ActivityProvider?, int>((a) => a?.unread ?? 0);
    final label = unread > 0 ? 'Notifications, $unread new' : 'Notifications';
    void open() => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NotificationsScreen()));
    final count = unread > 99 ? '99+' : '$unread';
    if (glass) {
      return Tooltip(message: label, child: RoundControl(icon: SolarIconsBold.bell, size: 40, badge: unread > 0 ? count : null, onTap: open));
    }
    return Semantics(
      label: label,
      button: true,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          CircleIconButton(icon: SolarIconsBold.bell, iconSize: 21, background: V.surface2, tooltip: label, onTap: open),
          if (unread > 0)
            Positioned(
              top: -2,
              right: -2,
              child: IgnorePointer(
                child: Container(
                  constraints: const BoxConstraints(minWidth: 18),
                  height: 18,
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: V.pink, borderRadius: BorderRadius.circular(9), border: Border.all(color: V.bg, width: 2)),
                  child: Text(count, style: VT.label(10, color: Colors.white, weight: FontWeight.w700)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
