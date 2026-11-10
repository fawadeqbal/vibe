import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/activity.dart';
import '../../models/calls.dart';
import '../../models/follows.dart';
import '../../models/models.dart';
import '../../providers/activity_provider.dart';
import '../../providers/calls_provider.dart';
import '../../providers/follows_provider.dart';
import '../../providers/social_provider.dart';
import '../../services/push/push_route.dart';
import '../profile/me_sections.dart';
import '../social/chat_screen.dart';
import '../social/team_avatar.dart' show TeamAvatar;
import 'notification_style.dart';

/// Notifications: every line opens the thing it is about — a person, a chat
/// at the message, your calls with someone, a receipt, a cash-out, Account
/// status. Filters on top, requests in one strip, then Today / This week /
/// Earlier. Opening the page clears the badge; this visit still shows which
/// lines are new. Mirror of the web's `NotificationsView`.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _scroll = ScrollController();

  NotificationFilter _filter = NotificationFilter.all;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      final a = context.read<ActivityProvider>();
      if (a.hasMore && _scroll.position.extentAfter < 400) a.loadMore();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      // Opening the page clears the bell; each line stays highlighted until it's opened.
      final a = context.read<ActivityProvider>()..addListener(_keepSeen);
      _activity = a;
      unawaited(a.seen());
      await (a.loaded ? a.refresh() : a.load());
      if (mounted) await a.seen();
    });
  }

  ActivityProvider? _activity;

  /// A new one while you're looking at the page: it's seen (the line still shows as new).
  void _keepSeen() {
    final a = _activity;
    if (a != null && a.loaded && a.unread > 0) unawaited(a.seen());
  }

  @override
  void dispose() {
    _activity?.removeListener(_keepSeen);
    _scroll.dispose();
    super.dispose();
  }

  static const _empty = {
    NotificationFilter.all: (SolarIconsOutline.bell, 'Nothing yet', 'Friend requests, new followers, matches, missed calls and news about your coins show up here.'),
    NotificationFilter.people: (SolarIconsOutline.usersGroupRounded, 'No one yet', 'Friend requests, follows, waves, likes and matches show up here.'),
    NotificationFilter.calls: (SolarIconsOutline.videocamera, 'No missed calls', 'When a friend calls and you miss it, it shows here. Tap it to see your calls with them and call back.'),
    NotificationFilter.money: (SolarIconsOutline.wallet, 'No money news', 'Payments, cash-outs and goals show up here, each with its receipt.'),
    NotificationFilter.account: (SolarIconsOutline.shieldCheck, 'All good', 'Notes from the Vibe team about your account show up here.'),
  };

  @override
  Widget build(BuildContext context) {
    final a = context.watch<ActivityProvider>();
    final social = context.watch<SocialProvider>();
    final incoming = social.incoming;
    final sent = social.requested;
    // Waiting friend requests live in Requests (Accept / Decline); their history line shows once answered.
    final waiting = {for (final f in incoming) f.profile.id};
    final items = [
      for (final i in a.items)
        if (!(i.type == 'friend.request' && waiting.contains(i.actor?.id))) i,
    ];
    bool inFilter(ActivityItem i) => _filter == NotificationFilter.all || NotificationStyle.of(i.type, i.title).filter == _filter;
    final listed = [
      for (final i in items)
        if (inFilter(i)) i,
    ];
    bool isNew(ActivityItem i) => !i.read;
    final now = DateTime.now();
    final groups = [
      for (final b in NotificationBucket.values)
        if (listed.any((i) => bucketOf(i.at, now) == b))
          (
            b,
            [
              for (final i in listed)
                if (bucketOf(i.at, now) == b) i,
            ],
          ),
    ];
    final requestCount = incoming.length + sent.length;
    final empty = _empty[_filter]!;
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
          : items.isEmpty && requestCount == 0
          ? EmptyState(icon: SolarIconsOutline.bell, title: 'Nothing ', accent: 'yet', body: _empty[NotificationFilter.all]!.$3)
          // The filters stay put; only the notifications under them scroll.
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                  child: PillTabs<NotificationFilter>(
                    value: _filter,
                    onChanged: (v) => setState(() => _filter = v),
                    tabs: const [
                      (NotificationFilter.all, 'All'),
                      (NotificationFilter.people, 'People'),
                      (NotificationFilter.calls, 'Calls'),
                      (NotificationFilter.money, 'Money'),
                      (NotificationFilter.account, 'Account'),
                    ],
                  ),
                ),
                Expanded(
                  child: RefreshIndicator(
                    color: V.pink,
                    onRefresh: a.refresh,
                    child: ListView(
                      controller: _scroll,
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                      children: [
                        if (requestCount > 0)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: _RequestsStrip(incoming: incoming, sent: sent),
                          ),
                        for (final (n, (b, rows)) in groups.indexed) ...[
                          _header(
                            switch (b) {
                              NotificationBucket.today => 'Today',
                              NotificationBucket.week => 'This week',
                              NotificationBucket.earlier => 'Earlier',
                            },
                            action: n == 0 && listed.any(isNew)
                                ? (
                                    'Mark all read',
                                    a.markAllRead,
                                  )
                                : null,
                          ),
                          _card([for (final i in rows) ActivityRow(item: i, isNew: isNew(i))]),
                        ],
                        if (listed.isEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 24),
                            child: EmptyState(icon: empty.$1, title: empty.$2, body: empty.$3),
                          ),
                        if (!a.hasMore && listed.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 18),
                            child: Text(
                              'We keep notifications for 90 days.',
                              textAlign: TextAlign.center,
                              style: VT.body(12, color: V.muted),
                            ),
                          ),
                        if (a.hasMore)
                          const Padding(
                            padding: EdgeInsets.all(16),
                            child: Center(
                              child: SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2, color: V.pink)),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

Widget _card(List<Widget> rows) => Container(
  clipBehavior: Clip.antiAlias,
  decoration: BoxDecoration(
    color: V.surface,
    borderRadius: BorderRadius.circular(22),
    border: Border.all(color: V.line),
  ),
  child: Column(
    children: [
      for (final (n, r) in rows.indexed) ...[if (n > 0) const Divider(height: 1, color: V.lineSoft), r],
    ],
  ),
);

Widget _header(String text, {(String, VoidCallback)? action}) => Padding(
  padding: const EdgeInsets.fromLTRB(4, 18, 4, 8),
  child: Row(
    children: [
      Expanded(child: Text(text.toUpperCase(), style: VT.overline())),
      if (action != null)
        GestureDetector(
          onTap: action.$2,
          child: Text(
            action.$1,
            style: VT.label(12.5, color: V.pinkSoft, weight: FontWeight.w600),
          ),
        ),
    ],
  ),
);

enum NotificationBucket { today, week, earlier }

NotificationBucket bucketOf(DateTime at, DateTime now) {
  if (Fmt.sameDay(at, now)) return NotificationBucket.today;
  return now.difference(at) < const Duration(days: 7) ? NotificationBucket.week : NotificationBucket.earlier;
}

/// When, as short as it can be: "5m" today, "Mon" this week, "3 Nov 2026" before.
String notificationWhen(DateTime at, [DateTime? now]) {
  final n = now ?? DateTime.now();
  if (Fmt.sameDay(at, n)) return Fmt.agoShort(at);
  if (n.difference(at) < const Duration(days: 6)) return const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][at.weekday - 1];
  return Fmt.date(at);
}

