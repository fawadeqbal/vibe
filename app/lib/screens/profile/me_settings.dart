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
import 'follow_lists_screen.dart';
import 'leaderboard_screen.dart';
import 'me_lists.dart';
import 'me_sections.dart';
import 'verification_flow.dart';

/// One row of the menu: what it shows, plus words people might search for.
class _Item {
  const _Item({required this.icon, required this.title, this.subtitle, this.color, this.words = '', this.open, this.onTap, this.trailing});
  final IconData icon;
  final String title;
  final String? subtitle;
  final Color? color;

  /// Extra search words ("password", "email"…).
  final String words;

  /// The page this row pushes.
  final WidgetBuilder? open;
  final VoidCallback? onTap;

  /// A switch or pill instead of the chevron.
  final Widget? trailing;

  bool matches(String q) => q.isEmpty || '$title ${subtitle ?? ''} $words'.toLowerCase().contains(q);
}

/// Settings and activity (Me → ☰): everything that isn't your profile, in
/// five groups people know from other apps, with a search on top. Rows push
/// their own page (Back returns here), and the simple on/off ones switch
/// right in the row. Same as the web (`me-settings.tsx`).
class SettingsMenuScreen extends StatefulWidget {
  const SettingsMenuScreen({super.key});

  @override
  State<SettingsMenuScreen> createState() => _SettingsMenuScreenState();
}

class _SettingsMenuScreenState extends State<SettingsMenuScreen> {
  final _search = TextEditingController();
  String _q = '';

