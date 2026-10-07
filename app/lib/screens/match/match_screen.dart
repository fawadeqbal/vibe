import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/mock/mock_data.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/follows.dart';
import '../../models/models.dart';
import '../../providers/engagement_provider.dart';
import '../../providers/follows_provider.dart';
import '../../providers/match_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/wallet_provider.dart';
import '../invite/share_cards.dart';
import '../profile/leaderboard_screen.dart';
import '../profile/progress.dart';
import '../profile/user_profile_screen.dart';
import '../store/store_screen.dart';
import '../store/vip_screen.dart';
import 'filters_sheet.dart';
import 'gift_sheet.dart';
import 'icebreakers.dart';
import 'lobby_extras.dart';
import 'report_sheet.dart';
import 'safety_sheet.dart';

/// The app. Four looks on one screen: lobby (idle), searching, connected,
/// ended. In the lobby your camera stays off until you ask for a preview
/// (battery); then it fills the screen clearly (scrims, not a dim);
/// during a match the partner takes the stage and you shrink to a corner.
class MatchScreen extends StatefulWidget {
  const MatchScreen({super.key, required this.onOpenStore, required this.onOpenChats});
  final VoidCallback onOpenStore;
  final VoidCallback onOpenChats;

  @override
  State<MatchScreen> createState() => _MatchScreenState();
}

class _MatchScreenState extends State<MatchScreen> {
  final _message = TextEditingController();
  final _chatScroll = ScrollController();
  Gift? _burst;
  bool _burstReceived = false;
  int _burstSeq = 0;
  int _seenChat = 0;
  late int _seenMutual = context.read<MatchProvider>().mutualSeq;
  bool _celebrating = false;

  // The camera is not opened here: the lobby preview is opt-in and the
  // provider opens/closes it (see MatchProvider "camera").

  @override
  void dispose() {
    _message.dispose();
    _chatScroll.dispose();
    super.dispose();
  }

