import 'dart:async';

import 'package:flutter/material.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
import '../../providers/match_provider.dart';

String _two(int n) => n.toString().padLeft(2, '0');

/// 65 → "01:05"; 3700 → "1:01:40".
String callClock(int seconds) {
  final s = seconds < 0 ? 0 : seconds;
  if (s >= 3600) return '${s ~/ 3600}:${_two((s % 3600) ~/ 60)}:${_two(s % 60)}';
  return '${_two(s ~/ 60)}:${_two(s % 60)}';
}

/// "23:41:05" under a day, "2 days 4h" beyond.
String pausedFor(int seconds) {
  final s = seconds < 0 ? 0 : seconds;
  if (s < 86400) return callClock(s);
  final d = s ~/ 86400;
  final h = (s % 86400) ~/ 3600;
  return '$d ${d == 1 ? 'day' : 'days'}${h > 0 ? ' ${h}h' : ''}';
}

// ── In a call ──────────────────────────────────────────────────────────────

/// The partner turned their camera off: their photo, dimmed, and a plain line.
/// Sits over the video (their voice keeps playing).
class CameraOffCover extends StatelessWidget {
  const CameraOffCover({super.key, required this.partner});
  final Profile partner;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        color: V.bg.withValues(alpha: 0.86),
        padding: const EdgeInsets.symmetric(horizontal: 24),
        alignment: Alignment.center,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                VAvatar(url: partner.avatarUrl, name: partner.name, size: 112, ring: true),
                Positioned(
                  right: -4,
                  bottom: -4,
                  child: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: V.surface2,
                      shape: BoxShape.circle,
                      border: Border.all(color: V.bg, width: 4),
                    ),
                    child: const Icon(Icons.videocam_off_rounded, size: 20, color: V.text2),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              '${partner.name} turned their camera off',
              textAlign: TextAlign.center,
              style: VT.title(19, weight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              'You can still talk and chat. It comes back when they turn it on.',
              textAlign: TextAlign.center,
              style: VT.body(13.5, color: V.text2),
            ),
          ],
        ),
      ),
    );
  }
}

/// Their mic is off, or the line is weak: small notes under the name.
class PartnerMediaPills extends StatelessWidget {
  const PartnerMediaPills({super.key, required this.m, required this.name});
  final MatchProvider m;
  final String name;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (m.weakSignal) ...[
          const SizedBox(height: 8),
          Semantics(
            liveRegion: true,
            child: GlassPill(label: 'Weak connection — video may freeze', icon: Icons.signal_cellular_alt_1_bar_rounded, iconColor: V.gold, height: 30, fontSize: 12),
          ),
        ],
        if (!m.partnerMicOn) ...[
          const SizedBox(height: 8),
          Semantics(
            liveRegion: true,
            child: GlassPill(label: '$name muted their mic', icon: Icons.mic_off_rounded, height: 30, fontSize: 12),
          ),
        ],
      ],
    );
  }
}

// ── Searching: only the two of you ─────────────────────────────────────────

/// "Just you and Sara here": when you'll meet again, call now, or keep waiting.
class RematchSoonCard extends StatefulWidget {
  const RematchSoonCard({super.key, required this.m, required this.onCallNow});
  final MatchProvider m;
  final VoidCallback onCallNow;

  @override
  State<RematchSoonCard> createState() => _RematchSoonCardState();
}

class _RematchSoonCardState extends State<RematchSoonCard> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final soon = widget.m.rematchSoon!;
    final name = soon.name.isEmpty ? 'them' : soon.name;
    final at = soon.at;
    final left = at == null ? null : (at.difference(DateTime.now()).inMilliseconds / 1000).ceil();
    final when = left == null
        ? "We'll keep looking for someone new."
        : left > 0
        ? "We'll put you two back together in ${callClock(left)} if nobody new comes."
        : 'Putting you back together…';
    final price = widget.m.reconnectPrice;
    return Glass(
      radius: 24,
      color: V.bg2.withValues(alpha: 0.7),
      border: Colors.white.withValues(alpha: 0.1),
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          VAvatar(url: soon.avatarUrl, name: name, size: 56, ring: true),
          const SizedBox(height: 12),
          Text(
            'Just you and $name here',
            textAlign: TextAlign.center,
            style: VT.title(18, weight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(
            'Nobody else is looking right now. $when',
            textAlign: TextAlign.center,
            style: VT.body(13.5, color: V.text2, height: 1.5),
          ),
          const SizedBox(height: 16),
          GradientButton(
            label: 'Call $name now',
            icon: SolarIconsBold.videocamera,
            onTap: widget.onCallNow,
            trailing: price == 0
                ? Text(
                    'Free',
                    style: VT.label(11, color: Colors.white, weight: FontWeight.w700),
                  )
                : CoinAmount(price, size: 12),
          ),
          TextButton(
            onPressed: widget.m.dismissRematchSoon,
            child: Text('Wait for new people', style: VT.label(14, color: V.text2)),
          ),
        ],
      ),
    );
  }
}

