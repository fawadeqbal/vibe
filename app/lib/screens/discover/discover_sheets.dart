import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/discover.dart';
import '../../providers/discover_provider.dart';
import '../filters/filters_sheet.dart';

/// What "out of likes" offers.
enum OutOfLikesChoice { vip, buy }

/// "You're out of likes": wait for tomorrow, buy a few more, or go VIP.
Future<OutOfLikesChoice?> showOutOfLikes(BuildContext context) {
  final s = context.read<DiscoverProvider>().status;
  final resets = s?.resetsAt != null ? comesBackIn(s!.resetsAt!) : 'the morning';
  return showVibeSheet<OutOfLikesChoice>(
    context,
    child: Builder(
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(color: V.pink.withValues(alpha: 0.14), shape: BoxShape.circle),
              child: const Icon(SolarIconsBold.heart, size: 30, color: V.pink),
            ),
            const SizedBox(height: 16),
            const Headline("You're out of ", accent: 'likes', size: 26, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              "You used today's ${s?.freeLikesPerDay ?? 30} free likes. They come back in $resets. Passing is always free.",
              textAlign: TextAlign.center,
              style: VT.body(14, color: V.text2, height: 1.5),
            ),
            const SizedBox(height: 24),
            GradientButton(
              label: 'Get VIP — unlimited likes',
              icon: SolarIconsBold.crown,
              gradient: V.goldGrad,
              foreground: V.onGold,
              onTap: () => Navigator.of(ctx).pop(OutOfLikesChoice.vip),
            ),
            const SizedBox(height: 10),
            GhostButton(
              label: '${s?.packSize ?? 30} more likes',
              expand: true,
              trailing: CoinAmount(s?.packCost ?? 20),
              onTap: () => Navigator.of(ctx).pop(OutOfLikesChoice.buy),
            ),
            const SizedBox(height: 6),
            TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text('Wait for tomorrow', style: VT.label(14, color: V.text2))),
          ],
        ),
      ),
    ),
  );
}

/// Who shows up in your deck.
/// Who shows up in your deck. Resolves 'vip' (go to VIP) or 'coins' (short for a pass).
/// Who shows up in your deck: the one filters sheet shared with random matches.
Future<String?> showDiscoverFilters(BuildContext context) => showFiltersSheet(context);

