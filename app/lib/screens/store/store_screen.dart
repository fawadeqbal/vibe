import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/mock/mock_data.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/session_provider.dart';
import '../../providers/wallet_provider.dart';
import '../../services/ads/rewarded_ads.dart';
import '../../services/app_services.dart';
import '../invite/invite_screen.dart';
import 'checkout_screen.dart';
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
    final hero = packs.firstWhere((p) => p.tag == 'Best value', orElse: () => packs.last);
    final rest = [for (final p in packs) if (p != hero) p];
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
                  _HeroPack(pack: hero),
                  const SizedBox(height: 10),
                  for (var i = 0; i < rest.length; i += 2) ...[
                    if (i > 0) const SizedBox(height: 10),
                    IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Expanded(child: _PackCard(pack: rest[i])),
                          const SizedBox(width: 10),
                          Expanded(child: i + 1 < rest.length ? _PackCard(pack: rest[i + 1]) : const SizedBox.shrink()),
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
                        : 'Prices in USD; JazzCash, Easypaisa and bank charge the PKR equivalent.',
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
                          child: const Icon(Icons.workspace_premium_rounded, size: 28, color: V.onGoldIcon),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Go VIP', style: VT.title(17)),
                              const SizedBox(height: 2),
                              Text('Free filters, no ads, ${Economy.vipMonthlyBonusCoins} coins a month, see who liked you.', style: VT.body(12.5, color: V.text2, height: 1.4)),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [Text('from', style: VT.body(10.5, color: V.muted, height: 1.2)), Text(Fmt.usd(MockData.plans.first.usd), style: VT.number(15, color: V.gold))],
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

class _HeroPack extends StatelessWidget {
  const _HeroPack({required this.pack});
  final CoinPack pack;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(24), border: Border.all(color: V.gold.withValues(alpha: 0.55), width: 1.5)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const CoinIcon(size: 44),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(Fmt.thousands(pack.coins), style: VT.number(30)),
                    const SizedBox(height: 2),
                    Text('${pack.name} · ${Fmt.usd(pack.usdPer100)} per 100', style: VT.body(12.5, color: V.text2)),
                  ],
                ),
              ),
              if (pack.tag != null) Tag(pack.tag!, color: V.gold),
            ],
          ),
          const SizedBox(height: 16),
          GradientButton(label: Fmt.usd(pack.usd), height: 46, gradient: V.goldGrad, foreground: V.onGold, glow: V.gold, onTap: () => _buy(context, pack)),
        ],
      ),
    );
  }
}

class _PackCard extends StatelessWidget {
  const _PackCard({required this.pack});
  final CoinPack pack;

