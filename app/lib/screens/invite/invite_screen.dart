import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/referrals_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/wallet_provider.dart';
import '../partner/partner_screen.dart';
import 'invite_code_field.dart';
import 'invite_share.dart';

/// Invite friends: "Give 50, get 100 coins", how it works, WhatsApp first,
/// the milestones, and everyone who joined with your link and how far they
/// are. Live: rows move as friends verify and have calls.
class InviteScreen extends StatefulWidget {
  const InviteScreen({super.key, this.claimCode});

  /// An invite link opened while signed in: pre-fills "Have an invite code?".
  final String? claimCode;

  @override
  State<InviteScreen> createState() => _InviteScreenState();
}

class _InviteScreenState extends State<InviteScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<ReferralsProvider>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final referrals = context.watch<ReferralsProvider>();
    final claimable = context.select<SessionProvider, bool>((s) => s.referralClaimable);
    final v = referrals.view;
    final rewards = referrals.rewards;
    return Scaffold(
      appBar: vibeAppBar(context, 'Invite friends'),
      body: RefreshIndicator(
        color: V.pink,
        backgroundColor: V.surface,
        onRefresh: referrals.load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
          children: [
            _Hero(rewards: rewards, code: v?.code),
            if (v?.affiliate != null) ...[const SizedBox(height: 12), _PartnerLinkCard(link: v!.affiliate!)],
            const SectionTitle('How it works'),
            _HowItWorks(rewards: rewards),
            SectionTitle('Milestones', note: v == null ? null : '${v.stats.rewarded} active ${v.stats.rewarded == 1 ? 'friend' : 'friends'}'),
            _MilestoneTrack(milestones: referrals.milestones, rewarded: v?.stats.rewarded ?? 0),
            if (v != null) ...[const SizedBox(height: 10), _Totals(stats: v.stats)],
            SectionTitle(v == null || v.people.isEmpty ? 'Your invites' : 'Your invites · ${v.stats.joined}'),
            if (v == null && referrals.loading)
              const Padding(padding: EdgeInsets.symmetric(vertical: 28), child: Center(child: CircularProgressIndicator()))
            else if (v == null && referrals.error != null)
              _LoadError(onRetry: referrals.load)
            else if (v == null || v.people.isEmpty)
              const _NoInvitesYet()
            else
              GroupCard(dividerInset: 74, children: [for (final p in v.people) _PersonRow(person: p)]),
            if (claimable || widget.claimCode != null) ...[const SizedBox(height: 18), InviteCodeField(initialCode: widget.claimCode)],
            if (referrals is LocalReferralsProvider) ...[
              const SizedBox(height: 8),
              Center(
                child: TextButton.icon(
                  onPressed: () {
                    final u = referrals.advanceDemo();
                    if (u == null) {
                      toast(context, 'Everyone is active already');
                    } else if (u.event == ReferralEvent.rewarded) {
                      context.read<WalletProvider>().claimInvite(u.person.firstName);
                    }
                  },
                  icon: const Icon(Icons.fast_forward_rounded, size: 18, color: V.muted),
                  label: Text('Offline demo: move a friend along', style: VT.label(12.5, color: V.muted, weight: FontWeight.w500)),
                ),
              ),
            ],
            const SizedBox(height: 14),
            Text(
              'Coins arrive about ${rewards.holdHours} h after your friend is active. Sign-ups from the same phone don\'t count.',
              textAlign: TextAlign.center,
              style: VT.body(11.5, color: V.muted, height: 1.45),
            ),
          ],
        ),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.rewards, required this.code});
  final ReferralRewards rewards;
  final String? code;

  @override
  Widget build(BuildContext context) {
    final gold = VT.display(34, color: V.gold);
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
      decoration: BoxDecoration(gradient: V.vipCard, borderRadius: BorderRadius.circular(26), border: Border.all(color: V.gold.withValues(alpha: 0.22))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            label: 'Give ${rewards.inviteeCoins}, get ${rewards.inviterCoins} coins',
            excludeSemantics: true,
            child: Text.rich(
              TextSpan(children: [
                TextSpan(text: 'Give ', style: VT.display(34)),
                TextSpan(text: '${rewards.inviteeCoins}', style: gold),
                TextSpan(text: ', get ', style: VT.display(34)),
                TextSpan(text: '${rewards.inviterCoins}', style: gold),
                TextSpan(text: ' coins', style: VT.serif(38, color: V.text)),
              ]),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Friends who join with your link get ${rewards.inviteeCoins} free coins. You get ${rewards.inviterCoins} for each one who becomes active.',
            style: VT.body(14, color: V.text2, height: 1.5),
          ),
          if (code != null && code!.isNotEmpty) ...[
            const SizedBox(height: 16),
            Material(
              color: V.surface2,
              borderRadius: BorderRadius.circular(16),
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () async {
                  await Clipboard.setData(ClipboardData(text: code!));
                  if (context.mounted) toast(context, 'Code copied');
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  child: Row(
                    children: [
                      Text('YOUR CODE', style: VT.overline()),
                      const SizedBox(width: 12),
                      Expanded(child: Text(code!, style: VT.mono(18, color: V.text, weight: FontWeight.w600))),
                      const Icon(Icons.copy_rounded, size: 18, color: V.text2, semanticLabel: 'Copy code'),
                    ],
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 16),
          // The one primary action on this screen.
          GradientButton(label: 'Share on WhatsApp', icon: Icons.chat_rounded, onTap: () => shareInviteOnWhatsApp(context, coins: rewards.inviteeCoins)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: GhostButton(label: 'More apps', icon: Icons.ios_share_rounded, expand: true, onTap: () => shareInviteText(context, coins: rewards.inviteeCoins))),
              const SizedBox(width: 10),
              Expanded(child: GhostButton(label: 'Copy link', icon: Icons.link_rounded, expand: true, onTap: () => copyInvite(context))),
            ],
          ),
        ],
      ),
    );
  }
}

