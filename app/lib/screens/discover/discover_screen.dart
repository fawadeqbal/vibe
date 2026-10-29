import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/discover.dart';
import '../../providers/discover_provider.dart';
import '../onboarding/profile_setup_screen.dart';
import '../store/store_screen.dart';
import '../store/vip_screen.dart';
import 'discover_card.dart';
import 'discover_sheets.dart';
import 'discover_states.dart';
import 'liked_you_screen.dart';

/// How far a card must be dragged to count.
const double _swipeX = 110;
const double _swipeUp = 120;
const Duration _flyTime = Duration(milliseconds: 240);

/// Discover: real people, one card at a time. Drag or tap — left passes,
/// right likes, up (or the star) Super Likes. Two likes make a match (the
/// dialog opens wherever you are, see HomeShell). Same as the web.
class DiscoverScreen extends StatefulWidget {
  const DiscoverScreen({super.key, this.onOpenMatch});

  /// "Meet someone live" on the empty deck.
  final VoidCallback? onOpenMatch;

  @override
  State<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends State<DiscoverScreen> {
  Offset _drag = Offset.zero;
  bool _dragging = false;
  (String, SwipeKind)? _fly;
  bool _busy = false;
  bool _lookAround = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final d = context.read<DiscoverProvider>();
      unawaited(d.load());
      unawaited(d.loadLikedYou());
    });
  }

  Future<bool> _needCoins(String why) async {
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Not enough coins'),
        content: Text('$why\n\nTop up, or earn free coins in the store.'),
        actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Not now')), TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Get coins'))],
      ),
    );
    if (go == true && mounted) await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StoreScreen(asPage: true)));
    return false;
  }

  Future<void> _outOfLikes() async {
    final d = context.read<DiscoverProvider>();
    final pick = await showOutOfLikes(context);
    if (!mounted) return;
    if (pick == OutOfLikesChoice.vip) await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VipScreen()));
    if (pick == OutOfLikesChoice.buy) {
      final s = d.status;
      try {
        if (await d.buyLikes()) {
          if (mounted) toast(context, '${s?.packSize ?? 30} more likes added');
        } else {
          await _needCoins('${s?.packSize ?? 30} more likes cost ${s?.packCost ?? 20} coins.');
        }
      } on ApiException catch (e) {
        if (mounted) toast(context, e.message, error: true);
      }
    }
  }

  Future<void> _swipe(DiscoverCard c, SwipeKind kind) async {
    if (_busy) return;
    final d = context.read<DiscoverProvider>();
    final st = d.status;
    if (kind == SwipeKind.like && st != null && st.likesLeft == 0) {
      setState(() => _drag = Offset.zero);
      return _outOfLikes();
    }
    _busy = true;
    setState(() => _fly = (c.profile.id, kind));
    await Future<void>.delayed(_flyTime);
    final r = await d.swipe(c, kind);
    if (!mounted) return;
    setState(() {
      _fly = null;
      _drag = Offset.zero;
      _dragging = false;
    });
    _busy = false;
    if (r.ok) return;
    switch (r.failure!) {
      case SwipeFailure.outOfLikes:
        await _outOfLikes();
      case SwipeFailure.coins:
        await _needCoins('A Super Like costs ${st?.superLikeCost ?? 10} coins.');
      case SwipeFailure.error:
        toast(context, r.message ?? 'Something went wrong. Try again.', error: true);
    }
  }

  Future<void> _undo() async {
    final d = context.read<DiscoverProvider>();
    if (d.lastPassed == null) return;
    try {
      final r = await d.undo();
      if (r == 'coins') await _needCoins('Undo costs ${d.status?.undoCost ?? 5} coins. VIP undoes for free.');
      if (r == 'nothing' && mounted) toast(context, 'Nothing to undo');
    } on ApiException catch (e) {
      if (mounted) toast(context, e.code == 'NOTHING_TO_UNDO' ? 'Nothing to undo' : e.message, error: e.code != 'NOTHING_TO_UNDO');
    }
  }

  void _onPanEnd(DiscoverCard top) {
    if (_drag.dx > _swipeX) {
      unawaited(_swipe(top, SwipeKind.like));
    } else if (_drag.dx < -_swipeX) {
      unawaited(_swipe(top, SwipeKind.pass));
    } else if (_drag.dy < -_swipeUp) {
      unawaited(_swipe(top, SwipeKind.superLike));
    } else {
      setState(() {
        _drag = Offset.zero;
        _dragging = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = context.watch<DiscoverProvider>();
    final status = d.status;
    final top = d.top;
    final vip = status?.vip ?? false;
    final media = MediaQuery.of(context);

    if (status != null && !status.enabled) {
      return Scaffold(
        body: Center(
          child: EmptyState(
            icon: SolarIconsBold.cardholder,
            title: 'Discover is ',
            accent: 'resting',
            body: "It's switched off for a little while. Your matches and chats are all still here.",
            action: widget.onOpenMatch == null ? null : GhostButton(label: 'Go to Match', onTap: widget.onOpenMatch),
          ),
        ),
      );
    }

    final likesChip = status == null ? null : (status.likesLeft == null ? 'Unlimited likes' : '${status.likesLeft} like${status.likesLeft == 1 ? '' : 's'} left');
    final flyKind = _fly != null && top != null && _fly!.$1 == top.profile.id ? _fly!.$2 : null;
    final width = media.size.width;
    final dragX = flyKind == SwipeKind.like ? 1.0 : flyKind == SwipeKind.pass ? -1.0 : (_drag.dx / _swipeX).clamp(-1.0, 1.0);
    final dragUp = flyKind == SwipeKind.superLike ? 1.0 : (-_drag.dy / _swipeUp).clamp(0.0, 1.0);
    final offset = switch (flyKind) {
      SwipeKind.like => Offset(width * 1.4, 40),
      SwipeKind.pass => Offset(-width * 1.4, 40),
      SwipeKind.superLike => Offset(0, -media.size.height),
      null => Offset(_drag.dx, math.min(_drag.dy, 40)),
    };
    final angle = switch (flyKind) { SwipeKind.like => 0.38, SwipeKind.pass => -0.38, SwipeKind.superLike => 0.0, null => _drag.dx / 900 };

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
              child: Row(children: [
                Expanded(child: Text('Discover', style: VT.display(28))),
                if (likesChip != null)
                  Container(
                    height: 32,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(color: (vip ? V.gold : V.pink).withValues(alpha: 0.14), borderRadius: BorderRadius.circular(16)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(vip ? Icons.all_inclusive_rounded : SolarIconsBold.heart, size: 15, color: vip ? V.gold : V.pinkSoft),
                      const SizedBox(width: 6),
                      Text(likesChip, style: VT.label(12.5, color: vip ? V.gold : V.pinkSoft)),
                    ]),
                  ),
                const SizedBox(width: 8),
                CircleIconButton(icon: SolarIconsOutline.tuning, tooltip: 'Filters', onTap: () => showDiscoverFilters(context)),
              ]),
            ),
            if (status != null && status.likedYouCount > 0) _LikedYouStrip(status: status, likedYou: d.likedYou),
            if (status != null && status.likesLeft == 0 && top != null) OutOfLikesBanner(resetsAt: status.resetsAt, onMore: _outOfLikes),
            if (status != null && !status.visible && (status.hasPhoto || _lookAround))
              Container(
                margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(color: V.warn.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(14)),
                child: Row(children: [
                  const Icon(SolarIconsOutline.eyeClosed, size: 16, color: V.warn),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      !status.hasPhoto ? 'Nobody can see you yet. Add a photo to appear in Discover.' : "You're hidden from Discover. Turn it on in filters.",
                      style: VT.body(12.5, color: V.warn),
                    ),
                  ),
                ]),
              ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: status != null && !status.hasPhoto && !_lookAround
                    ? NoPhotoPanel(
                        onAddPhoto: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProfileSetupScreen(editing: true))).then((_) => d.loadStatus()),
                        onLookAround: () => setState(() => _lookAround = true),
                      )
                    : top != null
                    ? Stack(
                        fit: StackFit.expand,
                        children: [
                          if (d.deck.length > 1)
                            Transform.scale(scale: 0.96, child: Opacity(opacity: 0.8, child: DiscoverCardView(key: ValueKey('next-${d.deck[1].profile.id}'), card: d.deck[1], shadow: false))),
                          GestureDetector(
                            key: ValueKey('top-${top.profile.id}'),
                            onPanStart: (_) => setState(() => _dragging = true),
                            onPanUpdate: (e) => setState(() => _drag += e.delta),
                            onPanEnd: (_) => _onPanEnd(top),
                            child: AnimatedContainer(
                              duration: _dragging && flyKind == null ? Duration.zero : (flyKind != null ? _flyTime : const Duration(milliseconds: 220)),
                              curve: flyKind != null ? Curves.easeIn : VMotion.out,
                              transform: Matrix4.translationValues(offset.dx, offset.dy, 0)..rotateZ(angle),
                              transformAlignment: Alignment.center,
                              child: DiscoverCardView(card: top, drag: dragX, up: dragUp),
                            ),
                          ),
                        ],
                      )
                    : d.loading
                        ? const DeckSkeleton()
                        : d.failed
                            ? DeckOffline(offline: d.offline, onRetry: d.load)
                            : DeckEmpty(
                                filters: d.filters,
                                onSetFilters: d.setFilters,
                                onEditFilters: () => showDiscoverFilters(context),
                                onMeetLive: widget.onOpenMatch,
                              ),
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, media.padding.bottom + V.dockHeight + V.dockInset + 6),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _RoundAction(
                    icon: SolarIconsBold.undoLeftRound,
                    size: 48,
                    color: V.gold,
                    fill: V.gold.withValues(alpha: 0.12),
                    border: V.gold.withValues(alpha: 0.4),
                    label: status != null && status.undoCost > 0 ? 'Undo (${status.undoCost} coins)' : 'Undo',
                    onTap: d.lastPassed == null || _fly != null ? null : _undo,
                  ),
                  const SizedBox(width: 16),
                  _RoundAction(icon: Icons.close_rounded, size: 64, iconSize: 30, color: V.text, fill: V.surface, border: Colors.white.withValues(alpha: 0.16), label: 'Pass', onTap: top == null || _fly != null ? null : () => _swipe(top, SwipeKind.pass)),
                  const SizedBox(width: 16),
                  _RoundAction(
                    icon: Icons.star_rounded,
                    size: 48,
                    color: V.lavender,
                    fill: V.violet.withValues(alpha: 0.18),
                    border: V.lavender.withValues(alpha: 0.45),
                    label: status != null && status.freeSuperLikesLeft > 0 ? 'Super Like (free)' : 'Super Like (${status?.superLikeCost ?? 10} coins)',
                    onTap: top == null || _fly != null ? null : () => _swipe(top, SwipeKind.superLike),
                  ),
                  const SizedBox(width: 16),
                  _RoundAction(icon: SolarIconsBold.heart, size: 64, iconSize: 30, color: Colors.white, gradient: V.brand, glow: true, label: status?.likesLeft == 0 ? 'Like (no likes left today)' : 'Like', onTap: top == null || _fly != null ? null : () => _swipe(top, SwipeKind.like)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({required this.icon, required this.size, required this.label, required this.onTap, this.iconSize = 22, this.color = V.text, this.fill, this.border, this.gradient, this.glow = false});
  final IconData icon;
  final double size;
  final double iconSize;
  final String label;
  final VoidCallback? onTap;
  final Color color;
  final Color? fill;
  final Color? border;
  final Gradient? gradient;
  final bool glow;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: label,
      excludeSemantics: true,
      child: Tooltip(
        message: label,
        child: Opacity(
          opacity: onTap == null ? 0.4 : 1,
          child: GestureDetector(
            onTap: onTap,
            child: Container(
              width: size,
              height: size,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: gradient == null ? fill : null,
                gradient: gradient,
                border: border == null ? null : Border.all(color: border!),
                boxShadow: glow ? [BoxShadow(color: V.pink.withValues(alpha: 0.4), blurRadius: 30, offset: const Offset(0, 10))] : null,
              ),
              child: Icon(icon, size: iconSize, color: color),
            ),
          ),
        ),
      ),
    );
  }
}

