import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/cache/cached_image.dart';
import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/discover.dart';
import '../../models/models.dart';
import '../../providers/discover_provider.dart';
import '../../providers/follows_provider.dart';
import '../../providers/social_provider.dart';
import '../match/report_sheet.dart';
import 'discover_card.dart';

/// Tap ⓘ on a card: the whole profile — big photo, who they are, bio and
/// every interest (shared ones first) — with the same buttons under it. ⋯
/// reports or blocks. (web: features/discover/discover-profile.tsx)
class DiscoverProfileScreen extends StatelessWidget {
  const DiscoverProfileScreen({super.key, required this.card, required this.actions});
  final DiscoverCard card;

  /// The deck's buttons (they act on this card and close the page).
  final Widget actions;

  Future<void> _more(BuildContext context) async {
    final p = card.profile;
    final first = p.name.split(' ').first;
    final pick = await showVibeSheet<String>(
      context,
      child: Builder(
        builder: (ctx) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(padding: const EdgeInsets.only(top: 4, bottom: 12), child: Text(first, style: VT.title(18, weight: FontWeight.w700))),
              GroupRow(icon: SolarIconsBold.flag, iconColor: V.bad, iconBg: V.bad.withValues(alpha: 0.12), title: 'Report $first', titleColor: V.bad, bare: true, onTap: () => Navigator.of(ctx).pop('report')),
              GroupRow(
                icon: SolarIconsBold.forbiddenCircle,
                iconColor: V.bad,
                iconBg: V.bad.withValues(alpha: 0.12),
                title: 'Block $first',
                subtitle: "You won't see each other again",
                titleColor: V.bad,
                bare: true,
                onTap: () => Navigator.of(ctx).pop('block'),
              ),
            ],
          ),
        ),
      ),
    );
    if (pick == null || !context.mounted) return;
    final discover = context.read<DiscoverProvider>();
    try {
      if (pick == 'report') {
        final choice = await showReportSheet(context, name: p.name, where: ReportContext.person);
        if (choice == null || !context.mounted) return;
        await context.read<FollowsProvider>().report(p.id, choice.reason, note: choice.note, block: choice.block);
        if (context.mounted) toast(context, 'Thanks. $first was reported and blocked.');
      } else {
        await context.read<SocialProvider>().block(p);
        if (context.mounted) toast(context, '$first is blocked');
      }
      if (context.mounted) Navigator.of(context).pop();
      // Out of your deck either way.
      await discover.swipe(card, SwipeKind.pass);
    } on ApiException catch (e) {
      if (context.mounted) toast(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = card.profile;
    final first = p.name.split(' ').first;
    final shared = card.sharedInterests.toSet();
    final pad = MediaQuery.of(context).padding;
    final facts = [p.country.name, p.gender.label, if (p.level > 0) 'Level ${p.level}', if (card.activeLabel.isNotEmpty) card.activeLabel].join(' · ');
    Widget glassBtn(IconData icon, String label, VoidCallback onTap) => Semantics(
          button: true,
          label: label,
          excludeSemantics: true,
          child: GestureDetector(
            onTap: onTap,
            child: ClipOval(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
                child: Container(width: 40, height: 40, color: V.bg2.withValues(alpha: 0.52), child: Icon(icon, size: 21, color: V.text)),
              ),
            ),
          ),
        );
    return Scaffold(
      backgroundColor: V.bg,
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(
                    height: (MediaQuery.sizeOf(context).height * 0.58).clamp(320, 470),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (p.avatarUrl.startsWith('http')) Image(image: netImage(p.avatarUrl), fit: BoxFit.cover, alignment: const Alignment(0, -0.4), errorBuilder: (_, _, _) => const ColoredBox(color: V.surface)) else const ColoredBox(color: V.surface),
                        const Align(
                          alignment: Alignment.bottomCenter,
                          child: SizedBox(
                            height: 140,
                            width: double.infinity,
                            child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [V.bg, Color(0x000B0A10)]))),
                          ),
                        ),
                        Positioned(left: 12, top: pad.top + 12, child: glassBtn(SolarIconsOutline.arrowLeft, 'Back to the card', () => Navigator.of(context).pop())),
                        Positioned(right: 12, top: pad.top + 12, child: glassBtn(SolarIconsBold.menuDots, 'More: report or block', () => _more(context))),
                      ],
                    ),
                  ),
                  Transform.translate(
                    offset: const Offset(0, -40),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [
                            Flexible(child: Text('$first${p.age > 0 ? ', ${p.age}' : ''}', style: VT.title(30, weight: FontWeight.w700))),
                            if (p.verified) const Padding(padding: EdgeInsets.only(left: 8), child: Icon(SolarIconsBold.verifiedCheck, size: 22, color: V.trust, semanticLabel: 'Verified')),
                          ]),
                          const SizedBox(height: 4),
                          Text(facts, style: VT.body(13.5, color: V.text2)),
                          if (p.bio.isNotEmpty) ...[const SizedBox(height: 12), Text(p.bio, style: VT.body(15, height: 1.5))],
                          if (p.interests.isNotEmpty) ...[
                            const SizedBox(height: 18),
                            Text('INTERESTS', style: VT.overline(color: V.muted)),
                            const SizedBox(height: 10),
                            Wrap(spacing: 6, runSpacing: 6, children: [for (final i in sortedInterests(p, card.sharedInterests)) InterestChip(label: i, shared: shared.contains(i), glass: false)]),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(padding: EdgeInsets.fromLTRB(16, 8, 16, pad.bottom + 18), child: actions),
        ],
      ),
    );
  }
}