  Future<void> _needCoins(String why) async {
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Not enough coins'),
        content: Text('$why\n\nTop up, or earn free coins in the store.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Not now', style: TextStyle(color: V.text2))),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Get coins')),
        ],
      ),
    );
    if (go == true && mounted) Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StoreScreen(asPage: true)));
  }

  /// After a failed action: coins → offer the store; anything else → toast.
  Future<void> _explainFailure(MatchProvider m, String coinsWhy) async {
    if (!mounted) return;
    if (m.needsCoins) {
      await _needCoins(coinsWhy);
    } else if (m.lastError != null) {
      toast(context, m.lastError!, error: true);
    }
  }

  /// Server calls can fail for network reasons; never let them crash a tap.
  Future<void> _safely(Future<void> Function() fn) async {
    try {
      await fn();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  Future<void> _start() async {
    final m = context.read<MatchProvider>();
    if (!await m.start()) await _explainFailure(m, 'These filters cost ${m.filterCost} coins per match.');
  }

  Future<void> _next() async {
    final m = context.read<MatchProvider>();
    HapticFeedback.mediumImpact();
    if (m.inCooldown) {
      final pay = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Slow down a second'),
          content: Text('Five quick skips in a row. Wait ${m.cooldownSeconds}s, or skip now for ${Economy.skipCooldownBypassCost} coins.'),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Wait', style: TextStyle(color: V.text2))),
            TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text('Skip for ${Economy.skipCooldownBypassCost}')),
          ],
        ),
      );
      if (pay != true) return;
      if (!await m.bypassCooldown()) await _explainFailure(m, 'Skipping the cooldown costs ${Economy.skipCooldownBypassCost} coins.');
      return;
    }
    if (await m.next()) return;
    // The server can answer "slow down" — then offer the same choice.
    if (m.inCooldown && mounted) return _next();
    await _explainFailure(m, 'These filters cost ${m.filterCost} coins per match.');
  }

  Future<void> _gift() async {
    final m = context.read<MatchProvider>();
    final p = m.partner;
    if (p == null) return;
    final g = await showGiftSheet(context, toName: p.name);
    if (g == null || !mounted) return;
    if (await m.sendGift(g)) {
      setState(() {
        _burst = g;
        _burstReceived = false;
        _burstSeq++;
      });
    } else if (mounted) {
      if (m.lastError != null && !m.needsCoins) {
        toast(context, m.lastError!, error: true);
      } else {
        await _needCoins('A ${g.name} costs ${g.coins} coins.');
      }
    }
  }

  Future<void> _addFriend() async {
    final m = context.read<MatchProvider>();
    final wallet = context.read<WalletProvider>();
    final free = wallet.freeFriendRequestsLeft;
    if (free == 0) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Send a friend request?'),
          content: Text('Your ${Economy.freeFriendRequestsPerDay} free requests for today are used. This one costs ${Economy.friendRequestCost} coins.'),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel', style: TextStyle(color: V.text2))),
            TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text('Send for ${Economy.friendRequestCost}')),
          ],
        ),
      );
      if (ok != true) return;
    }
    if (!await m.addFriend() && mounted) {
      await _needCoins('A friend request costs ${Economy.friendRequestCost} coins once your free ones are used.');
    } else if (mounted) {
      toast(context, 'Request sent');
    }
  }

  Future<void> _play() async {
    final m = context.read<MatchProvider>();
    final g = await showGamePicker(context);
    if (g == null || !mounted) return;
    await _safely(() async {
      try {
        await m.startGame(g);
      } on ApiException catch (e) {
        if (e.code == 'RATE_LIMITED' && mounted) return toast(context, 'One moment…', error: true);
        rethrow;
      }
    });
  }

  Future<void> _report() async {
    final m = context.read<MatchProvider>();
    final p = m.partner;
    if (p == null) return;
    final choice = await showReportSheet(context, name: p.name);
    if (choice == null || !mounted) return;
    await _safely(() async {
      await m.report(choice.reason, note: choice.note, block: choice.block);
      if (mounted) toast(context, 'Thanks. ${p.name} was reported${choice.block ? ' and blocked' : ''}.');
    });
  }

  Future<void> _reportLast() async {
    final m = context.read<MatchProvider>();
    final p = m.lastPartner;
    if (p == null) return;
    final choice = await showReportSheet(context, name: p.name, afterCall: true);
    if (choice == null || !mounted) return;
    await _safely(() async {
      await m.reportLast(choice.reason, note: choice.note, block: choice.block);
      if (mounted) toast(context, 'Thanks. ${p.name} was reported${choice.block ? ' and blocked' : ''}.');
    });
  }

  Future<void> _reconnect() async {
    final m = context.read<MatchProvider>();
    if (!await m.reconnect()) await _explainFailure(m, 'Reconnecting costs ${m.reconnectPrice} coins.');
  }

  @override
  Widget build(BuildContext context) {
    final m = context.watch<MatchProvider>();
    // A new incoming gift → burst.
    if (m.chat.length > _seenChat) {
      final fresh = m.chat.skip(_seenChat).where((c) => !c.fromMe && c.gift != null).toList();
      _seenChat = m.chat.length;
      if (fresh.isNotEmpty) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            setState(() {
              _burst = fresh.last.gift;
              _burstReceived = true;
              _burstSeq++;
            });
          }
        });
      }
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_chatScroll.hasClients) _chatScroll.animateTo(_chatScroll.position.maxScrollExtent, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      });
    }
    if (m.state == MatchState.idle || m.state == MatchState.ended) _seenChat = 0;
    // Both liked each other → "It's a vibe!" once.
    if (m.mutualSeq > _seenMutual) {
      _seenMutual = m.mutualSeq;
      if (m.isConnected) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() => _celebrating = true);
        });
      }
    }
    if (!m.isConnected && _celebrating) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _celebrating = false);
      });
    }
    final fs = m.friendState;

    return Scaffold(
      backgroundColor: V.bg,
      resizeToAvoidBottomInset: false,
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Stack(
          fit: StackFit.expand,
          children: [
            switch (m.state) {
              MatchState.connected => _Connected(m: m, onNext: _next, onGift: _gift, onAddFriend: _addFriend, onReport: _report, onPlay: _play, message: _message, chatScroll: _chatScroll),
              MatchState.searching => _Searching(m: m),
              MatchState.ended when m.lastPartner != null => _Ended(m: m, onReconnect: _reconnect, onFindAnother: _start, onReport: _reportLast),
              _ => _Lobby(m: m, onStart: _start, onOpenStore: widget.onOpenStore),
            },
            if (_celebrating && m.isConnected && m.partner != null)
              Positioned.fill(
                child: Center(
                  child: MutualCelebration(
                    name: m.partner!.name,
                    onDone: () {
                      if (mounted) setState(() => _celebrating = false);
                    },
                    // The same in-call friend action as the + button.
                    onAddFriend: fs == FriendState.none || fs == FriendState.incoming ? _addFriend : null,
                  ),
                ),
              ),
            if (_burst != null)
              Positioned.fill(
                child: IgnorePointer(
                  child: Center(
                    child: GiftBurst(key: ValueKey('${_burst!.id}-$_burstSeq'), gift: _burst!, received: _burstReceived),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Asks before spending on a boost; shared by the lobby and the search.
Future<void> confirmBoost(BuildContext context) async {
  final wallet = context.read<WalletProvider>();
  if (wallet.isBoosted) return;
  final free = wallet.freeBoosts;
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(free > 0 ? 'Use your free boost?' : 'Boost for 30 minutes?'),
      content: Text(free > 0
          ? 'You go to the front of the queue for 30 minutes — on us. ${free == 1 ? 'You have 1 free boost.' : 'You have $free free boosts.'}'
          : 'You go to the front of the queue — faster matches, more of them. ${Economy.boostCost} coins.'),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Not now', style: TextStyle(color: V.text2))),
        TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(free > 0 ? 'Free boost' : 'Boost · ${Economy.boostCost}', style: const TextStyle(color: V.gold))),
      ],
    ),
  );
  if (ok != true) return;
  try {
    if (!await wallet.boost() && context.mounted) toast(context, 'Not enough coins for a boost', error: true);
  } on ApiException catch (e) {
    if (context.mounted) toast(context, e.message, error: true);
  }
}

String _genderLabel(GenderFilter g) => switch (g) { GenderFilter.anyone => 'Anyone', GenderFilter.women => 'Women', GenderFilter.men => 'Men' };

String _countryLabel(String? code) {
  if (code == null) return 'Anywhere';
  final c = MockData.country(code);
  return '${c.flag} ${c.name}';
}

// ── lobby ──────────────────────────────────────────────────────────────

/// The lobby with the camera off: one tap opens the preview. The camera is
/// never opened just because the app was opened.
class _PreviewPrompt extends StatelessWidget {
  const _PreviewPrompt({required this.m});
  final MatchProvider m;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Turn on camera preview',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () {
          HapticFeedback.selectionClick();
          if (!m.camOn) m.toggleCam();
          m.startPreview();
        },
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.08),
                border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
              ),
              child: const Icon(SolarIconsBold.videocamera, size: 30, color: Colors.white),
            ),
            const SizedBox(height: 12),
            Text('Tap to preview your camera', style: VT.label(14, color: Colors.white, weight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text('It stays off until you need it — saves battery.', textAlign: TextAlign.center, style: VT.body(12, color: Colors.white.withValues(alpha: 0.62))),
          ],
        ),
      ),
    );
  }
}

class _CameraStarting extends StatelessWidget {
  const _CameraStarting();
  @override
  Widget build(BuildContext context) => SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white.withValues(alpha: 0.7)));
}

