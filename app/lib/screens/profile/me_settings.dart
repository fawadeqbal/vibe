import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../models/partner.dart';
import '../../models/payments.dart';
import '../../core/api/api_exception.dart';
import '../../providers/discover_provider.dart';
import '../../providers/engagement_provider.dart';
import '../../providers/follows_provider.dart';
import '../../providers/match_provider.dart';
import '../../providers/partner_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/social_provider.dart';
import '../../providers/wallet_provider.dart';
import '../invite/invite_code_field.dart';
import '../invite/invite_screen.dart';
import '../match/safety_sheet.dart' show VerifyPill;
import '../partner/partner_screen.dart';
import '../store/cashout_screen.dart';
import '../store/vip_screen.dart';
import '../store/wallet_screen.dart';
import 'blocked_people_screen.dart';
import 'devices_screen.dart';
import 'follow_lists_screen.dart';
import 'leaderboard_screen.dart';
import 'me_lists.dart';
import 'me_sections.dart';
import 'verification_flow.dart';

/// One row of a settings group.
class _Item {
  const _Item({required this.icon, required this.title, this.subtitle, this.color, this.open, this.onTap, this.trailing});
  final IconData icon;
  final String title;
  final String? subtitle;
  final Color? color;

  /// The page this row pushes.
  final WidgetBuilder? open;
  final VoidCallback? onTap;

  /// A switch or pill instead of the chevron.
  final Widget? trailing;
}

/// One settings group: a button on Me, its rows on its own page.
class _Group {
  const _Group(this.key, this.title, this.icon, this.summary, this.items, {this.color});
  final String key;
  final String title;
  final IconData icon;
  final Color? color;

  /// What's inside, on the group's button.
  final String summary;
  final List<_Item> items;
}

