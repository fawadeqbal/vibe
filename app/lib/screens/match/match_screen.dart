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
import '../../models/models.dart';
import '../../models/filters.dart' show WantedGender;
import '../../providers/engagement_provider.dart';
import '../../providers/filters_provider.dart';
import '../../providers/match_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/social_provider.dart';
import '../../providers/wallet_provider.dart';
import '../invite/invite_screen.dart';
import '../invite/share_cards.dart';
import '../profile/user_profile_screen.dart';
import '../notifications/notifications_screen.dart';
import '../store/store_screen.dart';
import '../store/wallet_screen.dart';
import '../store/vip_screen.dart';
import '../filters/filter_chips.dart';
import '../filters/filters_sheet.dart';
import 'gift_sheet.dart';
import 'icebreakers.dart';
import 'lobby_extras.dart';
import 'match_sheets.dart';
import 'call_states.dart';
import 'report_sheet.dart';
import 'safety_sheet.dart';
import 'swipe.dart';
import 'voice_call.dart';

/// The app. Four looks on one screen: lobby (idle), searching, connected,
/// ended. In the lobby your camera stays off until you ask for a preview
/// (battery); then it fills the screen clearly (scrims, not a dim);
/// during a match the partner takes the stage and you shrink to a corner.
class MatchScreen extends StatefulWidget {
  const MatchScreen({super.key, required this.onOpenStore, required this.onOpenChats, this.onOpenMe});
  final VoidCallback onOpenStore;
  final VoidCallback onOpenChats;

  /// The avatar in the lobby's top bar: the Me tab.
  final VoidCallback? onOpenMe;

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
  bool _cameraSheetOpen = false;

  /// "Swipe up for next" hint: shown on the first call on this device.
  bool _hintSeen = true;

  @override
  void initState() {
    super.initState();
    swipeHintSeen().then((seen) {
      if (mounted && !seen) setState(() => _hintSeen = false);
    });
  }

  void _doneHint() {
    if (_hintSeen) return;
    setState(() => _hintSeen = true);
    markSwipeHintSeen();
  }

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
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Not now', style: TextStyle(color: V.text2)),
          ),
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
    if (await m.start()) return;
    if (m.filtersLocked && mounted) {
      if (await _filtersLocked() && mounted) await m.start();
      return;
    }
    await _explainFailure(m, 'You need more coins for that.');
  }

  /// Gender or country are on but not open: the filter pass (shared with
  /// Discover), VIP, or meet anyone for now (age and verified only still apply).
  /// True = start again.
  Future<bool> _filtersLocked() async {
    final choice = await showFilterPass(context);
    if (!mounted) return false;
    switch (choice) {
      case 'ok':
        return true;
      case 'vip':
        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VipScreen()));
      case 'coins':
        widget.onOpenStore();
      default:
        final p = context.read<FiltersProvider>();
        await p.save(p.filters.copyWith(gender: WantedGender.anyone, clearCountry: true));
        return true;
    }
    return false;
  }

  Future<void> _next() async {
    final m = context.read<MatchProvider>();
    HapticFeedback.mediumImpact();
    if (m.inCooldown) {
      final choice = await showCooldown(
        context,
        until: DateTime.now().add(Duration(seconds: m.cooldownSeconds)),
        bypassCost: Economy.skipCooldownBypassCost,
        skipped: Economy.skipsBeforeCooldown,
      );
      if (choice == null || !mounted || !m.isConnected) return;
      if (choice == CooldownChoice.next) {
        // The wait is over: carry on to the next person.
        if (!await m.next()) await _explainFailure(m, 'You need more coins for that.');
        return;
      }
      if (!await m.bypassCooldown()) await _explainFailure(m, 'Skipping the cooldown costs ${Economy.skipCooldownBypassCost} coins.');
      return;
    }
    if (await m.next()) return;
    // The server can answer "slow down" — then offer the same choice.
    if (m.inCooldown && mounted) return _next();
    await _explainFailure(m, 'You need more coins for that.');
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

  /// After a skip: a friend request to the person you just left.
  Future<void> _addLastFriend() async {
    final m = context.read<MatchProvider>();
    final p = m.lastPartner;
    if (p == null) return;
    final wallet = context.read<WalletProvider>();
    final social = context.read<SocialProvider>();
    if (wallet.freeFriendRequestsLeft == 0) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('Send ${p.name} a friend request?'),
          content: Text('Your ${Economy.freeFriendRequestsPerDay} free requests for today are used. This one costs ${Economy.friendRequestCost} coins.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel', style: TextStyle(color: V.text2)),
            ),
            TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text('Send for ${Economy.friendRequestCost}')),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    try {
      if (await social.sendRequest(p)) {
        if (mounted) toast(context, 'Request sent to ${p.name}');
      } else if (mounted) {
        await _needCoins('A friend request costs ${Economy.friendRequestCost} coins once your free ones are used.');
      }
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
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
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Cancel', style: TextStyle(color: V.text2)),
            ),
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

  /// Ended card: Like back.
  Future<void> _likeLast() async {
    final m = context.read<MatchProvider>();
    if (!await m.likeLast() && mounted && m.lastError != null) toast(context, m.lastError!, error: true);
  }

  /// Ended card: Send a gift to the person you just left.
  Future<void> _giftLast() async {
    final m = context.read<MatchProvider>();
    final p = m.lastPartner;
    if (p == null) return;
    final g = await showGiftSheet(context, toName: p.name);
    if (g == null || !mounted) return;
    if (await m.giftLast(g)) {
      if (!mounted) return;
      setState(() {
        _burst = g;
        _burstReceived = false;
        _burstSeq++;
      });
      toast(context, '${g.name} sent to ${p.name}');
    } else if (mounted) {
      if (m.needsCoins) {
        await _needCoins('A ${g.name} costs ${g.coins} coins.');
      } else if (m.lastError != null) {
        toast(context, m.lastError!, error: true);
      }
    }
  }

  Future<void> _reconnect() async {
    final m = context.read<MatchProvider>();
    if (!await m.reconnect()) await _explainFailure(m, 'Reconnecting costs ${m.reconnectPrice} coins.');
  }

  @override
  Widget build(BuildContext context) {
    final m = context.watch<MatchProvider>();
    // The camera didn't open: explain how to allow it, once per failure.
    if (m.cameraFailed && !_cameraSheetOpen) {
      _cameraSheetOpen = true;
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!mounted) return;
        final fix = await showCameraBlocked(context);
        _cameraSheetOpen = false;
        if (!mounted) return;
        if (fix == CameraFix.retry) {
          await m.retryCamera();
        } else {
          m.clearCameraFailed();
        }
      });
    }
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
              MatchState.connected when m.voiceCall && m.partner != null => VoiceCallView(m: m, onReport: _report),
              MatchState.connected => _Connected(m: m, onNext: _next, onGift: _gift, onAddFriend: _addFriend, onReport: _report, onPlay: _play, message: _message, chatScroll: _chatScroll),
              MatchState.searching => _Searching(m: m, onCallNow: _reconnect, onRestart: _start),
              _ when m.pausedUntil != null => AccountPausedView(m: m, until: m.pausedUntil!, onOpenChats: widget.onOpenChats),
              MatchState.ended when m.lastPartner != null => _Ended(
                m: m,
                onReconnect: _reconnect,
                onFindAnother: _start,
                onReport: _reportLast,
                onLikeBack: _likeLast,
                onAddFriend: _addLastFriend,
                onGift: _giftLast,
              ),
              _ => _Lobby(m: m, onStart: _start, onOpenStore: widget.onOpenStore, onOpenMe: widget.onOpenMe),
            },
            if (m.isSearching && m.rematchSoon == null)
              Positioned(
                left: 12,
                right: 12,
                top: MediaQuery.of(context).padding.top + 12,
                child: SkippedBar(onUndo: _reconnect, onAddFriend: _addLastFriend),
              ),
            if (!_hintSeen && m.isConnected && !m.friendCall && !m.voiceCall) Positioned.fill(child: SwipeHint(onDone: _doneHint)),
            if (_celebrating && m.isConnected && m.partner != null && !m.friendCall)
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
      content: Text(
        free > 0
            ? 'You go to the front of the queue for 30 minutes — on us. ${free == 1 ? 'You have 1 free boost.' : 'You have $free free boosts.'}'
            : 'You go to the front of the queue — faster matches, more of them. ${Economy.boostCost} coins.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('Not now', style: TextStyle(color: V.text2)),
        ),
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text(free > 0 ? 'Free boost' : 'Boost · ${Economy.boostCost}', style: const TextStyle(color: V.gold)),
        ),
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

