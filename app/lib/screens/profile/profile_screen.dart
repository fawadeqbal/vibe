import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/engagement_provider.dart';
import '../../providers/follows_provider.dart';
import '../../providers/match_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/social_provider.dart';
import '../../providers/wallet_provider.dart';
import '../invite/invite_code_field.dart';
import '../invite/invite_screen.dart';
import '../invite/invite_share.dart';
import '../match/safety_sheet.dart' show VerifyPill;
import '../onboarding/profile_setup_screen.dart';
import 'follow_lists_screen.dart';
import 'progress.dart';
import 'sign_in_methods.dart';
import 'user_profile_screen.dart';
import 'verification_flow.dart';
import 'wellbeing_section.dart';
import '../store/vip_screen.dart';
import '../store/wallet_screen.dart';

/// You: your profile shown as the card others see, your numbers, then
/// Safety & trust (teal) above money (gold), then history and account.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key, required this.onOpenStore});
  final VoidCallback onOpenStore;

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final wallet = context.watch<WalletProvider>();
    final match = context.watch<MatchProvider>();
    final social = context.watch<SocialProvider>();
    final me = session.me;
    if (me == null) return const SizedBox.shrink();
    void openWallet() => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const WalletScreen()));
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            PageHeader(
              'Me',
              actions: [
                CircleIconButton(
                  icon: Icons.edit_rounded,
                  iconSize: 20,
                  background: V.surface2,
                  tooltip: 'Edit profile',
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProfileSetupScreen(editing: true))),
                ),
              ],
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
                children: [
                  _ProfileCard(me: me, vip: wallet.isVip),
                  const SizedBox(height: 12),
                  _StatsCard(me: me, friends: social.friends.length, match: match),
                  const SizedBox(height: 10),
                  const ProgressCard(),
                  const SizedBox(height: 10),
                  const _FollowSection(),
                  const SectionTitle('Safety & trust', top: 26),
                  GroupCard(
                    border: V.trust.withValues(alpha: 0.22),
                    children: [
                      GroupRow(
                        icon: me.verified ? Icons.verified_rounded : Icons.verified_outlined,
                        iconColor: V.trust,
                        iconBg: V.trust.withValues(alpha: 0.12),
                        title: me.verified ? 'Verified profile' : 'Verify your profile',
                        subtitle: verificationSubtitle(session.verification, verified: me.verified),
                        trailing: me.verified
                            ? const Icon(Icons.check_circle_rounded, color: V.trust)
                            : VerifyPill(
                                busy: session.busy,
                                onTap: () => startSelfieVerification(context),
                              ),
                      ),
                      GroupRow(
                        icon: Icons.blur_on_rounded,
                        title: 'Blur the first 3 seconds',
                        subtitle: 'Both videos start blurred.',
                        trailing: Switch(value: match.autoBlur, onChanged: match.setAutoBlur),
                      ),
                      if (social.blocked.isNotEmpty)
                        GroupRow(
                          icon: Icons.block_rounded,
                          title: '${social.blocked.length} blocked',
                          subtitle: 'They can never match with you.',
                          trailing: TextButton(
                            onPressed: () async {
                              for (final id in social.blocked.toList()) {
                                await social.unblock(id);
                              }
                              if (context.mounted) toast(context, 'Everyone unblocked');
                            },
                            child: const Text('Unblock all'),
                          ),
                        ),
                      GroupRow(
                        icon: Icons.support_agent_rounded,
                        title: 'Help and safety',
                        trailing: const Icon(Icons.chevron_right_rounded, color: V.muted),
                        onTap: () => toast(context, 'Opens the help centre in the real app'),
                      ),
                    ],
                  ),
                  const SectionTitle('Wallet', top: 26),
                  Row(
                    children: [
                      Expanded(
                        child: _BalanceCard(
                          label: 'Coins',
                          icon: const CoinIcon(size: 14, plain: true),
                          value: Fmt.thousands(wallet.coins),
                          color: V.gold,
                          onTap: openWallet,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _BalanceCard(
                          label: 'Gems',
                          icon: const GemIcon(size: 15),
                          value: Fmt.thousands(wallet.gems),
                          note: '≈ ${Fmt.gemsAsUsd(wallet.gems)}',
                          color: V.gem,
                          onTap: openWallet,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Material(
                    color: Colors.transparent,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(20),
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VipScreen())),
                      child: Ink(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                        decoration: BoxDecoration(gradient: V.vipCard, borderRadius: BorderRadius.circular(20), border: Border.all(color: V.gold.withValues(alpha: 0.28))),
                        child: Row(
                          children: [
                            const Icon(Icons.workspace_premium_rounded, color: V.gold, size: 24),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(wallet.isVip ? 'You are VIP' : 'Get VIP', style: VT.title(15, weight: FontWeight.w600)),
                                  Text(wallet.isVip ? Fmt.until(wallet.wallet.vipUntil!) : 'Free filters, no ads, see who liked you', style: VT.body(12, color: V.text2)),
                                ],
                              ),
                            ),
                            const Icon(Icons.chevron_right_rounded, color: V.gold),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SectionTitle('Invite & earn', top: 26),
                  GroupCard(
                    children: [
                      GroupRow(
                        icon: Icons.card_giftcard_rounded,
                        iconColor: V.gold,
                        iconBg: V.gold.withValues(alpha: 0.12),
                        title: 'Invite friends',
                        subtitle: 'Give ${Economy.inviteeRewardCoins}, get ${Economy.inviteRewardCoins} coins',
                        trailing: const Icon(Icons.chevron_right_rounded, color: V.muted),
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const InviteScreen())),
                      ),
                      GroupRow(
                        icon: Icons.campaign_rounded,
                        title: 'Creator partner program',
                        subtitle: 'Earn money for the people you bring · opens the web',
                        trailing: const Icon(Icons.open_in_new_rounded, size: 18, color: V.muted),
                        onTap: () => openPartnerPage(context),
                      ),
                    ],
                  ),
                  if (session.referralClaimable) ...[const SizedBox(height: 10), const InviteCodeField()],
                  const SectionTitle('Recent matches', top: 26, bottom: 4),
                  if (match.history.isEmpty)
                    Padding(padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 2), child: Text('Your last matches will show up here.', style: VT.body(13, color: V.text2)))
                  else
                    for (final (i, r) in match.history.take(8).indexed) _matchRow(context, r, last: i == (match.history.length.clamp(0, 8) - 1)),
                  const SectionTitle('Notifications & wellbeing', top: 22),
                  const WellbeingSection(),
                  const SectionTitle('Sign-in methods', top: 22),
                  const SignInMethodsCard(),
                  const SectionTitle('Account', top: 22),
                  GroupCard(
                    dividerInset: 52,
                    children: [
                      GroupRow(
                        bare: true,
                        icon: Icons.mail_outline_rounded,
                        title: 'E-mail updates',
                        subtitle: 'News and offers from Vibe. Sign-in codes always arrive.',
                        trailing: Switch(
                          value: session.emailUpdates,
                          onChanged: (on) async {
                            final ok = await session.setEmailUpdates(on);
                            if (!ok && context.mounted) toast(context, "Couldn't save that, try again", error: true);
                          },
                        ),
                      ),
                      GroupRow(
                        bare: true,
                        icon: Icons.description_outlined,
                        title: 'Terms and privacy',
                        trailing: const Icon(Icons.chevron_right_rounded, color: V.muted),
                        onTap: () => toast(context, 'Opens the policy pages in the real app'),
                      ),
                      GroupRow(
                        bare: true,
                        icon: Icons.logout_rounded,
                        iconColor: V.bad,
                        title: context.read<WalletProvider>().isRemote ? 'Sign out' : 'Sign out and reset the demo',
                        titleColor: V.bad,
                        onTap: () async {
                          final ok = await showDialog<bool>(
                            context: context,
                            builder: (ctx) => AlertDialog(
                              title: const Text('Sign out?'),
                              content: Text(context.read<WalletProvider>().isRemote ? 'You can sign back in with the same e-mail any time.' : 'This mock build clears everything: coins, friends, history.'),
                              actions: [
                                TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel', style: TextStyle(color: V.text2))),
                                TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Sign out', style: TextStyle(color: V.bad))),
                              ],
                            ),
                          );
                          if (ok == true) {
                            await match.releaseCamera();
                            await session.signOut();
                          }
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Center(child: Text(wallet.isRemote ? 'Vibe 0.1' : 'Vibe 0.1 · offline demo', style: VT.body(11, color: V.muted))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _matchRow(BuildContext context, MatchRecord r, {required bool last}) => InkWell(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => UserProfileScreen(userId: r.partner.id))),
        child: _matchRowContent(r, last: last),
      );

  Widget _matchRowContent(MatchRecord r, {required bool last}) {
    final bits = [Fmt.duration(r.length), Fmt.ago(r.startedAt), if (r.likedMe) 'liked you', if (r.giftsReceived > 0) '${r.giftsReceived} gift${r.giftsReceived == 1 ? '' : 's'}'];
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(border: last ? null : const Border(bottom: BorderSide(color: V.lineSoft))),
      child: Row(
        children: [
          VAvatar(url: r.partner.avatarUrl, name: r.partner.name, size: 44),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${r.partner.name}, ${r.partner.age} ${r.partner.country.flag}', style: VT.title(15, weight: FontWeight.w600)),
                const SizedBox(height: 1),
                Text(bits.join(' · '), style: VT.body(12, color: V.text2)),
              ],
            ),
          ),
          if (r.liked) const Icon(Icons.favorite_rounded, size: 18, color: V.pink),
        ],
      ),
    );
  }
}