/// The five settings groups, with live summaries and rows (null without a session).
List<_Group>? _settingsGroups(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final wallet = context.watch<WalletProvider>();
    final match = context.watch<MatchProvider>();
    final engagement = context.watch<EngagementProvider>();
    final followsP = context.watch<FollowsProvider>();
    final follows = followsP.settings;
    final social = context.watch<SocialProvider>();
    final partner = context.watch<PartnerProvider?>();
    final discover = context.watch<DiscoverProvider>();
    final me = session.me;
    if (me == null) return null;

    Future<void> savePrivacy({bool? privateAccount, bool? hideStats}) async {
      final ok = await followsP.setPrivacy(privateAccount: privateAccount, hideStats: hideStats);
      if (!ok && context.mounted) toast(context, "Couldn't save that, try again", error: true);
    }

    final v = session.verification;
    final friends = social.friends.length;
    final groups = <_Group>[
      _Group(
        'account',
        'Account',
        SolarIconsBold.userId,
        'Sign-in, devices, notifications, quiet hours, data saver',
        [
          _Item(icon: SolarIconsBold.userId, title: 'Account & sign-in', subtitle: 'Sign-in methods, e-mail, delete account', open: (_) => const AccountSectionScreen()),
          _Item(icon: SolarIconsBold.devices, title: 'Devices', subtitle: "Where you're signed in; sign one out", open: (_) => const DevicesScreen()),
          _Item(icon: SolarIconsOutline.bell, title: 'Notifications', subtitle: 'Phone, inbox and e-mail, for each kind', open: (_) => const NotificationsSectionScreen()),
          _Item(icon: SolarIconsBold.moonSleep, title: 'Time & wellbeing', subtitle: 'Quiet hours and break reminders', open: (_) => const WellbeingSectionScreen()),
          _Item(
            icon: SolarIconsBold.wifiRouterMinimalistic,
            title: 'Data saver',
            subtitle: 'Calls use less data: smaller, slower video. Voice stays clear.',
            trailing: Switch(value: match.dataSaver, onChanged: match.setDataSaver),
          ),
        ],
      ),
      _Group(
        'activity',
        'Your activity',
        SolarIconsBold.history,
        'Level ${engagement.level.level} · matches, friends, badges, leaderboard',
        [
          _Item(
            icon: SolarIconsBold.history,
            title: 'Recent matches',
            subtitle: match.history.isEmpty ? 'Your last calls show up here' : '${match.history.length} recent ${match.history.length == 1 ? 'call' : 'calls'}',
            open: (_) => const RecentMatchesScreen(),
          ),
          _Item(
            icon: SolarIconsBold.usersGroupTwoRounded,
            title: 'Followers & friends',
            subtitle: '${Fmt.compact(follows.followers)} ${follows.followers == 1 ? 'follower' : 'followers'} · ${Fmt.compact(friends)} ${friends == 1 ? 'friend' : 'friends'}',
            open: (_) => const FollowListsScreen(),
          ),
          _Item(
            icon: SolarIconsBold.cupStar,
            color: V.lavender,
            title: 'Progress & badges',
            subtitle: 'Level ${engagement.level.level} · ${Fmt.compact(engagement.level.xp)} XP',
            open: (_) => const ProgressSectionScreen(),
          ),
          _Item(icon: SolarIconsBold.ranking, color: V.lavender, title: 'Leaderboard', subtitle: "This week's top people", open: (_) => const LeaderboardScreen()),
        ],
      ),
      _Group(
        'privacy',
        'Privacy & safety',
        SolarIconsBold.shieldCheck,
        color: V.trust,
        '${me.verified ? 'Verified' : 'Get verified'} · private account, blur, Discover, blocked',
        [
          _Item(
            icon: SolarIconsBold.verifiedCheck,
            color: V.trust,
            title: me.verified ? 'Verified profile' : 'Get verified',
            subtitle: verificationSubtitle(v, verified: me.verified),
            trailing: me.verified
                ? const Icon(SolarIconsBold.checkCircle, color: V.trust)
                : v.status == VerificationStatus.pending
                    ? const SizedBox.shrink()
                    : VerifyPill(busy: session.busy, onTap: () => startSelfieVerification(context)),
          ),
          _Item(
            icon: SolarIconsOutline.lockKeyhole,
            title: 'Private account',
            subtitle: 'New followers need your OK first',
            trailing: Switch(value: follows.privateAccount, onChanged: (on) => savePrivacy(privateAccount: on)),
          ),
          _Item(
            icon: SolarIconsOutline.eye,
            title: 'Show my numbers',
            subtitle: 'Matches, likes and gifts on your profile',
            trailing: Switch(value: !follows.hideStats, onChanged: (on) => savePrivacy(hideStats: !on)),
          ),
          _Item(
            icon: SolarIconsBold.radialBlur,
            title: 'Blur the first 3 seconds',
            subtitle: 'Both videos start blurred',
            trailing: Switch(value: match.autoBlur, onChanged: match.setAutoBlur),
          ),
          _Item(
            icon: SolarIconsOutline.eye,
            title: 'Show me in Discover',
            subtitle: 'Off: nobody new sees your card',
            trailing: Switch(
              value: discover.status?.showInDiscover ?? true,
              onChanged: (on) async {
                try {
                  await discover.setVisible(on);
                } on ApiException catch (_) {
                  if (context.mounted) toast(context, "Couldn't save that, try again", error: true);
                }
              },
            ),
          ),
          _Item(
            icon: SolarIconsBold.forbiddenCircle,
            title: 'Blocked',
            subtitle: social.blocked.isEmpty ? 'Nobody blocked' : '${social.blocked.length} blocked · tap to unblock',
            open: (_) => const BlockedPeopleScreen(),
          ),
        ],
      ),
      _Group(
        'wallet',
        'Wallet & invites',
        SolarIconsBold.wallet,
        color: V.gold,
        '${Fmt.compact(wallet.coins)} coins · ${Fmt.compact(wallet.gems)} gems · VIP, cash out, invites',
        [
          _Item(icon: SolarIconsBold.wallet, color: V.gold, title: 'Wallet', subtitle: '${Fmt.compact(wallet.coins)} coins · ${Fmt.compact(wallet.gems)} gems', open: (_) => const WalletScreen()),
          _Item(
            icon: SolarIconsBold.crown,
            color: V.gold,
            title: wallet.isVip ? 'You are VIP' : 'Get VIP',
            subtitle: wallet.isVip ? Fmt.until(wallet.wallet.vipUntil!) : 'Free filters, no ads, see who liked you',
            open: (_) => const VipScreen(),
          ),
          _Item(icon: SolarIconsBold.moneyBag, color: V.gem, title: 'Cash out gems', subtitle: 'JazzCash, Easypaisa or bank', open: (_) => const CashoutScreen()),
          _Item(icon: SolarIconsBold.gift, color: V.gold, title: 'Invite friends', subtitle: 'Give ${Economy.inviteeRewardCoins}, get ${Economy.inviteRewardCoins} coins', open: (_) => const InviteScreen()),
          _Item(icon: SolarIconsBold.handMoney, color: V.lavender, title: 'Creator partner program', subtitle: _partnerSubtitle(partner?.status), onTap: () => openPartnerScreen(context)),
        ],
      ),
      _Group(
        'help',
        'Help & about',
        SolarIconsBold.headphonesRound,
        'Help & safety centre, terms',
        [
          _Item(icon: SolarIconsBold.headphonesRound, color: V.trust, title: 'Help & safety centre', subtitle: 'Staying safe, the rules, write to us', open: (_) => const HelpSectionScreen()),
          _Item(icon: SolarIconsOutline.documentText, title: 'Terms & policies', subtitle: 'Terms, privacy, guidelines, child safety', open: (_) => const LegalSectionScreen()),
        ],
      ),
    ];
    return groups;
}