// ── lobby ──────────────────────────────────────────────────────────────

class _CameraStarting extends StatelessWidget {
  const _CameraStarting();
  @override
  Widget build(BuildContext context) => SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white.withValues(alpha: 0.7)));
}

class _Lobby extends StatelessWidget {
  const _Lobby({required this.m, required this.onStart, required this.onOpenStore, this.onOpenMe});
  final MatchProvider m;
  final VoidCallback onStart;
  final VoidCallback onOpenStore;
  final VoidCallback? onOpenMe;

  @override
  Widget build(BuildContext context) {
    final camLive = m.hasLocalVideo && m.camOn;
    return Stack(
      fit: StackFit.expand,
      children: [
        _SelfVideo(m: m),
        const VideoScrims(top: 190, bottom: 520),
        SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Column(
                children: [
                  const _AvailabilityPoller(),
                  _LobbyTop(m: m, onOpenMe: onOpenMe),
                  const _LobbyBanners(),
                  if (camLive)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Glass(
                            radius: 15,
                            height: 30,
                            color: V.bg2.withValues(alpha: 0.5),
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(SolarIconsBold.eye, size: 15, color: V.text2),
                                const SizedBox(width: 6),
                                Text('Only you see this preview', style: VT.body(12, color: V.text2)),
                              ],
                            ),
                          ),
                          const Spacer(),
                          Column(
                            children: [
                              Tooltip(
                                message: 'Turn camera preview off',
                                child: RoundControl(icon: Icons.videocam_off_rounded, size: 42, onTap: m.stopPreview),
                              ),
                              const SizedBox(height: 10),
                              Tooltip(
                                message: 'Switch camera',
                                child: RoundControl(icon: SolarIconsBold.cameraRotate, size: 42, onTap: () => m.switchCamera()),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  Expanded(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 88),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 8),
                        child: Center(
                          child: camLive
                              ? const SizedBox.shrink()
                              : (m.previewOn && m.cameraActive
                                    ? const _CameraStarting()
                                    : FittedBox(
                                        fit: BoxFit.scaleDown,
                                        child: _PreviewOff(m: m),
                                      )),
                        ),
                      ),
                    ),
                  ),
                  FilterChips(glass: true, onOpen: () => showFiltersSheet(context)),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () => showSafetySheet(context),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 2),
                            child: Row(
                              children: [
                                const Icon(SolarIconsBold.shield, size: 16, color: V.trust),
                                const SizedBox(width: 6),
                                Flexible(
                                  child: Text(
                                    m.autoBlur ? 'Safe start: both videos stay blurred for 3 seconds' : 'Safety: report and block are one tap away in every call',
                                    style: VT.body(12.5, color: Colors.white.withValues(alpha: 0.82)),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        if (m.lastError != null) ...[
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(color: V.bad.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
                            child: Text(m.lastError!, style: VT.body(12.5, color: V.bad)),
                          ),
                          const SizedBox(height: 10),
                        ],
                        Semantics(
                          label: 'Start a video chat with someone new',
                          button: true,
                          excludeSemantics: true,
                          child: GradientButton(
                            label: 'Start video chat',
                            icon: SolarIconsBold.videocamera,
                            height: 60,
                            onTap: () {
                              HapticFeedback.mediumImpact();
                              onStart();
                            },
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Your photo (to Me), who's on right now, your coins and the bell.
class _LobbyTop extends StatelessWidget {
  const _LobbyTop({required this.m, this.onOpenMe});
  final MatchProvider m;
  final VoidCallback? onOpenMe;

  @override
  Widget build(BuildContext context) {
    final me = context.watch<SessionProvider>().me;
    final coins = context.select<WalletProvider, int>((w) => w.coins);
    final a = m.availability;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Row(
        children: [
          Semantics(
            button: true,
            label: 'Your profile',
            child: GestureDetector(
              onTap: onOpenMe,
              child: VAvatar(url: me?.avatarUrl ?? '', name: me?.name ?? 'You', size: 40, ring: true),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Align(
              alignment: Alignment.centerLeft,
              child: a == null
                  ? const SizedBox.shrink()
                  : Glass(
                      radius: 17,
                      height: 34,
                      color: V.bg2.withValues(alpha: 0.5),
                      padding: const EdgeInsets.only(left: 10, right: 12),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          OnlineDot(color: a.online == 0 ? V.warn : V.ok),
                          const SizedBox(width: 8),
                          Flexible(
                            child: Semantics(
                              liveRegion: true,
                              child: Text(
                                a.online == 0 ? 'Quiet right now' : '${Fmt.thousands(a.online)} on now',
                                overflow: TextOverflow.ellipsis,
                                style: VT.label(13, color: Colors.white),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
            ),
          ),
          const SizedBox(width: 8),
          CoinChip(
            coins: coins,
            glass: true,
            showPlus: false,
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const WalletScreen())),
          ),
          const SizedBox(width: 8),
          const NotificationsBell(glass: true),
        ],
      ),
    );
  }
}

/// Camera off: it stays off to save battery until you need it.
class _PreviewOff extends StatelessWidget {
  const _PreviewOff({required this.m});
  final MatchProvider m;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 320),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 84,
            height: 84,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.07),
              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
            ),
            child: const Icon(Icons.videocam_off_rounded, size: 34, color: V.text2),
          ),
          const SizedBox(height: 18),
          const Headline('Camera preview is ', accent: 'off', size: 22, accentColor: V.pinkSoft, textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Text(
            'It stays off until you need it, to save battery. It turns on by itself when you start.',
            textAlign: TextAlign.center,
            style: VT.body(14, color: V.text2, height: 1.5),
          ),
          const SizedBox(height: 18),
          GhostButton(
            label: 'Turn on preview',
            icon: SolarIconsBold.videocamera,
            height: 44,
            onTap: () {
              HapticFeedback.selectionClick();
              if (!m.camOn) m.toggleCam();
              m.startPreview();
            },
          ),
        ],
      ),
    );
  }
}

/// Vibe Hour (live, or when it starts, with "Remind me") and friends who are
/// on, stacked under the header. Takes no room when there's none of that.
class _LobbyBanners extends StatelessWidget {
  const _LobbyBanners();

  @override
  Widget build(BuildContext context) {
    final e = context.watch<EngagementProvider>();
    final v = e.vibeHour;
    final live = v.activeAt(e.now);
    final items = <Widget>[if (live) const VibeHourBanner(), if (!live && v.startsAt != null) const VibeHourInvite()];
    if (items.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[if (i > 0) const SizedBox(height: 8), items[i]],
        ],
      ),
    );
  }
}

/// Asks the server who's around while the lobby is open (every 20 s).
class _AvailabilityPoller extends StatefulWidget {
  const _AvailabilityPoller();