/// "How others see you": your photo as the card, name, bio and interests.
class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.me, required this.vip});
  final Profile me;
  final bool vip;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 330,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: V.line),
        gradient: const LinearGradient(colors: [Color(0xFF2B1B4D), V.surface], begin: Alignment.topCenter, end: Alignment.bottomCenter),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (me.avatarUrl.isNotEmpty)
            Image.network(me.avatarUrl, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Center(child: VAvatar(url: '', name: me.name, size: 120)))
          else
            Center(child: VAvatar(url: '', name: me.name, size: 120)),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height: 220,
            child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [V.bg.withValues(alpha: 0.92), V.bg.withValues(alpha: 0)]))),
          ),
          const Positioned(left: 12, top: 12, child: GlassPill(label: 'How others see you', icon: Icons.visibility_rounded, height: 28, fontSize: 11.5)),
          if (vip) const Positioned(right: 12, top: 12, child: GlassPill(label: 'VIP', icon: Icons.workspace_premium_rounded, tint: V.gold, textColor: V.gold, height: 28, fontSize: 11.5)),
          Positioned(
            left: 18,
            right: 18,
            bottom: 16,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(child: Text('${me.name}, ${me.age}', overflow: TextOverflow.ellipsis, style: VT.display(28, height: 1.1))),
                    if (me.verified) const Padding(padding: EdgeInsets.only(left: 6), child: Icon(Icons.verified_rounded, color: V.trust, size: 22, semanticLabel: 'Verified')),
                    Builder(builder: (context) {
                      final e = context.watch<EngagementProvider>();
                      final lvl = e.loaded ? e.level.level : me.level;
                      return lvl > 0 ? Padding(padding: const EdgeInsets.only(left: 8), child: LevelChip(level: lvl, glass: true, size: 12)) : const SizedBox.shrink();
                    }),
                  ],
                ),
                const SizedBox(height: 2),
                Text('${me.country.flag} ${me.country.name} · ${me.gender.label}', style: VT.body(13, color: Colors.white.withValues(alpha: 0.78))),
                if (me.bio.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(me.bio, maxLines: 2, overflow: TextOverflow.ellipsis, style: VT.body(13.5, color: Colors.white.withValues(alpha: 0.88))),
                ],
                const SizedBox(height: 12),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (!me.isComplete) const GlassPill(label: 'Profile incomplete', icon: Icons.info_outline_rounded, tint: V.warn, textColor: V.warn, height: 26, fontSize: 12),
                    for (final i in me.interests.take(3))
                      Glass(
                        radius: 13,
                        height: 26,
                        blur: 16,
                        color: Colors.white.withValues(alpha: 0.12),
                        border: Colors.transparent,
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child: Center(widthFactor: 1, child: Text(i, style: VT.label(12, color: V.text))),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatsCard extends StatelessWidget {
  const _StatsCard({required this.me, required this.friends, required this.match});
  final Profile me;
  final int friends;
  final MatchProvider match;

  @override
  Widget build(BuildContext context) {
    Widget big(String v, String l) => Expanded(
          child: Column(
            children: [Text(v, style: VT.number(20)), const SizedBox(height: 2), Text(l, style: VT.body(11, color: V.muted, height: 1.2))],
          ),
        );
    Widget small(String l, String v) => Text.rich(TextSpan(children: [TextSpan(text: '$l ', style: VT.body(12, color: V.muted)), TextSpan(text: v, style: VT.number(12, weight: FontWeight.w600))]));
    return Container(
      decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(V.r), border: Border.all(color: V.line)),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: IntrinsicHeight(
              child: Row(
                children: [
                  big(Fmt.thousands(me.matches), 'Matches'),
                  const VerticalDivider(width: 1, color: V.lineSoft),
                  big(Fmt.thousands(me.likes), 'Likes'),
                  const VerticalDivider(width: 1, color: V.lineSoft),
                  big(Fmt.thousands(friends), 'Friends'),
                ],
              ),
            ),
          ),
          const Divider(height: 1, color: V.lineSoft),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [small('Today', '${match.matchesToday}'), small('Avg', Fmt.duration(match.averageLength)), small('Skip rate', '${(match.skipRate * 100).round()}%')],
            ),
          ),
        ],
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.label, required this.icon, required this.value, required this.color, required this.onTap, this.note});
  final String label;
  final Widget icon;
  final String value;
  final String? note;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Panel(
      radius: 20,
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [icon, const SizedBox(width: 6), Text(label, style: VT.body(12, color: V.muted))]),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Flexible(child: Text(value, overflow: TextOverflow.ellipsis, style: VT.number(22, color: color))),
              if (note != null) ...[const SizedBox(width: 6), Text(note!, style: VT.body(12, color: V.muted))],
            ],
          ),
        ],
      ),
    );
  }
}