  @override
  void initState() {
    super.initState();
    context.read<SessionProvider>().loadVerification();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
    if (me == null) return const SizedBox.shrink();

    Future<void> savePrivacy({bool? privateAccount, bool? hideStats}) async {
      final ok = await followsP.setPrivacy(privateAccount: privateAccount, hideStats: hideStats);
      if (!ok && context.mounted) toast(context, "Couldn't save that, try again", error: true);
    }

    final v = session.verification;
    final friends = social.friends.length;
    final groups = <(String, List<_Item>)>[
      (
        'Your account',
        [
          _Item(icon: SolarIconsBold.userId, title: 'Account & sign-in', subtitle: 'Sign-in methods, e-mail, delete account', words: 'email password google apple facebook login delete', open: (_) => const AccountSectionScreen()),
          _Item(icon: SolarIconsOutline.bell, title: 'Notifications', subtitle: 'Phone, inbox and e-mail, for each kind', words: 'push alerts sounds email', open: (_) => const NotificationsSectionScreen()),
          _Item(icon: SolarIconsBold.moonSleep, title: 'Time & wellbeing', subtitle: 'Quiet hours and break reminders', words: 'quiet hours break reminder sleep', open: (_) => const WellbeingSectionScreen()),
        ],
      ),
      (
        'Your activity',
        [
          _Item(
            icon: SolarIconsBold.history,
            title: 'Recent matches',
            subtitle: match.history.isEmpty ? 'Your last calls show up here' : '${match.history.length} recent ${match.history.length == 1 ? 'call' : 'calls'}',
            words: 'history calls',
            open: (_) => const RecentMatchesScreen(),
          ),
          _Item(
            icon: SolarIconsBold.usersGroupTwoRounded,
            title: 'Followers & friends',
            subtitle: '${Fmt.thousands(follows.followers)} ${follows.followers == 1 ? 'follower' : 'followers'} · ${Fmt.thousands(friends)} ${friends == 1 ? 'friend' : 'friends'}',
            words: 'following requests',
            open: (_) => const FollowListsScreen(),
          ),
          _Item(
            icon: SolarIconsBold.cupStar,
            color: V.lavender,
            title: 'Progress & badges',
            subtitle: 'Level ${engagement.level.level} · ${Fmt.thousands(engagement.level.xp)} XP',
            words: 'xp level streak',
            open: (_) => const ProgressSectionScreen(),
          ),
          _Item(icon: SolarIconsBold.ranking, color: V.lavender, title: 'Leaderboard', subtitle: "This week's top people", words: 'ranking top', open: (_) => const LeaderboardScreen()),
        ],
      ),
      (
        'Privacy & safety',
        [
          _Item(
            icon: SolarIconsBold.verifiedCheck,
            color: V.trust,
            title: me.verified ? 'Verified profile' : 'Get verified',
            subtitle: verificationSubtitle(v, verified: me.verified),
            words: 'selfie badge',
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
            words: 'privacy followers approve',
            trailing: Switch(value: follows.privateAccount, onChanged: (on) => savePrivacy(privateAccount: on)),
          ),
          _Item(
            icon: SolarIconsOutline.eye,
            title: 'Show my numbers',
            subtitle: 'Matches, likes and gifts on your profile',
            words: 'stats hide privacy',
            trailing: Switch(value: !follows.hideStats, onChanged: (on) => savePrivacy(hideStats: !on)),
          ),
          _Item(
            icon: SolarIconsBold.radialBlur,
            title: 'Blur the first 3 seconds',
            subtitle: 'Both videos start blurred',
            words: 'safety video',
            trailing: Switch(value: match.autoBlur, onChanged: match.setAutoBlur),
          ),
          _Item(
            icon: SolarIconsOutline.eye,
            title: 'Show me in Discover',
            subtitle: 'Off: nobody new sees your card',
            words: 'hide visible discover card',
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
            words: 'unblock block',
            open: (_) => const BlockedPeopleScreen(),
          ),
        ],
      ),
      (
        'Wallet & invites',
        [
          _Item(icon: SolarIconsBold.wallet, color: V.gold, title: 'Wallet', subtitle: '${Fmt.thousands(wallet.coins)} coins · ${Fmt.thousands(wallet.gems)} gems', words: 'coins gems buy money', open: (_) => const WalletScreen()),
          _Item(
            icon: SolarIconsBold.crown,
            color: V.gold,
            title: wallet.isVip ? 'You are VIP' : 'Get VIP',
            subtitle: wallet.isVip ? Fmt.until(wallet.wallet.vipUntil!) : 'Free filters, no ads, see who liked you',
            words: 'premium subscription',
            open: (_) => const VipScreen(),
          ),
          _Item(icon: SolarIconsBold.moneyBag, color: V.gem, title: 'Cash out gems', subtitle: 'JazzCash, Easypaisa or bank', words: 'withdraw money payout', open: (_) => const CashoutScreen()),
          _Item(icon: SolarIconsBold.gift, color: V.gold, title: 'Invite friends', subtitle: 'Give ${Economy.inviteeRewardCoins}, get ${Economy.inviteRewardCoins} coins', words: 'referral code share', open: (_) => const InviteScreen()),
          _Item(icon: SolarIconsBold.handMoney, color: V.lavender, title: 'Creator partner program', subtitle: _partnerSubtitle(partner?.status), words: 'affiliate earn creator', onTap: () => openPartnerScreen(context)),
        ],
      ),
      (
        'Help & about',
        [
          _Item(icon: SolarIconsBold.headphonesRound, color: V.trust, title: 'Help & safety centre', subtitle: 'Staying safe, the rules, write to us', words: 'support report contact', open: (_) => const HelpSectionScreen()),
          _Item(icon: SolarIconsOutline.documentText, title: 'Terms & policies', subtitle: 'Terms, privacy, guidelines, child safety', words: 'legal terms privacy policy', open: (_) => const LegalSectionScreen()),
        ],
      ),
    ];

    final shown = [
      for (final (title, items) in groups)
        if (items.where((i) => i.matches(_q)).toList() case final hits when hits.isNotEmpty) (title, hits),
    ];

    return MeSectionScaffold(
      title: 'Settings and activity',
      children: [
        TextField(
          controller: _search,
          onChanged: (t) => setState(() => _q = t.trim().toLowerCase()),
          style: VT.body(15),
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: 'Search',
            isDense: true,
            prefixIcon: const Icon(SolarIconsOutline.magnifier, size: 20, color: V.muted),
            suffixIcon: _q.isEmpty
                ? null
                : IconButton(
                    tooltip: 'Clear',
                    icon: const Icon(SolarIconsOutline.closeCircle, size: 20, color: V.muted),
                    onPressed: () => setState(() {
                      _search.clear();
                      _q = '';
                    }),
                  ),
            contentPadding: const EdgeInsets.symmetric(vertical: 12),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: V.line)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: V.line)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: V.violet)),
            filled: true,
            fillColor: V.surface2,
          ),
        ),
        for (final (i, (title, items)) in shown.indexed) ...[
          SectionTitle(title, top: i == 0 ? 20 : 24, bottom: 10),
          GroupCard(children: [for (final it in items) _row(context, it)]),
          if (title == 'Wallet & invites' && _q.isEmpty && session.referralClaimable) ...[const SizedBox(height: 10), const InviteCodeField()],
        ],
        if (_q.isNotEmpty && shown.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 40),
            child: Center(child: Text('Nothing matches “${_search.text.trim()}”.', style: VT.body(14, color: V.text2))),
          ),
        if (_q.isEmpty) ...[
          const SizedBox(height: 24),
          GroupCard(
            dividerInset: 52,
            children: [
              GroupRow(bare: true, icon: SolarIconsBold.logout_2, iconColor: V.bad, title: wallet.isRemote ? 'Log out' : 'Log out and reset the demo', titleColor: V.bad, onTap: () => signOutFlow(context)),
              if (wallet.isRemote)
                GroupRow(bare: true, icon: SolarIconsOutline.trashBinTrash, iconColor: V.bad, title: 'Delete account', titleColor: V.bad, onTap: () => deleteAccountFlow(context)),
            ],
          ),
          const SizedBox(height: 16),
          Center(child: Text(wallet.isRemote ? 'Vibe 0.1' : 'Vibe 0.1 · offline demo', style: VT.body(11, color: V.muted))),
        ],
      ],
    );
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

  static String _partnerSubtitle(PartnerStatus? status) => switch (status) {
        PartnerStatus.active => 'Your stats, links and payouts',
        PartnerStatus.pending => 'Application under review',
        PartnerStatus.suspended => 'Paused · see why',
        PartnerStatus.rejected => 'Not approved this time',
        _ => 'Earn money for the people you bring',
      };
}