class _Lobby extends StatelessWidget {
  const _Lobby({required this.m, required this.onStart, required this.onOpenStore});
  final MatchProvider m;
  final VoidCallback onStart;
  final VoidCallback onOpenStore;

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletProvider>();
    final me = context.watch<SessionProvider>().me;
    // Vibe Hour: filters are free (the chips say so).
    final vibeHour = context.watch<EngagementProvider>().vibeHourActive;
    final cost = m.filterCost;
    final f = m.filters;
    final camLive = m.hasLocalVideo && m.camOn;
    return Stack(
      fit: StackFit.expand,
      children: [
        _SelfVideo(m: m),
        const VideoScrims(top: 200, bottom: 500),
        SafeArea(
          child: Column(
            children: [
              // Who you are + balance.
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Row(
                  children: [
                    if (me != null) VAvatar(url: me.avatarUrl, name: me.name, size: 40, border: Colors.white.withValues(alpha: 0.25)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(me == null ? 'Vibe' : 'Hi ${me.name.split(' ').first}', overflow: TextOverflow.ellipsis, style: VT.title(16, weight: FontWeight.w600)),
                          const SizedBox(height: 1),
                          Row(
                            children: [
                              Icon(camLive ? SolarIconsBold.lockKeyhole : Icons.videocam_off_rounded, size: 13, color: Colors.white.withValues(alpha: 0.72)),
                              const SizedBox(width: 4),
                              Flexible(child: Text(camLive ? 'Preview · only you can see this' : 'Camera off · saving battery', overflow: TextOverflow.ellipsis, style: VT.body(11.5, color: Colors.white.withValues(alpha: 0.72), height: 1.2))),
                            ],
                          ),
                        ],
                      ),
                    ),
                    if (wallet.isVip) const Padding(padding: EdgeInsets.only(right: 8), child: Tag('VIP', color: V.gold, icon: SolarIconsBold.crown)),
                    if (m.previewOn)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: CircleIconButton(icon: Icons.videocam_off_rounded, iconSize: 20, onTap: m.stopPreview, tooltip: 'Turn off preview', background: Colors.black.withValues(alpha: 0.35)),
                      ),
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: CircleIconButton(
                        icon: SolarIconsBold.cupStar,
                        iconSize: 20,
                        color: V.level,
                        tooltip: "This week's top",
                        background: Colors.black.withValues(alpha: 0.35),
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LeaderboardScreen())),
                      ),
                    ),
                    CoinChip(coins: wallet.coins, onTap: onOpenStore, glass: true),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              const VibeHourBanner(),
              // Shrinks on short phones (Vibe Hour banner + friends row take room).
              Expanded(child: Center(child: camLive ? const SizedBox.shrink() : (m.previewOn && m.cameraActive ? const _CameraStarting() : FittedBox(fit: BoxFit.scaleDown, child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: _PreviewPrompt(m: m)))))),
              const FriendsOnlineRow(),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const OnlineDot(),
                    const SizedBox(width: 8),
                    Text('${Fmt.thousands(_online())} people online now', style: VT.label(13, color: Colors.white.withValues(alpha: 0.82), weight: FontWeight.w500)),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    GlassPill(
                      height: 40,
                      fontSize: 13,
                      icon: switch (f.gender) { GenderFilter.women => SolarIconsBold.women, GenderFilter.men => SolarIconsBold.men, _ => SolarIconsBold.usersGroupRounded },
                      label: _genderLabel(f.gender),
                      trailing: vibeHour ? const _FreeTag() : const Icon(SolarIconsOutline.altArrowDown, size: 16, color: V.text2),
                      onTap: () => showFiltersSheet(context),
                    ),
                    GlassPill(
                      height: 40,
                      fontSize: 13,
                      icon: SolarIconsBold.global,
                      label: _countryLabel(f.countryCode),
                      trailing: vibeHour ? const _FreeTag() : const Icon(SolarIconsOutline.altArrowDown, size: 16, color: V.text2),
                      onTap: () => showFiltersSheet(context),
                    ),
                    GlassPill(
                      height: 40,
                      fontSize: 13,
                      icon: f.safeMode ? SolarIconsBold.verifiedCheck : SolarIconsOutline.verifiedCheck,
                      label: 'Verified only',
                      tint: f.safeMode ? V.trust : null,
                      textColor: f.safeMode ? V.trust : Colors.white,
                      onTap: () {
                        HapticFeedback.selectionClick();
                        m.setFilters(f.copyWith(safeMode: !f.safeMode));
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 38),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _SideAction(
                      icon: SolarIconsBold.bolt,
                      iconColor: V.gold,
                      tint: wallet.isBoosted ? V.gold : null,
                      label: wallet.isBoosted
                          ? Text(Fmt.until(wallet.wallet.boostUntil!), style: VT.label(11.5, color: V.gold))
                          : wallet.freeBoosts > 0
                              ? Text('Free boost', style: VT.label(11.5, color: V.gold))
                              : Text.rich(TextSpan(children: [TextSpan(text: 'Boost · ', style: VT.label(11.5, color: Colors.white.withValues(alpha: 0.85))), TextSpan(text: '${Economy.boostCost}', style: VT.label(11.5, color: V.gold))])),
                      semantics: wallet.isBoosted ? 'Boosted' : (wallet.freeBoosts > 0 ? 'Use a free boost' : 'Boost for ${Economy.boostCost} coins'),
                      onTap: () => confirmBoost(context),
                    ),
                    _Shutter(onTap: onStart, cost: cost),
                    _SideAction(
                      icon: SolarIconsBold.shield,
                      iconColor: V.trust,
                      label: Text('Safety', style: VT.label(11.5, color: Colors.white.withValues(alpha: 0.85))),
                      semantics: 'Safety settings',
                      onTap: () => showSafetySheet(context),
                    ),
                  ],
                ),
              ),
              if (m.lastError != null) ...[
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Glass(
                    radius: 16,
                    child: Row(children: [const Icon(SolarIconsOutline.dangerCircle, size: 16, color: V.bad), const SizedBox(width: 8), Expanded(child: Text(m.lastError!, style: VT.body(12, color: Colors.white)))]),
                  ),
                ),
              ],
              const SizedBox(height: 20),
            ],
          ),
        ),
      ],
    );
  }

  static int _online() {
    final h = DateTime.now().hour;
    final base = h >= 20 || h < 2 ? 2400 : h >= 12 ? 1500 : 700;
    return base + DateTime.now().minute * 7;
  }
}

/// "Free" on a filter chip while Vibe Hour runs.
class _FreeTag extends StatelessWidget {
  const _FreeTag();
  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.only(left: 4), child: Text('Free', style: VT.label(11.5, color: V.ok)));
}

