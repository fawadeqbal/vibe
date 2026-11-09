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
                  vip ? 'Active · ${Fmt.until(wallet.wallet.vipUntil!)}' : 'Meet more people, faster.',
                  textAlign: TextAlign.center,
                  style: VT.body(15, color: vip ? V.gold : V.text2),
                ),
                SectionTitle(vip ? 'Plans' : 'Choose a plan', top: 26, bottom: 14),
                IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final (i, p) in MockData.plans.take(3).indexed) ...[if (i > 0) const SizedBox(width: 8), Expanded(child: _planTile(p))],
                    ],
                  ),
                ),
                const SectionTitle('What you get', top: 26, bottom: 10),
                GroupCard(
                  children: [
                    for (final g in vipPerkGroups())
                      for (final (title, sub) in g.items)
                        () {
                          final (icon, color) = _perkLook(title);
                          return GroupRow(icon: icon, iconColor: color, iconBg: color.withValues(alpha: 0.13), title: title, subtitle: sub.isEmpty ? null : sub);
                        }(),
                  ],
                ),
                if (likedCount > 0) ...[
                  const SizedBox(height: 14),
                  _likedCard(likedUrls, likedNames, likedCount, vip, useDiscover ? () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LikedYouScreen())) : null),
                ],
                const SizedBox(height: 12),
                Text('Video calls in chat are the same for everyone: both people have to allow them.', style: VT.body(11.5, color: V.muted, height: 1.45)),
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

  /// Which tile goes with which perk (web: perkLook).
  (IconData, Color) _perkLook(String title) {
    final t = title.toLowerCase();
    if (t.contains('unlimited likes')) return (SolarIconsBold.heart, V.pink);
    if (t.contains('liked you')) return (SolarIconsBold.eye, V.pinkSoft);
    if (t.contains('super like')) return (SolarIconsBold.star, const Color(0xFF60A5FA));
    if (t.contains('undo')) return (SolarIconsBold.undoLeft, V.gold);
    if (t.contains('filter')) return (SolarIconsBold.tuning, V.lavender);
    if (t.contains('priority')) return (SolarIconsBold.bolt, V.gold);
    if (t.contains('coins')) return (SolarIconsBold.dollarMinimalistic, V.gold);
    if (t.contains('ads')) return (SolarIconsBold.forbiddenCircle, V.text2);
    return (SolarIconsBold.crown, V.gold);
  }

  /// One plan as a column: name, price, period; the badge sits on its top edge.
  Widget _planTile(VipPlan p) {
    final on = p.id == _plan.id;
    final badge = p.trialDays > 0 ? '${p.trialDays} days free' : (p.savePercent > 0 ? 'Save ${p.savePercent}%' : null);
    return Semantics(
      selected: on,
      button: true,
      label: '${p.label}, ${Fmt.usd(p.usd)} every ${_period(p)}${badge != null ? ', $badge' : ''}',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: () => setState(() => _planId = p.id),
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.topCenter,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(6, 16, 6, 12),
              decoration: BoxDecoration(
                color: on ? V.gold.withValues(alpha: 0.08) : V.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: on ? V.gold : V.line, width: on ? 1.5 : 1),
              ),
              child: Column(
                children: [
                  Text(p.label, style: VT.body(13, color: V.text2)),
                  const SizedBox(height: 4),
                  FittedBox(fit: BoxFit.scaleDown, child: Text(Fmt.usd(p.usd), style: VT.number(20))),
                  const SizedBox(height: 2),
                  Text('every ${_period(p)}', style: VT.body(11.5, color: V.muted)),
                ],
              ),
            ),
            if (badge != null)
              Positioned(
                top: -10,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: on ? V.gold : V.surface3, borderRadius: BorderRadius.circular(10)),
                  child: Text(badge, style: VT.label(11, color: on ? V.onGold : V.gold, weight: FontWeight.w700)),
                ),
              ),
          ],
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
        if (Economy.discoverPremiumFilters != 0)
          ('Gender and country filters', 'In random matches and Discover. Others pay ${Economy.discoverFilterPassCost} coins for ${Economy.discoverFilterPassHours} hours.'),
      ]),
    const VipPerkGroup('Video Match', SolarIconsBold.videocamera, V.lavender, [
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
      ],
      if (Economy.discoverPremiumFilters != 0) ('Gender & country filters', '${Economy.discoverFilterPassCost} coins / ${Economy.discoverFilterPassHours}h', 'Free'),
      ('Coins each month', '—', '${Economy.vipMonthlyBonusCoins}'),
      ('Ads', 'Yes', 'None'),
    ];
