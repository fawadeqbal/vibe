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
import '../invite/invite_screen.dart';
import '../store/vip_screen.dart';
import 'chat_screen.dart';
import 'moments.dart';
import 'streaks.dart';

/// Your chats, and only chats: the "liked you" teaser for free users, then a
/// calm, unboxed conversation list. Friend requests, sent requests and
/// Messages from Vibe live on the Notifications page (the bell).
class ChatsScreen extends StatelessWidget {
  const ChatsScreen({super.key, required this.onFindPeople});
  final VoidCallback onFindPeople;

  @override
  Widget build(BuildContext context) {
    final social = context.watch<SocialProvider>();
    final wallet = context.watch<WalletProvider>();
    final friends = social.friends;
    final empty = friends.isEmpty;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            PageHeader(
              'Chats',
              actions: [
                const NotificationsBell(),
                const SizedBox(width: 8),
                CircleIconButton(
                  icon: SolarIconsBold.userPlusRounded,
                  iconSize: 20,
                  background: V.surface2,
                  tooltip: 'Invite friends',
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const InviteScreen())),
                ),
              ],
            ),
            const MomentsBar(),
            Expanded(
              child: empty
                  ? Padding(
                      padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom),
                      child: EmptyState(
                        icon: SolarIconsOutline.chatRoundDots,
                        title: 'No friends ',
                        accent: 'yet',
                        body: 'Tap Add during a match. When they accept, you can keep talking here — text and gifts, any time.',
                        action: GradientButton(label: 'Find people', icon: SolarIconsBold.videocamera, expand: false, onTap: onFindPeople),
                      ),
                    )
                  : ListView(
                      // Clear the floating dock (its height arrives as bottom padding).
                      padding: EdgeInsets.fromLTRB(20, 0, 20, 32 + MediaQuery.paddingOf(context).bottom),
                      children: [
                        if (!wallet.isVip && social.likedYouCount > 0) ...[
                          const SizedBox(height: 4),
                          _LikedTeaser(people: social.likedYou, count: social.likedYouCount),
                        ],
                        SectionTitle('Friends · ${friends.length}', top: !wallet.isVip && social.likedYouCount > 0 ? 26 : 4, bottom: 4),
                        for (var i = 0; i < friends.length; i++) _FriendRow(f: friends[i], last: i == friends.length - 1),
                      ],
                    ),
            ),
          ],
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
    final msgs = social.messages(f.profile.id);
    final at = msgs.isEmpty ? f.since : msgs.last.at;
    final unread = f.unread > 0;
    return InkWell(
      onTap: () {
        social.markRead(f.profile.id);
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: f.profile.id)));
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(border: last ? null : const Border(bottom: BorderSide(color: V.lineSoft))),
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
                            Flexible(child: Text(f.profile.name, style: VT.title(16, weight: FontWeight.w600), overflow: TextOverflow.ellipsis)),
                            if (f.profile.verified) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(SolarIconsBold.verifiedCheck, size: 15, color: V.trust)),
                            if (f.streak.count > 0) Padding(padding: const EdgeInsets.only(left: 6), child: StreakChip(streak: f.streak)),
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
                            f.lastMessage ?? 'Say hi 👋',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: VT.body(14, color: unread ? V.text : V.text2, weight: unread ? FontWeight.w500 : FontWeight.w400),
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

/// Pinned row for "Messages from Vibe" (the team's messages from the admin
/// panel), above friend requests.