/// The big round "shutter" Start button in the thumb zone.
class _Shutter extends StatelessWidget {
  const _Shutter({required this.onTap, required this.cost});
  final VoidCallback onTap;
  final int cost;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: cost > 0 ? 'Start matching, $cost coins' : 'Start matching',
      child: GestureDetector(
        onTap: () {
          HapticFeedback.mediumImpact();
          onTap();
        },
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 108,
              height: 108,
              padding: const EdgeInsets.all(7),
              decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: 0.22), width: 1.5)),
              child: Container(
                decoration: BoxDecoration(shape: BoxShape.circle, gradient: V.brand, boxShadow: [BoxShadow(color: V.pink.withValues(alpha: 0.45), blurRadius: 36, offset: const Offset(0, 14))]),
                child: const Icon(SolarIconsBold.videocamera, size: 40, color: Colors.white),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Start', style: VT.title(15)),
                if (cost > 0) ...[Text(' · ', style: VT.title(15, color: V.text2)), CoinAmount(cost, size: 13)],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SideAction extends StatelessWidget {
  const _SideAction({required this.icon, required this.iconColor, required this.label, required this.onTap, required this.semantics, this.tint});
  final IconData icon;
  final Color iconColor;
  final Widget label;
  final VoidCallback onTap;
  final String semantics;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semantics,
      excludeSemantics: true,
      child: SizedBox(
        width: 72,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RoundControl(icon: icon, color: iconColor, size: 56, tint: tint, onTap: onTap),
            const SizedBox(height: 8),
            label,
          ],
        ),
      ),
    );
  }
}

// ── ended ──────────────────────────────────────────────────────────────

/// A recap, not an alert: their portrait blurs behind, the numbers become a
/// readable row, and reporting stays reachable after the call.
class _Ended extends StatefulWidget {
  const _Ended({required this.m, required this.onReconnect, required this.onFindAnother, required this.onReport});
  final MatchProvider m;
  final VoidCallback onReconnect;
  final VoidCallback onFindAnother;
  final VoidCallback onReport;

  @override
  State<_Ended> createState() => _EndedState();
}

