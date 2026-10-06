import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/follows_provider.dart';
import '../../providers/match_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/social_provider.dart';
import '../../providers/wallet_provider.dart';
import '../match/safety_sheet.dart' show VerifyPill;
import 'follow_lists_screen.dart';
import 'progress.dart';
import 'sign_in_methods.dart';
import 'user_profile_screen.dart';
import 'verification_flow.dart';
import 'wellbeing_section.dart';

/// The screens behind the Me menu rows. Me itself stays short (your card,
/// your numbers, one row per area); each area opens here.
class MeSectionScaffold extends StatelessWidget {
  const MeSectionScaffold({super.key, required this.title, required this.children, this.footer});
  final String title;
  final List<Widget> children;

  /// Small print under the content (e.g. what a section is for).
  final String? footer;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: vibeAppBar(context, title),
    body: ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
      children: [
        ...children,
        if (footer != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 12, 4, 0),
            child: Text(footer!, style: VT.body(12, color: V.muted, height: 1.5)),
          ),
      ],
    ),
  );
}

/// Me → Progress & badges: level, this week's XP and the badges.
class ProgressSectionScreen extends StatelessWidget {
  const ProgressSectionScreen({super.key});

  @override
  Widget build(BuildContext context) =>
      const MeSectionScaffold(title: 'Progress & badges', footer: 'Good calls, likes, gifts and streaks earn XP. Badges stay on your profile.', children: [ProgressCard()]);
}

/// Me → Followers & privacy.
class FollowersSectionScreen extends StatelessWidget {
  const FollowersSectionScreen({super.key});

  @override
  Widget build(BuildContext context) => const MeSectionScaffold(title: 'Followers & privacy', children: [FollowSettingsCard()]);
}

/// Me → Recent matches: your last calls; tap one to see their profile.
class RecentMatchesScreen extends StatelessWidget {
  const RecentMatchesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final match = context.watch<MatchProvider>();
    final list = match.history.take(20).toList();
    return MeSectionScaffold(
      title: 'Recent matches',
      children: [
        if (list.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 60),
            child: EmptyState(icon: Icons.history_rounded, title: 'No calls ', accent: 'yet', body: 'Your last matches will show up here.'),
          )
        else
          for (final (i, r) in list.indexed) _matchRow(context, r, last: i == list.length - 1),
      ],
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
      decoration: BoxDecoration(
        border: last ? null : const Border(bottom: BorderSide(color: V.lineSoft)),
      ),
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

/// Me → Safety & trust (teal): verification, blur, blocked people, help.
class SafetySectionScreen extends StatelessWidget {
  const SafetySectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final match = context.watch<MatchProvider>();
    final social = context.watch<SocialProvider>();
    final me = session.me;
    if (me == null) return const SizedBox.shrink();
    return MeSectionScaffold(
      title: 'Safety & trust',
      children: [
        GroupCard(
          border: V.trust.withValues(alpha: 0.22),
          children: [
            GroupRow(
              icon: me.verified ? Icons.verified_rounded : Icons.verified_outlined,
              iconColor: V.trust,
              iconBg: V.trust.withValues(alpha: 0.12),
              title: me.verified ? 'Verified profile' : 'Verify your profile',
              subtitle: verificationSubtitle(session.verification, verified: me.verified),
              trailing: me.verified ? const Icon(Icons.check_circle_rounded, color: V.trust) : VerifyPill(busy: session.busy, onTap: () => startSelfieVerification(context)),
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
      ],
    );
  }
}

/// Me → Notifications & wellbeing.
class WellbeingSectionScreen extends StatelessWidget {
  const WellbeingSectionScreen({super.key});

  @override
  Widget build(BuildContext context) => const MeSectionScaffold(title: 'Notifications & wellbeing', children: [WellbeingSection()]);
}

/// Me → Account: sign-in methods, e-mail updates, terms, sign out.
class AccountSectionScreen extends StatelessWidget {
  const AccountSectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final remote = context.read<WalletProvider>().isRemote;
    return MeSectionScaffold(
      title: 'Account',
      children: [
        const SectionTitle('Sign-in methods', top: 4),
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
              title: remote ? 'Sign out' : 'Sign out and reset the demo',
              titleColor: V.bad,
              onTap: () async {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Sign out?'),
                    content: Text(remote ? 'You can sign back in with the same e-mail any time.' : 'This mock build clears everything: coins, friends, history.'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.of(ctx).pop(false),
                        child: const Text('Cancel', style: TextStyle(color: V.text2)),
                      ),
                      TextButton(
                        onPressed: () => Navigator.of(ctx).pop(true),
                        child: const Text('Sign out', style: TextStyle(color: V.bad)),
                      ),
                    ],
                  ),
                );
                if (ok == true && context.mounted) {
                  final match = context.read<MatchProvider>();
                  // Back to the tabs first so the signed-out app isn't under this page.
                  Navigator.of(context).popUntil((r) => r.isFirst);
                  await match.releaseCamera();
                  await session.signOut();
                }
              },
            ),
          ],
        ),
      ],
    );
  }
}

/// Your followers (only you see the lists) and the two privacy switches.
class FollowSettingsCard extends StatelessWidget {
  const FollowSettingsCard({super.key});

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
          trailing: Switch(
            value: s.privateAccount,
            onChanged: (on) => save(privateAccount: on),
          ),
        ),
        GroupRow(
          bare: true,
          icon: Icons.visibility_off_outlined,
          title: 'Hide my stats',
          subtitle: 'Matches, likes and gifts stay private.',
          trailing: Switch(
            value: s.hideStats,
            onChanged: (on) => save(hideStats: on),
          ),
        ),
      ],
    );
  }
}
