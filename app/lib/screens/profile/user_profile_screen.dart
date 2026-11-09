import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/intent_icons.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/follows.dart';
import '../../models/models.dart';
import '../../providers/follows_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/social_provider.dart';
import '../../providers/wallet_provider.dart';
import '../match/report_sheet.dart';
import '../social/chat_screen.dart';
import '../store/store_screen.dart';
import 'progress.dart';

/// Someone else's profile. It opens up as you get closer: matched → following
/// (counts, stats) → friends (online, last seen, Message). Anyone you've met
/// can be sent a friend request from here.
class UserProfileScreen extends StatelessWidget {
  const UserProfileScreen({super.key, required this.userId});
  final String userId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: Center(child: CircleIconButton(icon: SolarIconsOutline.arrowLeft, tooltip: 'Back', onTap: () => Navigator.of(context).maybePop())),
        leadingWidth: 64,
      ),
      body: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 32), child: UserProfileBody(userId: userId)),
    );
  }
}

/// Opens a profile over whatever is on screen — used in a live call, so the call keeps going.
Future<void> showUserProfileSheet(BuildContext context, String userId) => showVibeSheet<void>(
      context,
      scrollable: true,
      child: Padding(padding: const EdgeInsets.fromLTRB(20, 8, 20, 20), child: UserProfileBody(userId: userId, inCall: true)),
    );

class UserProfileBody extends StatefulWidget {
  const UserProfileBody({super.key, required this.userId, this.inCall = false});
  final String userId;

  /// In a call: no jumping to chat (the call screen stays underneath).
  final bool inCall;

  @override
  State<UserProfileBody> createState() => _UserProfileBodyState();
}

