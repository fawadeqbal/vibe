import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../notifications/notifications_screen.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/social_provider.dart';
import '../../providers/wallet_provider.dart';
import '../store/vip_screen.dart';
import 'chat_screen.dart';
import 'moments.dart';
import 'streaks.dart';

/// Your chats: search, moments, friend requests (one row that opens the
/// Notifications page, where you answer them), the "liked you" teaser for
/// free users, then your friends in one rounded group. (Design: Chats.)
class ChatsScreen extends StatefulWidget {
  const ChatsScreen({super.key, required this.onFindPeople});
  final VoidCallback onFindPeople;

  @override
  State<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends State<ChatsScreen> {
  final _search = TextEditingController();
  String _q = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final social = context.watch<SocialProvider>();
    final wallet = context.watch<WalletProvider>();
    final all = social.friends;
    final q = _q.trim().toLowerCase();
    final friends = q.isEmpty ? all : all.where((f) => f.profile.name.toLowerCase().contains(q)).toList();
    final requests = social.incoming;
    final empty = all.isEmpty;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            PageHeader(
              'Chats',
              actions: const [NotificationsBell()],
            ),
            if (empty) const MomentsBar(),
            // Search and moments stay put; only the chats under them scroll.
            if (!empty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _SearchField(controller: _search, onChanged: (v) => setState(() => _q = v)),
                    if (q.isEmpty) ...[const SizedBox(height: 14), const MomentsBar(padding: EdgeInsets.zero)],
                  ],
                ),
              ),
            Expanded(
              child: empty
                  ? Padding(
                      padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom),
                      child: EmptyState(
                        icon: SolarIconsOutline.chatRoundDots,
                        title: 'No friends ',
                        accent: 'yet',
                        body: 'Tap Add during a match. When they accept, you can keep talking here — text and gifts, any time.',
                        action: GradientButton(label: 'Find people', icon: SolarIconsBold.videocamera, expand: false, onTap: widget.onFindPeople),
                      ),
                    )
                  : ListView(
                      // Clear the floating dock (its height arrives as bottom padding).
                      padding: EdgeInsets.fromLTRB(16, 0, 16, 32 + MediaQuery.paddingOf(context).bottom),
                      children: [
                        if (q.isEmpty) ...[
                          if (requests.isNotEmpty) ...[const SizedBox(height: 10), _RequestsRow(requests: requests)],
                          if (!wallet.isVip && social.likedYouCount > 0) ...[
                            const SizedBox(height: 14),
                            _LikedTeaser(people: social.likedYou, count: social.likedYouCount),
                          ],
                        ],
                        SectionTitle(q.isEmpty ? 'Friends · ${all.length}' : '${friends.length} ${friends.length == 1 ? 'match' : 'matches'}', top: 22, bottom: 10),
                        if (friends.isEmpty)
                          Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: Text('No friend called “${_q.trim()}”.', style: VT.body(13.5, color: V.muted)))
                        else
                          Container(
                            clipBehavior: Clip.antiAlias,
                            decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(22), border: Border.all(color: V.line)),
                            child: Column(children: [for (var i = 0; i < friends.length; i++) _FriendRow(f: friends[i], last: i == friends.length - 1)]),
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


class _SearchField extends StatelessWidget {
  const _SearchField({required this.controller, required this.onChanged});
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(24), border: Border.all(color: V.line)),
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
              decoration: InputDecoration(hintText: 'Search chats', hintStyle: VT.body(15, color: V.muted), filled: false, border: InputBorder.none, enabledBorder: InputBorder.none, focusedBorder: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero),
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

/// One row for incoming friend requests; you answer them on the Notifications page.
class _RequestsRow extends StatelessWidget {
  const _RequestsRow({required this.requests});
  final List<Friend> requests;

  @override
  Widget build(BuildContext context) {
    final n = requests.length;
    final first = requests.first.profile.name.split(' ').first;
    return Semantics(
      button: true,
      label: 'Friend requests, $n waiting',
      excludeSemantics: true,
      child: Material(
        color: V.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22), side: const BorderSide(color: V.line)),
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NotificationsScreen())),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
            child: Row(
              children: [
                SizedBox(
                  width: 52,
                  height: 52,
                  child: Stack(
                    children: [
                      Positioned(left: 0, top: 0, child: VAvatar(url: requests[0].profile.avatarUrl, name: requests[0].profile.name, size: 40)),
                      if (n > 1)
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Container(
                            decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: V.surface, width: 2)),
                            child: VAvatar(url: requests[1].profile.avatarUrl, name: requests[1].profile.name, size: 40),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Friend requests', style: VT.title(15.5, weight: FontWeight.w600)),
                      Text(n == 1 ? '$first wants to be friends' : '$first and ${n - 1} more want to be friends', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(13, color: V.text2)),
                    ],
                  ),
                ),
                Container(
                  constraints: const BoxConstraints(minWidth: 22),
                  height: 22,
                  padding: const EdgeInsets.symmetric(horizontal: 7),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: V.pink, borderRadius: BorderRadius.circular(11)),
                  child: Text(n > 99 ? '99+' : '$n', style: VT.label(12, color: Colors.white, weight: FontWeight.w700)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LikedTeaser extends StatelessWidget {
  const _LikedTeaser({required this.people, required this.count});
  final List<Profile> people;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(V.r),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VipScreen())),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(V.r),
            gradient: LinearGradient(colors: [V.gold.withValues(alpha: 0.1), V.gold.withValues(alpha: 0.02)]),
            border: Border.all(color: V.gold.withValues(alpha: 0.22)),
          ),
          child: Row(
            children: [
              FaceStack(urls: [for (final p in people.take(3)) p.avatarUrl], borderColor: const Color(0xFF17141F)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('$count ${count == 1 ? 'person' : 'people'} liked you', style: VT.title(14, weight: FontWeight.w600)),
                    Text('See who with VIP', style: VT.body(12, color: V.gold)),
                  ],
                ),
              ),
              const Icon(SolarIconsOutline.altArrowRight, color: V.gold),
            ],
          ),
        ),
      ),
    );
  }
}