// ── Account paused ─────────────────────────────────────────────────────────

const _rules = [
  (Icons.sentiment_satisfied_rounded, 'Be kind — no insults or hate'),
  (Icons.checkroom_rounded, 'Keep it clean — clothes on, nothing sexual'),
  (Icons.block_rounded, 'No ads, selling or asking for money'),
  (Icons.cake_rounded, 'Everyone here is 18 or older'),
];

/// Matching is paused after reports: a live countdown, the rules in plain
/// words, "Go to my chats", and "Think this is a mistake? Tell us".
class AccountPausedView extends StatefulWidget {
  const AccountPausedView({super.key, required this.m, required this.until, required this.onOpenChats});
  final MatchProvider m;
  final DateTime until;
  final VoidCallback onOpenChats;

  @override
  State<AccountPausedView> createState() => _AccountPausedViewState();
}

class _AccountPausedViewState extends State<AccountPausedView> {
  Timer? _tick;
  String? _appeal;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (!widget.until.isAfter(DateTime.now())) {
        widget.m.clearPaused();
      } else {
        setState(() {});
      }
    });
    widget.m.appealStatus().then((s) {
      if (mounted) setState(() => (_appeal = s, _loaded = true));
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _tellUs() async {
    final sent = await showVibeSheet<bool>(context, child: AppealSheet(send: widget.m.sendAppeal));
    if (sent == true && mounted) setState(() => _appeal = 'OPEN');
  }

  @override
  Widget build(BuildContext context) {
    final left = (widget.until.difference(DateTime.now()).inMilliseconds / 1000).ceil();
    return ColoredBox(
      color: V.bg,
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 28, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(color: V.gold.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(22)),
                  child: const Icon(SolarIconsBold.pauseCircle, size: 34, color: V.gold),
                ),
              ),
              const SizedBox(height: 16),
              const Headline('Your account is ', accent: 'paused', accentColor: V.gold, size: 28),
              const SizedBox(height: 8),
              Text('A few people reported your recent calls, so matching is off for a while. Your chats and friends still work.', style: VT.body(14.5, color: V.text2, height: 1.55)),
              const SizedBox(height: 20),
              Semantics(
                label: 'Back in ${pausedFor(left)}',
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    color: V.gold.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: V.gold.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(SolarIconsBold.clockCircle, size: 22, color: V.gold),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Matching is back in', style: VT.label(12, color: V.text2)),
                            Text(
                              pausedFor(left),
                              style: VT.title(26, color: V.gold, weight: FontWeight.w700),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Text("So it doesn't happen again", style: VT.title(15, weight: FontWeight.w700)),
              const SizedBox(height: 10),
              for (final (icon, text) in _rules)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(16)),
                  child: Row(
                    children: [
                      Icon(icon, size: 20, color: V.lavender),
                      const SizedBox(width: 12),
                      Expanded(child: Text(text, style: VT.body(14))),
                    ],
                  ),
                ),
              const SizedBox(height: 20),
              GradientButton(label: 'Go to my chats', icon: SolarIconsBold.chatRound, onTap: widget.onOpenChats),
              const SizedBox(height: 4),
              if (_loaded && _appeal == null)
                TextButton(
                  onPressed: _tellUs,
                  child: Text('Think this is a mistake? Tell us', style: VT.label(14, color: V.text2)),
                )
              else if (_appeal == 'OPEN')
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(
                    "We got your message — a person will look at it soon.",
                    textAlign: TextAlign.center,
                    style: VT.body(13, color: V.text2),
                  ),
                )
              else if (_appeal == 'REJECTED')
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(
                    'We looked again, and the pause stays this time.',
                    textAlign: TextAlign.center,
                    style: VT.body(13, color: V.text2),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Tell us what happened": pops true once sent.
class AppealSheet extends StatefulWidget {
  const AppealSheet({super.key, required this.send});
  final Future<void> Function(String message) send;

  @override
  State<AppealSheet> createState() => _AppealSheetState();
}

class _AppealSheetState extends State<AppealSheet> {
  final _text = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => (_busy = true, _error = null));
    try {
      await widget.send(_text.text.trim());
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ready = _text.text.trim().length >= 10 && !_busy;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Tell us what happened', style: VT.title(22, weight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text("A real person on our team reads every message. If we got it wrong, we'll lift the pause.", style: VT.body(14, color: V.text2, height: 1.5)),
          const SizedBox(height: 16),
          TextField(
            controller: _text,
            maxLines: 5,
            maxLength: 1000,
            onChanged: (_) => setState(() {}),
            style: VT.body(15),
            decoration: InputDecoration(
              hintText: 'For example: I was only saying hi, I think someone reported me by mistake.',
              errorText: _error,
              filled: true,
              fillColor: V.surface2,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 8),
          GradientButton(label: 'Send', icon: SolarIconsBold.plain, busy: _busy, onTap: ready ? _send : null),
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text('Cancel', style: VT.label(14, color: V.text2)),
          ),
        ],
      ),
    );
  }
}
