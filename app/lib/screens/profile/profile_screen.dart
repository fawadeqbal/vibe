import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/vibe_widgets.dart';
import '../../providers/session_provider.dart';
import '../../providers/wallet_provider.dart';
import '../store/wallet_screen.dart';
import 'me_overview.dart';
import 'me_settings.dart';

/// You, laid out like the profile pages people already know: photo and
/// your three numbers, name and bio, Edit / Share / Preview, then what's
/// left to fill in and your last matches (`me_overview.dart`). Below them,
/// the five settings groups and Log out (`me_settings.dart`); each group
/// pushes its own page. Same as the web.
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
                  const SettingsButtons(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