  @override
  State<_AvailabilityPoller> createState() => _AvailabilityPollerState();
}

class _AvailabilityPollerState extends State<_AvailabilityPoller> {
  Timer? _timer;
  DateTime? _looking;

  @override
  void initState() {
    super.initState();
    final m = context.read<MatchProvider>();
    unawaited(m.refreshAvailability());
    _timer = Timer.periodic(const Duration(seconds: 20), (_) => unawaited(m.refreshAvailability()));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // "Someone's looking" just arrived: ask again right away.
    final looking = context.select<MatchProvider, DateTime?>((m) => m.someoneLookingAt);
    if (looking != null && looking != _looking) {
      final m = context.read<MatchProvider>();
      WidgetsBinding.instance.addPostFrameCallback((_) => unawaited(m.refreshAvailability()));
    }
    _looking = looking;
    return const SizedBox.shrink();
  }
}

// ── ended ──────────────────────────────────────────────────────────────

/// How long "they left" waits before finding the next person.
const autoNextAfter = Duration(seconds: 5);

/// A recap, not an alert: their portrait blurs behind; a card with what
/// happened and three things you can still do for them; then Next,
/// Reconnect, Home, and Report, still reachable after the call.
/// (web: features/match/ended.tsx)
class _Ended extends StatefulWidget {
  const _Ended({required this.m, required this.onReconnect, required this.onFindAnother, required this.onReport, required this.onLikeBack, required this.onAddFriend, required this.onGift});
  final MatchProvider m;
  final VoidCallback onReconnect;
  final VoidCallback onFindAnother;
  final VoidCallback onReport;
  final VoidCallback onLikeBack;
  final VoidCallback onAddFriend;
  final VoidCallback onGift;

  @override
  State<_Ended> createState() => _EndedState();
}

class _EndedState extends State<_Ended> {
  Timer? _tick;

  /// They left: the next person comes by itself unless you stay (any tap).
  DateTime? _autoAt;
  Timer? _autoTick;

  int get _autoLeft => _autoAt == null ? 0 : (_autoAt!.difference(DateTime.now()).inMilliseconds / 1000).ceil().clamp(0, 99);

  void _stay() {
    if (_autoAt == null) return;
    _autoTick?.cancel();
    setState(() => _autoAt = null);
  }

