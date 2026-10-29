import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
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
      barrierColor: Colors.black.withValues(alpha: 0.72),
      transitionDuration: const Duration(milliseconds: 220),
      pageBuilder: (ctx, _, _) => _MatchDialog(f: f),
      transitionBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: ScaleTransition(scale: Tween(begin: 0.94, end: 1.0).animate(CurvedAnimation(parent: a, curve: VMotion.out)), child: child)),
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

  @override
  Widget build(BuildContext context) {
    final f = widget.f;
    final me = context.watch<SessionProvider>().me;
    final first = f.profile.name.split(' ').first;
    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
            child: Material(
              color: Colors.transparent,
              child: Container(
                constraints: const BoxConstraints(maxWidth: 460),
                padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(32),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                  gradient: const RadialGradient(center: Alignment.topCenter, radius: 1.2, colors: [Color(0xFF3D1A45), V.surface], stops: [0, 0.62]),
                ),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Align(alignment: Alignment.topRight, child: CircleIconButton(icon: Icons.close_rounded, tooltip: 'Close', onTap: () => Navigator.of(context).pop())),
                      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Transform.rotate(angle: -0.1, child: VAvatar(url: me?.avatarUrl ?? '', name: me?.name ?? 'You', size: 104, border: V.surface)),
                        Transform.translate(offset: const Offset(-20, 0), child: Transform.rotate(angle: 0.1, child: VAvatar(url: f.profile.avatarUrl, name: f.profile.name, size: 104, border: V.surface))),
                      ]),
                      const SizedBox(height: 16),
                      Text.rich(
                        TextSpan(children: [TextSpan(text: "It's a ", style: VT.display(36)), TextSpan(text: 'match!', style: VT.serif(44, color: V.pinkSoft))]),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 4),
                      Text('You and $first liked each other.', textAlign: TextAlign.center, style: VT.body(15, color: V.text2)),
                      if (f.online) ...[
                        const SizedBox(height: 12),
                        Container(
                          height: 28,
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          decoration: BoxDecoration(color: V.ok.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(14)),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Container(width: 8, height: 8, decoration: const BoxDecoration(color: V.ok, shape: BoxShape.circle)),
                            const SizedBox(width: 8),
                            Text('$first is online now', style: VT.label(12.5, color: V.ok)),
                          ]),
                        ),
                      ],
                      const SizedBox(height: 24),
                      Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final o in matchOpeners(f, me?.interests ?? const []))
                            ActionChip(
                              label: Text(o, style: VT.label(13, color: V.text)),
                              backgroundColor: Colors.white.withValues(alpha: 0.06),
                              side: BorderSide(color: Colors.white.withValues(alpha: 0.14)),
                              shape: const StadiumBorder(),
                              onPressed: _busy ? null : () => _send(o),
                            ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(children: [
                        Expanded(
                          child: TextField(
                            controller: _text,
                            textInputAction: TextInputAction.send,
                            onSubmitted: _send,
                            style: VT.body(15),
                            decoration: InputDecoration(
                              hintText: 'Write your first message…',
                              filled: true,
                              fillColor: V.bg2,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(26), borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.12))),
                              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(26), borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.12))),
                              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(26), borderSide: BorderSide(color: V.pink.withValues(alpha: 0.6))),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Semantics(
                          button: true,
                          label: 'Send',
                          child: GestureDetector(
                            onTap: () => _send(_text.text),
                            child: Container(
                              width: 52,
                              height: 52,
                              decoration: BoxDecoration(gradient: V.brand, shape: BoxShape.circle, boxShadow: [BoxShadow(color: V.pink.withValues(alpha: 0.32), blurRadius: 30, offset: const Offset(0, 10))]),
                              child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                            ),
                          ),
                        ),
                      ]),
                      const SizedBox(height: 8),
                      TextButton(onPressed: () => Navigator.of(context).pop(), child: Text('Keep swiping', style: VT.label(14, color: V.text2))),
                      Text('Chat is open now. Video calls stay off until you both allow them in the chat.', textAlign: TextAlign.center, style: VT.body(12, color: V.muted, height: 1.45)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