Widget _row(BuildContext context, _Item it) {
  final c = it.color;
  return GroupRow(
    icon: it.icon,
    iconColor: c ?? V.text2,
    // Tinted tiles as on the web: lavender sits on violet 14%, the rest on their own colour at 12%.
    iconBg: c == null ? null : (c == V.lavender ? V.violet.withValues(alpha: 0.14) : c.withValues(alpha: 0.12)),
    title: it.title,
    subtitle: it.subtitle,
    trailing: it.trailing ?? const Icon(SolarIconsOutline.altArrowRight, color: V.muted),
    onTap: it.open != null ? () => Navigator.of(context).push(MaterialPageRoute(builder: it.open!)) : it.onTap,
  );
}


String _partnerSubtitle(PartnerStatus? status) => switch (status) {
    PartnerStatus.active => 'Your stats, links and payouts',
    PartnerStatus.pending => 'Application under review',
    PartnerStatus.suspended => 'Paused · see why',
    PartnerStatus.rejected => 'Not approved this time',
    _ => 'Earn money for the people you bring',
  };

/// Me: the five settings groups (account, activity, privacy & safety, wallet,
/// help) as buttons, then Log out. A group pushes [SettingsGroupScreen].
/// Same as the web (`SettingsButtons` in `me-settings.tsx`).
class SettingsButtons extends StatefulWidget {
  const SettingsButtons({super.key});

  @override
  State<SettingsButtons> createState() => _SettingsButtonsState();
}

class _SettingsButtonsState extends State<SettingsButtons> {
  @override
  void initState() {
    super.initState();
    context.read<SessionProvider>().loadVerification();
  }

  @override
  Widget build(BuildContext context) {
    final groups = _settingsGroups(context);
    if (groups == null) return const SizedBox.shrink();
    final remote = context.watch<WalletProvider>().isRemote;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GroupCard(
          children: [
            for (final g in groups)
              _row(context, _Item(icon: g.icon, color: g.color, title: g.title, subtitle: g.summary, open: (_) => SettingsGroupScreen(group: g.key))),
          ],
        ),
        const SizedBox(height: 16),
        GroupCard(
          dividerInset: 52,
          children: [
            GroupRow(bare: true, icon: SolarIconsBold.logout_2, iconColor: V.bad, title: remote ? 'Log out' : 'Log out and reset the demo', titleColor: V.bad, onTap: () => signOutFlow(context)),
          ],
        ),
        const SizedBox(height: 12),
        Center(child: Text(remote ? 'Vibe 0.1' : 'Vibe 0.1 · offline demo', style: VT.body(11, color: V.muted))),
      ],
    );
  }
}

/// Me → one settings group: its rows. Rows push their own page and on/off
/// ones switch in place.
class SettingsGroupScreen extends StatelessWidget {
  const SettingsGroupScreen({super.key, required this.group});

  /// 'account', 'activity', 'privacy', 'wallet' or 'help'.
  final String group;

  @override
  Widget build(BuildContext context) {
    final open = _settingsGroups(context)?.where((g) => g.key == group).firstOrNull;
    if (open == null) return const SizedBox.shrink();
    final session = context.watch<SessionProvider>();
    final remote = context.watch<WalletProvider>().isRemote;
    return MeSectionScaffold(
      title: open.title,
      children: [
        const SizedBox(height: 8),
        GroupCard(children: [for (final it in open.items) _row(context, it)]),
        if (open.key == 'wallet' && session.referralClaimable) ...[const SizedBox(height: 10), const InviteCodeField()],
        if (open.key == 'account' && remote) ...[
          const SizedBox(height: 24),
          GroupCard(
            dividerInset: 52,
            children: [GroupRow(bare: true, icon: SolarIconsOutline.trashBinTrash, iconColor: V.bad, title: 'Delete account', titleColor: V.bad, onTap: () => deleteAccountFlow(context))],
          ),
        ],
      ],
    );
  }
}
