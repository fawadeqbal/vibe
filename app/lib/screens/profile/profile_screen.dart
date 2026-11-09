import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/session_provider.dart';
import '../../providers/wallet_provider.dart';
import '../invite/invite_screen.dart';
import '../store/vip_screen.dart';
import '../store/wallet_screen.dart';
import 'me_overview.dart';
import 'me_settings.dart';

/// You, laid out like the profile pages people already know: photo and
/// your three numbers, name and bio, Edit / Share / Preview, then what's
/// left to fill in, your last matches and three shortcuts (`me_overview.dart`).
/// Everything else lives behind ☰ in Settings and activity (`me_settings.dart`),
/// one level down, with its own pages below that. Same as the web.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key, required this.onOpenStore});
  final VoidCallback onOpenStore;

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final wallet = context.watch<WalletProvider>();
    final me = session.me;
    if (me == null) return const SizedBox.shrink();
    void push(Widget page) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            PageHeader(
              'Me',
              actions: [
                CoinChip(coins: wallet.coins, showPlus: false, onTap: () => push(const WalletScreen())),
                CircleIconButton(icon: SolarIconsOutline.hamburgerMenu, background: V.surface2, tooltip: 'Settings and activity', onTap: () => push(const SettingsMenuScreen())),
              ],
            ),
            Expanded(
              child: ListView(
                // Clear the floating dock (its height arrives as bottom padding).
                padding: EdgeInsets.fromLTRB(20, 0, 20, 32 + MediaQuery.paddingOf(context).bottom),
                children: [
                  ProfileHeader(me: me),
                  CompleteProfile(me: me),
                  const RecentMatches(),
                  const SizedBox(height: 26),
                  GroupCard(
                    children: [
                      _Shortcut(
                        icon: SolarIconsBold.wallet,
                        title: 'Wallet',
                        subtitle: '${Fmt.thousands(wallet.coins)} coins · ${Fmt.thousands(wallet.gems)} gems',
                        onTap: () => push(const WalletScreen()),
                      ),
                      _Shortcut(
                        icon: SolarIconsBold.crown,
                        title: wallet.isVip ? 'You are VIP' : 'Get VIP',
                        subtitle: wallet.isVip ? Fmt.until(wallet.wallet.vipUntil!) : 'Free filters, no ads, see who liked you',
                        onTap: () => push(const VipScreen()),
                      ),
                      _Shortcut(
                        icon: SolarIconsBold.gift,
                        title: 'Invite friends',
                        subtitle: 'Give ${Economy.inviteeRewardCoins}, get ${Economy.inviteRewardCoins} coins',
                        onTap: () => push(const InviteScreen()),
                      ),
                    ],
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

class _Shortcut extends StatelessWidget {
  const _Shortcut({required this.icon, required this.title, required this.subtitle, required this.onTap});
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GroupRow(
        icon: icon,
        iconColor: V.gold,
        iconBg: V.gold.withValues(alpha: 0.12),
        title: title,
        subtitle: subtitle,
        trailing: const Icon(SolarIconsOutline.altArrowRight, color: V.muted),
        onTap: onTap,
      );
}