  @override
  Widget build(BuildContext context) {
    final tag = pack.bonusPercent > 0 ? Tag('+${pack.bonusPercent}% bonus', color: V.ok) : (pack.tag != null ? Tag(pack.tag!, color: V.pink) : null);
    return Material(
      color: V.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22), side: const BorderSide(color: V.line)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _buy(context, pack),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                height: 24,
                child: Row(children: [const CoinIcon(size: 22), const SizedBox(width: 8), if (tag != null) Expanded(child: Align(alignment: Alignment.centerRight, child: FittedBox(fit: BoxFit.scaleDown, child: tag)))]),
              ),
              const SizedBox(height: 10),
              Text(Fmt.thousands(pack.coins), style: VT.number(22)),
              const SizedBox(height: 2),
              Text('${pack.name} · ${Fmt.usd(pack.usdPer100)}/100', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(11.5, color: V.muted)),
              const Spacer(),
              const SizedBox(height: 12),
              Container(
                height: 38,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: V.surface3, borderRadius: BorderRadius.circular(19)),
                child: Text(Fmt.usd(pack.usd), style: VT.title(14, weight: FontWeight.w600)),
              ),
            ],
          ),
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
  bool _adBusy = false;

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

  Future<void> _watchAd() async {
    final wallet = context.read<WalletProvider>();
    final ads = context.read<AppServices>().ads;
    if (wallet.adsLeftToday <= 0) {
      toast(context, 'You have watched all of today\'s ads', error: true);
      return;
    }
    setState(() => _adBusy = true);
    final r = await ads.show(context, userId: context.read<SessionProvider>().me?.id ?? '');
    if (!mounted) return;
    setState(() => _adBusy = false);
    switch (r.outcome) {
      case AdOutcome.dismissed:
        return;
      case AdOutcome.noFill:
      case AdOutcome.unavailable:
        toast(context, r.message ?? 'No ad available right now. Try again in a minute.', error: true);
        return;
      case AdOutcome.rewarded:
        await _guard(() async {
          // The token is the nonce AdMob echoes to the server in its signed callback.
          final coins = await wallet.rewardAd(adToken: r.token);
          if (mounted) toast(context, coins == null ? 'Daily ad limit reached' : '+$coins coins', error: coins == null);
        });
    }
  }

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
    return Column(
      children: [
        Panel(
          radius: 24,
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Daily check-in', style: VT.title(15, weight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text('Miss a day and the streak starts over.', style: VT.body(12, color: V.muted)),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  for (var i = 0; i < rewards.length; i++) _streakDay(i, rewards[i], day, done),
                ],
              ),
              const SizedBox(height: 16),
              if (done)
                GhostButton(label: 'Come back tomorrow', icon: Icons.check_rounded, height: 48, expand: true, onTap: null)
              else
                GradientButton(label: 'Claim ${rewards[day]} coins', onTap: _checkIn, height: 48),
            ],
          ),
        ),
        const SizedBox(height: 10),
        GroupCard(
          children: [
            if (context.read<AppServices>().ads.available)
              GroupRow(
              icon: Icons.play_circle_rounded,
              iconColor: V.gold,
              iconBg: V.gold.withValues(alpha: 0.12),
              title: 'Watch an ad',
              subtitle: wallet.isVip ? 'VIP has no ads — but you can still earn' : '${wallet.adsLeftToday} left today',
              trailing: _adBusy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: V.gold)) : _reward('+${Economy.rewardedAdCoins}', wallet.adsLeftToday > 0),
              onTap: _adBusy ? null : _watchAd,
            ),
            GroupRow(
              icon: Icons.person_add_rounded,
              iconColor: V.gold,
              iconBg: V.gold.withValues(alpha: 0.12),
              title: 'Invite a friend',
              subtitle: 'They get ${Economy.inviteeRewardCoins} when they\'re active, you get ${Economy.inviteRewardCoins}',
              trailing: _reward('+${Economy.inviteRewardCoins}', true),
              onTap: _invite,
            ),
            GroupRow(
              icon: Icons.badge_rounded,
              iconColor: V.gold,
              iconBg: V.gold.withValues(alpha: 0.12),
              title: 'Complete your profile',
              subtitle: wallet.wallet.profileBonusClaimed ? 'Claimed' : (me?.isComplete == true ? 'Ready to claim · once' : 'Photo, bio, 3 interests · once'),
              trailing: wallet.wallet.profileBonusClaimed ? const Icon(Icons.check_circle_rounded, color: V.ok, size: 22) : _reward('+${Economy.profileCompleteCoins}', true),
              onTap: wallet.wallet.profileBonusClaimed ? null : _profileBonus,
            ),
          ],
        ),
      ],
    );
  }

  Widget _streakDay(int i, int reward, int day, bool done) {
    final claimed = i < day || (i == day && done);
    final today = i == day && !done;
    final last = i == Economy.checkInRewards.length - 1;
    Widget circle;
    if (claimed) {
      circle = Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(shape: BoxShape.circle, color: V.gold.withValues(alpha: 0.16)),
        child: const Icon(Icons.check_rounded, size: 18, color: V.gold),
      );
    } else if (today) {
      circle = Container(
        width: 38,
        height: 38,
        padding: const EdgeInsets.all(2),
        decoration: const BoxDecoration(shape: BoxShape.circle, gradient: V.brand),
        child: Container(
          alignment: Alignment.center,
          decoration: const BoxDecoration(shape: BoxShape.circle, color: V.surface),
          child: Text('$reward', style: VT.number(12, color: V.gold)),
        ),
      );
    } else {
      circle = Container(
        width: 38,
        height: 38,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: last ? V.gold.withValues(alpha: 0.08) : V.surface2,
          border: last ? Border.all(color: V.gold.withValues(alpha: 0.45)) : null,
        ),
        child: Text('$reward', style: VT.number(12, color: last ? V.gold : V.muted, weight: last ? FontWeight.w700 : FontWeight.w600)),
      );
    }
    return Semantics(
      label: 'Day ${i + 1}, $reward coins${claimed ? ', claimed' : today ? ', today' : ''}',
      excludeSemantics: true,
      child: Column(
        children: [
          circle,
          const SizedBox(height: 6),
          Text(today ? 'Today' : (claimed ? '$reward' : 'D${i + 1}'), style: VT.label(10.5, color: today ? V.text : V.muted, weight: today ? FontWeight.w600 : FontWeight.w400)),
        ],
      ),
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
