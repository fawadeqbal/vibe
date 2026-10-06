import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/follows.dart';
import '../../models/models.dart';
import '../../providers/follows_provider.dart';
import '../../providers/social_provider.dart';
import '../match/report_sheet.dart';
import '../social/chat_screen.dart';
import 'progress.dart';

/// Someone else's profile. It opens up as you get closer: matched → following
/// (counts, stats) → friends (online, Message).
class UserProfileScreen extends StatelessWidget {
  const UserProfileScreen({super.key, required this.userId});
  final String userId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: Center(child: CircleIconButton(icon: Icons.arrow_back_rounded, tooltip: 'Back', onTap: () => Navigator.of(context).maybePop())),
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
      case FriendState.none:
      case FriendState.requested:
      case FriendState.blocked:
        return;
    }
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
        final choice = await showReportSheet(context, name: p.name);
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
    if (_loading) return const Padding(padding: EdgeInsets.symmetric(vertical: 80), child: Center(child: CircularProgressIndicator(color: V.pink)));
    final v = _view;
    if (v == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: EmptyState(icon: Icons.person_off_rounded, title: 'Profile not available', body: 'You can see the profiles of people you have met in a match.'),
      );
    }
    final p = v.profile;
    final self = v.tier == ProfileTier.self;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                VAvatar(url: p.avatarUrl, name: p.name, size: 84, ring: true),
                if (v.online == true)
                  Positioned(right: 2, bottom: 2, child: Container(width: 18, height: 18, decoration: BoxDecoration(shape: BoxShape.circle, color: V.ok, border: Border.all(color: V.bg, width: 3)))),
              ],
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Flexible(child: Text('${p.name}, ${p.age}', overflow: TextOverflow.ellipsis, style: VT.display(26, height: 1.1))),
                      if (p.verified) const Padding(padding: EdgeInsets.only(left: 6), child: Icon(Icons.verified_rounded, color: V.trust, size: 20, semanticLabel: 'Verified')),
                      if (p.vip) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(Icons.workspace_premium_rounded, color: V.gold, size: 19, semanticLabel: 'VIP')),
                      if (v.level > 0) Padding(padding: const EdgeInsets.only(left: 8), child: LevelChip(level: v.level)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('${p.country.flag} ${p.country.name}${v.online == true ? ' · Online now' : ''}', style: VT.body(13, color: V.text2)),
                  if (friend == FriendState.friends && streak.count > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Row(children: [
                        Icon(Icons.local_fire_department_rounded, size: 16, color: streak.atRisk ? V.warn : V.flame),
                        const SizedBox(width: 4),
                        Text('${streak.count}-day streak${streak.atRisk ? ' · ends tonight' : ''}', style: VT.label(13, color: streak.atRisk ? V.warn : V.flame)),
                      ]),
                    ),
                  if (v.followsYou) const Padding(padding: EdgeInsets.only(top: 8), child: Tag('Follows you', color: V.violet)),
                ],
              ),
            ),
            if (!self)
              PopupMenuButton<String>(
                icon: const Icon(Icons.more_horiz_rounded, color: V.text2),
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
        if (!self) ...[
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(child: _followButton(p, follow)),
              // Friend requests are only sent from a live call (the + button
              // on the call screen); a profile can only accept or open chat.
              if (friend != FriendState.none && friend != FriendState.blocked) ...[
                const SizedBox(width: 10),
                Expanded(child: _friendButton(p, friend)),
              ],
            ],
          ),
          if (friend == FriendState.none) ...[
            const SizedBox(height: 10),
            Row(children: [
              const Icon(Icons.videocam_rounded, size: 16, color: V.muted),
              const SizedBox(width: 8),
              Expanded(child: Text(widget.inCall ? 'Tap + on the call to add ${p.name} as a friend' : 'Friends are made on video calls. Match again to add ${p.name}.', style: VT.body(12.5, color: V.text2))),
            ]),
          ],
        ],
        if (v.followers != null) ...[
          const SizedBox(height: 16),
          Text.rich(TextSpan(children: [
            TextSpan(text: Fmt.thousands(v.followers!), style: VT.number(15, weight: FontWeight.w600)),
            TextSpan(text: v.followers == 1 ? ' follower' : ' followers', style: VT.body(13.5, color: V.text2)),
            TextSpan(text: '  ·  ', style: VT.body(13.5, color: V.muted)),
            TextSpan(text: Fmt.thousands(v.following ?? 0), style: VT.number(15, weight: FontWeight.w600)),
            TextSpan(text: ' following', style: VT.body(13.5, color: V.text2)),
          ])),
        ],
        const SizedBox(height: 16),
        _StatsBlock(view: v),
        if (v.badges.isNotEmpty) ...[
          const SectionTitle('Badges', top: 22, bottom: 10),
          BadgesRow(ids: v.badges),
        ],
        if (p.bio.trim().isNotEmpty) ...[
          const SectionTitle('About', top: 22, bottom: 8),
          Text(p.bio, style: VT.body(14.5, color: V.text)),
        ],
        if (p.interests.isNotEmpty) ...[
          const SectionTitle('Interests', top: 22, bottom: 10),
          Wrap(spacing: 6, runSpacing: 6, children: [for (final i in p.interests) Tag(i, color: V.violet)]),
        ],
      ],
    );
  }

  Widget _followButton(Profile p, FollowState s) => switch (s) {
        FollowState.none => GradientButton(label: 'Follow', icon: Icons.person_add_alt_1_rounded, height: 46, busy: _busy, onTap: _follow),
        FollowState.requested => GhostButton(label: 'Requested', icon: Icons.hourglass_top_rounded, height: 46, expand: true, onTap: _busy ? null : () => _unfollow(p.name, s)),
        FollowState.following => GhostButton(label: 'Following', icon: Icons.check_rounded, height: 46, expand: true, onTap: _busy ? null : () => _unfollow(p.name, s)),
      };

  Widget _friendButton(Profile p, FriendState s) => switch (s) {
        FriendState.friends => GhostButton(label: 'Message', icon: Icons.chat_bubble_outline_rounded, height: 46, expand: true, onTap: widget.inCall ? null : () => _friendAction(p, s)),
        FriendState.incoming => GhostButton(label: 'Accept friend', icon: Icons.how_to_reg_rounded, height: 46, expand: true, onTap: () => _friendAction(p, s)),
        FriendState.requested => const GhostButton(label: 'Request sent', icon: Icons.hourglass_top_rounded, height: 46, expand: true),
        FriendState.blocked => const SizedBox.shrink(),
        FriendState.none => const SizedBox.shrink(),
      };
}

/// Matches · Likes · Gifts, or why you can't see them.
class _StatsBlock extends StatelessWidget {
  const _StatsBlock({required this.view});
  final ProfileView view;

  @override
  Widget build(BuildContext context) {
    final s = view.stats;
    if (s != null) {
      Widget cell(int n, String label) => Expanded(
            child: Column(children: [Text(Fmt.thousands(n), style: VT.number(20)), const SizedBox(height: 2), Text(label, style: VT.body(11, color: V.muted, height: 1.2))]),
          );
      return Panel(padding: const EdgeInsets.symmetric(vertical: 16), child: Row(children: [cell(s.matches, 'Matches'), cell(s.likes, 'Likes'), cell(s.gifts, 'Gifts')]));
    }
    final (icon, text) = view.statsHidden ? (Icons.visibility_off_rounded, 'Stats hidden') : (Icons.lock_outline_rounded, 'Follow to see their stats');
    return Panel(
      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
      child: Row(children: [Icon(icon, size: 18, color: V.muted), const SizedBox(width: 10), Expanded(child: Text(text, style: VT.body(13, color: V.text2)))]),
    );
  }
}
