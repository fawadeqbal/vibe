import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../notifications/notifications_screen.dart' show NotificationsBell;
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/social_provider.dart';
import '../../providers/wallet_provider.dart';
import '../store/vip_screen.dart';
import '../../core/api/api_exception.dart';
import 'chat_preview.dart';
import 'chat_screen.dart';
import 'message_status.dart';
import 'moments.dart';
import 'streaks.dart';

/// Your chats, edge to edge like the messaging apps people know: search,
/// four filters (All · Unread · Online · Requests), then — under All —
/// moments and who's online, friend requests and "liked you" as slim rows,
/// and your chats, newest first. Each line says what the last message was
/// (seen ticks, photo, voice note, gift, a missed call in red, typing…).
/// Same as the web (`chats-list.tsx`).
class ChatsScreen extends StatefulWidget {
  const ChatsScreen({super.key, required this.onFindPeople});
  final VoidCallback onFindPeople;

  @override
  State<ChatsScreen> createState() => _ChatsScreenState();
}

enum _Filter { all, unread, online, requests }

class _ChatsScreenState extends State<ChatsScreen> {
  final _search = TextEditingController();
  String _q = '';
  _Filter _filter = _Filter.all;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _openChat(Friend f) {
    context.read<SocialProvider>().markRead(f.profile.id);
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: f.profile.id)));
  }

  @override
  Widget build(BuildContext context) {
    final social = context.watch<SocialProvider>();
    final wallet = context.watch<WalletProvider>();
    final all = social.friends;
    final requests = social.incoming;
    final q = _q.trim().toLowerCase();
    bool named(Friend f) => q.isEmpty || f.profile.name.toLowerCase().contains(q);
    final unreadCount = all.where((f) => f.unread > 0).length;
    final online = all.where((f) => f.online).toList();
    final shown = switch (_filter) {
      _Filter.requests => requests.where(named).toList(),
      _Filter.unread => all.where((f) => named(f) && f.unread > 0).toList(),
      _Filter.online => online.where(named).toList(),
      _Filter.all => all.where(named).toList(),
    };
    final empty = all.isEmpty && requests.isEmpty;
    final bottom = 32 + MediaQuery.paddingOf(context).bottom;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            PageHeader('Chats', actions: const [NotificationsBell()]),
            if (empty) ...[
              const MomentsBar(),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom),
                  child: EmptyState(
                    icon: SolarIconsOutline.chatRoundDots,
                    title: 'No friends ',
                    accent: 'yet',
                    body: 'Tap Add during a match. When they accept, you can keep talking here — text and gifts, any time.',
                    action: GradientButton(label: 'Find people', icon: SolarIconsBold.videocamera, expand: false, onTap: widget.onFindPeople),
                  ),
                ),
              ),
            ] else ...[
              // Search and filters stay put; only the list under them scrolls.
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                child: _SearchField(controller: _search, onChanged: (v) => setState(() => _q = v)),
              ),
              SizedBox(
                height: 50,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  children: [
                    _Chip(label: 'All', on: _filter == _Filter.all, onTap: () => setState(() => _filter = _Filter.all)),
                    _Chip(label: 'Unread', count: unreadCount, on: _filter == _Filter.unread, onTap: () => setState(() => _filter = _Filter.unread)),
                    _Chip(label: 'Online', count: online.length, on: _filter == _Filter.online, onTap: () => setState(() => _filter = _Filter.online)),
                    _Chip(label: 'Requests', count: requests.length, on: _filter == _Filter.requests, onTap: () => setState(() => _filter = _Filter.requests)),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  // Clear the floating dock (its height arrives as bottom padding).
                  padding: EdgeInsets.only(top: 6, bottom: bottom),
                  children: [
                    if (_filter == _Filter.all && q.isEmpty) ...[
                      MomentsBar(online: online, onOpenChat: _openChat),
                      if (requests.isNotEmpty) _RequestsRow(requests: requests, onTap: () => setState(() => _filter = _Filter.requests)),
                      if (!wallet.isVip && social.likedYouCount > 0) _LikedRow(people: social.likedYou, count: social.likedYouCount),
                    ],
                    if (_filter == _Filter.requests)
                      for (final f in shown) _RequestRow(key: ValueKey('req-${f.profile.id}'), f: f)
                    else
                      for (final f in shown) _ChatRow(key: ValueKey('chat-${f.profile.id}'), f: f, onTap: () => _openChat(f)),
                    if (shown.isEmpty)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(24, 32, 24, 0),
                        child: Text(
                          q.isNotEmpty
                              ? 'Nobody called “${_q.trim()}”.'
                              : switch (_filter) {
                                  _Filter.unread => "You're all caught up.",
                                  _Filter.online => 'None of your friends are online right now.',
                                  _Filter.requests => 'No friend requests right now.',
                                  _Filter.all => 'No chats yet.',
                                },
                          textAlign: TextAlign.center,
                          style: VT.body(13.5, color: V.muted),
                        ),
                      )
                    else if (_filter == _Filter.unread)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(24, 18, 24, 0),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text("That's everything unread. ", style: VT.body(13, color: V.muted)),
                            GestureDetector(
                              onTap: () {
                                for (final f in all.where((f) => f.unread > 0)) {
                                  social.markRead(f.profile.id);
                                }
                              },
                              child: Text('Mark all as read', style: VT.body(13, color: V.pinkSoft, weight: FontWeight.w600)),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.on, required this.onTap, this.count = 0});
  final String label;
  final bool on;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Semantics(
        button: true,
        selected: on,
        label: count > 0 ? '$label, $count' : label,
        excludeSemantics: true,
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            height: 34,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(color: on ? V.text : V.surface, borderRadius: BorderRadius.circular(17), border: Border.all(color: on ? V.text : V.line)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label, style: VT.label(13.5, color: on ? V.bg : V.text2, weight: FontWeight.w600)),
                if (count > 0) ...[const SizedBox(width: 6), Text(count > 99 ? '99+' : '$count', style: VT.number(12, color: on ? V.bg : V.pinkSoft, weight: FontWeight.w700))],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({required this.controller, required this.onChanged});
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 42,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: V.line)),
      child: Row(
        children: [
          const Icon(Icons.search_rounded, size: 21, color: V.muted),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              style: VT.body(15),
              cursorColor: V.pink,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(hintText: 'Search', hintStyle: VT.body(15, color: V.muted), filled: false, border: InputBorder.none, enabledBorder: InputBorder.none, focusedBorder: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero),
            ),
          ),
          if (controller.text.isNotEmpty)
            IconButton(
              tooltip: 'Clear search',
              visualDensity: VisualDensity.compact,
              icon: const Icon(Icons.close_rounded, size: 18, color: V.muted),
              onPressed: () {
                controller.clear();
                onChanged('');
              },
            ),
        ],
      ),
    );
  }
}

