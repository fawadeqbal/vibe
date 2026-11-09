import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/calls.dart';
import '../../models/models.dart';
import '../../providers/calls_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/social_provider.dart';
import '../social/chat_screen.dart';

/// Openers that fit anyone, plus one from a shared interest.
List<String> matchOpeners(Friend f, List<String> mine) {
  final first = f.profile.name.split(' ').first;
  String? shared;
  for (final i in f.profile.interests) {
    if (mine.contains(i)) {
      shared = i;
      break;
    }
  }
  return ['Hey $first! 👋', shared != null ? "You're into $shared too?" : "How's your day going?", 'What brings you to Vibe?'];
}

/// "It's a match!" — messaging only: the chat is open, and video calls stay
/// off until you both allow them in the chat. Resolves when closed.
Future<void> showMatchDialog(BuildContext context, Friend f) => showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Close',
      barrierColor: V.bg,
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (ctx, _, _) => _MatchDialog(f: f),
      transitionBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
    );

class _MatchDialog extends StatefulWidget {
  const _MatchDialog({required this.f});
  final Friend f;

  @override
  State<_MatchDialog> createState() => _MatchDialogState();
}

class _MatchDialogState extends State<_MatchDialog> {
  final _text = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _send(String msg) async {
    final t = msg.trim();
    if (t.isEmpty || _busy) return;
    setState(() => _busy = true);
    final nav = Navigator.of(context);
    try {
      await context.read<SocialProvider>().sendMessage(widget.f.profile.id, t);
      nav.pop();
      await nav.push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: widget.f.profile.id)));
    } on ApiException catch (e) {
      if (mounted) {
        toast(context, e.message, error: true);
        setState(() => _busy = false);
      }
    }
  }

  /// Calls are off until you both allow them in the chat: there you can ask.
  void _videoCall() {
    final f = widget.f;
    final nav = Navigator.of(context);
    nav.pop();
    if (f.calls.on && f.calls.video) {
      unawaited(context.read<CallsProvider>().ring(f.profile, CallMedia.video));
    } else {
      unawaited(nav.push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: f.profile.id))));
    }
  }

  Widget _photo(String url, String name, double angle) => Transform.rotate(
        angle: angle,
        child: Container(
          width: 140,
          height: 180,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: V.bg, width: 3),
            color: V.surface,
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 30, offset: const Offset(0, 14))],
          ),
          child: url.startsWith('http')
              ? Image.network(url, fit: BoxFit.cover, semanticLabel: name, errorBuilder: (_, _, _) => const ColoredBox(color: V.surface))
              : DecoratedBox(
                  decoration: const BoxDecoration(gradient: V.brand),
                  child: Center(child: Text(name.isEmpty ? '?' : name[0].toUpperCase(), style: VT.display(56, color: Colors.white.withValues(alpha: 0.6)))),
                ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final f = widget.f;
    final me = context.watch<SessionProvider>().me;
    final first = f.profile.name.split(' ').first;
    final mine = me?.interests ?? const <String>[];
    final both = f.profile.interests.where(mine.contains).take(2).toList();
    final pad = MediaQuery.of(context).padding;
    return Material(
      color: Colors.transparent,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: RadialGradient(center: Alignment(0, -0.5), radius: 0.9, colors: [Color(0x59FF3D8F), Color(0x2E8B5CF6), V.bg], stops: [0, 0.45, 0.85]),
        ),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Padding(
              padding: EdgeInsets.fromLTRB(20, pad.top, 20, pad.bottom + 26 + MediaQuery.of(context).viewInsets.bottom),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Align(
                    alignment: Alignment.centerRight,
                    child: Padding(padding: const EdgeInsets.only(top: 12), child: CircleIconButton(icon: Icons.close_rounded, tooltip: 'Keep discovering', onTap: () => Navigator.of(context).pop())),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    height: 210,
                    child: Stack(
                      alignment: Alignment.topCenter,
                      children: [
                        Positioned(top: 20, left: 0, right: 140, child: Center(child: _photo(me?.avatarUrl ?? '', me?.name ?? 'You', -0.14))),
                        Positioned(top: 6, left: 140, right: 0, child: Center(child: _photo(f.profile.avatarUrl, f.profile.name, 0.12))),
                        Positioned(
                          top: 150,
                          child: Container(
                            width: 56,
                            height: 56,
                            decoration: BoxDecoration(shape: BoxShape.circle, gradient: V.brand, boxShadow: [BoxShadow(color: V.pink.withValues(alpha: 0.5), blurRadius: 22, offset: const Offset(0, 8))]),
                            child: const Icon(SolarIconsBold.heart, size: 28, color: Colors.white),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 26),
                  const Headline("It's a ", accent: 'match!', size: 34, accentColor: V.pinkSoft, textAlign: TextAlign.center),
                  const SizedBox(height: 4),
                  Text(
                    'You and $first liked each other.${both.isEmpty ? '' : ' You both like ${both.join(' and ')}.'}',
                    textAlign: TextAlign.center,
                    style: VT.body(14.5, color: V.text2),
                  ),
                  if (f.online) ...[
                    const SizedBox(height: 12),
                    Center(
                      child: Container(
                        height: 28,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(color: V.ok.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(999)),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          const OnlineDot(),
                          const SizedBox(width: 8),
                          Text('$first is online now', style: VT.label(12.5, color: V.ok, weight: FontWeight.w600)),
                        ]),
                      ),
                    ),
                  ],
                  const Spacer(),
                  Text('SAY SOMETHING FIRST', style: VT.overline(color: V.muted)),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 36,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: [
                        for (final o in matchOpeners(f, mine))
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: GestureDetector(
                              onTap: _busy ? null : () => _send(o),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14),
                                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.06), border: Border.all(color: Colors.white.withValues(alpha: 0.14)), borderRadius: BorderRadius.circular(999)),
                                child: Center(widthFactor: 1, child: Text(o, style: VT.label(13.5, color: V.text, weight: FontWeight.w600))),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    height: 52,
                    padding: const EdgeInsets.only(left: 18, right: 6),
                    decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(999), border: Border.all(color: V.line)),
                    child: Row(children: [
                      Expanded(
                        child: TextField(
                          controller: _text,
                          style: VT.body(15),
                          textInputAction: TextInputAction.send,
                          onSubmitted: _send,
                          decoration: InputDecoration(
                            hintText: 'Write your first message…',
                            hintStyle: VT.body(15, color: V.muted),
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            filled: false,
                            isDense: true,
                            contentPadding: EdgeInsets.zero,
                          ),
                        ),
                      ),
                      Semantics(
                        button: true,
                        label: 'Send',
                        child: GestureDetector(
                          onTap: () => _send(_text.text),
                          child: Container(width: 40, height: 40, decoration: const BoxDecoration(shape: BoxShape.circle, gradient: V.brand), child: const Icon(SolarIconsBold.plain, size: 19, color: Colors.white)),
                        ),
                      ),
                    ]),
                  ),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(child: GhostButton(label: 'Video call', icon: SolarIconsBold.videocamera, height: 48, expand: true, onTap: _videoCall)),
                    const SizedBox(width: 10),
                    Expanded(child: GhostButton(label: 'Keep discovering', height: 48, expand: true, onTap: () => Navigator.of(context).pop())),
                  ]),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