/// Phone: one line for every request, opening the Requests list.
class _RequestsStrip extends StatelessWidget {
  const _RequestsStrip({required this.incoming, required this.sent});
  final List<Friend> incoming;
  final List<Friend> sent;

  @override
  Widget build(BuildContext context) {
    final people = [...incoming, ...sent];
    final names = [for (final f in incoming) f.profile.name.split(' ').first];
    final text = names.isNotEmpty
        ? (names.length <= 2 ? '${names.join(' and ')} ${names.length == 1 ? 'wants' : 'want'} to be friends' : '${names.take(2).join(', ')} and ${names.length - 2} more want to be friends')
        : 'Waiting for ${sent.length == 1 ? sent.first.profile.name.split(' ').first : '${sent.length} people'} to accept';
    return Semantics(
      button: true,
      label: 'Requests: $text',
      child: Material(
        color: V.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: const BorderSide(color: V.line),
        ),
        child: InkWell(
          customBorder: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RequestsScreen())),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                SizedBox(
                  width: people.length > 1 ? 56 : 34,
                  height: 34,
                  child: Stack(
                    children: [
                      for (final (i, f) in people.take(2).indexed)
                        Positioned(
                          left: i * 22.0,
                          child: Container(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(color: V.surface, width: 2),
                            ),
                            child: VAvatar(url: f.profile.avatarUrl, name: f.profile.name, size: 30),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Requests', style: VT.title(14.5)),
                      Text(
                        text,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: VT.body(12.5, color: V.text2),
                      ),
                    ],
                  ),
                ),
                if (incoming.isNotEmpty)
                  Container(
                    constraints: const BoxConstraints(minWidth: 22),
                    height: 22,
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: V.pink, borderRadius: BorderRadius.circular(11)),
                    child: Text(
                      '${incoming.length}',
                      style: VT.label(12, color: Colors.white, weight: FontWeight.w700),
                    ),
                  ),
                const SizedBox(width: 4),
                const Icon(SolarIconsOutline.altArrowRight, size: 20, color: V.muted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Friend requests waiting for you (Accept / Decline) and yours (Cancel).
class RequestsScreen extends StatelessWidget {
  const RequestsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final social = context.watch<SocialProvider>();
    final incoming = social.incoming;
    final sent = social.requested;
    return Scaffold(
      appBar: vibeAppBar(context, 'Requests'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
        children: [
          if (incoming.isNotEmpty) ...[
            _header('Friend requests · ${incoming.length}'),
            _card([for (final f in incoming) _RequestRow(friend: f, incoming: true)]),
          ],
          if (sent.isNotEmpty) ...[
            _header('Sent requests · ${sent.length}'),
            _card([for (final f in sent) _RequestRow(friend: f, incoming: false)]),
          ],
          if (incoming.isEmpty && sent.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 32),
              child: Text(
                'No requests right now.',
                textAlign: TextAlign.center,
                style: VT.body(13.5, color: V.muted),
              ),
            ),
        ],
      ),
    );
  }
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
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => DeepLinks.open({'route': 'profile', 'userId': p.id}),
              child: Row(
                children: [
                  VAvatar(url: p.avatarUrl, name: p.name, size: 42),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${p.name}, ${p.age}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: VT.body(14, weight: FontWeight.w600),
                        ),
                        Text(
                          widget.incoming ? 'Wants to be friends' : 'Waiting for $first',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: VT.body(12.5, color: V.text2),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (widget.incoming) ...[
            TextButton(
              onPressed: _busy ? null : () => _act(() => social.decline(p.id)),
              child: Text('Decline', style: VT.label(12.5, color: V.text2)),
            ),
            SizedBox(
              width: 84,
              child: GradientButton(label: 'Accept', height: 34, busy: _busy, onTap: () => _act(() async => social.accept(p.id), 'You and $first are friends now')),
            ),
          ] else
            TextButton(
              onPressed: _busy ? null : () => _act(() => social.cancel(p.id)),
              child: Text('Cancel', style: VT.label(12.5, color: V.text2)),
            ),
        ],
      ),
    );
  }
}

