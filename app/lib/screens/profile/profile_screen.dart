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
import '../../providers/wallet_provider.dart';
import '../invite/invite_code_field.dart';
import '../invite/invite_screen.dart';
import '../../models/partner.dart';
import '../../providers/partner_provider.dart';
import '../onboarding/profile_setup_screen.dart';
import '../partner/partner_screen.dart';
import 'me_overview.dart';
import 'me_sections.dart';
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
                  // The card others see, what's left, verification, your numbers (me_overview.dart).
                  ProfileCard(me: me, vip: wallet.isVip),
                  if (ProfileProgress.shows(me, bonusClaimed: wallet.wallet.profileBonusClaimed)) ...[const SizedBox(height: 12), ProfileProgress(me: me)],
                  const SizedBox(height: 12),
                  VerificationCard(me: me),
                  const SizedBox(height: 12),
                  StatsCard(me: me),
                  const SizedBox(height: 18),
                  // Everything else is one row each; the details live on their own screens.
                  GroupCard(
                    children: [
                      _MenuRow(
                        icon: SolarIconsBold.cupStar,
                        color: V.lavender,
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
                        subtitle: 'Blur, blocking, reports and help',
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
                        iconColor: V.lavender,
                        iconBg: V.violet.withValues(alpha: 0.14),
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
        // Tinted tiles as on the web: lavender sits on violet 14%, the rest on their own colour at 12%.
        iconBg: color == V.text2 ? null : (color == V.lavender ? V.violet.withValues(alpha: 0.14) : color.withValues(alpha: 0.12)),
        title: title,
        subtitle: subtitle,
        trailing: const Icon(SolarIconsOutline.altArrowRight, color: V.muted),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: open)),
      );
}