class _EndedState extends State<_Ended> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    // "Free for 9:41" counts down; then the coin price comes back.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (!widget.m.reconnectFree) {
        _tick?.cancel();
        _tick = null;
      }
      setState(() {});
    });
    if (!widget.m.reconnectFree) {
      _tick?.cancel();
      _tick = null;
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  MatchProvider get m => widget.m;
  VoidCallback get onReconnect => widget.onReconnect;
  VoidCallback get onFindAnother => widget.onFindAnother;
  VoidCallback get onReport => widget.onReport;

  @override
  Widget build(BuildContext context) {
    final p = m.lastPartner!;
    final reported = m.endReason == EndReason.reported;
    final why = switch (m.endReason) {
      EndReason.partnerLeft => '${p.name} left',
      EndReason.skipped => 'You skipped ${p.name}',
      EndReason.reported => 'Reported',
      _ => 'Call ended',
    };
    final last = m.history.isEmpty ? null : m.history.first;
    final (likeIcon, likeColor, likeLabel) = last?.likedMe == true
        ? (SolarIconsBold.heart, V.pink, 'Liked you')
        : last?.liked == true
            ? (SolarIconsBold.heart, V.pinkSoft, 'You liked')
            : (SolarIconsOutline.heart, V.muted, 'No likes');
    final gifts = last?.giftsReceived ?? 0;
    return Stack(
      fit: StackFit.expand,
      children: [
        ImageFiltered(
          imageFilter: ImageFilter.blur(sigmaX: 36, sigmaY: 36, tileMode: TileMode.clamp),
          child: Image.network(p.avatarUrl, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(colors: [Color(0xFF2B1B4D), V.bg], begin: Alignment.topCenter, end: Alignment.bottomCenter)))),
        ),
        ColoredBox(color: V.bg.withValues(alpha: 0.7)),
        SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Row(
                  children: [
                    CircleIconButton(icon: Icons.close_rounded, onTap: m.dismissEnded, tooltip: 'Close'),
                    Expanded(child: Text('CALL ENDED', textAlign: TextAlign.center, style: VT.overline(color: V.text2).copyWith(fontSize: 12, letterSpacing: 1.2))),
                    const SizedBox(width: 40),
                  ],
                ),
              ),
              Expanded(
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                    child: Glass(
                      radius: 30,
                      color: V.surface.withValues(alpha: 0.88),
                      border: Colors.white.withValues(alpha: 0.1),
                      padding: const EdgeInsets.fromLTRB(22, 28, 22, 20),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Stack(
                            clipBehavior: Clip.none,
                            children: [
                              GestureDetector(
                                onTap: () => showUserProfileSheet(context, p.id),
                                child: Semantics(button: true, label: 'Open ${p.name}\'s profile', child: VAvatar(url: p.avatarUrl, name: p.name, size: 92, ring: true, gapColor: V.surface)),
                              ),
                              if (p.verified)
                                Positioned(
                                  right: -2,
                                  bottom: 2,
                                  child: Container(width: 26, height: 26, decoration: const BoxDecoration(shape: BoxShape.circle, color: V.surface), child: const Icon(SolarIconsBold.verifiedCheck, size: 20, color: V.trust)),
                                ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          Text(why, textAlign: TextAlign.center, style: VT.display(26, height: 1.1)),
                          const SizedBox(height: 4),
                          Text('${p.country.flag} ${p.country.name} · ${p.age}', style: VT.body(13, color: V.text2)),
                          const SizedBox(height: 22),
                          Container(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            decoration: const BoxDecoration(border: Border.symmetric(horizontal: BorderSide(color: V.line))),
                            child: IntrinsicHeight(
                              child: Row(
                                children: [
                                  _stat(Text(last == null ? '—' : Fmt.duration(last.length), style: VT.mono(18, color: V.text)), 'Call length'),
                                  const VerticalDivider(width: 1, color: V.line),
                                  _stat(Icon(likeIcon, size: 22, color: likeColor), likeLabel),
                                  const VerticalDivider(width: 1, color: V.line),
                                  _stat(
                                    Row(mainAxisSize: MainAxisSize.min, children: [Text('$gifts', style: VT.number(18, weight: FontWeight.w600)), const SizedBox(width: 4), Icon(SolarIconsBold.gift, size: 18, color: gifts > 0 ? V.gold : V.muted)]),
                                    gifts == 1 ? 'Gift received' : 'Gifts received',
                                  ),
                                ],
                              ),
                            ),
                          ),
                          if (m.lastMutual) ...[
                            const SizedBox(height: 14),
                            Text('You liked each other 💞', textAlign: TextAlign.center, style: VT.label(14, color: V.pinkSoft)),
                            const SizedBox(height: 4),
                            TextButton.icon(
                              onPressed: () => showShareCardSheet(context, ShareCardData.match(friend: p.name, me: context.read<SessionProvider>().me?.name ?? '')),
                              icon: const Icon(SolarIconsBold.export, size: 16, color: V.pinkSoft),
                              label: Text('Share · We vibed', style: VT.label(13, color: V.pinkSoft)),
                            ),
                          ],
                          const SizedBox(height: 20),
                          GradientButton(label: 'Find someone else', onTap: onFindAnother, icon: SolarIconsBold.videocamera),
                          if (!reported) ...[
                            const SizedBox(height: 10),
                            GhostButton(
                              label: m.reconnectFree ? 'Reconnect' : 'Reconnect with ${p.name}',
                              icon: SolarIconsOutline.restart,
                              expand: true,
                              onTap: onReconnect,
                              trailing: m.reconnectFree
                                  ? Container(
                                      height: 22,
                                      padding: const EdgeInsets.symmetric(horizontal: 8),
                                      decoration: BoxDecoration(color: V.ok.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(11)),
                                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                                        Text('Free for ', style: VT.label(12, color: V.ok)),
                                        Text(countdown(m.freeReconnectUntil!.difference(DateTime.now())), style: VT.mono(12, color: V.ok, weight: FontWeight.w600)),
                                      ]),
                                    )
                                  : Container(
                                      height: 22,
                                      padding: const EdgeInsets.symmetric(horizontal: 8),
                                      decoration: BoxDecoration(color: V.gold.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(11)),
                                      child: CoinAmount(m.reconnectPrice, size: 12),
                                    ),
                            ),
                            const SizedBox(height: 6),
                            TextButton.icon(
                              onPressed: onReport,
                              icon: const Icon(SolarIconsOutline.flag, size: 16, color: V.text2),
                              label: Text('Something wrong? Report ${p.name}', style: VT.label(13, color: V.text2, weight: FontWeight.w500)),
                            ),
                          ] else ...[
                            const SizedBox(height: 16),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(SolarIconsBold.checkCircle, size: 16, color: V.trust),
                                const SizedBox(width: 6),
                                Flexible(child: Text('Thanks — our team reviews every report.', style: VT.label(13, color: V.text2, weight: FontWeight.w500))),
                              ],
                            ),
                            const SizedBox(height: 4),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _stat(Widget value, String label) {
    return Expanded(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [SizedBox(height: 24, child: Center(child: value)), const SizedBox(height: 4), Text(label, style: VT.body(11, color: V.muted, height: 1.2))],
      ),
    );
  }
}

// ── searching ──────────────────────────────────────────────────────────

/// The brand's two rings become the loader; the wait sets expectations
/// about blur and reporting.
class _Searching extends StatelessWidget {
  const _Searching({required this.m});
  final MatchProvider m;

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletProvider>();
    final f = m.filters;
    return Stack(
      fit: StackFit.expand,
      children: [
        _SelfVideo(m: m, blur: 28),
        ColoredBox(color: V.bg.withValues(alpha: 0.62)),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
            child: Column(
              children: [
                const Spacer(),
                SizedBox(
                  width: 240,
                  height: 240,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Container(decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: 0.06)))),
                      Padding(padding: const EdgeInsets.all(36), child: Container(decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: 0.09))))),
                      const VibeMark(size: 120, animate: true, stroke: 0.075),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                Semantics(
                  liveRegion: true,
                  child: wallet.isBoosted
                      ? const Headline('Boosted · finding someone ', accent: 'fast', size: 28, textAlign: TextAlign.center)
                      : const Headline('Finding someone ', accent: 'for you', size: 28, textAlign: TextAlign.center),
                ),
                const SizedBox(height: 12),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    _miniChip(_genderLabel(f.gender)),
                    _miniChip(_countryLabel(f.countryCode)),
                    if (f.safeMode) _miniChip('Verified only', trust: true),
                  ],
                ),
                const Spacer(),
                Glass(
                  radius: 22,
                  color: V.bg2.withValues(alpha: 0.55),
                  border: Colors.white.withValues(alpha: 0.1),
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(color: V.trust.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(12)),
                        child: const Icon(SolarIconsBold.shield, size: 20, color: V.trust),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(m.autoBlur && !wallet.isVip ? 'Both videos start blurred' : 'Report is one tap away', style: VT.title(14, weight: FontWeight.w600)),
                            const SizedBox(height: 3),
                            Text(
                              m.autoBlur && !wallet.isVip ? 'The first 3 seconds stay soft. Report and block are always top-right, one tap away.' : 'Report and block are always top-right. Turn on blur in Safety if you want a softer start.',
                              style: VT.body(12.5, color: V.text2, height: 1.45),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                GhostButton(label: 'Cancel', expand: true, fill: Colors.white.withValues(alpha: 0.08), onTap: m.stop),
                const SizedBox(height: 14),
                if (wallet.isBoosted)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(SolarIconsBold.bolt, size: 15, color: V.gold),
                      const SizedBox(width: 6),
                      Text('Boosted · ${Fmt.until(wallet.wallet.boostUntil!)}', style: VT.label(12.5, weight: FontWeight.w500)),
                    ],
                  )
                else
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => confirmBoost(context),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(SolarIconsBold.bolt, size: 15, color: V.gold),
                          const SizedBox(width: 6),
                          if (wallet.freeBoosts > 0)
                            Text('Use your free boost', style: VT.label(12.5, color: V.gold))
                          else ...[
                            Text('Boost to the front of the queue · ', style: VT.label(12.5, weight: FontWeight.w500)),
                            Text('${Economy.boostCost}', style: VT.label(12.5, color: V.gold)),
                          ],
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _miniChip(String label, {bool trust = false}) {
    return Container(
      height: 28,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(color: trust ? V.trust.withValues(alpha: 0.12) : Colors.white.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(14)),
      child: Center(widthFactor: 1, child: Text(label, style: VT.label(12, color: trust ? V.trust : V.text2, weight: FontWeight.w500))),
    );
  }
}

