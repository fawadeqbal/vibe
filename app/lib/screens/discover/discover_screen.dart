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
import '../filters/filter_chips.dart';
import 'discover_card.dart';
import 'discover_profile.dart';
import 'discover_sheets.dart';
import 'discover_states.dart';
import 'liked_you_screen.dart';

/// How far a card must be dragged to count.
const double _swipeX = 110;
const double _swipeUp = 120;
const Duration _flyTime = Duration(milliseconds: 240);
const Duration _settleTime = Duration(milliseconds: 260);

/// Loading longer than this says "taking longer than usual" with a retry.
const Duration _slowAfter = Duration(seconds: 8);

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

  /// Loading that drags on says so (and offers a retry) instead of looking stuck.
  bool _slow = false;
  Timer? _slowTimer;
  bool _waitingSeen = false;

  void _watchSlow(bool waiting) {
    if (waiting == _waitingSeen) return;
    _waitingSeen = waiting;
    _slowTimer?.cancel();
    if (waiting) {
      _slowTimer = Timer(_slowAfter, () {
        if (mounted) setState(() => _slow = true);
      });
    } else if (_slow) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _slow = false);
      });
    }
  }

  @override
  void dispose() {
    _slowTimer?.cancel();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final d = context.read<DiscoverProvider>();
      unawaited(d.load());
      unawaited(d.loadLikedYou());
      unawaited(d.loadNotifyNew());
      unawaited(_welcomeBack(d));
    });
  }

  /// Back after a few days: what happened while you were away (once per visit).
  Future<void> _welcomeBack(DiscoverProvider d) async {
    final w = await d.welcomeBack();
    if (w == null || !mounted) return;
    final pick = await showVibeSheet<String>(context, child: WelcomeBackSheet(awayDays: w.awayDays, likesSince: w.likesSince, newPeople: w.newPeople, freeLikes: d.status?.likesLeft));
    if (pick == 'liked' && mounted) await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LikedYouScreen()));
  }

  Future<void> _setNotify(DiscoverProvider d, bool on) async {
    try {
      await d.setNotifyNew(on);
      if (on && mounted) toast(context, "We'll tell you when new people join");
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
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

  /// The filters sheet, then what it asked for: VIP, or coins for a pass.
  Future<void> _editFilters() async {
    final r = await showDiscoverFilters(context);
    if (!mounted) return;
    if (r == 'vip') await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VipScreen()));
    if (r == 'coins') {
      final cost = context.read<DiscoverProvider>().status?.filters.passCost ?? 25;
      await _needCoins('A filter pass costs $cost coins. VIP gets every filter free.');
    }
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
      setState(() {
        _drag = Offset.zero;
        _dragging = false;
      });
      return _outOfLikes();
    }
    _busy = true;
    setState(() => _fly = (c.profile.id, kind));
    await Future<void>.delayed(_flyTime);
    if (!mounted) return;
    // The card has flown. Forget the drag, take the card off the deck and stop
    // flying — all before the next frame, so no frame ever shows the next card
    // at the old drag position. The one behind is already built (same key), so
    // it just eases up to the centre. The server answers in the background:
    // the next card can be swiped right away.
    setState(() {
      _drag = Offset.zero;
      _dragging = false;
      _fly = null;
    });
    final answer = d.swipe(c, kind); // removes the card synchronously
    _busy = false;
    final r = await answer;
    if (!mounted || r.ok) return;
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

  /// ⓘ: the whole profile, with the deck's buttons acting on this card.
  void _openProfile(DiscoverProvider d, DiscoverCard c) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (ctx) => DiscoverProfileScreen(
        card: c,
        actions: ListenableBuilder(
          listenable: d,
          builder: (_, _) {
            void act(SwipeKind k) {
              Navigator.of(ctx).pop();
              unawaited(_swipe(c, k));
            }

            return _DeckActions(
              status: d.status,
              disabled: _fly != null,
              canUndo: d.lastPassed != null && _fly == null,
              onUndo: _undo,
              onPass: () => act(SwipeKind.pass),
              onSuper: () => act(SwipeKind.superLike),
              onLike: () => act(SwipeKind.like),
              onLive: widget.onOpenMatch == null
                  ? null
                  : () {
                      Navigator.of(ctx).pop();
                      widget.onOpenMatch!();
                    },
            );
          },
        ),
      ),
    ));
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

  /// One card in the stack. Depth 0 is the top (dragged, flies); 1 peeks out
  /// behind it; 2 waits unseen. Same widgets at every depth, so a card keeps
  /// its state (and loaded photo) as it moves up.
  Widget _deckCard(
    DiscoverProvider d,
    DiscoverCard c,
    int depth, {
    required Offset offset,
    required double angle,
    required SwipeKind? flyKind,
    required double dragX,
    required double dragUp,
  }) {
    final top = depth == 0;
    final Matrix4 transform = top
        ? (Matrix4.translationValues(offset.dx, offset.dy, 0)..rotateZ(angle))
        : (Matrix4.translationValues(0, depth * 10.0, 0)..scaleByDouble(1 - depth * 0.04, 1 - depth * 0.04, 1, 1));
    final Duration duration = top && _dragging && flyKind == null ? Duration.zero : (top && flyKind != null ? _flyTime : _settleTime);
    final returned = top && d.returnedId == c.profile.id;
    return KeyedSubtree(
      key: ValueKey(c.profile.id),
      child: IgnorePointer(
        ignoring: !top,
        child: GestureDetector(
          onPanStart: top ? (_) => setState(() => _dragging = true) : null,
          onPanUpdate: top ? (e) => setState(() => _drag += e.delta) : null,
          onPanEnd: top ? (_) => _onPanEnd(c) : null,
          onPanCancel: top ? _settle : null,
          child: AnimatedOpacity(
            duration: top && flyKind != null ? _flyTime : _settleTime,
            opacity: top ? (flyKind != null ? 0 : 1) : (depth == 1 ? 0.85 : 0),
            child: AnimatedContainer(
              duration: duration,
              curve: top && flyKind != null ? Curves.easeIn : VMotion.out,
              transform: transform,
              transformAlignment: Alignment.center,
              // A card that came back (the server said no, or undo) eases in instead of popping.
              // The tween's start only counts when the card first appears.
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: returned ? 0.0 : 1.0, end: 1.0),
                duration: _settleTime,
                curve: VMotion.out,
                onEnd: returned ? d.clearReturned : null,
                builder: (_, t, child) => Opacity(opacity: t, child: Transform.scale(scale: 0.92 + 0.08 * t, child: child)),
                child: DiscoverCardView(card: c, drag: top ? dragX : 0, up: top ? dragUp : 0, shadow: top, onInfo: top ? () => _openProfile(d, c) : null),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// The gesture was taken away (a scroll, a system gesture): never a swipe, just settle back.
  void _settle() => setState(() {
        _drag = Offset.zero;
        _dragging = false;
      });

  @override
  Widget build(BuildContext context) {
    final expired = context.select<DiscoverProvider, bool>((d) => d.filtersExpired);
    if (expired) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        context.read<DiscoverProvider>().clearFiltersExpired();
        toast(context, 'Your filter pass ended, so only age is on now');
      });
    }
    final d = context.watch<DiscoverProvider>();
    final status = d.status;
    final top = d.top;
    final vip = status?.vip ?? false;
    final media = MediaQuery.of(context);

    // What the deck area shows — one of these, and the buttons follow it:
    // resting (switched off), the "add a photo" gate, the cards, a skeleton
    // while people load, or a state (empty, offline). The buttons only act on
    // a card you can see, and only appear when there's a card (or one coming).
    final resting = status != null && !status.enabled;
    final photoGate = !resting && status != null && !status.hasPhoto && !_lookAround;
    final showCards = !resting && !photoGate && top != null;
    final waiting = !resting && !photoGate && top == null && (d.loading || d.refilling);
    final showActions = showCards || waiting;
    _watchSlow(waiting);

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
              padding: const EdgeInsets.fromLTRB(20, 10, 16, 10),
              child: Row(children: [
                Expanded(child: Semantics(header: true, child: Text('Discover', style: VT.title(30, weight: FontWeight.w700)))),
                if (likesChip != null && !resting)
                  Semantics(
                    button: status?.likesLeft == 0,
                    label: status?.likesLeft == 0 ? '$likesChip: get more' : likesChip,
                    excludeSemantics: true,
                    child: GestureDetector(
                      onTap: status?.likesLeft == 0 ? _outOfLikes : null,
                      child: Container(
                        height: 34,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(color: (vip ? V.gold : V.pink).withValues(alpha: 0.14), borderRadius: BorderRadius.circular(999)),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Icon(vip ? Icons.all_inclusive_rounded : SolarIconsBold.heart, size: 15, color: vip ? V.gold : V.pinkSoft),
                          const SizedBox(width: 6),
                          Text(likesChip, style: VT.label(13, color: vip ? V.gold : V.pinkSoft, weight: FontWeight.w600)),
                        ]),
                      ),
                    ),
                  ),
              ]),
            ),
            if (!resting) Padding(padding: const EdgeInsets.only(bottom: 12), child: FilterChips(onOpen: _editFilters)),
            if (status != null && !resting && status.likedYouCount > 0) _LikedYouStrip(status: status, likedYou: d.likedYou),
            if (status != null && status.likesLeft == 0 && showCards) OutOfLikesBanner(resetsAt: status.resetsAt, packSize: status.packSize, packCost: status.packCost, onMore: _outOfLikes),
            if (status != null && !resting && !status.visible && (status.hasPhoto || _lookAround))
              Container(
                margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(color: V.warn.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(14)),
                child: Row(children: [
                  const Icon(SolarIconsOutline.eyeClosed, size: 16, color: V.warn),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      !status.hasPhoto ? 'Nobody can see you yet. Add a photo to appear in Discover.' : "You're hidden from Discover. Turn it on in Me › Settings › Privacy & safety.",
                      style: VT.body(12.5, color: V.warn),
                    ),
                  ),
                ]),
              ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: resting
                    ? DeckResting(onMeetLive: widget.onOpenMatch)
                    : photoGate
                    ? NoPhotoPanel(
                        onAddPhoto: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProfileSetupScreen(editing: true))).then((_) => d.loadStatus()),
                        onLookAround: () => setState(() => _lookAround = true),
                      )
                    : showCards
                    // The top three, each keyed by person and built the same way at
                    // every depth: when the top card leaves, the one behind is the same
                    // widget moving up (no rebuild, no photo reload); the third is built
                    // unseen, so its photo is loaded before it's needed.
                    ? Stack(
                        fit: StackFit.expand,
                        children: [
                          for (var i = math.min(3, d.deck.length) - 1; i >= 0; i--)
                            _deckCard(d, d.deck[i], i, offset: offset, angle: angle, flyKind: flyKind, dragX: dragX, dragUp: dragUp),
                        ],
                      )
                    : waiting
                        ? DeckSkeleton(
                            label: d.refilling && !d.loading ? 'Looking for more people…' : 'Finding people for you…',
                            slow: _slow,
                            onRetry: () {
                              setState(() => _slow = false);
                              unawaited(d.load());
                            },
                          )
                        : d.failed
                            ? DeckOffline(offline: d.offline, onRetry: d.load)
                            : DeckEmpty(
                                filters: d.filters,
                                onSetFilters: d.setFilters,
                                onEditFilters: _editFilters,
                                onMeetLive: widget.onOpenMatch,
                                notifyOn: d.notifyNew,
                                onNotify: (on) => unawaited(_setNotify(d, on)),
                              ),
              ),
            ),
            if (!showActions)
              SizedBox(height: media.padding.bottom + 13)
            else
            Padding(
              // 14px above the page's bottom edge, which is the tab bar's top.
              padding: EdgeInsets.fromLTRB(16, 14, 16, media.padding.bottom + 13),
              child: _DeckActions(
                status: status,
                disabled: !showCards || _fly != null,
                canUndo: d.lastPassed != null && _fly == null && (showCards || d.refilling),
                onUndo: _undo,
                onPass: () => _swipe(top!, SwipeKind.pass),
                onSuper: () => _swipe(top!, SwipeKind.superLike),
                onLike: () => _swipe(top!, SwipeKind.like),
                onLive: widget.onOpenMatch,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Under the card: undo (gold), pass, Super Like (blue), like (the big pink
/// one; muted when today's likes are used up), and meet someone live.
class _DeckActions extends StatelessWidget {
  const _DeckActions({required this.status, required this.disabled, required this.canUndo, required this.onUndo, required this.onPass, required this.onSuper, required this.onLike, this.onLive});
  final DiscoverStatus? status;
  final bool disabled;
  final bool canUndo;
  final VoidCallback onUndo;
  final VoidCallback onPass;
  final VoidCallback onSuper;
  final VoidCallback onLike;
  final VoidCallback? onLive;

  @override
  Widget build(BuildContext context) {
    final st = status;
    final out = st?.likesLeft == 0;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _RoundAction(icon: SolarIconsBold.undoLeftRound, size: 44, color: V.gold, label: st != null && st.undoCost > 0 && !st.vip ? 'Undo (${st.undoCost} coins)' : 'Undo', onTap: canUndo ? onUndo : null),
        const SizedBox(width: 16),
        _RoundAction(icon: Icons.close_rounded, size: 60, iconSize: 28, color: V.text, label: 'Pass', onTap: disabled ? null : onPass),
        const SizedBox(width: 16),
        _RoundAction(icon: Icons.star_rounded, size: 52, color: superBlue, label: st != null && st.freeSuperLikesLeft > 0 ? 'Super Like (free)' : 'Super Like · ${st?.superLikeCost ?? 10} coins', onTap: disabled ? null : onSuper),
        const SizedBox(width: 16),
        _RoundAction(icon: SolarIconsBold.heart, size: 64, iconSize: 30, color: out ? V.muted : Colors.white, brand: !out, label: out ? 'Like (no likes left today)' : 'Like', onTap: disabled ? null : onLike),
        const SizedBox(width: 16),
        _RoundAction(icon: SolarIconsBold.videocamera, size: 44, color: V.pinkSoft, label: 'Meet someone live', onTap: onLive),
      ],
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({required this.icon, required this.size, required this.label, required this.onTap, this.iconSize, this.color = V.text, this.brand = false});
  final IconData icon;
  final double size;
  final double? iconSize;
  final String label;
  final VoidCallback? onTap;
  final Color color;
  final bool brand;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: label,
      excludeSemantics: true,
      child: Tooltip(
        message: label,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 200),
          opacity: onTap == null ? 0.4 : 1,
          child: GestureDetector(
            onTap: onTap,
            child: Container(
              width: size,
              height: size,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: brand ? null : V.surface2,
                gradient: brand ? V.brand : null,
                border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                boxShadow: brand && onTap != null ? [BoxShadow(color: V.pink.withValues(alpha: 0.4), blurRadius: 30, offset: const Offset(0, 10))] : null,
              ),
              child: Icon(icon, size: iconSize ?? size * 0.44, color: color),
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
      child: Semantics(
        button: true,
        label: 'See who liked you',
        child: GestureDetector(
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LikedYouScreen())),
          child: Container(
            height: 54,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(color: V.gold.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(18), border: Border.all(color: V.gold.withValues(alpha: 0.25))),
            child: Row(children: [
              if (urls.isEmpty)
                Container(width: 34, height: 34, decoration: BoxDecoration(color: V.gold.withValues(alpha: 0.14), shape: BoxShape.circle), child: const Icon(SolarIconsBold.heart, size: 18, color: V.gold))
              else
                FaceStack(urls: urls.take(3).toList(), size: 34, overlap: 10, blur: l?.unlocked == true ? 0 : 4, borderColor: V.bg),
              const SizedBox(width: 10),
              Expanded(
                child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('$n ${n == 1 ? 'person' : 'people'} liked you', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.title(14, weight: FontWeight.w700)),
                  Text(status.vip ? 'Like them back to match' : 'Like them back to match · VIP shows who', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(12, color: V.gold)),
                ]),
              ),
              if (status.likedYouUnseen > 0)
                Container(
                  margin: const EdgeInsets.only(right: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: V.pink, borderRadius: BorderRadius.circular(10)),
                  child: Text('${status.likedYouUnseen} new', style: VT.label(11, color: Colors.white, weight: FontWeight.w800)),
                ),
              const Icon(SolarIconsOutline.altArrowRight, size: 20, color: V.gold),
            ]),
          ),
        ),
      ),
    );
  }
}