class _PartnerLinkCard extends StatelessWidget {
  const _PartnerLinkCard({required this.link});
  final PartnerLink link;

  @override
  Widget build(BuildContext context) {
    return Panel(
      radius: 20,
      padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: V.gold.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.campaign_rounded, color: V.gold, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Your partner link', style: VT.title(14.5, weight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(link.link.replaceFirst(RegExp(r'^https?://'), ''), maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.mono(12.5, color: V.text2)),
                const SizedBox(height: 2),
                GestureDetector(
                  onTap: () => openPartnerScreen(context),
                  child: Text('Earnings and stats →', style: VT.label(12, color: V.pinkSoft)),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Copy partner link',
            icon: const Icon(Icons.copy_rounded, size: 20, color: V.text2),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: link.link));
              if (context.mounted) toast(context, 'Partner link copied');
            },
          ),
        ],
      ),
    );
  }
}

class _HowItWorks extends StatelessWidget {
  const _HowItWorks({required this.rewards});
  final ReferralRewards rewards;

  @override
  Widget build(BuildContext context) {
    final calls = '${rewards.activationCalls} ${rewards.activationCalls == 1 ? 'call' : 'calls'}';
    final steps = [
      (Icons.ios_share_rounded, V.pinkSoft, 'Share your link', 'WhatsApp, Instagram, anywhere. They sign up with it.'),
      (Icons.verified_rounded, V.trust, rewards.requireVerified ? 'They verify and have $calls' : 'They have $calls', rewards.requireVerified ? 'A selfie check, then $calls of a minute or more.' : '$calls of a minute or more.'),
      (Icons.toll_rounded, V.gold, 'You both get coins', 'You get ${rewards.inviterCoins}, they get ${rewards.inviteeCoins}.'),
    ];
    return GroupCard(
      dividerInset: 70,
      children: [
        for (final (i, s) in steps.indexed)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: s.$2.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                  child: Icon(s.$1, size: 21, color: s.$2),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${i + 1}. ${s.$3}', style: VT.title(14.5, weight: FontWeight.w600)),
                      const SizedBox(height: 1),
                      Text(s.$4, style: VT.body(12.5, color: V.text2, height: 1.4)),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// 3 · 10 · 25 on a line that fills with your active friends.
class _MilestoneTrack extends StatelessWidget {
  const _MilestoneTrack({required this.milestones, required this.rewarded});
  final List<ReferralMilestone> milestones;
  final int rewarded;

  @override
  Widget build(BuildContext context) {
    if (milestones.isEmpty) return const SizedBox.shrink();
    final top = milestones.last.count <= 0 ? 1 : milestones.last.count;
    final next = milestones.where((m) => !m.reached && rewarded < m.count).firstOrNull;
    return Panel(
      radius: 20,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: 34,
            child: LayoutBuilder(builder: (context, c) {
              final w = c.maxWidth;
              double x(int count) => (count / top).clamp(0.0, 1.0) * (w - 30) + 15;
              final fill = (rewarded / top).clamp(0.0, 1.0) * (w - 30);
              return Stack(
                clipBehavior: Clip.none,
                children: [
                  Positioned(left: 15, right: 15, top: 15, child: Container(height: 4, decoration: BoxDecoration(color: V.surface3, borderRadius: BorderRadius.circular(2)))),
                  Positioned(left: 15, top: 15, child: Container(width: fill, height: 4, decoration: BoxDecoration(color: V.gold, borderRadius: BorderRadius.circular(2)))),
                  for (final m in milestones)
                    Positioned(
                      left: x(m.count) - 15,
                      top: 2,
                      child: Semantics(
                        label: '${m.count} friends: ${m.rewardLabel}${(m.reached || rewarded >= m.count) ? ', reached' : ''}',
                        excludeSemantics: true,
                        child: _node(m, m.reached || rewarded >= m.count),
                      ),
                    ),
                ],
              );
            }),
          ),
          const SizedBox(height: 8),
          LayoutBuilder(builder: (context, c) {
            return SizedBox(
              height: 34,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  for (final m in milestones)
                    Positioned(
                      left: ((m.count / top).clamp(0.0, 1.0) * (c.maxWidth - 30) + 15 - 45).clamp(0.0, c.maxWidth - 90),
                      width: 90,
                      child: Column(
                        children: [
                          Text('${m.count} friends', style: VT.label(11.5, color: V.text, weight: FontWeight.w600)),
                          Text(m.rewardLabel, style: VT.label(10.5, color: (m.reached || rewarded >= m.count) ? V.gold : V.muted, weight: FontWeight.w500)),
                        ],
                      ),
                    ),
                ],
              ),
            );
          }),
          const SizedBox(height: 10),
          Text(
            next == null ? 'Every milestone reached. Legend. 🎖️' : '${next.count - rewarded} more active ${next.count - rewarded == 1 ? 'friend' : 'friends'} to ${next.rewardLabel}',
            textAlign: TextAlign.center,
            style: VT.body(12.5, color: V.text2),
          ),
        ],
      ),
    );
  }

  Widget _node(ReferralMilestone m, bool reached) {
    return Container(
      width: 30,
      height: 30,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: reached ? V.gold : V.surface2,
        border: Border.all(color: reached ? V.gold : V.lineStrong, width: 1.5),
      ),
      child: Icon(
        reached ? Icons.check_rounded : (m.kind == MilestoneReward.vip ? Icons.workspace_premium_rounded : Icons.toll_rounded),
        size: 16,
        color: reached ? V.onGold : V.muted,
      ),
    );
  }
}