// ── connected ──────────────────────────────────────────────────────────

class _Connected extends StatelessWidget {
  const _Connected({required this.m, required this.onNext, required this.onGift, required this.onAddFriend, required this.onReport, required this.onPlay, required this.message, required this.chatScroll});
  final MatchProvider m;
  final VoidCallback onNext;
  final VoidCallback onGift;
  final VoidCallback onAddFriend;
  final VoidCallback onReport;
  final VoidCallback onPlay;
  final TextEditingController message;
  final ScrollController chatScroll;

  @override
  Widget build(BuildContext context) {
    final p = m.partner!;
    final me = context.watch<SessionProvider>().me;
    final friendState = m.friendState;
    final media = MediaQuery.of(context);
    final bottomInset = media.viewInsets.bottom;
    final topRow = media.padding.top + 64;
    final shared = [for (final i in p.interests) if (me?.interests.contains(i) == true) i];
    final opener = shared.isNotEmpty ? 'You both like ${shared.take(2).join(' · ')}' : (p.interests.isEmpty ? null : 'Into ${p.interests.take(2).join(' · ')}');
    final likeText = m.mutualLike ? 'You both liked each other' : (m.partnerLikedMe ? '${p.name} liked you' : null);

    void send() {
      m.sendMessage(message.text);
      message.clear();
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        _PartnerStage(m: m, partner: p, blurred: m.blurred),
        const VideoScrims(top: 220, bottom: 460, topAlpha: 0.75, bottomAlpha: 0.92, bottomMid: 0.6),
        // Top: who, timer, report.
        Positioned(
          left: 0,
          right: 0,
          top: media.padding.top,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
            child: Row(
              children: [
                Flexible(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => showUserProfileSheet(context, p.id),
                    child: Glass(
                    radius: 24,
                    color: V.bg2.withValues(alpha: 0.45),
                    padding: const EdgeInsets.fromLTRB(5, 5, 14, 5),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // "Lv 7" pinned under their photo: always room for it.
                        Stack(
                          clipBehavior: Clip.none,
                          alignment: Alignment.bottomCenter,
                          children: [
                            VAvatar(url: p.avatarUrl, name: p.name, size: 36),
                            if (p.level > 0) Positioned(bottom: -6, child: LevelChip(level: p.level, glass: true, size: 8.5)),
                          ],
                        ),
                        const SizedBox(width: 10),
                        Flexible(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Flexible(child: Text('${p.name}, ${p.age}', overflow: TextOverflow.ellipsis, style: VT.title(15, weight: FontWeight.w600))),
                                  if (p.verified) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(SolarIconsBold.verifiedCheck, size: 16, color: V.trust, semanticLabel: 'Verified')),
                                  if (p.vip) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(SolarIconsBold.crown, size: 15, color: V.gold, semanticLabel: 'VIP')),
                                ],
                              ),
                              Text('${p.country.flag} ${p.country.name}', overflow: TextOverflow.ellipsis, style: VT.body(11.5, color: Colors.white.withValues(alpha: 0.72), height: 1.2)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  ),
                ),
                const SizedBox(width: 8),
                Glass(
                  radius: 16,
                  height: 32,
                  color: V.bg2.withValues(alpha: 0.45),
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(width: 6, height: 6, decoration: const BoxDecoration(shape: BoxShape.circle, color: V.bad)),
                      const SizedBox(width: 6),
                      Text(Fmt.clock(m.elapsed), style: VT.mono(12, color: V.text)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                _FollowPill(userId: p.id),
                const SizedBox(width: 8),
                GlassPill(label: 'Report', icon: SolarIconsBold.flag, tint: V.bad, height: 36, onTap: onReport),
              ],
            ),
          ),
        ),
        // Openers and likes, under the identity pill.
        Positioned(
          left: 12,
          top: topRow,
          right: 12 + 100 + 10,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (opener != null) GlassPill(label: opener, icon: SolarIconsBold.widget_4, iconColor: V.lavender, height: 30, fontSize: 12),
              if (likeText != null) ...[
                const SizedBox(height: 8),
                GlassPill(label: likeText, icon: SolarIconsBold.heart, iconColor: V.pinkSoft, tint: V.pink, height: 30, fontSize: 12),
              ],
            ],
          ),
        ),
        // Self PiP
        Positioned(
          right: 12,
          top: topRow,
          child: Container(
            width: 100,
            height: 140,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white.withValues(alpha: 0.28), width: 1.5),
              color: V.surface2,
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 30, offset: const Offset(0, 12))],
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (m.hasLocalVideo && m.camOn) RTCVideoView(m.localRenderer, mirror: m.frontCamera, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover) else const Center(child: Icon(Icons.videocam_off_rounded, color: V.muted)),
                if (m.blurred) BackdropFilter(filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12), child: const SizedBox.expand()),
                Positioned(
                  left: 6,
                  bottom: 6,
                  child: GestureDetector(
                    onTap: m.toggleMic,
                    child: Glass(
                      radius: 12,
                      padding: EdgeInsets.zero,
                      border: Colors.transparent,
                      color: V.bg2.withValues(alpha: 0.55),
                      child: SizedBox(width: 24, height: 24, child: Icon(m.micOn ? Icons.mic_rounded : Icons.mic_off_rounded, size: 14, color: m.micOn ? Colors.white : V.bad)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        // Bottom stack: chat, controls, composer
        Positioned(
          left: 12,
          right: 12,
          bottom: bottomInset > 0 ? bottomInset + 8 : media.padding.bottom + 16,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (m.game != null) ...[
                GameCard(m: m, round: m.game!),
                const SizedBox(height: 10),
              ],
              _ChatOverlay(m: m, controller: chatScroll, maxHeight: m.game != null ? 84 : 168),
              const SizedBox(height: 14),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    RoundControl(
                      icon: m.likedPartner ? SolarIconsBold.heart : SolarIconsOutline.heart,
                      color: m.likedPartner ? V.pink : Colors.white,
                      tint: m.likedPartner ? V.pink : null,
                      onTap: m.like,
                      label: m.likedPartner ? 'Liked' : 'Like',
                    ),
                    RoundControl(icon: SolarIconsBold.gift, onTap: onGift, label: 'Gift', color: V.gold),
                    _NextButton(m: m, onTap: onNext),
                    RoundControl(
                      icon: switch (friendState) { FriendState.friends => SolarIconsBold.userCheckRounded, FriendState.requested => SolarIconsBold.hourglass, _ => SolarIconsBold.userPlusRounded },
                      onTap: friendState == FriendState.none || friendState == FriendState.incoming ? onAddFriend : null,
                      label: switch (friendState) { FriendState.friends => 'Friends', FriendState.requested => 'Sent', FriendState.incoming => 'Accept', _ => 'Add' },
                      color: friendState == FriendState.friends ? V.ok : Colors.white,
                      tint: friendState == FriendState.incoming ? V.violet : null,
                    ),
                    RoundControl(icon: SolarIconsBold.gamepadMinimalistic, onTap: onPlay, label: 'Play', color: V.lavender, tint: m.game != null ? V.violet : null),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  // Call options (mute, camera, block, end) sit by the composer.
                  Semantics(
                    button: true,
                    label: 'Call options',
                    excludeSemantics: true,
                    child: GestureDetector(
                      onTap: () => _more(context),
                      child: Glass(radius: 26, height: 52, padding: EdgeInsets.zero, border: Colors.white.withValues(alpha: 0.14), child: const SizedBox(width: 52, child: Icon(SolarIconsBold.menuDots, color: Colors.white))),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Glass(
                radius: 26,
                height: 52,
                border: Colors.white.withValues(alpha: 0.14),
                padding: const EdgeInsets.only(left: 18, right: 6),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: message,
                        style: VT.body(15, color: Colors.white),
                        textInputAction: TextInputAction.send,
                        cursorColor: V.pinkSoft,
                        decoration: InputDecoration(
                          hintText: 'Say something…',
                          hintStyle: VT.body(15, color: Colors.white.withValues(alpha: 0.55)),
                          filled: false,
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          contentPadding: EdgeInsets.zero,
                          isDense: true,
                        ),
                        onSubmitted: (_) => send(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Semantics(
                      button: true,
                      label: 'Send',
                      child: Material(
                        color: V.violet,
                        shape: const CircleBorder(),
                        child: InkWell(customBorder: const CircleBorder(), onTap: send, child: const SizedBox(width: 40, height: 40, child: Icon(SolarIconsBold.plain, size: 19, color: Colors.white))),
                      ),
                    ),
                  ],
                ),
              ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  void _more(BuildContext context) {
    showVibeSheet(
      context,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Call options', style: VT.title(20)),
            const SizedBox(height: 16),
            GroupCard(
              children: [
                GroupRow(icon: m.micOn ? Icons.mic_rounded : Icons.mic_off_rounded, title: m.micOn ? 'Mute microphone' : 'Unmute', onTap: () {
                  m.toggleMic();
                  Navigator.of(context).pop();
                }),
                GroupRow(icon: m.camOn ? SolarIconsBold.videocamera : Icons.videocam_off_rounded, title: m.camOn ? 'Turn camera off' : 'Turn camera on', onTap: () {
                  m.toggleCam();
                  Navigator.of(context).pop();
                }),
                GroupRow(icon: SolarIconsBold.cameraRotate, title: 'Switch camera', onTap: () {
                  m.switchCamera();
                  Navigator.of(context).pop();
                }),
              ],
            ),
            const SizedBox(height: 10),
            GroupCard(
              children: [
                GroupRow(icon: SolarIconsBold.forbiddenCircle, iconColor: V.bad, iconBg: V.bad.withValues(alpha: 0.12), title: 'Block and end', titleColor: V.bad, onTap: () {
                  m.blockPartner();
                  Navigator.of(context).pop();
                }),
                GroupRow(icon: SolarIconsBold.endCallRounded, title: 'End and go back', onTap: () {
                  m.stop();
                  Navigator.of(context).pop();
                }),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _NextButton extends StatelessWidget {
  const _NextButton({required this.m, required this.onTap});
  final MatchProvider m;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cd = m.cooldownSeconds;
    return Semantics(
      button: true,
      label: cd > 0 ? 'Next, wait $cd seconds or skip for ${Economy.skipCooldownBypassCost} coins' : 'Next person',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 76,
              height: 76,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: cd > 0 ? const LinearGradient(colors: [V.surface3, V.surface2]) : V.brand,
                boxShadow: [BoxShadow(color: (cd > 0 ? Colors.black : V.pink).withValues(alpha: 0.42), blurRadius: 30, offset: const Offset(0, 12))],
              ),
              child: cd > 0 ? Center(child: Text('${cd}s', style: VT.number(20, color: Colors.white))) : const Icon(SolarIconsBold.skipNext, size: 38, color: Colors.white),
            ),
            const SizedBox(height: 6),
            cd > 0
                ? Row(mainAxisSize: MainAxisSize.min, children: [Text('Skip · ', style: VT.label(11, color: Colors.white.withValues(alpha: 0.85))), CoinAmount(Economy.skipCooldownBypassCost, size: 11)])
                : Text('Next', style: VT.label(11, color: Colors.white.withValues(alpha: 0.85))),
          ],
        ),
      ),
    );
  }
}

class _ChatOverlay extends StatelessWidget {
  const _ChatOverlay({required this.m, required this.controller, this.maxHeight = 168});
  final MatchProvider m;
  final ScrollController controller;
  final double maxHeight;

  @override
  Widget build(BuildContext context) {
    final items = m.chat;
    if (items.isEmpty) return const SizedBox.shrink();
    final maxW = MediaQuery.of(context).size.width * 0.72;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: ShaderMask(
        // Fade the oldest lines out at the top edge.
        shaderCallback: (r) => const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, stops: [0, 0.18], colors: [Colors.transparent, Colors.black]).createShader(r),
        blendMode: BlendMode.dstIn,
        child: ListView.builder(
          controller: controller,
          padding: EdgeInsets.zero,
          shrinkWrap: true,
          itemCount: items.length,
          itemBuilder: (context, i) {
            final c = items[i];
            final mine = c.fromMe;
            final text = c.gift != null ? '${c.gift!.emoji}  ${c.text}' : c.text;
            final bubble = mine
                ? Container(
                    constraints: BoxConstraints(maxWidth: maxW),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: c.gift != null ? V.gold.withValues(alpha: 0.28) : V.violet.withValues(alpha: 0.6),
                      borderRadius: const BorderRadius.only(topLeft: Radius.circular(18), topRight: Radius.circular(18), bottomLeft: Radius.circular(18), bottomRight: Radius.circular(6)),
                    ),
                    child: Text(text, style: VT.body(14, color: Colors.white, height: 1.35)),
                  )
                : ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: maxW),
                    child: ClipRRect(
                      borderRadius: const BorderRadius.only(topLeft: Radius.circular(18), topRight: Radius.circular(18), bottomLeft: Radius.circular(6), bottomRight: Radius.circular(18)),
                      child: BackdropFilter(
                        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: c.gift != null ? V.gold.withValues(alpha: 0.2) : V.glass,
                            border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                            borderRadius: const BorderRadius.only(topLeft: Radius.circular(18), topRight: Radius.circular(18), bottomLeft: Radius.circular(6), bottomRight: Radius.circular(18)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(m.partner?.name ?? 'Them', style: VT.label(11, color: V.pinkSoft)),
                              Text(text, style: VT.body(14, color: Colors.white, height: 1.35)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Align(alignment: mine ? Alignment.centerRight : Alignment.centerLeft, child: bubble),
            );
          },
        ),
      ),
    );
  }
}

/// The partner's video: the live WebRTC stream in server mode, or their
/// portrait (offline mock, dev bots, or while the connection comes up).
class _PartnerStage extends StatelessWidget {
  const _PartnerStage({required this.m, required this.partner, required this.blurred});
  final MatchProvider m;
  final Profile partner;
  final bool blurred;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        if (m.hasRemoteVideo)
          RTCVideoView(m.remoteRenderer, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)
        else
          Image.network(
          partner.avatarUrl,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(
            decoration: const BoxDecoration(gradient: LinearGradient(colors: [Color(0xFF2B1B4D), V.bg], begin: Alignment.topCenter, end: Alignment.bottomCenter)),
            alignment: Alignment.center,
            child: VAvatar(url: '', name: partner.name, size: 120, ring: true),
          ),
        ),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 600),
          child: blurred
              ? BackdropFilter(
                  key: const ValueKey('blur'),
                  filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                  child: Container(
                    color: Colors.black.withValues(alpha: 0.1),
                    alignment: Alignment.center,
                    child: GlassPill(label: 'Starts blurred · clearing in a moment', icon: SolarIconsBold.radialBlur, iconColor: V.trust, height: 34),
                  ),
                )
              : const SizedBox.shrink(key: ValueKey('clear')),
        ),
      ],
    );
  }
}

