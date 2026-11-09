import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_exception.dart';
import '../../core/config/legal_links.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/match_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/wallet_provider.dart';
import 'notify_choices.dart';
import 'progress.dart';
import 'sign_in_methods.dart';
import 'user_profile_screen.dart';
import 'wellbeing_section.dart';

/// The screens behind Me and Settings and activity, one level each: the
/// system Back (or the app bar arrow) always returns to the page you came from.
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
            child: EmptyState(icon: SolarIconsBold.history, title: 'No calls ', accent: 'yet', body: 'Your last matches will show up here.'),
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
          if (r.liked) const Icon(SolarIconsBold.heart, size: 18, color: V.pink),
        ],
      ),
    );
  }
}

/// Settings → Notifications: for each kind of news, which of phone, inbox and e-mail it reaches.
class NotificationsSectionScreen extends StatelessWidget {
  const NotificationsSectionScreen({super.key});

  @override
  Widget build(BuildContext context) =>
      const MeSectionScaffold(title: 'Notifications', footer: "Account and safety messages always reach you, so they can't be turned off.", children: [NotifyChoices()]);
}

/// Settings → Time & wellbeing: quiet hours and break reminders.
class WellbeingSectionScreen extends StatelessWidget {
  const WellbeingSectionScreen({super.key});

  @override
  Widget build(BuildContext context) => const MeSectionScaffold(title: 'Time & wellbeing', children: [WellbeingSection()]);
}

/// Settings → Account & sign-in: how you sign in, e-mail updates, then log out / delete.
class AccountSectionScreen extends StatelessWidget {
  const AccountSectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final remote = context.read<WalletProvider>().isRemote;
    return MeSectionScaffold(
      title: 'Account & sign-in',
      children: [
        const SectionTitle('Sign-in methods', top: 4),
        const SignInMethodsCard(),
        const SectionTitle('E-mail', top: 22),
        GroupCard(
          dividerInset: 52,
          children: [
            GroupRow(
              bare: true,
              icon: SolarIconsOutline.letter,
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
          ],
        ),
        const SectionTitle('Danger zone', top: 22),
        GroupCard(
          dividerInset: 52,
          border: V.bad.withValues(alpha: 0.2),
          children: [
            GroupRow(bare: true, icon: SolarIconsBold.logout_2, iconColor: V.bad, title: remote ? 'Log out' : 'Log out and reset the demo', titleColor: V.bad, onTap: () => signOutFlow(context)),
            if (remote)
              GroupRow(
                bare: true,
                icon: SolarIconsOutline.trashBinTrash,
                iconColor: V.bad,
                title: 'Delete account',
                titleColor: V.bad,
                subtitle: 'Removes your profile for good',
                onTap: () => deleteAccountFlow(context),
              ),
          ],
        ),
      ],
    );
  }
}

/// Settings → Terms & policies: the four public pages on the site.
class LegalSectionScreen extends StatelessWidget {
  const LegalSectionScreen({super.key});

  @override
  Widget build(BuildContext context) => MeSectionScaffold(
        title: 'Terms & policies',
        footer: 'These open on the Vibe website.',
        children: [
          GroupCard(
            dividerInset: 52,
            children: [
              for (final (page, icon, label) in [
                (LegalPage.terms, SolarIconsOutline.documentText, 'Terms of Use'),
                (LegalPage.privacy, SolarIconsOutline.lockKeyhole, 'Privacy Policy'),
                (LegalPage.guidelines, SolarIconsOutline.usersGroupRounded, 'Community guidelines'),
                (LegalPage.childSafety, SolarIconsOutline.shieldUser, 'Child safety'),
              ])
                GroupRow(
                  bare: true,
                  icon: icon,
                  title: label,
                  trailing: const Icon(SolarIconsOutline.squareShareLine, color: V.muted, size: 18),
                  onTap: () => openSitePage(context, page),
                ),
            ],
          ),
        ],
      );
}

