import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_exception.dart';

import '../../core/mock/mock_data.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../models/payments.dart';
import '../../providers/social_provider.dart';
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

  static List<(IconData, String, String)> get _perks => [
    (Icons.tune_rounded, 'Unlimited filters', 'Gender and country cost nothing.'),
    (Icons.block_rounded, 'No ads', 'Never watch one again.'),
    (Icons.favorite_rounded, 'See who liked you', 'Reconnect with people who wanted more.'),
    (Icons.bolt_rounded, 'Priority matching', 'First in the queue, every time.'),
    (Icons.monetization_on_rounded, '${Economy.vipMonthlyBonusCoins} coins a month', 'Landed the day you subscribe.'),
    (Icons.verified_rounded, 'VIP badge', 'Shown on the match screen.'),
  ];

  String _period(VipPlan p) => p.periodWord;

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletProvider>();
    final social = context.watch<SocialProvider>();
    final liked = social.likedYou;
    final likedCount = social.likedYouCount;
    final vip = wallet.isVip;
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
                Align(alignment: Alignment.centerLeft, child: CircleIconButton(icon: Icons.arrow_back_rounded, onTap: () => Navigator.of(context).maybePop(), tooltip: 'Back')),
                const SizedBox(height: 6),
                Center(
                  child: Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(gradient: V.goldGrad, borderRadius: BorderRadius.circular(20), boxShadow: [BoxShadow(color: const Color(0xFFF0A020).withValues(alpha: 0.3), blurRadius: 36, offset: const Offset(0, 14))]),
                    child: const Icon(Icons.workspace_premium_rounded, size: 36, color: V.onGoldIcon),
                  ),
                ),
                const SizedBox(height: 16),
                const Headline('Vibe ', accent: 'VIP', size: 36, accentColor: V.gold, textAlign: TextAlign.center),
                const SizedBox(height: 8),
                Text(vip ? 'Active · ${Fmt.until(wallet.wallet.vipUntil!)}' : 'Everything the free app holds back.', textAlign: TextAlign.center, style: VT.body(15, color: vip ? V.gold : V.text2)),
                const SizedBox(height: 22),
                if (likedCount > 0) _likedCard(liked, likedCount, vip),
                const SectionTitle('What you get', top: 26),
                for (var i = 0; i < _perks.length; i += 2) ...[
                  if (i > 0) const SizedBox(height: 10),
                  IntrinsicHeight(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Expanded(child: _perk(_perks[i])),
                        const SizedBox(width: 10),
                        Expanded(child: i + 1 < _perks.length ? _perk(_perks[i + 1]) : const SizedBox.shrink()),
                      ],
                    ),
                  ),
                ],
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
                        const Icon(Icons.check_circle_rounded, size: 16, color: V.trust),
                        const SizedBox(width: 6),
                        Text(_plan.trialDays > 0 ? 'Nothing charged today · cancel any time' : 'Cancel any time', style: VT.label(12.5, color: V.text, weight: FontWeight.w500)),
                      ],
                    ),
                  const SizedBox(height: 12),
                  if (vip)
                    GhostButton(
                      label: _status?.managedByStore == true ? 'Manage in $_storeName' : 'Cancel VIP',
                      icon: _status?.managedByStore == true ? Icons.open_in_new_rounded : null,
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

  Widget _likedCard(List<Profile> liked, int count, bool vip) {
    final urls = [for (final p in liked.take(4)) p.avatarUrl];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(22), border: Border.all(color: V.gold.withValues(alpha: 0.22))),
      child: Row(
        children: [
          FaceStack(urls: urls, size: 38, overlap: 12, blur: vip ? 0 : 3),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$count ${count == 1 ? 'person' : 'people'} liked you', style: VT.title(15, weight: FontWeight.w600)),
                Text(vip ? liked.take(3).map((p) => p.name).join(', ') : 'This week. VIP shows who.', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(12, color: V.text2)),
              ],
            ),
          ),
          Icon(vip ? Icons.lock_open_rounded : Icons.lock_rounded, size: 20, color: V.gold),
        ],
      ),
    );
  }

  Widget _perk((IconData, String, String) p) {
    final (icon, title, sub) = p;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(18), border: Border.all(color: Colors.white.withValues(alpha: 0.07))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: V.gold),
          const SizedBox(height: 10),
          Text(title, style: VT.title(13.5, weight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text(sub, style: VT.body(11.5, color: V.text2, height: 1.4)),
        ],
      ),
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
