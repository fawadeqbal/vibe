import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
import '../../services/app_services.dart';
import 'invite_share.dart';

enum ShareCardKind { level, streak, match }

/// What a share card says. First names only, never photos: the other
/// person didn't agree to be posted.
@immutable
class ShareCardData {
  const ShareCardData._(this.kind, {this.level = 0, this.days = 0, this.friend = '', this.me = ''});

  /// "I'm Level 12 on Vibe".
  const ShareCardData.level(int level, {String me = ''}) : this._(ShareCardKind.level, level: level, me: me);

  /// "Our 30-day streak 🔥" with a friend.
  const ShareCardData.streak(int days, {required String friend, String me = ''}) : this._(ShareCardKind.streak, days: days, friend: friend, me: me);

  /// "We vibed 💞" after a mutual like.
  const ShareCardData.match({required String friend, String me = ''}) : this._(ShareCardKind.match, friend: friend, me: me);

  final ShareCardKind kind;
  final int level;
  final int days;
  final String friend;
  final String me;

  String get friendFirst => firstNameOf(friend);

  /// `s=` on the link, so the partner/admin stats show which card works.
  String get channel => switch (kind) { ShareCardKind.level => 'card_level', ShareCardKind.streak => 'card_streak', ShareCardKind.match => 'card_match' };

  String get headline => switch (kind) {
        ShareCardKind.level => "I'm Level $level on Vibe",
        ShareCardKind.streak => 'Our $days-day streak 🔥',
        ShareCardKind.match => 'We vibed 💞',
      };

  /// The text that goes with the image (and alone when it can't render).
  String message(String link, int coins) => switch (kind) {
        ShareCardKind.level => "I'm Level $level on Vibe 🎉 Meet new people on video — join with my link and get $coins free coins: $link",
        ShareCardKind.streak => 'Our $days-day streak on Vibe 🔥${friendFirst.isEmpty ? '' : ' Me & $friendFirst'} — join with my link and get $coins free coins: $link',
        ShareCardKind.match => 'We vibed 💞 on Vibe${friendFirst.isEmpty ? '' : ' — me & $friendFirst'}. Meet someone new on video, get $coins free coins: $link',
      };
}

/// The branded card (360×450 logical; 1080×1350 PNG at 3×). Pure widget,
/// no network images, so it always renders the same.
class ShareCard extends StatelessWidget {
  const ShareCard({super.key, required this.data, required this.link, required this.coins});
  final ShareCardData data;
  final String link;
  final int coins;

  static const size = Size(360, 450);

  @override
  Widget build(BuildContext context) {
    return MediaQuery(
      data: const MediaQueryData(textScaler: TextScaler.noScaling),
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: SizedBox.fromSize(
          size: size,
          child: DecoratedBox(
            decoration: BoxDecoration(color: V.bg, borderRadius: BorderRadius.circular(28)),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(28),
              child: Stack(
                children: [
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(gradient: RadialGradient(center: const Alignment(0, -0.35), radius: 0.95, colors: [_glow.withValues(alpha: 0.32), const Color(0x000B0A10)])),
                    ),
                  ),
                  Positioned(
                    left: 0,
                    right: 0,
                    top: 0,
                    height: 4,
                    child: const DecoratedBox(decoration: BoxDecoration(gradient: V.brand)),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(26, 24, 26, 22),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const VibeLogo(size: 26, shadow: false),
                            const SizedBox(width: 8),
                            Text('Vibe', style: VT.title(17)),
                            const Spacer(),
                            Text('vibe.fawadiqbal.dev', style: VT.label(10.5, color: V.muted, weight: FontWeight.w500)),
                          ],
                        ),
                        Expanded(child: Center(child: _visual())),
                        _title(),
                        const SizedBox(height: 6),
                        Text(_subtitle, style: VT.body(13.5, color: V.text2)),
                        const SizedBox(height: 18),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                          decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: V.line)),
                          child: Row(
                            children: [
                              const CoinIcon(size: 18),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('Join me · get $coins free coins', style: VT.label(12.5, color: V.gold, weight: FontWeight.w700)),
                                    const SizedBox(height: 2),
                                    Text(link.replaceFirst(RegExp(r'^https?://'), '').replaceFirst(RegExp(r'\?.*$'), ''), maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.mono(11.5, color: V.text)),
                                  ],
                                ),
                              ),
                            ],
                          ),
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

  Color get _glow => switch (data.kind) { ShareCardKind.level => V.violet, ShareCardKind.streak => V.flame, ShareCardKind.match => V.pink };

  String get _subtitle => switch (data.kind) {
        ShareCardKind.level => 'Talking to new people every day.',
        ShareCardKind.streak => data.friendFirst.isEmpty ? 'Talking every single day.' : 'Me & ${data.friendFirst} · every single day.',
        ShareCardKind.match => data.friendFirst.isEmpty ? 'A stranger, then a friend.' : 'Me & ${data.friendFirst} · liked each other on Vibe.',
      };

  /// One serif word per card, the emotional one.
  Widget _title() {
    final (plain, accent, tail) = switch (data.kind) {
      ShareCardKind.level => ("I'm ", 'Level ${data.level}', ' on Vibe'),
      ShareCardKind.streak => ('Our ${data.days}-day ', 'streak', ' 🔥'),
      ShareCardKind.match => ('We ', 'vibed', ' 💞'),
    };
    return Text.rich(
      TextSpan(children: [
        TextSpan(text: plain, style: VT.display(30)),
        TextSpan(text: accent, style: VT.serif(36, color: data.kind == ShareCardKind.streak ? V.flame : V.pinkSoft)),
        TextSpan(text: tail, style: VT.display(30)),
      ]),
    );
  }

  Widget _visual() {
    switch (data.kind) {
      case ShareCardKind.level:
        return SizedBox(
          width: 150,
          height: 150,
          child: CustomPaint(
            painter: _CardRing(),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('LEVEL', style: VT.overline(color: V.lavender)),
                  Text('${data.level}', style: VT.number(60, color: V.text)),
                ],
              ),
            ),
          ),
        );
      case ShareCardKind.streak:
        return Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            const Icon(Icons.local_fire_department_rounded, size: 92, color: V.flame),
            Text('${data.days}', style: VT.number(84, color: V.text)),
          ],
        );
      case ShareCardKind.match:
        return SizedBox(
          width: 190,
          height: 110,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Positioned(left: 0, child: _initial(data.me.isEmpty ? 'Me' : data.me, V.violet)),
              Positioned(right: 0, child: _initial(data.friend, V.pink)),
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(shape: BoxShape.circle, color: V.bg, border: Border.all(color: V.line)),
                child: const Icon(Icons.favorite_rounded, color: V.pink, size: 24),
              ),
            ],
          ),
        );
    }
  }

  Widget _initial(String name, Color c) {
    final t = name.trim();
    final letter = t.isEmpty ? '?' : t.characters.first.toUpperCase();
    return Container(
      width: 100,
      height: 100,
      alignment: Alignment.center,
      decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [c, c.withValues(alpha: 0.55)], begin: Alignment.topLeft, end: Alignment.bottomRight), border: Border.all(color: V.bg, width: 4)),
      child: Text(letter, style: VT.display(42)),
    );
  }
}