/// The photo with a small type badge, or Vibe's coloured tile.
class NotificationLead extends StatelessWidget {
  const NotificationLead({super.key, required this.item, this.size = 46});
  final ActivityItem item;
  final double size;

  @override
  Widget build(BuildContext context) {
    final st = NotificationStyle.of(item.type, item.title);
    final a = item.actor;
    if (a != null) {
      return SizedBox.square(
        dimension: size,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            VAvatar(url: a.avatarUrl, name: a.name, size: size),
            Positioned(
              right: -3,
              bottom: -3,
              child: Container(
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: st.color,
                  border: Border.all(color: V.bg, width: 2.5),
                ),
                child: Icon(st.icon, size: 10, color: Colors.white),
              ),
            ),
          ],
        ),
      );
    }
    if (item.type == 'team.message') return TeamAvatar(size: size);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: st.color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: st.color.withValues(alpha: 0.22)),
      ),
      child: Icon(st.icon, size: 23, color: st.color),
    );
  }
}

/// The sentence: who in bold, then what. Lines from a person that start with
/// their name read as one sentence ("**Omar** started following you"); the
/// rest are "**title** · body".
List<InlineSpan> notificationSentence(ActivityItem i) {
  final b = VT.body(14, weight: FontWeight.w700);
  final name = i.actor?.name ?? '';
  final first = name.split(' ').first;
  if (name.isNotEmpty && !i.title.contains(first)) {
    final who = i.body.startsWith(name) ? name : (first.isNotEmpty && i.body.startsWith(first) ? first : null);
    if (who != null) return [TextSpan(text: who, style: b), TextSpan(text: i.body.substring(who.length))];
  }
  return [
    TextSpan(text: i.title, style: b),
    if (i.count > 1)
      TextSpan(
        text: ' · ${i.count} new',
        style: VT.body(14, color: V.pinkSoft, weight: FontWeight.w700),
      ),
    if (i.body.isNotEmpty)
      TextSpan(
        text: ' · ${i.body}',
        style: VT.body(14, color: V.text2),
      ),
  ];
}