/// Slim row above the chats: who's asking to be friends; opens the Requests filter.
class _RequestsRow extends StatelessWidget {
  const _RequestsRow({required this.requests, required this.onTap});
  final List<Friend> requests;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final n = requests.length;
    final first = requests.first.profile.name.split(' ').first;
    return Semantics(
      button: true,
      label: 'Friend requests, $n waiting',
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(shape: BoxShape.circle, color: V.violet.withValues(alpha: 0.16)),
                child: const Icon(SolarIconsOutline.userPlus, size: 24, color: V.lavender),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Friend requests', style: VT.title(15.5, weight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(n == 1 ? '$first wants to be friends' : '$first and ${n - 1} more want to be friends', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(13.5, color: V.text2)),
                  ],
                ),
              ),
              _Badge(n),
              const SizedBox(width: 4),
              const Icon(SolarIconsOutline.altArrowRight, size: 20, color: V.muted),
            ],
          ),
        ),
      ),
    );
  }
}

class _LikedRow extends StatelessWidget {
  const _LikedRow({required this.people, required this.count});
  final List<Profile> people;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VipScreen())),
          child: Ink(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              color: V.gold.withValues(alpha: 0.08),
              border: Border.all(color: V.gold.withValues(alpha: 0.2)),
            ),
            child: Row(
              children: [
                if (people.isNotEmpty)
                  FaceStack(urls: [for (final p in people.take(3)) p.avatarUrl], borderColor: const Color(0xFF17141F), size: 28)
                else
                  const Icon(SolarIconsOutline.heart, size: 20, color: V.gold),
                const SizedBox(width: 12),
                Expanded(child: Text('$count ${count == 1 ? 'person' : 'people'} liked you', style: VT.title(13.5, weight: FontWeight.w600))),
                Text('See with VIP', style: VT.label(13, color: V.gold, weight: FontWeight.w700)),
                const Icon(SolarIconsOutline.altArrowRight, size: 18, color: V.gold),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge(this.n);
  final int n;

  @override
  Widget build(BuildContext context) => Container(
        constraints: const BoxConstraints(minWidth: 20),
        height: 20,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        alignment: Alignment.center,
        decoration: BoxDecoration(color: V.pink, borderRadius: BorderRadius.circular(10)),
        child: Text(n > 99 ? '99+' : '$n', style: VT.number(11.5, color: Colors.white, weight: FontWeight.w700)),
      );
}

/// The streak on a chat row: flame and days in a small pill; gold with an hourglass when it ends tonight.
class _StreakPill extends StatelessWidget {
  const _StreakPill(this.s);
  final StreakView s;

  @override
  Widget build(BuildContext context) {
    final color = s.atRisk ? V.gold : V.pinkSoft;
    return Semantics(
      label: '${s.count}-day streak${s.atRisk ? ', ends tonight' : ''}',
      excludeSemantics: true,
      child: Container(
        height: 20,
        padding: const EdgeInsets.fromLTRB(4, 0, 7, 0),
        decoration: BoxDecoration(color: (s.atRisk ? V.gold : V.pink).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(SolarIconsBold.fire, size: 13, color: color),
            const SizedBox(width: 2),
            Text('${s.count}', style: VT.number(11.5, color: color, weight: FontWeight.w700)),
            if (s.atRisk) ...[const SizedBox(width: 2), Icon(SolarIconsOutline.hourglass, size: 12, color: color)],
          ],
        ),
      ),
    );
  }
}