class _UserProfileBodyState extends State<UserProfileBody> {
  ProfileView? _view;
  bool _loading = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    // After the first frame: a quick answer must not notify listeners mid-build.
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final v = await context.read<FollowsProvider>().view(widget.userId);
      if (mounted) {
        setState(() {
          _view = v;
          _loading = false;
        });
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      toast(context, e.message, error: true);
    }
  }

  /// Runs an action, then re-reads the profile (the tier may have changed).
  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      await _load();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _follow() => _run(() async {
        final s = await context.read<FollowsProvider>().follow(widget.userId);
        if (mounted && s == FollowState.requested) toast(context, 'Request sent. They have a private account.');
      });

  Future<void> _unfollow(String name, FollowState s) async {
    final pending = s == FollowState.requested;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(pending ? 'Cancel your request?' : 'Unfollow $name?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Keep', style: TextStyle(color: V.text2))),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(pending ? 'Cancel request' : 'Unfollow', style: const TextStyle(color: V.bad))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _run(() => context.read<FollowsProvider>().unfollow(widget.userId));
  }

  Future<void> _friendAction(Profile p, FriendState s) async {
    final social = context.read<SocialProvider>();
    switch (s) {
      case FriendState.friends:
        if (!widget.inCall) await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: p.id)));
      case FriendState.incoming:
        await _run(() async => social.accept(p.id));
      case FriendState.requested:
        final ok = await _confirm('Cancel your friend request?', null, 'Cancel request', keep: 'Keep', danger: true);
        if (ok && mounted) await _run(() => social.cancel(p.id));
      case FriendState.none:
        await _sendRequest(p);
      case FriendState.blocked:
        return;
    }
  }

  /// Same rules as the + on the call screen: free requests first, then coins.
  Future<void> _sendRequest(Profile p) async {
    final social = context.read<SocialProvider>();
    if (context.read<WalletProvider>().freeFriendRequestsLeft == 0) {
      final ok = await _confirm(
        'Send ${p.name} a friend request?',
        'Your ${Economy.freeFriendRequestsPerDay} free requests for today are used. This one costs ${Economy.friendRequestCost} coins.',
        'Send for ${Economy.friendRequestCost}',
      );
      if (!ok || !mounted) return;
    }
    await _run(() async {
      if (await social.sendRequest(p)) {
        if (mounted) toast(context, 'Request sent to ${p.name}');
      } else if (mounted) {
        final go = await _confirm('Not enough coins', 'A friend request costs ${Economy.friendRequestCost} coins once your free ones are used.\n\nTop up, or earn free coins in the store.', 'Get coins', keep: 'Not now');
        if (go && mounted) await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StoreScreen(asPage: true)));
      }
    });
  }

  Future<bool> _confirm(String title, String? body, String ok, {String keep = 'Cancel', bool danger = false}) async {
    final r = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: body == null ? null : Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(keep, style: const TextStyle(color: V.text2))),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(ok, style: danger ? const TextStyle(color: V.bad) : null)),
        ],
      ),
    );
    return r == true;
  }

  Future<void> _menu(String action, ProfileView v) async {
    final p = v.profile;
    final social = context.read<SocialProvider>();
    final follows = context.read<FollowsProvider>();
    switch (action) {
      case 'remove-follower':
        await _run(() => follows.removeFollower(p.id));
      case 'unfriend':
        await _run(() => social.remove(p.id));
      case 'report':
        final choice = await showReportSheet(context, name: p.name, where: ReportContext.person);
        if (choice == null || !mounted) return;
        await _run(() => follows.report(p.id, choice.reason, note: choice.note, block: choice.block));
        if (choice.block) await social.load();
        if (mounted) toast(context, 'Thanks. ${p.name} was reported${choice.block ? ' and blocked' : ''}.');
      case 'block':
        await social.block(p);
        if (mounted) Navigator.of(context).maybePop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final follow = context.select<FollowsProvider, FollowState>((f) => f.stateOf(widget.userId));
    final friend = context.select<SocialProvider, FriendState>((s) => s.stateOf(widget.userId));
    final streak = context.select<SocialProvider, StreakView>((s) => s.friend(widget.userId)?.streak ?? StreakView.none);
    // Friends: live from the friends list (presence events), else what the profile said when it loaded.
    final live = context.select<SocialProvider, (bool?, DateTime?)>((s) {
      final f = s.friend(widget.userId);
      return f == null || f.state != FriendState.friends ? (null, null) : (f.online, f.lastSeenAt);
    });
    if (_loading) return const Padding(padding: EdgeInsets.symmetric(vertical: 80), child: Center(child: CircularProgressIndicator(color: V.pink)));
    final v = _view;
    if (v == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: EmptyState(icon: SolarIconsBold.userCrossRounded, title: 'Profile not available', body: 'You can see the profiles of people you have met in a match.'),
      );
    }
    final p = v.profile;
    final self = v.tier == ProfileTier.self;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Stack(
              children: [
                VAvatar(url: p.avatarUrl, name: p.name, size: 92, ring: true),
                if (v.online == true)
                  Positioned(right: 4, bottom: 4, child: Container(width: 20, height: 20, decoration: BoxDecoration(shape: BoxShape.circle, color: V.ok, border: Border.all(color: V.bg, width: 3)))),
              ],
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Row(
                children: [
                  _stat(v.followers == null ? '—' : Fmt.compact(v.followers!), v.followers == 1 ? 'Follower' : 'Followers'),
                  _stat(v.stats == null ? '—' : Fmt.compact(v.stats!.likes), 'Likes'),
                  _stat('Lv ${v.level}', 'Level'),
                ],
              ),
            ),
            if (!self)
              PopupMenuButton<String>(
                icon: const Icon(SolarIconsBold.menuDots, color: V.text2),
                tooltip: 'More',
                onSelected: (a) => _menu(a, v),
                itemBuilder: (_) => [
                  if (v.followsYou) const PopupMenuItem(value: 'remove-follower', child: Text('Remove follower')),
                  if (friend == FriendState.friends) const PopupMenuItem(value: 'unfriend', child: Text('Unfriend')),
                  const PopupMenuItem(value: 'report', child: Text('Report')),
                  const PopupMenuItem(value: 'block', child: Text('Block', style: TextStyle(color: V.bad))),
                ],
              ),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Flexible(child: Text('${p.name}, ${p.age}', overflow: TextOverflow.ellipsis, style: VT.title(18))),
            if (p.verified) const Padding(padding: EdgeInsets.only(left: 6), child: Icon(SolarIconsBold.verifiedCheck, color: V.trust, size: 18, semanticLabel: 'Verified')),
            if (p.vip) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(SolarIconsBold.crown, color: V.gold, size: 18, semanticLabel: 'VIP')),
            if (v.followsYou) const Padding(padding: EdgeInsets.only(left: 8), child: Tag('Follows you', color: V.violet)),
          ],
        ),
        const SizedBox(height: 2),
        Builder(builder: (_) {
          final status = v.tier == ProfileTier.friends ? Fmt.presence(live.$1 ?? v.online, live.$2 ?? v.lastSeenAt) : null;
          return Text([('${p.country.flag} ${p.country.name}'), p.gender.label, if (status != null) (status == 'Online' ? 'Active now' : status)].join(' · '), style: VT.body(13, color: V.text2));
        }),
        if (p.bio.trim().isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(p.bio, style: VT.body(14, color: V.text))),
        if (v.stats == null && !self)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Row(children: [
              Icon(v.statsHidden ? SolarIconsOutline.eyeClosed : SolarIconsOutline.lock, size: 14, color: V.muted),
              const SizedBox(width: 6),
              Text(v.statsHidden ? 'Stats hidden' : 'Follow to see their stats', style: VT.body(12, color: V.muted)),
            ]),
          ),
        if (friend == FriendState.friends && streak.count > 0)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Row(children: [
              Icon(SolarIconsBold.fire, size: 16, color: streak.atRisk ? V.warn : V.flame),
              const SizedBox(width: 4),
              Text('${streak.count}-day streak${streak.atRisk ? ' · ends tonight' : ''}', style: VT.label(13, color: streak.atRisk ? V.warn : V.flame)),
            ]),
          ),
        if (!self) ...[
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(child: _followButton(p, follow, v.followsYou)),
              // Friends: anyone you've met (call or Discover match). On a live call the + on the call screen does it.
              if (friend != FriendState.blocked && (friend != FriendState.none || (v.met && !widget.inCall))) ...[
                const SizedBox(width: 10),
                Expanded(child: _friendButton(p, friend)),
              ],
            ],
          ),
          if (friend == FriendState.incoming) ...[
            const SizedBox(height: 10),
            Row(children: [
              const Icon(SolarIconsBold.userPlusRounded, size: 16, color: V.muted),
              const SizedBox(width: 8),
              Expanded(child: Text('${p.name.split(' ').first} wants to be friends.', style: VT.body(12.5, color: V.text2))),
              TextButton(
                onPressed: _busy ? null : () => _run(() => context.read<SocialProvider>().decline(p.id)),
                child: Text('Decline', style: VT.label(12.5, color: V.text2)),
              ),
            ]),
          ],
          if (friend == FriendState.none && (widget.inCall || !v.met)) ...[
            const SizedBox(height: 10),
            Row(children: [
              const Icon(SolarIconsBold.videocamera, size: 16, color: V.muted),
              const SizedBox(width: 8),
              Expanded(child: Text(widget.inCall ? 'Tap + on the call to add ${p.name} as a friend' : 'You can add ${p.name} as a friend after you meet on a video call.', style: VT.body(12.5, color: V.text2))),
            ]),
          ],
        ],
        if (p.interests.isNotEmpty) ...[
          const SectionTitle('Interests', top: 22, bottom: 10),
          Builder(builder: (context) {
            final mine = _myInterests(context);
            return Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final i in p.interests)
                  Container(
                    height: 32,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: mine.contains(i) ? V.pink.withValues(alpha: 0.14) : Colors.white.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: mine.contains(i) ? V.pink.withValues(alpha: 0.4) : V.line),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      if (mine.contains(i)) ...[const Icon(Icons.check_rounded, size: 14, color: V.pinkSoft), const SizedBox(width: 4)],
                      Text(i, style: VT.label(13, color: mine.contains(i) ? V.pinkSoft : V.text, weight: FontWeight.w600)),
                    ]),
                  ),
              ],
            );
          }),
        ],
        if (p.intent != null)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Row(children: [Icon(intentIcon(p.intent!), size: 16, color: V.pinkSoft), const SizedBox(width: 6), Text('Here for: ${p.intent!.label}', style: VT.label(13, color: V.text2))]),
          ),
        if (v.badges.isNotEmpty) ...[
          const SectionTitle('Badges', top: 22, bottom: 10),
          BadgesRow(ids: v.badges),
        ],
      ],
    );
  }

  Widget _stat(String value, String label) => Expanded(
    child: Column(children: [Text(value, style: VT.number(20)), Text(label, style: VT.body(12, color: V.text2))]),
  );

  List<String> _myInterests(BuildContext context) {
    try {
      return context.read<SessionProvider>().me?.interests ?? const [];
    } on ProviderNotFoundException {
      return const [];
    }
  }

  Widget _followButton(Profile p, FollowState s, bool followsYou) => switch (s) {
        FollowState.none => GradientButton(label: followsYou ? 'Follow back' : 'Follow', icon: SolarIconsBold.userPlusRounded, height: 46, busy: _busy, onTap: _follow),
        FollowState.requested => GhostButton(label: 'Requested', icon: SolarIconsBold.hourglass, height: 46, expand: true, onTap: _busy ? null : () => _unfollow(p.name, s)),
        FollowState.following => GhostButton(label: 'Following', icon: Icons.check_rounded, height: 46, expand: true, onTap: _busy ? null : () => _unfollow(p.name, s)),
      };

  Widget _friendButton(Profile p, FriendState s) => switch (s) {
        FriendState.friends => GhostButton(label: 'Message', icon: SolarIconsOutline.chatRoundDots, height: 46, expand: true, onTap: widget.inCall ? null : () => _friendAction(p, s)),
        FriendState.incoming => GhostButton(label: 'Accept friend', icon: SolarIconsBold.userCheckRounded, height: 46, expand: true, onTap: _busy ? null : () => _friendAction(p, s)),
        FriendState.requested => GhostButton(label: 'Request sent', icon: SolarIconsBold.hourglass, height: 46, expand: true, onTap: _busy ? null : () => _friendAction(p, s)),
        FriendState.blocked => const SizedBox.shrink(),
        FriendState.none => GhostButton(label: 'Add friend', icon: SolarIconsBold.userPlusRounded, height: 46, expand: true, onTap: _busy ? null : () => _friendAction(p, s)),
      };
}