/// One notification: opens the thing it is about, with the one action that fits now.
class ActivityRow extends StatefulWidget {
  const ActivityRow({super.key, required this.item, this.isNew = false});
  final ActivityItem item;

  /// Unread when the page opened (a dot and a faint pink wash).
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
      if (mounted) unawaited(context.read<ActivityProvider>().markRead([widget.item.id]));
      if (mounted && done != null) toast(context, done);
      if (mounted) await context.read<ActivityProvider>().refresh();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Exactly where its push would have taken you (the home shell opens it, see `PushRoute`,
  /// and reads the line); the line's own id lets Account status highlight it.
  void _open() => DeepLinks.open({...widget.item.data, 'noteId': widget.item.id, 'activityId': widget.item.id});

  @override
  Widget build(BuildContext context) {
    final i = widget.item;
    return Container(
      color: widget.isNew ? V.pink.withValues(alpha: 0.05) : null,
      padding: const EdgeInsets.fromLTRB(18, 12, 14, 12),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          if (widget.isNew)
            Positioned(
              left: -12,
              top: 0,
              bottom: 0,
              child: Center(
                child: Semantics(
                  label: 'New',
                  child: Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(color: V.pink, shape: BoxShape.circle),
                  ),
                ),
              ),
            ),
          Row(
            children: [
              Expanded(
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: _open,
                  child: Row(
                    children: [
                      NotificationLead(item: i),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text.rich(
                              TextSpan(
                                style: VT.body(14, color: V.text),
                                children: notificationSentence(i),
                              ),
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 3),
                            Text(
                              notificationWhen(i.at),
                              style: VT.label(12, color: V.muted, weight: FontWeight.w500),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (i.actor != null && i.rel != null) Padding(padding: const EdgeInsets.only(left: 8), child: _actions(i.actor!, i.rel!)),
            ],
          ),
        ],
      ),
    );
  }

  /// At most one action (or a pair for a request still waiting).
  Widget _actions(Profile a, ActivityRel rel) {
    final i = widget.item;
    final social = context.read<SocialProvider>();
    final follows = context.read<FollowsProvider>();
    final first = a.name.split(' ').first;
    Widget pair(Future<void> Function() yes, Future<void> Function() no, String done) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        TextButton(
          onPressed: _busy ? null : () => _act(no),
          child: Text('Decline', style: VT.label(12.5, color: V.text2)),
        ),
        SizedBox(
          width: 84,
          child: GradientButton(label: 'Accept', height: 34, busy: _busy, onTap: () => _act(yes, done)),
        ),
      ],
    );

    if (i.type == 'friend.request' && rel.friend == FriendState.incoming) {
      return pair(() async => social.accept(a.id), () => social.decline(a.id), 'You and $first are friends now');
    }
    if (i.type == 'follow.request' && rel.followRequest) {
      return pair(() => follows.accept(a.id), () => follows.decline(a.id), '$first can see your profile now');
    }
    if ((i.type == 'follow.new' || i.type == 'follow.accepted') && rel.follow == FollowState.none) {
      return GradientButton(label: rel.followsYou ? 'Follow back' : 'Follow', height: 34, expand: false, busy: _busy, onTap: () => _act(() async => follows.follow(a.id)));
    }
    if (i.type == 'call.missed' && rel.friend == FriendState.friends) {
      return GhostButton(
        label: 'Call back',
        icon: SolarIconsBold.videocamera,
        height: 34,
        onTap: () {
          final f = social.friend(a.id);
          if (f != null && f.calls.on) {
            context.read<CallsProvider>().ring(f.profile, f.calls.video ? CallMedia.video : CallMedia.voice);
          } else {
            Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: a.id)));
          }
        },
      );
    }
    if ({'friend.accepted', 'discover.match', 'friend.request'}.contains(i.type) && rel.friend == FriendState.friends) {
      return GhostButton(
        label: 'Say hi',
        icon: SolarIconsBold.chatRound,
        height: 34,
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: a.id))),
      );
    }
    return const SizedBox.shrink();
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
      return Tooltip(
        message: label,
        child: RoundControl(icon: SolarIconsBold.bell, size: 40, badge: unread > 0 ? count : null, onTap: open),
      );
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
                  decoration: BoxDecoration(
                    color: V.pink,
                    borderRadius: BorderRadius.circular(9),
                    border: Border.all(color: V.bg, width: 2),
                  ),
                  child: Text(
                    count,
                    style: VT.label(10, color: Colors.white, weight: FontWeight.w700),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