class _LikedYouStrip extends StatelessWidget {
  const _LikedYouStrip({required this.status, required this.likedYou});
  final DiscoverStatus status;
  final LikedYou? likedYou;

  @override
  Widget build(BuildContext context) {
    final l = likedYou;
    final urls = l == null ? <String>[] : (l.unlocked ? l.people.map((p) => p.profile.avatarUrl).toList() : l.previews);
    final n = status.likedYouCount;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: Panel(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        radius: 18,
        border: V.gold.withValues(alpha: 0.3),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LikedYouScreen())),
        child: Row(children: [
          if (urls.isEmpty)
            Container(width: 40, height: 40, decoration: BoxDecoration(color: V.gold.withValues(alpha: 0.14), shape: BoxShape.circle), child: const Icon(SolarIconsBold.heart, size: 20, color: V.gold))
          else
            FaceStack(urls: urls.take(3).toList(), size: 36, overlap: 12, blur: l?.unlocked == true ? 0 : 3),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('$n ${n == 1 ? 'person likes' : 'people like'} you', style: VT.title(14, weight: FontWeight.w600)),
              Text(status.vip ? 'See who, and like back' : 'VIP shows who they are', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(12, color: V.muted)),
            ]),
          ),
          if (status.likedYouUnseen > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(color: V.pink, borderRadius: BorderRadius.circular(10)),
              child: Text('${status.likedYouUnseen} new', style: VT.label(11, color: Colors.white, weight: FontWeight.w800)),
            ),
          const SizedBox(width: 6),
          const Icon(SolarIconsOutline.altArrowRight, size: 20, color: V.muted),
        ]),
      ),
    );
  }
}
