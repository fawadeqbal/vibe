import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/mock/mock_data.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/session_provider.dart';
import '../../providers/wallet_provider.dart';
import '../../services/app_services.dart';
import '../invite/invite_screen.dart';
import 'checkout_screen.dart';
import 'video_coins_card.dart';
import 'vip_screen.dart';
import 'wallet_screen.dart';

/// VIP, coins to buy, and free coins to earn — in that order, because that
/// is the order of revenue. Best value leads as a hero card; the rest sit
/// in a 2×2 grid.
class StoreScreen extends StatelessWidget {
  const StoreScreen({super.key, this.asPage = false});

  /// Pushed as a route (from a "not enough coins" prompt) rather than a tab.
  final bool asPage;

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletProvider>();
    void openWallet() => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const WalletScreen()));
    final packs = MockData.packs;
    final best = packs.where((p) => p.tag == 'Best value').firstOrNull;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            PageHeader(
              'Store',
              onBack: asPage ? () => Navigator.of(context).maybePop() : null,
              actions: [
                GemChip(gems: wallet.gems, onTap: openWallet),
                CoinChip(coins: wallet.coins, onTap: openWallet, showPlus: false),
              ],
            ),
            Expanded(
              child: ListView(
                // Clear the floating dock (its height arrives as bottom padding).
                padding: EdgeInsets.fromLTRB(20, 0, 20, 32 + MediaQuery.paddingOf(context).bottom),
                children: [
                  if (!wallet.isVip) const _VipBanner(),
                  SectionTitle('Coins', note: 'Coins never expire', top: wallet.isVip ? 4 : 28),
                  const SizedBox(height: 4),
                  for (var i = 0; i < packs.length; i += 2) ...[
                    if (i > 0) const SizedBox(height: 14),
                    IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Expanded(child: _PackCard(pack: packs[i], best: packs[i] == best)),
                          const SizedBox(width: 10),
                          Expanded(child: i + 1 < packs.length ? _PackCard(pack: packs[i + 1], best: packs[i + 1] == best) : const SizedBox.shrink()),
                        ],
                      ),
                    ),
                  ],
                  SectionTitle('Free coins', note: wallet.checkedInToday ? 'Done for today' : 'Day ${wallet.nextCheckInDay + 1} of 7'),
                  const _EarnSection(),
                  const SizedBox(height: 18),
                  Text(
                    context.read<AppServices>().config.isStoreBuild
                        ? 'Prices in USD; your store may show them in your currency.'
                        : 'Prices in USD. JazzCash, Easypaisa and bank pay the PKR amount.',
                    style: VT.body(11, color: V.muted, height: 1.45),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

void _buy(BuildContext context, CoinPack pack) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => CheckoutScreen(pack: pack)));