/// Your followers (only you see the lists) and the two privacy switches.
class _FollowSection extends StatelessWidget {
  const _FollowSection();

  @override
  Widget build(BuildContext context) {
    final follows = context.watch<FollowsProvider>();
    final s = follows.settings;
    Future<void> save({bool? privateAccount, bool? hideStats}) async {
      final ok = await follows.setPrivacy(privateAccount: privateAccount, hideStats: hideStats);
      if (!ok && context.mounted) toast(context, "Couldn't save that, try again", error: true);
    }

    return GroupCard(
      dividerInset: 52,
      children: [
        GroupRow(
          bare: true,
          icon: Icons.people_alt_rounded,
          title: '${Fmt.thousands(s.followers)} ${s.followers == 1 ? 'follower' : 'followers'} · ${Fmt.thousands(s.following)} following',
          subtitle: 'Only you can see these lists.',
          trailing: const Icon(Icons.chevron_right_rounded, color: V.muted),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const FollowListsScreen())),
        ),
        GroupRow(
          bare: true,
          icon: Icons.lock_outline_rounded,
          title: 'Private account',
          subtitle: 'New followers need your OK first.',
          trailing: Switch(value: s.privateAccount, onChanged: (on) => save(privateAccount: on)),
        ),
        GroupRow(
          bare: true,
          icon: Icons.visibility_off_outlined,
          title: 'Hide my stats',
          subtitle: 'Matches, likes and gifts stay private.',
          trailing: Switch(value: s.hideStats, onChanged: (on) => save(hideStats: on)),
        ),
      ],
    );
  }
}