/// Your own camera as a full-bleed background (lobby, searching).
class _SelfVideo extends StatelessWidget {
  const _SelfVideo({required this.m, this.blur = 0});
  final MatchProvider m;
  final double blur;

  @override
  Widget build(BuildContext context) {
    final Widget video = m.hasLocalVideo && m.camOn
        ? RTCVideoView(m.localRenderer, mirror: m.frontCamera, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)
        : const DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(center: Alignment(0, -0.35), radius: 1.1, colors: [Color(0xFF3A1D5C), Color(0xFF1A1030), V.bg]),
            ),
          );
    if (blur <= 0) return video;
    return ImageFiltered(imageFilter: ImageFilter.blur(sigmaX: blur, sigmaY: blur, tileMode: TileMode.clamp), child: video);
  }
}

/// Small helper for a "Get VIP" nudge.
class VipNudge extends StatelessWidget {
  const VipNudge({super.key});
  @override
  Widget build(BuildContext context) {
    return GhostButton(label: 'Get VIP', icon: SolarIconsBold.crown, color: V.gold, onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VipScreen())));
  }
}

/// Follow from the call's top bar (a small icon button). Reads the partner's
/// profile once so it knows whether you already follow them.
class _FollowPill extends StatefulWidget {
  const _FollowPill({required this.userId});
  final String userId;

