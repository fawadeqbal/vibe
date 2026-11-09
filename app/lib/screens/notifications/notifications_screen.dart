import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../profile/me_sections.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/activity.dart';
import '../../models/follows.dart';
import '../../models/models.dart';
import '../../providers/activity_provider.dart';
import '../../providers/follows_provider.dart';
import '../../providers/social_provider.dart';
import '../../services/push/push_route.dart';
import '../social/chat_screen.dart';
import '../social/inbox_screen.dart' show TeamAvatar;

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
  String _tab = 'all';

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
    final social = context.watch<SocialProvider>();
    final incoming = social.incoming;
    final sent = social.requested;
    // Waiting friend requests have their own section on top (Accept / Decline); their history line shows once answered.
    final waiting = {for (final f in incoming) f.profile.id};
    final items = [for (final i in a.items) if (!(i.type == 'friend.request' && waiting.contains(i.actor?.id))) i];
    final listed = _tab == 'calls' ? [for (final i in items) if (i.type.startsWith('call')) i] : (_tab == 'requests' ? <ActivityItem>[] : items);
    bool isNew(ActivityItem i) => !i.read || _freshIds.contains(i.id);
    final fresh = [for (final i in listed) if (isNew(i)) i];
    final earlier = [for (final i in listed) if (!isNew(i)) i];
    final requestCount = incoming.length + sent.length;
    Widget card(List<Widget> rows) => Container(
      clipBehavior: Clip.antiAlias,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(22), border: Border.all(color: V.line)),
      child: Column(children: [for (final (n, r) in rows.indexed) ...[if (n > 0) const Divider(height: 1, color: V.lineSoft), r]]),
    );
    return Scaffold(
      appBar: vibeAppBar(
        context,
        'Notifications',
        actions: [
          CircleIconButton(
            icon: SolarIconsOutline.settings,
            tooltip: 'Notification settings',
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NotificationsSectionScreen())),
          ),
        ],
      ),
      body: !a.loaded
          ? const Center(child: CircularProgressIndicator(color: V.pink))
          : items.isEmpty && incoming.isEmpty && sent.isEmpty
          ? const EmptyState(icon: SolarIconsOutline.bell, title: 'Nothing ', accent: 'yet', body: 'Friend requests, new followers, matches and news about your coins show up here.')
          : RefreshIndicator(
              color: V.pink,
              onRefresh: a.refresh,
              child: ListView(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                children: [
                  PillTabs<String>(
                    value: _tab,
                    onChanged: (v) => setState(() => _tab = v),
                    tabs: [('all', 'All'), ('requests', requestCount > 0 ? 'Requests · $requestCount' : 'Requests'), ('calls', 'Calls')],
                  ),
                  if (_tab != 'calls' && incoming.isNotEmpty) ...[_header('Friend requests · ${incoming.length}'), card([for (final f in incoming) _RequestRow(friend: f, incoming: true)])],
                  if (_tab != 'calls' && sent.isNotEmpty) ...[_header('Sent requests · ${sent.length}'), card([for (final f in sent) _RequestRow(friend: f, incoming: false)])],
                  if (fresh.isNotEmpty) ...[
                    _header('New', action: ('Mark all as read', () {
                      setState(() => _freshIds = const {});
                      a.markAllRead();
                    })),
                    card([for (final i in fresh) ActivityRow(item: i, isNew: true)]),
                  ],
                  if (earlier.isNotEmpty) ...[_header(fresh.isEmpty ? (_tab == 'calls' ? 'Calls' : 'All') : 'Earlier'), card([for (final i in earlier) ActivityRow(item: i)])],
                  if (_tab == 'requests' && requestCount == 0) Padding(padding: const EdgeInsets.only(top: 24), child: Text('No friend requests right now.', textAlign: TextAlign.center, style: VT.body(13.5, color: V.muted))),
                  if (_tab == 'calls' && listed.isEmpty) Padding(padding: const EdgeInsets.only(top: 24), child: Text('No calls yet.', textAlign: TextAlign.center, style: VT.body(13.5, color: V.muted))),
                  if (_tab != 'requests' && !a.hasMore && listed.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 16), child: Text('We keep notifications for 90 days.', textAlign: TextAlign.center, style: VT.body(12, color: V.muted))),
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

  Widget _header(String text, {(String, VoidCallback)? action}) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 22, 4, 10),
    child: Row(
      children: [
        Expanded(child: Text(text.toUpperCase(), style: VT.overline())),
        if (action != null) GestureDetector(onTap: action.$2, child: Text(action.$1, style: VT.label(12.5, color: V.pinkSoft, weight: FontWeight.w600))),
      ],
    ),
  );
}

/// A friend request still waiting: theirs (Accept / Decline) or yours (Cancel).
class _RequestRow extends StatefulWidget {
  const _RequestRow({required this.friend, required this.incoming});
  final Friend friend;
  final bool incoming;

  @override
  State<_RequestRow> createState() => _RequestRowState();
}

class _RequestRowState extends State<_RequestRow> {
  bool _busy = false;

  Future<void> _act(Future<void> Function() fn, [String? done]) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await fn();
      if (mounted && done != null) toast(context, done);
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.friend.profile;
    final social = context.read<SocialProvider>();
    final first = p.name.split(' ').first;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => DeepLinks.open({'route': 'profile', 'userId': p.id}),
              child: Row(
                children: [
                  VAvatar(url: p.avatarUrl, name: p.name, size: 44),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${p.name}, ${p.age}', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(14, weight: FontWeight.w600)),
                        Text(widget.incoming ? 'Wants to be friends' : 'Waiting for $first to accept', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(12.5, color: V.text2)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (widget.incoming) ...[
            TextButton(onPressed: _busy ? null : () => _act(() => social.decline(p.id)), child: Text('Decline', style: VT.label(12.5, color: V.text2))),
            SizedBox(width: 84, child: GradientButton(label: 'Accept', height: 34, busy: _busy, onTap: () => _act(() async => social.accept(p.id), 'You and $first are friends now'))),
          ] else
            TextButton(onPressed: _busy ? null : () => _act(() => social.cancel(p.id)), child: Text('Cancel', style: VT.label(12.5, color: V.text2))),
        ],
      ),
    );
  }
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

  /// Exactly where its push would have taken you (the home shell opens it, see `PushRoute`).
  void _open() => DeepLinks.open(widget.item.data);

  @override
  Widget build(BuildContext context) {
    final i = widget.item;
    final a = i.actor;
    return SizedBox(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
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
                              if (i.count > 1) TextSpan(text: ' · ${i.count} new', style: VT.body(13.5, color: V.pinkSoft, weight: FontWeight.w600)),
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