class _FriendRow extends StatelessWidget {
  const _FriendRow({required this.f, required this.last});
  final Friend f;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final social = context.read<SocialProvider>();
    final at = social.lastActivity(f);
    final unread = f.unread > 0;
    final typing = context.select<SocialProvider, bool>((s) => s.isTyping(f.profile.id));
    return InkWell(
      onTap: () {
        social.markRead(f.profile.id);
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: f.profile.id)));
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
        foregroundDecoration: last ? null : const _InsetDivider(82),
        child: Row(
          children: [
            Stack(
              children: [
                VAvatar(url: f.profile.avatarUrl, name: f.profile.name, size: 52),
                if (f.online)
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(width: 14, height: 14, decoration: BoxDecoration(shape: BoxShape.circle, color: V.ok, border: Border.all(color: V.bg, width: 2.5))),
                  ),
              ],
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Row(
                          children: [
                            Flexible(child: Text(f.profile.name, style: VT.title(15.5, weight: unread ? FontWeight.w700 : FontWeight.w600), overflow: TextOverflow.ellipsis)),
                            if (f.profile.verified) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(SolarIconsBold.verifiedCheck, size: 15, color: V.trust)),
                            if (f.streak.count > 0) Padding(padding: const EdgeInsets.only(left: 6), child: StreakFlame(streak: f.streak)),
                          ],
                        ),
                      ),
                      Text(Fmt.agoShort(at), style: VT.label(12, color: unread ? V.pinkSoft : V.muted, weight: unread ? FontWeight.w600 : FontWeight.w400)),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      if (f.streak.restorable) ...[
                        Flexible(child: Text('Streak lost · ', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(13.5, color: V.muted))),
                        RestoreStreakButton(friend: f),
                        const Spacer(),
                      ] else
                        Expanded(
                          child: Text(
                            typing ? 'typing…' : (f.lastMessage ?? 'Say hi 👋'),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: VT.body(13, color: typing ? V.ok : (unread ? V.text : V.text2), weight: typing || unread ? FontWeight.w600 : FontWeight.w400),
                          ),
                        ),
                      if (unread)
                        Container(
                          margin: const EdgeInsets.only(left: 8),
                          constraints: const BoxConstraints(minWidth: 20),
                          height: 20,
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: V.pink, borderRadius: BorderRadius.circular(10)),
                          child: Text('${f.unread}', style: VT.label(11, color: Colors.white, weight: FontWeight.w700)),
                        ),
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

/// A hairline under a row, starting after the avatar (rows in a group).
class _InsetDivider extends Decoration {
  const _InsetDivider(this.left);
  final double left;
  @override
  BoxPainter createBoxPainter([VoidCallback? onChanged]) => _InsetDividerPainter(left);
}

class _InsetDividerPainter extends BoxPainter {
  _InsetDividerPainter(this.left);
  final double left;
  @override
  void paint(Canvas canvas, Offset offset, ImageConfiguration configuration) {
    final size = configuration.size!;
    canvas.drawRect(Rect.fromLTWH(offset.dx + left, offset.dy + size.height - 1, size.width - left, 1), Paint()..color = V.lineSoft);
  }
}
