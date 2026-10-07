import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/inbox_provider.dart';
import '../../providers/social_provider.dart';
import '../../providers/wallet_provider.dart';
import '../invite/invite_screen.dart';
import '../store/vip_screen.dart';
import 'chat_screen.dart';
import 'inbox_screen.dart';
import 'moments.dart';
import 'streaks.dart';

/// Friends you made in matches. Requests on top with labelled
/// Accept/Decline, the "liked you" teaser for free users, then a calm,
/// unboxed conversation list.
class ChatsScreen extends StatelessWidget {
  const ChatsScreen({super.key, required this.onFindPeople});
  final VoidCallback onFindPeople;

  @override
  Widget build(BuildContext context) {
    final social = context.watch<SocialProvider>();
    final wallet = context.watch<WalletProvider>();
    final inbox = context.watch<InboxProvider>();
    final friends = social.friends;
    final incoming = social.incoming;
    final requested = social.requested;
    final empty = friends.isEmpty && incoming.isEmpty && requested.isEmpty && inbox.latest == null;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            PageHeader(
              'Chats',
              actions: [
                CircleIconButton(
                  icon: Icons.person_add_alt_1_rounded,
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
                        icon: Icons.chat_bubble_outline_rounded,
                        title: 'No friends ',
                        accent: 'yet',
                        body: 'Tap Add during a match. When they accept, you can keep talking here — text and gifts, any time.',
                        action: GradientButton(label: 'Find people', icon: Icons.videocam_rounded, expand: false, onTap: onFindPeople),
                      ),
                    )
                  : ListView(
                      // Clear the floating dock (its height arrives as bottom padding).
                      padding: EdgeInsets.fromLTRB(20, 0, 20, 32 + MediaQuery.paddingOf(context).bottom),
                      children: [
                        if (inbox.latest != null) _TeamRow(latest: inbox.latest!, unread: inbox.unread),
                        if (incoming.isNotEmpty) ...[
                          SectionTitle('Requests · ${incoming.length}', top: inbox.latest == null ? 4 : 18),
                          for (final f in incoming) _RequestCard(f: f),
                        ],
                        if (!wallet.isVip && social.likedYouCount > 0) ...[
                          SizedBox(height: incoming.isEmpty ? 4 : 10),
                          _LikedTeaser(people: social.likedYou, count: social.likedYouCount),
                        ],
                        if (requested.isNotEmpty) ...[
                          const SizedBox(height: 14),
                          for (final f in requested)
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
                              child: Row(
                                children: [
                                  Opacity(opacity: 0.8, child: VAvatar(url: f.profile.avatarUrl, name: f.profile.name, size: 24)),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text.rich(
                                      TextSpan(children: [
                                        TextSpan(text: 'Waiting for ', style: VT.body(12.5, color: V.muted)),
                                        TextSpan(text: f.profile.name, style: VT.body(12.5, color: V.text2, weight: FontWeight.w600)),
                                        TextSpan(text: ' to accept', style: VT.body(12.5, color: V.muted)),
                                      ]),
                                    ),
                                  ),
                                  const Icon(Icons.hourglass_top_rounded, size: 16, color: V.muted),
                                ],
                              ),
                            ),
                        ],
                        SectionTitle('Friends · ${friends.length}', top: 26, bottom: 4),
                        if (friends.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 2), child: Text('Nobody has accepted yet.', style: VT.body(13, color: V.text2))),
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

class _RequestCard extends StatelessWidget {
  const _RequestCard({required this.f});
  final Friend f;

  @override
  Widget build(BuildContext context) {
    final social = context.read<SocialProvider>();
    final p = f.profile;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(V.r), border: Border.all(color: V.pink.withValues(alpha: 0.32))),
        child: Column(
          children: [
            Row(
              children: [
                VAvatar(url: p.avatarUrl, name: p.name, size: 52, ring: true, gapColor: V.surface),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(child: Text('${p.name}, ${p.age}', overflow: TextOverflow.ellipsis, style: VT.title(16, weight: FontWeight.w600))),
                          if (p.verified) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(Icons.verified_rounded, size: 16, color: V.trust, semanticLabel: 'Verified')),
                        ],
                      ),
                      const SizedBox(height: 1),
                      Text('${p.country.flag} ${p.country.name} · wants to be friends', overflow: TextOverflow.ellipsis, style: VT.body(12.5, color: V.text2)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: GhostButton(label: 'Decline', height: 42, expand: true, color: V.text2, onTap: () => social.decline(p.id))),
                const SizedBox(width: 8),
                Expanded(child: GradientButton(label: 'Accept', height: 42, onTap: () => social.accept(p.id))),
              ],
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
              const Icon(Icons.chevron_right_rounded, color: V.gold),
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
                            if (f.profile.verified) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(Icons.verified_rounded, size: 15, color: V.trust)),
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
class _TeamRow extends StatelessWidget {
  const _TeamRow({required this.latest, required this.unread});
  final TeamMessage latest;
  final int unread;

  @override
  Widget build(BuildContext context) {
    final hasUnread = unread > 0;
    return Semantics(
      button: true,
      label: hasUnread ? 'Messages from Vibe, $unread new' : 'Messages from Vibe',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(V.r),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const InboxScreen())),
        child: Ink(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: V.surface,
            borderRadius: BorderRadius.circular(V.r),
            border: Border.all(color: hasUnread ? V.pink.withValues(alpha: 0.32) : V.line),
          ),
          child: Row(
            children: [
              const TeamAvatar(size: 46),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text('Messages from Vibe', style: VT.title(15, weight: FontWeight.w600), overflow: TextOverflow.ellipsis)),
                        Text(Fmt.agoShort(latest.at), style: VT.label(12, color: hasUnread ? V.pinkSoft : V.muted, weight: hasUnread ? FontWeight.w600 : FontWeight.w400)),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            latest.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: VT.body(13.5, color: hasUnread ? V.text : V.text2, weight: hasUnread ? FontWeight.w500 : FontWeight.w400),
                          ),
                        ),
                        if (hasUnread)
                          Container(
                            margin: const EdgeInsets.only(left: 8),
                            constraints: const BoxConstraints(minWidth: 20),
                            height: 20,
                            padding: const EdgeInsets.symmetric(horizontal: 6),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(color: V.pink, borderRadius: BorderRadius.circular(10)),
                            child: Text(unread > 99 ? '99+' : '$unread', style: VT.label(11, color: Colors.white, weight: FontWeight.w700)),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