class _ChatRow extends StatelessWidget {
  const _ChatRow({super.key, required this.f, required this.onTap});
  final Friend f;
  final VoidCallback onTap;

  static const _icons = {
    PreviewIcon.photo: SolarIconsOutline.gallery,
    PreviewIcon.mic: SolarIconsOutline.microphone,
    PreviewIcon.gift: SolarIconsOutline.gift,
    PreviewIcon.call: SolarIconsOutline.phone,
    PreviewIcon.callMissed: SolarIconsOutline.phoneCalling,
  };

  @override
  Widget build(BuildContext context) {
    final social = context.read<SocialProvider>();
    final at = social.lastActivity(f);
    final unread = f.unread > 0;
    final typing = context.select<SocialProvider, bool>((s) => s.isTyping(f.profile.id));
    final seenAt = context.select<SocialProvider, DateTime?>((s) => s.seenAt(f.profile.id));
    final deliveredAt = context.select<SocialProvider, DateTime?>((s) => s.deliveredAt(f.profile.id));
    final p = ChatPreview.of(f, seenAt: seenAt, deliveredAt: deliveredAt);
    final color = typing ? V.ok : (p.missed ? V.bad : (unread ? V.text : V.text2));
    return InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              Stack(
                children: [
                  VAvatar(url: f.profile.avatarUrl, name: f.profile.name, size: 56),
                  if (f.online)
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: Container(width: 15, height: 15, decoration: BoxDecoration(shape: BoxShape.circle, color: V.ok, border: Border.all(color: V.bg, width: 2.5))),
                    ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Name, tick and streak on the left; the time always in the same place, at the right edge.
                    Row(
                      children: [
                        Expanded(
                          child: Row(
                            children: [
                              Flexible(child: Text(f.profile.name, style: VT.title(15.5, weight: unread ? FontWeight.w700 : FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis)),
                              if (f.profile.verified) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(SolarIconsBold.verifiedCheck, size: 15, color: V.trust)),
                              if (f.streak.count > 0) Padding(padding: const EdgeInsets.only(left: 6), child: _StreakPill(f.streak)),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(Fmt.agoShort(at), key: ValueKey('time-${f.profile.id}'), textAlign: TextAlign.right, style: VT.number(12, color: unread ? V.pinkSoft : V.muted, weight: unread ? FontWeight.w600 : FontWeight.w500)),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        if (f.streak.restorable)
                          Expanded(
                            child: Row(
                              children: [
                                Flexible(child: Text('Streak lost · ', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(13.5, color: V.muted))),
                                RestoreStreakButton(friend: f),
                              ],
                            ),
                          )
                        else ...[
                          if (!typing && p.ticks != null) ...[
                            Ticks(switch (p.ticks!) {
                              PreviewTicks.seen => MessageStatus.seen,
                              PreviewTicks.delivered => MessageStatus.delivered,
                              PreviewTicks.sent => MessageStatus.sent,
                            }),
                            const SizedBox(width: 4),
                          ],
                          if (!typing && p.icon != null) ...[
                            Icon(_icons[p.icon], size: 15, color: p.icon == PreviewIcon.gift ? V.gold : color),
                            const SizedBox(width: 4),
                          ],
                          Expanded(
                            child: Text(
                              typing ? 'typing…' : p.text,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: VT.body(13.5, color: color, weight: typing || unread ? FontWeight.w600 : FontWeight.w400),
                            ),
                          ),
                        ],
                        if (unread) ...[const SizedBox(width: 8), Semantics(label: '${f.unread} unread', excludeSemantics: true, child: _Badge(f.unread))],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
    );
  }
}

/// Requests filter: someone wants to be friends; answer right here.
class _RequestRow extends StatefulWidget {
  const _RequestRow({super.key, required this.f});
  final Friend f;

  @override
  State<_RequestRow> createState() => _RequestRowState();
}

class _RequestRowState extends State<_RequestRow> {
  bool _busy = false;

  Future<void> _answer(bool yes) async {
    final social = context.read<SocialProvider>();
    final first = widget.f.profile.name.split(' ').first;
    setState(() => _busy = true);
    try {
      if (yes) {
        await social.accept(widget.f.profile.id);
      } else {
        await social.decline(widget.f.profile.id);
      }
      if (mounted) toast(context, yes ? 'You and $first are friends' : 'Request declined');
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final f = widget.f;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          VAvatar(url: f.profile.avatarUrl, name: f.profile.name, size: 52),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(child: Text(f.profile.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.title(15.5, weight: FontWeight.w600))),
                    if (f.profile.verified) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(SolarIconsBold.verifiedCheck, size: 15, color: V.trust)),
                  ],
                ),
                Text('Wants to be friends · ${Fmt.agoShort(f.since)}', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(13, color: V.text2)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: _busy ? null : () => _answer(false),
            style: OutlinedButton.styleFrom(minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 14), shape: const StadiumBorder(), side: const BorderSide(color: V.line), foregroundColor: V.text2),
            child: Text('Decline', style: VT.label(13, color: V.text2, weight: FontWeight.w600)),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: _busy ? null : () => _answer(true),
            style: FilledButton.styleFrom(minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 14), shape: const StadiumBorder(), backgroundColor: V.pink),
            child: Text('Accept', style: VT.label(13, color: Colors.white, weight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}