/// Settings → Help & safety centre: how to stay safe, the rules, and a person to write to.
class HelpSectionScreen extends StatelessWidget {
  const HelpSectionScreen({super.key});

  static const supportEmail = 'support@vibe.fawadiqbal.dev';

  @override
  Widget build(BuildContext context) {
    Widget row(IconData icon, String title, String subtitle, VoidCallback onTap, {bool external = true}) => GroupRow(
          icon: icon,
          iconColor: V.trust,
          iconBg: V.trust.withValues(alpha: 0.12),
          title: title,
          subtitle: subtitle,
          trailing: Icon(external ? SolarIconsOutline.squareShareLine : SolarIconsOutline.altArrowRight, color: V.muted, size: external ? 18 : 24),
          onTap: onTap,
        );
    return MeSectionScaffold(
      title: 'Help & safety centre',
      footer: 'In a call, tap the flag to report someone. A person on our team reviews every report.',
      children: [
        GroupCard(
          border: V.trust.withValues(alpha: 0.22),
          children: [
            row(SolarIconsBold.shieldCheck, 'Staying safe on Vibe', 'Blur, blocking, reporting and age rules', () => openSitePage(context, LegalPage.childSafety)),
            row(SolarIconsBold.usersGroupRounded, 'Community guidelines', "What's OK and what gets you banned", () => openSitePage(context, LegalPage.guidelines)),
            row(SolarIconsBold.letter, 'Write to us', supportEmail, external: false, () async {
              final uri = Uri(scheme: 'mailto', path: supportEmail, query: 'subject=Vibe%20help');
              var ok = false;
              try {
                ok = await launchUrl(uri);
              } catch (_) {}
              if (!ok && context.mounted) {
                await Clipboard.setData(const ClipboardData(text: supportEmail));
                if (context.mounted) toast(context, 'E-mail address copied');
              }
            }),
          ],
        ),
      ],
    );
  }
}

/// A page on the public site, or a toast when it can't open.
Future<void> openSitePage(BuildContext context, LegalPage page) async {
  if (!await openLegal(page) && context.mounted) toast(context, "Couldn't open the page. Try again.", error: true);
}

/// Log out, after one check; back to the tabs first so the signed-out app isn't under this page.
Future<void> signOutFlow(BuildContext context) async {
  final remote = context.read<WalletProvider>().isRemote;
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Log out?'),
      content: Text(remote ? 'You can sign back in with the same e-mail any time.' : 'This mock build clears everything: coins, friends, history.'),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel', style: TextStyle(color: V.text2))),
        TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Log out', style: TextStyle(color: V.bad))),
      ],
    ),
  );
  if (ok != true || !context.mounted) return;
  final match = context.read<MatchProvider>();
  final session = context.read<SessionProvider>();
  Navigator.of(context).popUntil((r) => r.isFirst);
  await match.releaseCamera();
  await session.signOut();
}

/// Two confirmations, then `DELETE /me` and back to the welcome screen.
Future<void> deleteAccountFlow(BuildContext context) async {
  final session = context.read<SessionProvider>();
  Future<bool> ask(String title, String body, String ok) async =>
      await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(title),
          content: Text(body),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel', style: TextStyle(color: V.text2))),
            TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(ok, style: const TextStyle(color: V.bad))),
          ],
        ),
      ) ==
      true;
  if (!await ask('Delete your account?', "Your profile, photos and name are removed and you're signed out. Unused coins, gems and VIP time are lost — cash out gems first. This can't be undone.", 'Continue')) return;
  if (!context.mounted || !await ask('Delete it for good?', 'Last check: your Vibe account will be deleted now.', 'Delete account')) return;
  if (!context.mounted) return;
  final match = context.read<MatchProvider>();
  final nav = Navigator.of(context);
  try {
    await match.releaseCamera();
    await session.deleteAccount();
    nav.popUntil((r) => r.isFirst);
  } on ApiException catch (e) {
    if (context.mounted) toast(context, e.message, error: true);
  }
}