  @override
  void initState() {
    super.initState();
    // Never spends coins without a tap: only when matching is free for them.
    if (widget.m.endReason == EndReason.partnerLeft && (!widget.m.filters.usesExtra || (widget.m.extraFiltersOpen?.call() ?? true))) {
      _autoAt = DateTime.now().add(autoNextAfter);
      _autoTick = Timer.periodic(const Duration(milliseconds: 250), (_) {
        if (!mounted) return;
        if (_autoLeft == 0) {
          _autoTick?.cancel();
          _autoAt = null;
          widget.onFindAnother();
          return;
        }
        setState(() {});
      });
    }
    // "Free 9:41" counts down; then the coin price comes back.
    if (widget.m.reconnectFree) {
      _tick = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        if (!widget.m.reconnectFree) {
          _tick?.cancel();
          _tick = null;
        }
        setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    _autoTick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.m;
    final p = m.lastPartner!;
    final reported = m.endReason == EndReason.reported;
    final theyLeft = m.endReason == EndReason.partnerLeft;
    final last = m.history.isEmpty ? null : m.history.first;
    final mutual = m.lastMutual || (last?.liked == true && last?.likedMe == true);
    final liked = last?.liked == true;
    final fs = context.select<SocialProvider, FriendState>((s) => s.stateOf(p.id));
    final why = switch (m.endReason) {
      EndReason.partnerLeft => '${p.name} moved on',
      EndReason.skipped => 'You skipped',
      EndReason.reported => 'Reported',
      _ => 'Call ended',
    };
    final chip = mutual ? 'You liked each other' : (last?.likedMe == true ? '${p.name} liked you' : (liked ? 'You liked ${p.name}' : null));
    final media = MediaQuery.of(context);
    return Listener(
      // Any tap on the recap means "stay here" (no auto-next).
      onPointerDown: _autoAt != null ? (_) => _stay() : null,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ImageFiltered(
            imageFilter: ImageFilter.blur(sigmaX: 14, sigmaY: 14, tileMode: TileMode.clamp),
            child: ColorFiltered(
              colorFilter: const ColorFilter.matrix([0.3, 0, 0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0, 1, 0]),
              child: Transform.scale(
                scale: 1.15,
                child: Image.network(
                  p.avatarUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [Color(0xFF2B1B4D), V.bg], begin: Alignment.topCenter, end: Alignment.bottomCenter),
                    ),
                  ),
                ),
              ),
            ),
          ),
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Padding(
                padding: EdgeInsets.fromLTRB(16, media.padding.top + 24, 16, media.padding.bottom + 30),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: Center(
                        child: SingleChildScrollView(
                          child: Container(
                            padding: const EdgeInsets.fromLTRB(20, 26, 20, 20),
                            decoration: BoxDecoration(
                              color: V.surface.withValues(alpha: 0.86),
                              borderRadius: BorderRadius.circular(28),
                              border: Border.all(color: V.line),
                            ),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Stack(
                                  clipBehavior: Clip.none,
                                  children: [
                                    Semantics(
                                      button: true,
                                      label: "Open ${p.name}'s profile",
                                      child: GestureDetector(
                                        onTap: () => showUserProfileSheet(context, p.id),
                                        child: VAvatar(url: p.avatarUrl, name: p.name, size: 92, ring: true, gapColor: V.surface),
                                      ),
                                    ),
                                    if (p.verified)
                                      Positioned(
                                        right: -2,
                                        bottom: 2,
                                        child: Container(
                                          width: 26,
                                          height: 26,
                                          decoration: const BoxDecoration(shape: BoxShape.circle, color: V.surface),
                                          child: const Icon(SolarIconsBold.verifiedCheck, size: 20, color: V.trust),
                                        ),
                                      ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  '${p.name}, ${p.age}',
                                  textAlign: TextAlign.center,
                                  style: VT.title(22, weight: FontWeight.w700),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  last == null ? why : '$why · ${Fmt.duration(last.length)}',
                                  textAlign: TextAlign.center,
                                  style: VT.body(13.5, color: V.text2),
                                ),
                                if (theyLeft) ...[
                                  const SizedBox(height: 2),
                                  Text(
                                    "It happens — it's not about you.",
                                    textAlign: TextAlign.center,
                                    style: VT.body(12.5, color: V.muted),
                                  ),
                                ],
                                if (chip != null) ...[
                                  const SizedBox(height: 12),
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Container(
                                        height: 30,
                                        padding: const EdgeInsets.symmetric(horizontal: 12),
                                        decoration: BoxDecoration(color: V.pink.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(999)),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Icon(SolarIconsBold.heart, size: 14, color: V.pinkSoft),
                                            const SizedBox(width: 6),
                                            Text(chip, style: VT.label(12.5, color: V.pinkSoft)),
                                          ],
                                        ),
                                      ),
                                      if (mutual) ...[
                                        const SizedBox(width: 6),
                                        Tooltip(
                                          message: 'Share',
                                          child: GestureDetector(
                                            onTap: () => showShareCardSheet(context, ShareCardData.match(friend: p.name, me: context.read<SessionProvider>().me?.name ?? '')),
                                            child: Container(
                                              width: 30,
                                              height: 30,
                                              decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.08)),
                                              child: const Icon(SolarIconsBold.export, size: 15, color: V.text2),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ],
                                const SizedBox(height: 18),
                                if (reported)
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      const Icon(SolarIconsBold.checkCircle, size: 16, color: V.trust),
                                      const SizedBox(width: 6),
                                      Flexible(
                                        child: Text(
                                          'Thanks — our team reviews every report.',
                                          style: VT.label(13, color: V.text2, weight: FontWeight.w500),
                                        ),
                                      ),
                                    ],
                                  )
                                else
                                  Row(
                                    children: [
                                      _CardAction(
                                        icon: SolarIconsBold.heart,
                                        color: V.pink,
                                        label: liked ? 'Liked' : (last?.likedMe == true ? 'Like back' : 'Like'),
                                        onTap: liked ? null : widget.onLikeBack,
                                      ),
                                      const SizedBox(width: 10),
                                      _CardAction(
                                        icon: switch (fs) {
                                          FriendState.friends => SolarIconsBold.userCheckRounded,
                                          FriendState.requested => SolarIconsBold.hourglass,
                                          _ => SolarIconsBold.userPlusRounded,
                                        },
                                        color: V.lavender,
                                        label: switch (fs) {
                                          FriendState.friends => 'Friends',
                                          FriendState.requested => 'Request sent',
                                          FriendState.incoming => 'Accept friend',
                                          _ => 'Add friend',
                                        },
                                        onTap: fs == FriendState.none || fs == FriendState.incoming ? widget.onAddFriend : null,
                                      ),
                                      const SizedBox(width: 10),
                                      _CardAction(icon: SolarIconsBold.gift, color: V.gold, label: 'Send a gift', onTap: widget.onGift),
                                    ],
                                  ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    GradientButton(label: _autoAt != null ? 'Next person in $_autoLeft' : 'Next person', icon: SolarIconsBold.skipNext, height: 58, onTap: widget.onFindAnother),
                    if (_autoAt != null)
                      Center(
                        child: TextButton(
                          onPressed: _stay,
                          child: Text('Stay here', style: VT.label(12.5, color: V.text2)),
                        ),
                      ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        if (!reported) ...[
                          Expanded(
                            child: Semantics(
                              label: m.reconnectFree ? 'Reconnect with ${p.name}, free' : 'Reconnect with ${p.name}, ${m.reconnectPrice} coins',
                              button: true,
                              excludeSemantics: true,
                              child: GhostButton(
                                label: m.reconnectFree ? 'Reconnect · Free ${countdown(m.freeReconnectUntil!.difference(DateTime.now()))}' : 'Reconnect · ${m.reconnectPrice}',
                                icon: SolarIconsOutline.restart,
                                height: 48,
                                expand: true,
                                onTap: widget.onReconnect,
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                        ],
                        Expanded(
                          child: GhostButton(label: 'Home', icon: SolarIconsBold.videocamera, height: 48, expand: true, onTap: m.dismissEnded),
                        ),
                      ],
                    ),
                    if (!reported)
                      Center(
                        child: TextButton.icon(
                          onPressed: widget.onReport,
                          icon: const Icon(SolarIconsBold.flag, size: 15, color: V.bad),
                          label: Text('Report ${p.name}', style: VT.label(13.5, color: V.bad)),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One of the card's three: a tinted circle and a label. Dimmed once done (Liked, Request sent).
class _CardAction extends StatelessWidget {
  const _CardAction({required this.icon, required this.color, required this.label, required this.onTap});
  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Semantics(
        button: true,
        enabled: onTap != null,
        label: label,
        excludeSemantics: true,
        child: GestureDetector(
          onTap: onTap,
          child: Opacity(
            opacity: onTap == null ? 0.6 : 1,
            child: Column(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: color.withValues(alpha: 0.14)),
                  child: Icon(icon, size: 24, color: color),
                ),
                const SizedBox(height: 6),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: VT.label(12.5, color: V.text),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── searching ──────────────────────────────────────────────────────────

/// After this long without a match, offer to widen narrow filters.
const slowSearchSeconds = 15;

/// Looking for someone: your own photo in the middle of soft rings, who
/// you're looking for, a tip, then Boost (go to the front) and Stop. When
/// nobody else is on, it says so plainly ("You're first in line") and offers
/// to tell you instead. (web: features/match/searching.tsx)
class _Searching extends StatefulWidget {
  const _Searching({required this.m, required this.onCallNow, required this.onRestart});
  final MatchProvider m;
  final VoidCallback onCallNow;
  final VoidCallback onRestart;

  @override
  State<_Searching> createState() => _SearchingState();
}

class _SearchingState extends State<_Searching> {
  final _startedAt = DateTime.now();
  Timer? _tick;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
    unawaited(widget.m.refreshAvailability(inQueue: true));
    _poll = Timer.periodic(const Duration(seconds: 8), (_) => unawaited(widget.m.refreshAvailability(inQueue: true)));
  }

  @override
  void dispose() {
    _tick?.cancel();
    _poll?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.m;
    final wallet = context.watch<WalletProvider>();
    final me = context.watch<SessionProvider>().me;
    final filters = context.watch<FiltersProvider>().filters;
    final seconds = DateTime.now().difference(_startedAt).inMilliseconds / 1000;
    final a = m.availability;
    final quiet = a != null && a.online == 0 && seconds >= 4;
    final slow = !quiet && seconds >= slowSearchSeconds;
    final rematch = m.rematchSoon;
    final boosted = wallet.isBoosted;

    final Widget card;
    if (rematch != null) {
      card = RematchSoonCard(m: m, onCallNow: widget.onCallNow);
    } else if (quiet) {
      card = const _VibeHourNudge();
    } else if (slow && filters.usesExtra) {
      card = _SearchCard(
        icon: SolarIconsBold.tuning,
        iconColor: V.warn,
        text: 'Your filters are narrow right now. Meet anyone to find someone sooner.',
        action: 'Meet anyone',
        onAction: () {
          m.stop();
          final p = context.read<FiltersProvider>();
          unawaited(p.save(p.filters.freeOnly()));
          widget.onRestart();
        },
      );
    } else {
      card = const _SearchCard(icon: SolarIconsBold.widget_4, iconColor: V.lavender, text: 'Tip: say hi first and ask about something in their profile.');
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        _SelfVideo(m: m, blur: 28),
        ColoredBox(color: V.bg.withValues(alpha: 0.66)),
        SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: LayoutBuilder(
                builder: (context, box) => SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: box.maxHeight - 16),
                    child: IntrinsicHeight(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 12),
                            child: Row(
                              children: [
                                Tooltip(
                                  message: 'Stop looking',
                                  child: RoundControl(icon: Icons.close_rounded, size: 40, onTap: m.stop),
                                ),
                                const Spacer(),
                                CoinChip(coins: wallet.coins, glass: true, showPlus: false),
                              ],
                            ),
                          ),
                          const SizedBox(height: 24),
                          Center(
                            child: ExcludeSemantics(
                              child: SizedBox.square(
                                dimension: 300,
                                child: _SearchRings(
                                  child: VAvatar(url: me?.avatarUrl ?? '', name: me?.name ?? 'You', size: 112, ring: true),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Semantics(
                            liveRegion: true,
                            child: quiet
                                ? const Headline("You're first ", accent: 'in line', size: 26, accentColor: V.pinkSoft, textAlign: TextAlign.center)
                                : boosted
                                ? const Headline('Boosted · finding someone ', accent: 'fast', size: 26, accentColor: V.pinkSoft, textAlign: TextAlign.center)
                                : const Headline('Finding someone ', accent: 'new', size: 26, accentColor: V.pinkSoft, textAlign: TextAlign.center),
                          ),
                          const SizedBox(height: 6),
                          if (quiet)
                            Center(
                              child: ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 330),
                                child: Text(
                                  "It's quiet right now. Stay here and we'll connect you the moment someone starts looking.",
                                  textAlign: TextAlign.center,
                                  style: VT.body(14, color: V.text2, height: 1.5),
                                ),
                              ),
                            )
                          else
                            Text.rich(
                              TextSpan(
                                style: VT.body(13.5, color: V.text2),
                                children: [
                                  TextSpan(text: '${filters.summary((c) => MockData.country(c).name)} · '),
                                  TextSpan(
                                    text: searchClock(seconds),
                                    style: VT.mono(13.5, color: V.text2),
                                  ),
                                ],
                              ),
                              textAlign: TextAlign.center,
                            ),
                          const SizedBox(height: 20),
                          card,
                          const Expanded(child: SizedBox(height: 24)),
                          if (quiet) ...[
                            GradientButton(
                              label: 'Notify me instead',
                              icon: SolarIconsBold.bellBing,
                              height: 54,
                              onTap: () async {
                                final ok = await m.notifyMe();
                                m.stop();
                                if (context.mounted) toast(context, ok ? "We'll tell you when someone starts looking" : "Couldn't set that up. Try again.", error: !ok);
                              },
                            ),
                            const SizedBox(height: 10),
                            GhostButton(
                              label: 'Invite a friend',
                              icon: SolarIconsBold.userPlusRounded,
                              height: 48,
                              expand: true,
                              onTap: () {
                                m.stop();
                                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const InviteScreen()));
                              },
                            ),
                          ] else if (boosted)
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(SolarIconsBold.bolt, size: 16, color: V.gold),
                                const SizedBox(width: 6),
                                Text('Boosted · ${Fmt.until(wallet.wallet.boostUntil!)}', style: VT.label(13, color: V.text2)),
                              ],
                            )
                          else
                            _BoostCard(free: wallet.freeBoosts > 0),
                          const SizedBox(height: 10),
                          GhostButton(label: 'Stop', height: 48, expand: true, fill: quiet ? Colors.transparent : null, onTap: m.stop),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Three soft pink rings breathing around your photo.
class _SearchRings extends StatefulWidget {
  const _SearchRings({required this.child});
  final Widget child;

  @override
  State<_SearchRings> createState() => _SearchRingsState();
}

class _SearchRingsState extends State<_SearchRings> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final still = MediaQuery.of(context).disableAnimations;
    return AnimatedBuilder(
      animation: _c,
      builder: (_, child) => Stack(
        alignment: Alignment.center,
        children: [
          for (final (i, d) in const [150.0, 220.0, 300.0].indexed)
            Container(
              width: d,
              height: d,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: V.pink.withValues(alpha: const [0.55, 0.32, 0.18][i] * (still ? 1 : 0.6 + 0.4 * ((_c.value + i * 0.2) % 1)))),
              ),
            ),
          child!,
        ],
      ),
      child: widget.child,
    );
  }
}

/// One frosted line in the middle of the search: a tip, or what would help.
class _SearchCard extends StatelessWidget {
  const _SearchCard({required this.icon, required this.iconColor, required this.text, this.action, this.onAction});
  final IconData icon;
  final Color iconColor;
  final String text;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Glass(
      radius: 18,
      color: V.bg2.withValues(alpha: 0.55),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Icon(icon, size: 20, color: iconColor),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: VT.body(13, color: V.text, height: 1.45)),
          ),
          if (action != null) ...[
            const SizedBox(width: 10),
            GestureDetector(
              onTap: onAction,
              child: Text(action!, style: VT.label(13, color: V.pinkSoft)),
            ),
          ],
        ],
      ),
    );
  }
}

/// "Go to the front": the boost, gold, with its price (or Free).
class _BoostCard extends StatelessWidget {
  const _BoostCard({required this.free});
  final bool free;

  @override
  Widget build(BuildContext context) {
    final minutes = Economy.boostLength.inMinutes;
    return Semantics(
      button: true,
      label: free ? 'Go to the front, free boost' : 'Go to the front, ${Economy.boostCost} coins',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: () => confirmBoost(context),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
          decoration: BoxDecoration(
            color: V.gold.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: V.gold.withValues(alpha: 0.28)),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: V.gold.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(12)),
                child: const Icon(SolarIconsBold.bolt, size: 22, color: V.gold),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Go to the front', style: VT.title(15)),
                    Text(free ? 'Use your free boost' : 'Boost: $minutes minutes first in line', style: VT.body(12, color: V.text2)),
                  ],
                ),
              ),
              if (free)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(color: V.ok.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(999)),
                  child: Text('Free', style: VT.label(13, color: V.ok)),
                )
              else
                Container(
                  height: 36,
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  decoration: BoxDecoration(gradient: V.goldGrad, borderRadius: BorderRadius.circular(999)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(SolarIconsBold.dollar, size: 16, color: V.onGold),
                      const SizedBox(width: 4),
                      Text('${Economy.boostCost}', style: VT.label(13.5, color: V.onGold)),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "0:07", "1:42": how long a search has been running.
String searchClock(double seconds) {
  final s = seconds < 0 ? 0 : seconds.floor();
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

/// In a quiet search: when everyone's on, and one tap to be reminded.
class _VibeHourNudge extends StatelessWidget {
  const _VibeHourNudge();

  @override
  Widget build(BuildContext context) {
    final e = context.watch<EngagementProvider>();
    final v = e.vibeHour;
    final startsAt = v.startsAt;
    if (startsAt == null || v.activeAt(e.now)) return const SizedBox.shrink();
    final remind = e.vibeHourReminder;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Wrap(
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 8,
        runSpacing: 4,
        children: [
          Text.rich(
            TextSpan(
              style: VT.body(12.5, color: V.muted),
              children: [
                const TextSpan(text: 'Most people come at '),
                TextSpan(
                  text: clock12(startsAt),
                  style: const TextStyle(color: V.text),
                ),
                const TextSpan(text: ' for Vibe Hour.'),
              ],
            ),
          ),
          GestureDetector(
            onTap: () => unawaited(toggleVibeHourReminder(context, !remind, startsAt)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(remind ? SolarIconsBold.bellBing : SolarIconsOutline.bell, size: 14, color: V.pinkSoft),
                const SizedBox(width: 4),
                Text(remind ? 'Reminder on' : 'Remind me', style: VT.label(12.5, color: V.pinkSoft)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── connected ──────────────────────────────────────────────────────────

class _Connected extends StatelessWidget {
  const _Connected({
    required this.m,
    required this.onNext,
    required this.onGift,
    required this.onAddFriend,
    required this.onReport,
    required this.onPlay,
    required this.message,
    required this.chatScroll,
  });
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
    final keyboard = media.viewInsets.bottom;
    final bottom = keyboard > 0 ? keyboard + 8 : media.padding.bottom;
    final shared = [
      for (final i in p.interests)
        if (me?.interests.contains(i) == true) i,
    ];
    final opener = shared.isNotEmpty ? 'You both like ${shared.take(2).join(' · ')}' : (p.interests.isEmpty ? null : 'Into ${p.interests.take(2).join(' · ')}');
    final likeText = m.mutualLike ? 'You both liked each other' : (m.partnerLikedMe ? '${p.name} liked you' : null);

    final stage = Stack(
      fit: StackFit.expand,
      children: [
        _PartnerStage(m: m, partner: p, blurred: m.blurred),
        const VideoScrims(top: 200, bottom: 380, topAlpha: 0.65, bottomAlpha: 0.9, bottomMid: 0.55),
      ],
    );

    return Stack(
      fit: StackFit.expand,
      children: [
        if (m.friendCall)
          stage
        else
          SwipeStage(
            onNext: onNext,
            onLike: () {
              if (!m.likedPartner) m.like();
            },
            child: stage,
          ),
        Positioned(
          left: 0,
          right: 0,
          top: media.padding.top,
          child: _CallTop(m: m, partner: p, onReport: onReport),
        ),
        // What you share and who liked whom, under the name.
        Positioned(
          left: 12,
          top: media.padding.top + 72,
          right: 120,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (opener != null) GlassPill(label: opener, icon: SolarIconsBold.widget_4, iconColor: V.lavender, height: 30, fontSize: 12),
              if (likeText != null) ...[const SizedBox(height: 8), GlassPill(label: likeText, icon: SolarIconsBold.heart, iconColor: V.pinkSoft, tint: V.pink, height: 30, fontSize: 12)],
              PartnerMediaPills(m: m, name: p.name),
            ],
          ),
        ),
        Positioned(
          right: 12,
          top: media.padding.top + 70,
          child: _SelfPip(m: m),
        ),
        if (m.friendCall)
          // A call with a friend from a chat: no Next, no like, no add — End.
          Positioned(
            left: 12,
            right: 12,
            bottom: bottom + 16,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (m.game != null) ...[GameCard(m: m, round: m.game!), const SizedBox(height: 10)],
                Align(
                  alignment: Alignment.centerLeft,
                  child: _ChatOverlay(m: m, controller: chatScroll, maxHeight: m.game != null ? 84 : 168),
                ),
                const SizedBox(height: 14),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    RoundControl(icon: SolarIconsBold.gift, onTap: onGift, label: 'Gift', color: V.gold),
                    const SizedBox(width: 20),
                    RoundControl(icon: SolarIconsBold.gamepadMinimalistic, onTap: onPlay, label: 'Play', color: m.game != null ? V.lavender : Colors.white, tint: m.game != null ? V.violet : null),
                    const SizedBox(width: 20),
                    RoundControl(icon: Icons.call_end_rounded, size: 64, onTap: m.stop, label: 'End', background: const Color(0xFFE11D48)),
                    const SizedBox(width: 20),
                    RoundControl(icon: SolarIconsBold.menuDots, onTap: () => _showCallOptions(context, m, onReport), label: 'More'),
                  ],
                ),
                const SizedBox(height: 14),
                _Composer(m: m, controller: message),
              ],
            ),
          )
        else ...[
          // The rail: everything you can do for this person, one thumb away.
          Positioned(
            right: 12,
            bottom: bottom + 112,
            child: Column(
              children: [
                RoundControl(
                  size: 50,
                  icon: m.likedPartner ? SolarIconsBold.heart : SolarIconsOutline.heart,
                  color: m.likedPartner ? V.pink : Colors.white,
                  tint: m.likedPartner ? V.pink : null,
                  onTap: m.like,
                  label: m.likedPartner ? 'Liked' : 'Like',
                ),
                const SizedBox(height: 14),
                RoundControl(
                  size: 50,
                  icon: switch (friendState) {
                    FriendState.friends => SolarIconsBold.userCheckRounded,
                    FriendState.requested => SolarIconsBold.hourglass,
                    _ => SolarIconsBold.userPlusRounded,
                  },
                  onTap: friendState == FriendState.none || friendState == FriendState.incoming ? onAddFriend : null,
                  label: switch (friendState) {
                    FriendState.friends => 'Friends',
                    FriendState.requested => 'Sent',
                    FriendState.incoming => 'Accept',
                    _ => 'Add friend',
                  },
                  color: friendState == FriendState.friends ? V.ok : Colors.white,
                  tint: friendState == FriendState.incoming ? V.violet : null,
                ),
                const SizedBox(height: 14),
                RoundControl(size: 50, icon: SolarIconsBold.gift, onTap: onGift, label: 'Gift', color: V.gold),
                const SizedBox(height: 14),
                RoundControl(
                  size: 50,
                  icon: SolarIconsBold.gamepadMinimalistic,
                  onTap: onPlay,
                  label: 'Play',
                  color: m.game != null ? V.lavender : Colors.white,
                  tint: m.game != null ? V.violet : null,
                ),
                const SizedBox(height: 14),
                RoundControl(size: 50, icon: SolarIconsBold.menuDots, onTap: () => _showCallOptions(context, m, onReport), label: 'More'),
              ],
            ),
          ),
          // Chat and a game, bottom left, clear of the rail.
          Positioned(
            left: 12,
            right: 84,
            bottom: bottom + 96,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (m.game != null) ...[GameCard(m: m, round: m.game!), const SizedBox(height: 10)],
                _ChatOverlay(m: m, controller: chatScroll, maxHeight: m.game != null ? 84 : 168),
              ],
            ),
          ),
          Positioned(
            left: 12,
            right: 12,
            bottom: bottom + 22,
            child: Row(
              children: [
                Expanded(
                  child: _Composer(m: m, controller: message),
                ),
                const SizedBox(width: 10),
                _NextButton(m: m, onTap: onNext),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// Top: who you're with (opens their profile), how long, and Report.
class _CallTop extends StatelessWidget {
  const _CallTop({required this.m, required this.partner, required this.onReport});
  final MatchProvider m;
  final Profile partner;
  final VoidCallback onReport;

  @override
  Widget build(BuildContext context) {
    final p = partner;
    final glass = V.bg2.withValues(alpha: 0.52);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      child: Row(
        children: [
          Expanded(
            child: Row(
              children: [
                Flexible(
                  child: Semantics(
                    button: true,
                    label: "Open ${p.name}'s profile",
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () => showUserProfileSheet(context, p.id),
                      child: Glass(
                        radius: 999,
                        height: 46,
                        blur: 18,
                        color: glass,
                        border: Colors.white.withValues(alpha: 0.10),
                        padding: const EdgeInsets.only(left: 6, right: 14),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            VAvatar(url: p.avatarUrl, name: p.name, size: 34),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Flexible(
                                        child: Text(
                                          '${p.name}, ${p.age}',
                                          overflow: TextOverflow.ellipsis,
                                          style: VT.title(14.5, weight: FontWeight.w700),
                                        ),
                                      ),
                                      if (p.verified)
                                        const Padding(
                                          padding: EdgeInsets.only(left: 4),
                                          child: Icon(SolarIconsBold.verifiedCheck, size: 15, color: V.trust, semanticLabel: 'Verified'),
                                        ),
                                      if (p.vip)
                                        const Padding(
                                          padding: EdgeInsets.only(left: 4),
                                          child: Icon(SolarIconsBold.crown, size: 15, color: V.gold, semanticLabel: 'VIP'),
                                        ),
                                    ],
                                  ),
                                  Text(
                                    '${p.country.name} · Level ${p.level}',
                                    overflow: TextOverflow.ellipsis,
                                    style: VT.body(11.5, color: Colors.white.withValues(alpha: 0.75), height: 1.2),
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
                const SizedBox(width: 8),
                Glass(
                  radius: 999,
                  height: 32,
                  blur: 18,
                  color: glass,
                  border: Colors.white.withValues(alpha: 0.10),
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 7,
                        height: 7,
                        decoration: const BoxDecoration(shape: BoxShape.circle, color: V.bad),
                      ),
                      const SizedBox(width: 6),
                      Text(Fmt.clock(m.elapsed), style: VT.mono(12.5, color: V.text)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Semantics(
            button: true,
            label: 'Report',
            excludeSemantics: true,
            child: GestureDetector(
              onTap: onReport,
              child: Glass(
                radius: 999,
                height: 40,
                blur: 18,
                color: glass,
                border: Colors.white.withValues(alpha: 0.10),
                padding: EdgeInsets.zero,
                child: const SizedBox(width: 40, child: Icon(SolarIconsBold.flag, size: 21, color: V.bad)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// You, picture-in-picture. Camera off: your photo (what they see). Muted: a red mic to unmute.
class _SelfPip extends StatelessWidget {
  const _SelfPip({required this.m});
  final MatchProvider m;

  @override
  Widget build(BuildContext context) {
    final me = context.watch<SessionProvider>().me;
    return Container(
      width: 96,
      height: 136,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.22), width: 2),
        color: V.surface2,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 24, offset: const Offset(0, 8))],
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (m.hasLocalVideo && m.camOn)
            RTCVideoView(m.localRenderer, mirror: m.frontCamera, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)
          else if (me != null && me.avatarUrl.isNotEmpty)
            Opacity(
              opacity: 0.7,
              child: Image.network(
                me.avatarUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const Center(child: Icon(Icons.videocam_off_rounded, color: V.muted)),
              ),
            )
          else
            const Center(child: Icon(Icons.videocam_off_rounded, color: V.muted)),
          if (m.blurred) BackdropFilter(filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12), child: const SizedBox.expand()),
          if (!m.micOn)
            Positioned(
              left: 6,
              bottom: 6,
              child: Semantics(
                button: true,
                label: 'Unmute microphone',
                child: GestureDetector(
                  onTap: m.toggleMic,
                  child: Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: V.bg2.withValues(alpha: 0.7)),
                    child: const Icon(Icons.mic_off_rounded, size: 14, color: V.bad),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Quick reactions behind the smile: one tap sends.
const quickReactions = ['👋', '😂', '😍', '🔥', '👍', '🙏'];

/// "Say something…", with the smile for quick reactions; Send appears once you type.
class _Composer extends StatefulWidget {
  const _Composer({required this.m, required this.controller});
  final MatchProvider m;
  final TextEditingController controller;

  @override
  State<_Composer> createState() => _ComposerState();
}

class _ComposerState extends State<_Composer> {
  bool _quick = false;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_changed);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  void _send([String? value]) {
    final text = value ?? widget.controller.text;
    if (text.trim().isEmpty) return;
    widget.m.sendMessage(text);
    if (value == null) widget.controller.clear();
    setState(() => _quick = false);
  }

  @override
  Widget build(BuildContext context) {
    final typed = widget.controller.text.trim().isNotEmpty;
    final name = widget.m.partner?.name;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_quick) ...[
          Glass(
            radius: 999,
            blur: 18,
            color: V.bg2.withValues(alpha: 0.8),
            border: Colors.white.withValues(alpha: 0.10),
            padding: const EdgeInsets.all(6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final r in quickReactions)
                  Semantics(
                    button: true,
                    label: 'Send $r',
                    child: GestureDetector(
                      onTap: () => _send(r),
                      child: SizedBox.square(
                        dimension: 40,
                        child: Center(child: Text(r, style: const TextStyle(fontSize: 22))),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
        Glass(
          radius: 999,
          height: 52,
          blur: 18,
          color: V.bg2.withValues(alpha: 0.52),
          border: Colors.white.withValues(alpha: 0.10),
          padding: const EdgeInsets.only(left: 18, right: 8),
          child: Row(
            children: [
              Expanded(
                child: Semantics(
                  label: name == null ? 'Message' : 'Message $name',
                  child: TextField(
                    controller: widget.controller,
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
                    onSubmitted: (_) => _send(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              if (typed)
                Semantics(
                  button: true,
                  label: 'Send',
                  child: Material(
                    color: V.violet,
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: _send,
                      child: const SizedBox(width: 36, height: 36, child: Icon(SolarIconsBold.plain, size: 18, color: Colors.white)),
                    ),
                  ),
                )
              else
                Semantics(
                  button: true,
                  label: 'Quick reactions',
                  child: GestureDetector(
                    onTap: () => setState(() => _quick = !_quick),
                    child: SizedBox(width: 36, height: 36, child: Icon(SolarIconsOutline.smileCircle, size: 22, color: Colors.white.withValues(alpha: 0.75))),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// "More": camera, mic, their profile, then report, block and end.
void _showCallOptions(BuildContext context, MatchProvider m, VoidCallback onReport) {
  final name = m.partner?.name ?? 'They';
  final partnerId = m.partner?.id;
  void run(BuildContext ctx, VoidCallback fn) {
    Navigator.of(ctx).pop();
    fn();
  }

  showVibeSheet(
    context,
    child: Builder(
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 4, bottom: 14),
              child: Text('Call options', style: VT.title(18, weight: FontWeight.w700)),
            ),
            if (!m.voiceCall) _OptionRow(icon: SolarIconsBold.cameraRotate, title: 'Switch camera', onTap: () => run(ctx, () => m.switchCamera())),
            _OptionRow(icon: m.micOn ? Icons.mic_off_rounded : Icons.mic_rounded, title: m.micOn ? 'Mute my mic' : 'Unmute my mic', onTap: () => run(ctx, m.toggleMic)),
            if (!m.voiceCall)
              _OptionRow(
                icon: m.camOn ? Icons.videocam_off_rounded : SolarIconsBold.videocamera,
                title: m.camOn ? 'Turn my camera off' : 'Turn my camera on',
                subtitle: m.camOn ? '$name sees your photo instead' : null,
                onTap: () => run(ctx, m.toggleCam),
              ),
            if (partnerId != null) _OptionRow(icon: SolarIconsBold.eye, title: "See $name's profile", onTap: () => run(ctx, () => showUserProfileSheet(context, partnerId))),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 6),
              child: Divider(height: 1, color: V.lineSoft),
            ),
            _OptionRow(icon: SolarIconsBold.flag, title: 'Report', subtitle: 'Our team reviews every report', bad: true, onTap: () => run(ctx, onReport)),
            _OptionRow(icon: SolarIconsBold.forbiddenCircle, title: 'Block and end', subtitle: "You won't be matched again", bad: true, onTap: () => run(ctx, m.blockPartner)),
            _OptionRow(icon: SolarIconsBold.endCallRounded, title: 'End and go back', onTap: () => run(ctx, m.stop)),
          ],
        ),
      ),
    ),
  );
}

class _OptionRow extends StatelessWidget {
  const _OptionRow({required this.icon, required this.title, required this.onTap, this.subtitle, this.bad = false});
  final IconData icon;
  final String title;
  final String? subtitle;
  final bool bad;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fg = bad ? V.bad : V.text;
    return Semantics(
      button: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 13),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: bad ? V.bad.withValues(alpha: 0.12) : Colors.white.withValues(alpha: 0.05), borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, size: 21, color: bad ? V.bad : V.text2),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: VT.label(15, color: fg, weight: FontWeight.w600),
                    ),
                    if (subtitle != null) Text(subtitle!, style: VT.body(12, color: V.text2)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Next, as a pill beside the composer. In a cooldown it counts down and offers the skip.
class _NextButton extends StatelessWidget {
  const _NextButton({required this.m, required this.onTap});
  final MatchProvider m;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cd = m.cooldownSeconds;
    return Semantics(
      button: true,
      label: cd > 0 ? 'Next in $cd seconds, or skip the wait for ${Economy.skipCooldownBypassCost} coins' : 'Next person',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 52,
          padding: EdgeInsets.only(left: 14, right: cd > 0 ? 16 : 20),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            gradient: cd > 0 ? null : V.brand,
            color: cd > 0 ? V.surface3.withValues(alpha: 0.9) : null,
            border: cd > 0 ? Border.all(color: Colors.white.withValues(alpha: 0.10)) : null,
            boxShadow: cd > 0 ? null : [BoxShadow(color: V.pink.withValues(alpha: 0.4), blurRadius: 26, offset: const Offset(0, 10))],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: cd > 0
                ? [
                    Text('${cd}s', style: VT.mono(15, color: Colors.white)),
                    Text(' · ', style: VT.label(14, color: Colors.white.withValues(alpha: 0.6))),
                    Text(
                      'Skip ',
                      style: VT.label(14, color: Colors.white, weight: FontWeight.w700),
                    ),
                    CoinAmount(Economy.skipCooldownBypassCost, size: 13),
                  ]
                : [
                    const Icon(SolarIconsBold.skipNext, size: 26, color: Colors.white),
                    const SizedBox(width: 4),
                    Text(
                      'Next',
                      style: VT.label(15, color: Colors.white, weight: FontWeight.w700),
                    ),
                  ],
          ),
        ),
      ),
    );
  }
}

/// The in-call chat: frosted bubbles, the sender's name first, fading at the top.
class _ChatOverlay extends StatelessWidget {
  const _ChatOverlay({required this.m, required this.controller, this.maxHeight = 168});
  final MatchProvider m;
  final ScrollController controller;
  final double maxHeight;

  @override
  Widget build(BuildContext context) {
    final items = m.chat;
    if (items.isEmpty) return const SizedBox.shrink();
    final partner = m.partner?.name ?? 'Them';
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
            final text = c.gift != null ? '${c.gift!.emoji} ${c.text}' : c.text;
            final bubble = ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 250),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                    color: c.gift != null ? V.gold.withValues(alpha: 0.28) : (mine ? V.violet.withValues(alpha: 0.55) : V.bg2.withValues(alpha: 0.55)),
                    child: Text.rich(
                      TextSpan(
                        style: VT.body(13.5, color: Colors.white, height: 1.35),
                        children: [
                          TextSpan(
                            text: mine ? 'You' : partner,
                            style: TextStyle(fontWeight: FontWeight.w700, color: mine ? Colors.white : V.pinkSoft),
                          ),
                          TextSpan(text: ' $text'),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            );
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Align(
                alignment: Alignment.centerLeft,
                child: mine && c.hidden
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          bubble,
                          HiddenNote(color: Colors.white.withValues(alpha: 0.8), shadow: true),
                        ],
                      )
                    : bubble,
              ),
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
              decoration: const BoxDecoration(
                gradient: LinearGradient(colors: [Color(0xFF2B1B4D), V.bg], begin: Alignment.topCenter, end: Alignment.bottomCenter),
              ),
              alignment: Alignment.center,
              child: VAvatar(url: '', name: partner.name, size: 120, ring: true),
            ),
          ),
        // Over the video, not instead of it: their voice keeps playing.
        if (!m.partnerCamOn && !m.voiceCall) CameraOffCover(partner: partner),
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
    return ImageFiltered(
      imageFilter: ImageFilter.blur(sigmaX: blur, sigmaY: blur, tileMode: TileMode.clamp),
      child: video,
    );
  }
}

/// Small helper for a "Get VIP" nudge.
class VipNudge extends StatelessWidget {
  const VipNudge({super.key});
  @override
  Widget build(BuildContext context) {
    return GhostButton(
      label: 'Get VIP',
      icon: SolarIconsBold.crown,
      color: V.gold,
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const VipScreen())),
    );
  }
}
