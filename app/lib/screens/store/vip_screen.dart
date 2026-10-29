import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_exception.dart';

import '../../core/mock/mock_data.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../models/payments.dart';
import '../../providers/discover_provider.dart';
import '../../providers/social_provider.dart';
import '../discover/liked_you_screen.dart';
import '../../providers/wallet_provider.dart';
import '../../services/app_services.dart';
import 'checkout_screen.dart';

/// The subscription page. "Who liked you" leads as the hook, benefits are
/// a grid, plans are radio rows with the trial stated plainly, and the CTA
/// sticks to the bottom with a no-charge-today reassurance.
class VipScreen extends StatefulWidget {
  const VipScreen({super.key});

  @override
  State<VipScreen> createState() => _VipScreenState();
}

class _VipScreenState extends State<VipScreen> {
  // Kept by id: the plan list can change live when staff edit prices.
  String? _planId;

  /// How the current VIP is billed: store subscriptions are managed there.
  VipStatus? _status;

  @override
  void initState() {
    super.initState();
    _loadStatus();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final d = context.read<DiscoverProvider>();
      d.loadStatus();
      d.loadLikedYou();
    });
  }

  Future<void> _loadStatus() async {
    final wallet = context.read<WalletProvider>();
    if (!wallet.isVip) return;
    try {
      final s = await wallet.vipStatus();
      if (mounted) setState(() => _status = s);
    } on ApiException catch (_) {}
  }

  Future<void> _openManage(String url) async {
    final ok = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication).catchError((_) => false);
    if (!ok && mounted) toast(context, "Couldn't open the store", error: true);
  }

  Future<void> _cancel(WalletProvider wallet) async {
    final manage = _status?.managedByStore == true ? _status!.manageUrl : null;
    if (manage != null) return _openManage(manage);
    try {
      await wallet.cancelVip();
      if (mounted) toast(context, 'VIP renewal cancelled');
    } on ApiException catch (e) {
      // Billed by Google Play / the App Store: cancel there.
      final url = e.details['manageUrl'];
      if (url is String) return _openManage(url);
      if (mounted) toast(context, e.message, error: true);
    }
  }

  String get _storeName => _status?.method == PaymentMethod.appStore ? 'App Store' : 'Google Play';
  VipPlan get _plan => MockData.plans.firstWhere((p) => p.id == _planId, orElse: () => MockData.plans.firstWhere((p) => p.highlighted, orElse: () => MockData.plans.first));


  String _period(VipPlan p) => p.periodWord;

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletProvider>();
    final social = context.watch<SocialProvider>();
    final discover = context.watch<DiscoverProvider>();
    final vip = wallet.isVip;
    // Discover likes are the ones you can answer; fall back to likes from video calls.
    final discoverCount = discover.status?.likedYouCount ?? 0;
    final useDiscover = discoverCount > 0 && discoverCount >= social.likedYouCount;
    final likedCount = useDiscover ? discoverCount : social.likedYouCount;
    final dl = discover.likedYou;
    final likedUrls = useDiscover ? (dl?.unlocked == true ? dl!.people.map((p) => p.profile.avatarUrl).toList() : (dl?.previews ?? const <String>[])) : social.likedYou.map((p) => p.avatarUrl).toList();
    final likedNames = useDiscover ? (dl?.people ?? const []).map((p) => p.profile.name).toList() : social.likedYou.map((p) => p.name).toList();
    return Scaffold(
      body: Stack(
        children: [
          // Warm gold glow from the top.
          const Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: 420,
            child: DecoratedBox(decoration: BoxDecoration(gradient: RadialGradient(center: Alignment(0, -1), radius: 1.1, colors: [Color(0x2BFFC857), Color(0x000B0A10)], stops: [0, 0.7]))),
          ),
          SafeArea(
            bottom: false,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 220),
              children: [
                Align(alignment: Alignment.centerLeft, child: CircleIconButton(icon: SolarIconsOutline.arrowLeft, onTap: () => Navigator.of(context).maybePop(), tooltip: 'Back')),
                const SizedBox(height: 6),
                Center(
                  child: Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(gradient: V.goldGrad, borderRadius: BorderRadius.circular(20), boxShadow: [BoxShadow(color: const Color(0xFFF0A020).withValues(alpha: 0.3), blurRadius: 36, offset: const Offset(0, 14))]),
                    child: const Icon(SolarIconsBold.crown, size: 36, color: V.onGoldIcon),
                  ),
                ),
                const SizedBox(height: 16),
                const Headline('Vibe ', accent: 'VIP', size: 36, accentColor: V.gold, textAlign: TextAlign.center),
                const SizedBox(height: 8),
                Text(
                  vip ? 'Active · ${Fmt.until(wallet.wallet.vipUntil!)}' : 'Meet more people, faster: unlimited likes, see who liked you, free filters.',
                  textAlign: TextAlign.center,
                  style: VT.body(15, color: vip ? V.gold : V.text2),
                ),
                const SizedBox(height: 22),
                if (likedCount > 0)
                  _likedCard(likedUrls, likedNames, likedCount, vip, useDiscover ? () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LikedYouScreen())) : null),
                const SectionTitle('What you get', top: 26),
                for (final g in vipPerkGroups()) ...[_group(g), const SizedBox(height: 10)],
                const SectionTitle('Free vs VIP', top: 16),
                _compare(),
                const SizedBox(height: 10),
                Text('Video calls in chat are the same for everyone: both people have to allow them.', style: VT.body(11.5, color: V.muted, height: 1.45)),
                const SectionTitle('Choose a plan', top: 26),
                for (final p in MockData.plans) ...[_planRow(p), const SizedBox(height: 8)],
              ],
            ),
          ),
          // Sticky CTA.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: EdgeInsets.fromLTRB(20, 40, 20, MediaQuery.of(context).padding.bottom + 16),
              decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, stops: [0.72, 1], colors: [V.bg, Color(0x000B0A10)])),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (!vip)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(SolarIconsBold.checkCircle, size: 16, color: V.trust),
                        const SizedBox(width: 6),
                        Flexible(child: Text(_plan.trialDays > 0 ? 'Nothing charged today · cancel any time' : 'Cancel any time', textAlign: TextAlign.center, style: VT.label(12.5, color: V.text, weight: FontWeight.w500))),
                      ],
                    ),
                  const SizedBox(height: 12),
                  if (vip)
                    GhostButton(
                      label: _status?.managedByStore == true ? 'Manage in $_storeName' : 'Cancel VIP',
                      icon: _status?.managedByStore == true ? SolarIconsBold.squareArrowRightUp : null,
                      expand: true,
                      color: _status?.managedByStore == true ? V.text : V.bad,
                      onTap: () => _cancel(wallet),
                    )
                  else
                    GradientButton(
                      label: _plan.trialDays > 0 ? 'Start ${_plan.trialDays}-day free trial' : 'Subscribe · ${Fmt.usd(_plan.usd)}',
                      gradient: V.goldGrad,
                      foreground: V.onGold,
                      glow: const Color(0xFFF0A020),
                      onTap: () async {
                        final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => CheckoutScreen(plan: _plan)));
                        if (ok == true && context.mounted) Navigator.of(context).pop();
                      },
                    ),
                  if (!vip && context.read<AppServices>().billing.supported)
                    TextButton(
                      onPressed: () async {
                        toast(context, 'Checking your store purchases…');
                        try {
                          await context.read<AppServices>().billing.restore();
                        } catch (_) {
                          if (context.mounted) toast(context, "Couldn't reach the store", error: true);
                        }
                      },
                      child: Text('Restore purchases', style: VT.label(12.5, color: V.text2)),
                    )
                  else
                    const SizedBox(height: 10),
                  Text(
                    vip
                        ? (_status?.managedByStore == true ? 'Billed by $_storeName: renew or cancel it there.' : 'Your plan stays active until the end of the period.')
                        : '${_plan.trialDays > 0 ? 'Then ' : ''}${Fmt.usd(_plan.usd)}/${_period(_plan)}, renewing until cancelled. Cancel any time. Prices in USD.',
                    textAlign: TextAlign.center,
                    style: VT.body(11, color: V.muted, height: 1.45),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _likedCard(List<String> urls, List<String> names, int count, bool vip, VoidCallback? onOpen) {
    return Panel(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      radius: 22,
      border: V.gold.withValues(alpha: 0.22),
      onTap: onOpen,
      child: Row(
        children: [
          FaceStack(urls: urls.take(4).toList(), size: 38, overlap: 12, blur: vip ? 0 : 3),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$count ${count == 1 ? 'person' : 'people'} liked you', style: VT.title(15, weight: FontWeight.w600)),
                Text(vip ? names.take(3).join(', ') : "VIP shows who they are. Like back and it's a match.", maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(12, color: V.text2)),
              ],
            ),
          ),
          Icon(onOpen != null ? SolarIconsOutline.altArrowRight : (vip ? SolarIconsBold.lockKeyholeUnlocked : SolarIconsBold.lockKeyhole), size: 20, color: V.gold),
        ],
      ),
    );
  }

  Widget _group(VipPerkGroup g) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
      decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withValues(alpha: 0.07))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [Icon(g.icon, size: 16, color: g.color), const SizedBox(width: 6), Text(g.title, style: VT.label(12.5, color: g.color, weight: FontWeight.w700))]),
          const SizedBox(height: 6),
          for (final (title, sub) in g.items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(padding: const EdgeInsets.only(top: 1), child: Icon(SolarIconsBold.checkCircle, size: 18, color: g.color)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(title, style: VT.title(14, weight: FontWeight.w600)),
                      if (sub.isNotEmpty) Text(sub, style: VT.body(12, color: V.text2, height: 1.4)),
                    ]),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _compare() {
    final rows = vipComparison();
    return Container(
      decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withValues(alpha: 0.07))),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 0, 10),
          child: Row(children: [
            const Expanded(child: SizedBox.shrink()),
            SizedBox(width: 84, child: Text('Free', textAlign: TextAlign.center, style: VT.label(12, color: V.muted))),
            SizedBox(width: 84, child: Text('VIP', textAlign: TextAlign.center, style: VT.label(12, color: V.gold, weight: FontWeight.w700))),
          ]),
        ),
        for (final (k, free, vip) in rows)
          Container(
            decoration: const BoxDecoration(border: Border(top: BorderSide(color: V.lineSoft))),
            padding: const EdgeInsets.fromLTRB(16, 10, 0, 10),
            child: Row(children: [
              Expanded(child: Text(k, style: VT.body(13, weight: FontWeight.w500))),
              SizedBox(width: 84, child: Text(free, textAlign: TextAlign.center, style: VT.body(13, color: V.muted))),
              SizedBox(width: 84, child: Text(vip, textAlign: TextAlign.center, style: VT.body(13, color: V.gold, weight: FontWeight.w600))),
            ]),
          ),
      ]),
    );
  }

  Widget _planRow(VipPlan p) {
    final on = p.id == _plan.id;
    final perWeek = p.usd / (p.length.inDays / 7);
    final Widget? tag = p.trialDays > 0 ? Tag('${p.trialDays} days free', color: V.trust) : (p.savePercent > 0 ? Tag('Save ${p.savePercent}%', color: V.ok) : null);
    return Semantics(
      selected: on,
      button: true,
      label: '${p.label}, ${Fmt.usd(p.usd)}',
      child: GestureDetector(
        onTap: () => setState(() => _planId = p.id),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: on ? V.gold.withValues(alpha: 0.08) : V.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: on ? V.gold : V.line, width: on ? 1.5 : 1),
          ),
          child: Row(
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                width: 20,
                height: 20,
                decoration: BoxDecoration(shape: BoxShape.circle, color: on ? V.gold : Colors.transparent, border: on ? null : Border.all(color: V.muted, width: 2)),
                child: on ? Center(child: Container(width: 8, height: 8, decoration: const BoxDecoration(shape: BoxShape.circle, color: V.bg))) : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [Text(p.label, style: VT.title(15, weight: FontWeight.w600)), if (tag != null) ...[const SizedBox(width: 8), tag]]),
                    const SizedBox(height: 1),
                    Text('${Fmt.usd(perWeek)}/wk${p.highlighted ? ' · most popular' : ''}', style: VT.body(12, color: on ? V.text2 : V.muted)),
                  ],
                ),
              ),
              Text(Fmt.usd(p.usd), style: VT.number(16)),
            ],
          ),
        ),
      ),
    );
  }
}