class _VipBanner extends StatelessWidget {
  const _VipBanner();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(24),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VipScreen())),
          child: Ink(
            decoration: BoxDecoration(gradient: V.vipCard, borderRadius: BorderRadius.circular(24), border: Border.all(color: V.gold.withValues(alpha: 0.3))),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: Stack(
                children: [
                  // Warm glow in the corner.
                  Positioned(
                    right: -40,
                    top: -60,
                    child: Container(width: 180, height: 180, decoration: const BoxDecoration(shape: BoxShape.circle, gradient: RadialGradient(colors: [Color(0x2EFFC857), Color(0x00FFC857)], stops: [0, 0.7]))),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(18),
                    child: Row(
                      children: [
                        Container(
                          width: 52,
                          height: 52,
                          decoration: BoxDecoration(gradient: V.goldGrad, borderRadius: BorderRadius.circular(16)),
                          child: const Icon(SolarIconsBold.crown, size: 28, color: V.onGoldIcon),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Go VIP', style: VT.title(17)),
                              const SizedBox(height: 2),
                              Text('Unlimited likes, free filters, no ads, ${Economy.vipMonthlyBonusCoins} coins a month', style: VT.body(12.5, color: V.text2, height: 1.4)),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          height: 36,
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(gradient: V.goldGrad, borderRadius: BorderRadius.circular(18)),
                          child: Text('From ${Fmt.usd(MockData.plans.first.usd)}', style: VT.label(13, color: V.onGold, weight: FontWeight.w700)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PackCard extends StatelessWidget {
  const _PackCard({required this.pack, required this.best});
  final CoinPack pack;
  final bool best;

  @override
  Widget build(BuildContext context) {
    final badge = pack.bonusPercent > 0 ? '+${pack.bonusPercent}% bonus' : pack.tag;
    return Semantics(
      button: true,
      label: 'Buy ${Fmt.thousands(pack.coins)} coins for ${Fmt.usd(pack.usd)}',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: () => _buy(context, pack),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(14, 16, 14, 14),
              decoration: BoxDecoration(
                color: best ? null : V.surface,
                gradient: best ? LinearGradient(colors: [V.gold.withValues(alpha: 0.10), V.surface], begin: Alignment.topLeft, end: Alignment.bottomRight) : null,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: best ? V.gold.withValues(alpha: 0.55) : V.line, width: best ? 1.5 : 1),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [const CoinIcon(size: 22), const SizedBox(width: 8), Text(Fmt.figure(pack.coins), style: VT.number(24))]),
                  const SizedBox(height: 2),
                  Text('coins', style: VT.body(12, color: V.muted)),
                  const Spacer(),
                  const SizedBox(height: 12),
                  Container(
                    height: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: best ? null : V.surface3, gradient: best ? V.goldGrad : null, borderRadius: BorderRadius.circular(20)),
                    child: Text(Fmt.usd(pack.usd), style: VT.title(14, weight: best ? FontWeight.w700 : FontWeight.w600, color: best ? V.onGold : V.text)),
                  ),
                ],
              ),
            ),
            if (badge != null)
              Positioned(
                top: -10,
                left: 12,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: V.pink, borderRadius: BorderRadius.circular(10)),
                  child: Text(badge, style: VT.label(11, color: Colors.white, weight: FontWeight.w700)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Daily check-in streak, rewarded ads, invite, profile bonus.
class _EarnSection extends StatefulWidget {
  const _EarnSection();

  @override
  State<_EarnSection> createState() => _EarnSectionState();
}

class _EarnSectionState extends State<_EarnSection> {
  /// Runs a wallet action and shows server errors (offline, limits) as a toast.
  Future<void> _guard(Future<void> Function() fn) async {
    try {
      await fn();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  Future<void> _checkIn() => _guard(() async {
        final r = await context.read<WalletProvider>().checkIn();
        if (!mounted) return;
        toast(context, r == null ? 'Already checked in today' : '+$r coins · see you tomorrow', error: r == null);
      });

  void _invite() => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const InviteScreen()));

  Future<void> _profileBonus() async {
    final session = context.read<SessionProvider>();
    final wallet = context.read<WalletProvider>();
    if (session.me?.isComplete != true) {
      toast(context, 'Add a photo, a bio and 3 interests first', error: true);
      return;
    }
    await _guard(() async {
      final r = await wallet.claimProfileBonus();
      if (mounted) toast(context, r == null ? 'Already claimed' : '+$r coins', error: r == null);
    });
  }

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletProvider>();
    final me = context.watch<SessionProvider>().me;
    final day = wallet.nextCheckInDay;
    final done = wallet.checkedInToday;
    final rewards = Economy.checkInRewards;
    final today = rewards[day.clamp(0, rewards.length - 1)];
    return GroupCard(
      children: [
        const VideoCoinsCard(asRow: true),
        GroupRow(
          icon: Icons.schedule_rounded,
          iconColor: V.pinkSoft,
          iconBg: V.pink.withValues(alpha: 0.13),
          title: 'Daily check-in',
          subtitle: done ? 'Day $day of 7 · come back tomorrow' : 'Day ${day + 1} of 7 · +$today today',
          trailing: done ? const Icon(SolarIconsBold.checkCircle, color: V.ok, size: 22) : actionPill('Claim'),
          onTap: done ? null : _checkIn,
        ),
        GroupRow(
          icon: SolarIconsBold.gift,
          iconColor: V.lavender,
          iconBg: V.violet.withValues(alpha: 0.16),
          title: 'Invite a friend',
          subtitle: 'You get ${Economy.inviteRewardCoins} when they get active',
          trailing: _reward('+${Economy.inviteRewardCoins}', true),
          onTap: _invite,
        ),
        GroupRow(
          icon: SolarIconsBold.user,
          iconColor: V.lavender,
          iconBg: V.violet.withValues(alpha: 0.16),
          title: 'Complete your profile',
          subtitle: wallet.wallet.profileBonusClaimed ? 'Claimed' : (me?.isComplete == true ? 'Ready to claim · once' : 'Photo, bio and 3 interests'),
          trailing: wallet.wallet.profileBonusClaimed ? const Icon(SolarIconsBold.checkCircle, color: V.ok, size: 22) : _reward('+${Economy.profileCompleteCoins}', true),
          onTap: wallet.wallet.profileBonusClaimed ? null : _profileBonus,
        ),
      ],
    );
  }

  Widget _reward(String text, bool active) {
    return Container(
      height: 26,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(color: (active ? V.gold : V.muted).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(13)),
      child: Center(widthFactor: 1, child: Text(text, style: VT.number(12.5, color: active ? V.gold : V.muted))),
    );
  }
}
