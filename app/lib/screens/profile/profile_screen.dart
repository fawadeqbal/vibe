import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

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
import '../../models/partner.dart';
import '../../providers/partner_provider.dart';
import '../onboarding/profile_setup_screen.dart';
import '../partner/partner_screen.dart';
import 'me_sections.dart';
import 'progress.dart' show LevelChip;
import '../store/vip_screen.dart';
import '../store/wallet_screen.dart';

/// You: your profile shown as the card others see and your numbers, then one
/// row per area (progress, followers, history, safety, money, invite & earn,
/// settings). Each row opens its own screen (`me_sections.dart`), so Me stays
/// short instead of one long page.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key, required this.onOpenStore});
  final VoidCallback onOpenStore;

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final wallet = context.watch<WalletProvider>();
    final match = context.watch<MatchProvider>();
    final social = context.watch<SocialProvider>();
    final engagement = context.watch<EngagementProvider>();
    final follows = context.watch<FollowsProvider>().settings;
    final partner = context.watch<PartnerProvider?>();
    final me = session.me;
    if (me == null) return const SizedBox.shrink();
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            PageHeader(
              'Me',
              actions: [
                CircleIconButton(
                  icon: SolarIconsBold.pen,
                  iconSize: 20,
                  background: V.surface2,
                  tooltip: 'Edit profile',
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProfileSetupScreen(editing: true))),
                ),
              ],
            ),
            Expanded(
              child: ListView(
                // Clear the floating dock (its height arrives as bottom padding).
                padding: EdgeInsets.fromLTRB(20, 0, 20, 32 + MediaQuery.paddingOf(context).bottom),
                children: [
                  _ProfileCard(me: me, vip: wallet.isVip),
                  const SizedBox(height: 12),
                  _StatsCard(me: me, friends: social.friends.length, match: match),
                  const SizedBox(height: 18),
                  // Everything else is one row each; the details live on their own screens.
                  GroupCard(
                    children: [
                      _MenuRow(
                        icon: SolarIconsBold.cupStar,
                        color: V.level,
                        title: 'Progress & badges',
                        subtitle: 'Level ${engagement.level.level} · ${Fmt.thousands(engagement.level.xp)} XP',
                        open: (_) => const ProgressSectionScreen(),
                      ),
                      _MenuRow(
                        icon: SolarIconsBold.usersGroupTwoRounded,
                        title: 'Followers & privacy',
                        subtitle: '${Fmt.thousands(follows.followers)} ${follows.followers == 1 ? 'follower' : 'followers'} · ${Fmt.thousands(follows.following)} following',
                        open: (_) => const FollowersSectionScreen(),
                      ),
                      _MenuRow(
                        icon: SolarIconsBold.history,
                        title: 'Recent matches',
                        subtitle: match.history.isEmpty ? 'Your last calls show up here' : '${match.history.length} recent ${match.history.length == 1 ? 'call' : 'calls'}',
                        open: (_) => const RecentMatchesScreen(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  GroupCard(
                    border: V.trust.withValues(alpha: 0.22),
                    children: [
                      _MenuRow(
                        icon: me.verified ? SolarIconsBold.verifiedCheck : SolarIconsOutline.verifiedCheck,
                        color: V.trust,
                        title: 'Safety & trust',
                        subtitle: me.verified ? 'Verified · blur, blocking and help' : 'Not verified yet · blur, blocking and help',
                        open: (_) => const SafetySectionScreen(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  GroupCard(
                    children: [
                      _MenuRow(
                        icon: SolarIconsBold.wallet,
                        color: V.gold,
                        title: 'Wallet',
                        subtitle: '${Fmt.thousands(wallet.coins)} coins · ${Fmt.thousands(wallet.gems)} gems',
                        open: (_) => const WalletScreen(),
                      ),
                      _MenuRow(
                        icon: SolarIconsBold.crown,
                        color: V.gold,
                        title: wallet.isVip ? 'You are VIP' : 'Get VIP',
                        subtitle: wallet.isVip ? Fmt.until(wallet.wallet.vipUntil!) : 'Free filters, no ads, see who liked you',
                        open: (_) => const VipScreen(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  GroupCard(
                    children: [
                      _MenuRow(
                        icon: SolarIconsBold.gift,
                        color: V.gold,
                        title: 'Invite friends',
                        subtitle: 'Give ${Economy.inviteeRewardCoins}, get ${Economy.inviteRewardCoins} coins',
                        open: (_) => const InviteScreen(),
                      ),
                      GroupRow(
                        icon: SolarIconsBold.handMoney,
                        iconColor: V.pinkSoft,
                        iconBg: V.pink.withValues(alpha: 0.12),
                        title: 'Creator partner program',
                        subtitle: _partnerSubtitle(partner?.status),
                        trailing: const Icon(SolarIconsOutline.altArrowRight, color: V.muted),
                        onTap: () => openPartnerScreen(context),
                      ),
                    ],
                  ),
                  if (session.referralClaimable) ...[const SizedBox(height: 10), const InviteCodeField()],
                  const SizedBox(height: 10),
                  GroupCard(
                    children: [
                      _MenuRow(
                        icon: SolarIconsOutline.bell,
                        title: 'Notifications & wellbeing',
                        subtitle: 'Quiet hours and break reminders',
                        open: (_) => const WellbeingSectionScreen(),
                      ),
                      _MenuRow(
                        icon: SolarIconsOutline.userId,
                        title: 'Account',
                        subtitle: 'Sign-in methods, e-mail, terms, sign out',
                        open: (_) => const AccountSectionScreen(),
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

  static String _partnerSubtitle(PartnerStatus? status) => switch (status) {
        PartnerStatus.active => 'Your stats, links and payouts',
        PartnerStatus.pending => 'Application under review',
        PartnerStatus.suspended => 'Paused · see why',
        PartnerStatus.rejected => 'Not approved this time',
        _ => 'Earn money for the people you bring',
      };
}

/// One Me menu row: tinted icon tile, title, live subtitle, chevron; pushes [open].
class _MenuRow extends StatelessWidget {
  const _MenuRow({required this.icon, required this.title, required this.subtitle, required this.open, this.color = V.text2});
  final IconData icon;
  final String title;
  final String subtitle;
  final WidgetBuilder open;
  final Color color;

  @override
  Widget build(BuildContext context) => GroupRow(
        icon: icon,
        iconColor: color,
        iconBg: color == V.text2 ? null : color.withValues(alpha: 0.12),
        title: title,
        subtitle: subtitle,
        trailing: const Icon(SolarIconsOutline.altArrowRight, color: V.muted),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: open)),
      );
}

/// "How others see you": your photo as the card, name, bio and interests.
class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.me, required this.vip});
  final Profile me;
  final bool vip;

  /// No photo: initials in the top half, clear of the name and bio below.
  static Widget _noPhoto(Profile me) => Align(
        alignment: Alignment.topCenter,
        child: Padding(padding: const EdgeInsets.only(top: 52), child: VAvatar(url: '', name: me.name, size: 100)),
      );

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
            Image.network(me.avatarUrl, fit: BoxFit.cover, errorBuilder: (_, __, ___) => _noPhoto(me))
          else
            _noPhoto(me),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height: 220,
            child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [V.bg.withValues(alpha: 0.92), V.bg.withValues(alpha: 0)]))),
          ),
          const Positioned(left: 12, top: 12, child: GlassPill(label: 'How others see you', icon: SolarIconsBold.eye, height: 28, fontSize: 11.5)),
          if (vip) const Positioned(right: 12, top: 12, child: GlassPill(label: 'VIP', icon: SolarIconsBold.crown, tint: V.gold, textColor: V.gold, height: 28, fontSize: 11.5)),
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
                    if (me.verified) const Padding(padding: EdgeInsets.only(left: 6), child: Icon(SolarIconsBold.verifiedCheck, color: V.trust, size: 22, semanticLabel: 'Verified')),
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
                    if (!me.isComplete) const GlassPill(label: 'Profile incomplete', icon: SolarIconsOutline.infoCircle, tint: V.warn, textColor: V.warn, height: 26, fontSize: 12),
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