class _CardRing extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final r = (Offset.zero & size).deflate(6);
    canvas.drawArc(r, 0, math.pi * 2, false, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..color = V.surface3);
    canvas.drawArc(
      r,
      -math.pi / 2,
      math.pi * 1.5,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 8
        ..strokeCap = StrokeCap.round
        ..shader = const SweepGradient(colors: [V.pink, V.violet, V.lavender]).createShader(r),
    );
  }

  @override
  bool shouldRepaint(_CardRing old) => false;
}

/// PNG bytes of whatever [key]'s [RepaintBoundary] shows; null when it
/// can't be rendered (not laid out yet, out of memory…).
Future<Uint8List?> renderBoundaryPng(GlobalKey key, {double pixelRatio = 3}) async {
  try {
    final ro = key.currentContext?.findRenderObject();
    if (ro is! RenderRepaintBoundary) return null;
    final image = await ro.toImage(pixelRatio: pixelRatio);
    try {
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      return data?.buffer.asUint8List();
    } finally {
      image.dispose();
    }
  } catch (_) {
    return null;
  }
}

/// Shows the card and shares it as an image with the text and your invite
/// link; plain text when the image can't be made or shared, the clipboard
/// as a last resort.
Future<void> showShareCardSheet(BuildContext context, ShareCardData data) {
  final link = inviteLinkFor(context, channel: data.channel);
  final coins = Economy.inviteeRewardCoins;
  return showVibeSheet<void>(context, scrollable: true, child: _ShareCardSheet(data: data, link: link, coins: coins));
}

class _ShareCardSheet extends StatefulWidget {
  const _ShareCardSheet({required this.data, required this.link, required this.coins});
  final ShareCardData data;
  final String link;
  final int coins;

  @override
  State<_ShareCardSheet> createState() => _ShareCardSheetState();
}

class _ShareCardSheetState extends State<_ShareCardSheet> {
  final _card = GlobalKey();
  bool _busy = false;

  Future<void> _share() async {
    setState(() => _busy = true);
    final share = context.read<AppServices>().share;
    final text = widget.data.message(widget.link, widget.coins);
    try {
      final png = await renderBoundaryPng(_card);
      var ok = png != null && await share.shareImage(png, text, fileName: 'vibe-${widget.data.channel.replaceAll('_', '-')}.png');
      if (!ok) ok = await share.shareText(text);
      if (!ok) {
        await Clipboard.setData(ClipboardData(text: text));
        if (mounted) toast(context, 'Copied — paste it anywhere');
      }
      if (mounted) Navigator.of(context).maybePop();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Show your friends', style: VT.title(18), textAlign: TextAlign.center),
          const SizedBox(height: 14),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 380),
            child: FittedBox(
              child: RepaintBoundary(
                key: _card,
                child: ShareCard(data: widget.data, link: widget.link, coins: widget.coins),
              ),
            ),
          ),
          const SizedBox(height: 16),
          GradientButton(label: 'Share', icon: Icons.ios_share_rounded, busy: _busy, onTap: _share),
          const SizedBox(height: 4),
          Text('Friends who join with your link get ${widget.coins} free coins.', textAlign: TextAlign.center, style: VT.body(12, color: V.muted)),
        ],
      ),
    );
  }
}