class _Totals extends StatelessWidget {
  const _Totals({required this.stats});
  final ReferralStats stats;

  @override
  Widget build(BuildContext context) {
    Widget cell(String v, String l, {Color color = V.text}) => Expanded(
          child: Column(children: [Text(v, style: VT.number(20, color: color)), const SizedBox(height: 2), Text(l, style: VT.body(11, color: V.muted, height: 1.2))]),
        );
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(V.r), border: Border.all(color: V.line)),
      child: IntrinsicHeight(
        child: Row(
          children: [
            cell(Fmt.thousands(stats.joined), 'Joined'),
            const VerticalDivider(width: 1, color: V.lineSoft),
            cell(Fmt.thousands(stats.pending), 'On their way'),
            const VerticalDivider(width: 1, color: V.lineSoft),
            cell(Fmt.thousands(stats.rewarded), 'Active'),
            const VerticalDivider(width: 1, color: V.lineSoft),
            cell(Fmt.thousands(stats.coinsEarned), 'Coins earned', color: V.gold),
          ],
        ),
      ),
    );
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({required this.person});
  final ReferralPerson person;

  @override
  Widget build(BuildContext context) {
    final p = person;
    final s = p.steps;
    final (String sub, Widget chip) = switch (p.status) {
      ReferralStatus.pending => ('Joined ${Fmt.ago(p.createdAt)}', _progressChip(s)),
      ReferralStatus.qualified => ('Active · coins on the way', const _Chip('Pending', color: V.gold, icon: Icons.hourglass_top_rounded)),
      ReferralStatus.rewarded => ('Rewarded ${p.rewardedAt == null ? '' : Fmt.ago(p.rewardedAt!)}'.trim(), _Chip('Rewarded +${p.coins}', color: V.gold, icon: Icons.check_rounded)),
      ReferralStatus.rejected => (p.rejectText, const _Chip('Not eligible', color: V.muted)),
    };
    return Semantics(
      container: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Opacity(opacity: p.status == ReferralStatus.rejected ? 0.5 : 1, child: VAvatar(url: p.profile.avatarUrl, name: p.profile.name, size: 44, gapColor: V.surface)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(p.firstName.isEmpty ? 'Someone' : p.firstName, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.title(15, weight: FontWeight.w600, color: p.status == ReferralStatus.rejected ? V.text2 : V.text)),
                  const SizedBox(height: 2),
                  Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(12, color: V.text2)),
                  const SizedBox(height: 6),
                  chip,
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// "Verified ✓ · 2/3 calls".
  static Widget _progressChip(ReferralSteps s) {
    final parts = [
      if (s.verifyNeeded) s.verified ? 'Verified ✓' : 'Not verified yet',
      '${s.calls}/${s.callsNeeded} calls',
    ];
    final color = s.verified || !s.verifyNeeded ? V.trust : V.text2;
    return _Chip(parts.join(' · '), color: color);
  }
}

/// A status chip that ellipsizes instead of overflowing on narrow rows.
class _Chip extends StatelessWidget {
  const _Chip(this.text, {required this.color, this.icon});
  final String text;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 22,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(11)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 12, color: color), const SizedBox(width: 4)],
          Flexible(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.label(10.5, color: color, weight: FontWeight.w700))),
        ],
      ),
    );
  }
}