  @override
  State<_FollowPill> createState() => _FollowPillState();
}

class _FollowPillState extends State<_FollowPill> {
  @override
  void initState() {
    super.initState();
    final follows = context.read<FollowsProvider>();
    Future(() async {
      try {
        await follows.view(widget.userId);
      } on ApiException catch (_) {}
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = context.select<FollowsProvider, FollowState>((f) => f.stateOf(widget.userId));
    final label = switch (s) { FollowState.none => 'Follow', FollowState.requested => 'Follow requested', FollowState.following => 'Following' };
    final none = s == FollowState.none;
    // Icon-only so the partner's name keeps its room on small phones.
    return Tooltip(
      message: label,
      child: Semantics(
        button: none,
        label: label,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: !none
              ? null
              : () async {
                  try {
                    await context.read<FollowsProvider>().follow(widget.userId);
                  } on ApiException catch (e) {
                    if (context.mounted) toast(context, e.message, error: true);
                  }
                },
          child: Glass(
            radius: 18,
            height: 36,
            padding: const EdgeInsets.symmetric(horizontal: 9),
            color: none ? V.violet.withValues(alpha: 0.28) : V.bg2.withValues(alpha: 0.45),
            border: none ? V.violet.withValues(alpha: 0.5) : null,
            child: Center(
              widthFactor: 1,
              child: Icon(switch (s) { FollowState.none => Icons.add_rounded, FollowState.requested => SolarIconsBold.hourglass, FollowState.following => Icons.check_rounded }, size: 20, color: s == FollowState.following ? V.ok : Colors.white),
            ),
          ),
        ),
      ),
    );
  }
}