/// A group of VIP perks on the VIP screen.
class VipPerkGroup {
  const VipPerkGroup(this.title, this.icon, this.color, this.items);
  final String title;
  final IconData icon;
  final Color color;
  final List<(String, String)> items;
}

/// What VIP adds, grouped the way people use the app (same as the web).
/// Numbers come from the live catalog.
List<VipPerkGroup> vipPerkGroups() {
  final supers = Economy.discoverVipFreeSuperLikes;
  return [
    if (Economy.discoverEnabled)
      VipPerkGroup('Discover', SolarIconsBold.userHeartRounded, V.pinkSoft, [
        ('Unlimited likes', 'Free accounts get ${Economy.discoverFreeLikesPerDay} a day.'),
        ('See who liked you', "Their faces, not a blur. Like back and it's a match."),
        if (supers > 0) ('$supers free Super Like${supers == 1 ? '' : 's'} a day', 'They see you first, with a star.'),
        ('Free Undo', 'Bring back someone you passed by mistake.'),
        if (Economy.discoverPremiumFilters) ('Every Discover filter', 'Gender, country, online now, verified. Others pay ${Economy.discoverFilterPassCost} coins for ${Economy.discoverFilterPassHours} hours.'),
      ]),
    const VipPerkGroup('Video Match', SolarIconsBold.videocamera, V.lavender, [
      ('Free gender and country filters', 'No coins per match.'),
      ('Priority in the queue', "Paired a little sooner when it's busy."),
    ]),
    VipPerkGroup('Extras', SolarIconsBold.crown, V.gold, [
      ('${Economy.vipMonthlyBonusCoins} coins every month', 'Added the day you subscribe, then every month.'),
      ('No ads', ''),
      ('Gold VIP badge', 'On your profile and in calls.'),
    ]),
  ];
}

/// The Free vs VIP table: (what, free, VIP).
List<(String, String, String)> vipComparison() => [
      if (Economy.discoverEnabled) ...[
        ('Likes a day', '${Economy.discoverFreeLikesPerDay}', 'Unlimited'),
        ('See who liked you', 'Blurred', 'Yes'),
        ('Super Likes', '${Economy.discoverSuperLikeCost} coins', Economy.discoverVipFreeSuperLikes > 0 ? '${Economy.discoverVipFreeSuperLikes} free/day' : '${Economy.discoverSuperLikeCost} coins'),
        ('Undo a pass', '${Economy.discoverUndoCost} coins', 'Free'),
        if (Economy.discoverPremiumFilters) ('Discover filters', 'Age · ${Economy.discoverFilterPassCost} coins/${Economy.discoverFilterPassHours}h', 'All'),
      ],
      ('Match filters', '${Economy.genderFilterCost < Economy.regionFilterCost ? Economy.genderFilterCost : Economy.regionFilterCost}+ coins', 'Free'),
      ('Coins each month', '—', '${Economy.vipMonthlyBonusCoins}'),
      ('Ads', 'Yes', 'None'),
    ];