class _NoInvitesYet extends StatelessWidget {
  const _NoInvitesYet();

  @override
  Widget build(BuildContext context) {
    return Panel(
      radius: 20,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 22),
      child: Column(
        children: [
          const Icon(Icons.group_add_rounded, size: 30, color: V.text2),
          const SizedBox(height: 10),
          Text('No one yet', style: VT.title(16)),
          const SizedBox(height: 4),
          Text('Friends who sign up with your link show up here, with how far they are.', textAlign: TextAlign.center, style: VT.body(13, color: V.text2, height: 1.45)),
        ],
      ),
    );
  }
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.onRetry});
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Panel(
      radius: 20,
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          const Icon(Icons.wifi_off_rounded, color: V.text2),
          const SizedBox(width: 12),
          Expanded(child: Text("Couldn't load your invites.", style: VT.body(13.5, color: V.text2))),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

/// A milestone was reached: the celebration (from anywhere in the app).
Future<void> showMilestoneSheet(BuildContext context, MilestoneReached m) {
  final r = m.reward;
  final vip = r.kind == MilestoneReward.vip;
  return showVibeSheet<void>(
    context,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(24, 18, 24, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(shape: BoxShape.circle, color: V.gold.withValues(alpha: 0.14), border: Border.all(color: V.gold.withValues(alpha: 0.4))),
            child: Icon(vip ? Icons.workspace_premium_rounded : Icons.military_tech_rounded, size: 38, color: V.gold),
          ),
          const SizedBox(height: 16),
          Headline('${m.count} friends joined. ', accent: 'Thank you.', size: 26, textAlign: TextAlign.center),
          const SizedBox(height: 10),
          Text(
            vip ? 'You unlocked ${r.amount} days of VIP 👑 — free filters, no ads, see who liked you.' : '+${Fmt.thousands(r.amount)} coins 🎖️ are in your wallet.',
            textAlign: TextAlign.center,
            style: VT.body(15, color: V.text2, height: 1.5),
          ),
          const SizedBox(height: 22),
          GhostButton(label: 'Keep inviting', icon: Icons.ios_share_rounded, expand: true, onTap: () => Navigator.of(context).pop()),
        ],
      ),
    ),
  );
}
