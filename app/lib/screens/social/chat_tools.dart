import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
import '../../providers/social_provider.dart';

/// Colour emoji first wherever the platform has them.
const emojiFonts = ['Apple Color Emoji', 'Noto Color Emoji', 'NotoColorEmoji', 'Segoe UI Emoji'];

/// The six one-tap reactions (long-press a message).
const quickReactions = ['❤️', '😂', '😮', '😢', '🙏', '👍'];

const _emojiGroups = <(String, List<String>)>[
  (
    'Smileys',
    [
      '😀',
      '😃',
      '😄',
      '😁',
      '😆',
      '😅',
      '🤣',
      '😂',
      '🙂',
      '😉',
      '😊',
      '😇',
      '🥰',
      '😍',
      '🤩',
      '😘',
      '😋',
      '😛',
      '😜',
      '🤪',
      '🤗',
      '🤭',
      '🤔',
      '😐',
      '😏',
      '😒',
      '🙄',
      '😬',
      '😌',
      '😔',
      '😴',
      '🥳',
      '😎',
      '🥹',
      '😭',
      '😤',
      '😡',
      '🤯',
      '😳',
      '🥺',
    ],
  ),
  ('Love', ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💖', '💗', '💓', '💕', '💞', '💘', '💝', '💌', '😻', '🌹', '💐', '🫶', '💋', '💯', '✨']),
  ('Hands', ['👍', '👎', '👏', '🙌', '🙏', '🤝', '✌️', '🤞', '🤟', '🤙', '👋', '👌', '💪', '✋', '👊', '🫡', '🤌', '☝️', '👀', '🫣']),
  ('Food', ['☕', '🍵', '🧋', '🍕', '🍔', '🍟', '🌮', '🍜', '🍩', '🍰', '🧁', '🍫', '🍦', '🍿', '🥭', '🍉', '🍓', '🍌', '🥤', '🍽️']),
  ('Fun', ['🎉', '🎂', '🎁', '🎮', '🎵', '🎧', '🎤', '🎬', '📸', '⚽', '🏏', '🏆', '✈️', '🏔️', '🏖️', '🚗', '🌙', '⭐', '🌸', '🔥']),
];
const _recentKey = 'vibe.recentEmoji';

/// Emoji under the composer: Recent first, then groups.
class EmojiPanel extends StatefulWidget {
  const EmojiPanel({super.key, required this.onPick});
  final ValueChanged<String> onPick;

  @override
  State<EmojiPanel> createState() => _EmojiPanelState();
}

class _EmojiPanelState extends State<EmojiPanel> {
  List<String> _recent = const [];
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance()
        .then((p) {
          if (mounted) setState(() => _recent = p.getStringList(_recentKey) ?? const []);
        })
        .catchError((_) {});
  }

  void _pick(String e) {
    widget.onPick(e);
    final next = [e, ..._recent.where((x) => x != e)].take(16).toList();
    SharedPreferences.getInstance().then((p) => p.setStringList(_recentKey, next)).catchError((_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final groups = [if (_recent.isNotEmpty) ('Recent', _recent), ..._emojiGroups];
    final tab = _tab.clamp(0, groups.length - 1);
    return Container(
      height: 248,
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 4),
      decoration: BoxDecoration(
        color: V.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: V.line),
      ),
      child: Column(
        children: [
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              children: [
                for (final (i, g) in groups.indexed)
                  Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: ChoiceChip(
                      label: Text(g.$1, style: VT.label(12, color: i == tab ? V.text : V.muted)),
                      selected: i == tab,
                      showCheckmark: false,
                      visualDensity: VisualDensity.compact,
                      side: BorderSide.none,
                      backgroundColor: Colors.transparent,
                      selectedColor: V.surface3,
                      onSelected: (_) => setState(() => _tab = i),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: GridView.count(
              crossAxisCount: 8,
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
              children: [
                for (final e in groups[tab].$2)
                  InkResponse(
                    onTap: () => _pick(e),
                    radius: 22,
                    child: Center(child: Text(e, style: const TextStyle(fontSize: 24, fontFamilyFallback: emojiFonts))),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// What the long-press menu picked.
sealed class MessageAction {
  const MessageAction();
}

class ReactAction extends MessageAction {
  const ReactAction(this.emoji);
  final String emoji;
}

enum SimpleAction { reply, copy, unsend, report }

class PlainAction extends MessageAction {
  const PlainAction(this.action);
  final SimpleAction action;
}

/// Long-press a message: react, reply, copy, unsend (yours, for a few
/// minutes), report (theirs).
Future<MessageAction?> showMessageMenu(BuildContext context, ChatMessage m) {
  final copyable = m.kind == MessageKind.text && !m.unsent;
  return showVibeSheet<MessageAction>(
    context,
    child: Builder(
      builder: (ctx) {
        Widget row(IconData icon, String label, SimpleAction a, {bool bad = false}) => ListTile(
          leading: Icon(icon, size: 22, color: bad ? V.bad : V.text2),
          title: Text(
            label,
            style: VT.title(15, color: bad ? V.bad : V.text, weight: FontWeight.w500),
          ),
          onTap: () => Navigator.of(ctx).pop(PlainAction(a)),
        );
        return Material(
          type: MaterialType.transparency,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!m.unsent && m.kind != MessageKind.system)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        for (final e in quickReactions)
                          Semantics(
                            button: true,
                            selected: m.reactionMine == e,
                            label: 'React $e',
                            child: GestureDetector(
                              onTap: () => Navigator.of(ctx).pop(ReactAction(e)),
                              child: Container(
                                width: 46,
                                height: 46,
                                decoration: BoxDecoration(shape: BoxShape.circle, color: m.reactionMine == e ? V.violet.withValues(alpha: 0.3) : V.surface2),
                                alignment: Alignment.center,
                                child: Text(e, style: const TextStyle(fontSize: 24, fontFamilyFallback: emojiFonts)),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                if (!m.unsent) row(Icons.reply_rounded, 'Reply', SimpleAction.reply),
                if (copyable) row(SolarIconsOutline.copy, 'Copy', SimpleAction.copy),
                if (SocialProvider.canUnsend(m)) row(SolarIconsOutline.undoLeftRound, 'Unsend', SimpleAction.unsend, bad: true),
                if (!m.fromMe) row(SolarIconsOutline.flag, 'Report', SimpleAction.report, bad: true),
              ],
            ),
          ),
        );
      },
    ),
  );
}

/// Copies a message's text.
Future<void> copyMessage(BuildContext context, ChatMessage m) async {
  await Clipboard.setData(ClipboardData(text: m.text));
  if (context.mounted) toast(context, 'Copied');
}

/// The quoted message at the top of a reply bubble (and above the composer).
class ReplyQuote extends StatelessWidget {
  const ReplyQuote({super.key, required this.quote, required this.friendName, this.onMine = false, this.onClose});
  final ReplyRef quote;
  final String friendName;

  /// Drawn inside your own (violet) bubble.
  final bool onMine;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final who = quote.fromMe ? 'You' : friendName.split(' ').first;
    final fg = onMine ? Colors.white : V.text;
    return Container(
      margin: onClose == null ? const EdgeInsets.only(bottom: 6) : null,
      padding: const EdgeInsets.fromLTRB(10, 6, 6, 6),
      decoration: BoxDecoration(
        color: onMine ? Colors.white.withValues(alpha: 0.14) : V.bg2.withValues(alpha: onClose == null ? 0.6 : 1),
        borderRadius: BorderRadius.circular(12),
        border: Border(left: BorderSide(color: onMine ? Colors.white70 : V.pink, width: 3)),
      ),
      child: Row(
        mainAxisSize: onClose == null ? MainAxisSize.min : MainAxisSize.max,
        children: [
          Flexible(
            fit: onClose == null ? FlexFit.loose : FlexFit.tight,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  onClose != null ? 'Replying to $who' : who,
                  style: VT.label(11.5, color: onMine ? Colors.white : V.pinkSoft, weight: FontWeight.w700),
                ),
                Text(
                  quote.unsent ? 'Message unsent' : quote.preview,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: VT.body(12.5, color: fg.withValues(alpha: 0.8)),
                ),
              ],
            ),
          ),
          if (onClose != null)
            IconButton(
              tooltip: 'Cancel reply',
              visualDensity: VisualDensity.compact,
              onPressed: onClose,
              icon: const Icon(Icons.close_rounded, size: 18, color: V.muted),
            ),
        ],
      ),
    );
  }
}

/// A photo in the chat. Theirs show blurred until tapped (safety); tap
/// again for full size.
class PhotoBubble extends StatefulWidget {
  const PhotoBubble({super.key, required this.m});
  final ChatMessage m;

  @override
  State<PhotoBubble> createState() => _PhotoBubbleState();
}

class _PhotoBubbleState extends State<PhotoBubble> {
  bool _shown = false;

  ImageProvider? get _image {
    final bytes = widget.m.localBytes;
    if (bytes != null) return MemoryImage(bytes);
    final url = widget.m.mediaUrl;
    return url == null ? null : NetworkImage(url);
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.m;
    final shown = m.fromMe || _shown;
    final w = (m.meta?['w'] as num?)?.toDouble();
    final h = (m.meta?['h'] as num?)?.toDouble();
    final ratio = w != null && h != null && w > 0 && h > 0 ? (w / h).clamp(0.6, 1.6) : 0.8;
    final img = _image;
    return Semantics(
      button: true,
      label: m.fromMe ? 'Your photo' : (shown ? 'Photo' : 'Photo, tap to view'),
      child: GestureDetector(
        onTap: img == null
            ? null
            : () {
                if (!shown) {
                  setState(() => _shown = true);
                  return;
                }
                Navigator.of(context).push(
                  PageRouteBuilder(
                    opaque: false,
                    barrierColor: Colors.black,
                    pageBuilder: (ctx, _, _) => GestureDetector(
                      onTap: () => Navigator.of(ctx).pop(),
                      child: Scaffold(
                        backgroundColor: Colors.black,
                        body: Center(
                          child: InteractiveViewer(child: Image(image: img)),
                        ),
                      ),
                    ),
                  ),
                );
              },
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: SizedBox(
            width: 220,
            child: AspectRatio(
              aspectRatio: ratio,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (img == null)
                    Container(
                      color: V.surface3,
                      child: const Icon(SolarIconsOutline.gallery, color: V.muted),
                    )
                  else
                    ImageFiltered(
                      enabled: !shown,
                      imageFilter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
                      child: Opacity(
                        opacity: m.pending ? 0.6 : 1,
                        child: Image(
                          image: img,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => Container(color: V.surface3),
                        ),
                      ),
                    ),
                  if (!shown)
                    Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.45), borderRadius: BorderRadius.circular(14)),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(SolarIconsOutline.eye, size: 16, color: Colors.white),
                            const SizedBox(width: 6),
                            Flexible(child: Text('Photo · tap to view', overflow: TextOverflow.ellipsis, style: VT.label(12, color: Colors.white))),
                          ],
                        ),
                      ),
                    ),
                  if (m.pending)
                    const Center(
                      child: SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white)),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A voice note: play / pause, a little waveform, and the length.
class VoiceNoteBubble extends StatefulWidget {
  const VoiceNoteBubble({super.key, required this.m});
  final ChatMessage m;

  @override
  State<VoiceNoteBubble> createState() => _VoiceNoteBubbleState();
}

class _VoiceNoteBubbleState extends State<VoiceNoteBubble> {
  AudioPlayer? _player;
  final List<StreamSubscription> _subs = [];
  bool _playing = false;
  Duration _pos = Duration.zero;

  static const _bars = [6, 10, 16, 9, 20, 14, 8, 18, 12, 22, 10, 6, 14, 18, 9, 12, 20, 8, 6, 12, 16, 10, 7, 5];

  int get _seconds => (widget.m.meta?['seconds'] as num?)?.toInt() ?? 0;

  Future<void> _toggle() async {
    final p = _player ??= _makePlayer();
    try {
      if (_playing) {
        await p.pause();
        return;
      }
      if (_pos > Duration.zero && p.state == PlayerState.paused) {
        await p.resume();
        return;
      }
      final bytes = widget.m.localBytes;
      final url = widget.m.mediaUrl;
      if (bytes != null) {
        await p.play(BytesSource(bytes));
      } else if (url != null) {
        await p.play(UrlSource(url));
      }
    } catch (_) {
      if (mounted) toast(context, "Couldn't play this voice message", error: true);
    }
  }

  AudioPlayer _makePlayer() {
    final p = AudioPlayer();
    _subs
      ..add(
        p.onPlayerStateChanged.listen((s) {
          if (mounted) setState(() => _playing = s == PlayerState.playing);
        }),
      )
      ..add(
        p.onPositionChanged.listen((d) {
          if (mounted) setState(() => _pos = d);
        }),
      )
      ..add(
        p.onPlayerComplete.listen((_) {
          if (mounted) setState(() => _pos = Duration.zero);
        }),
      );
    return p;
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mine = widget.m.fromMe;
    final fg = mine ? Colors.white : V.text;
    final secs = _seconds;
    final progress = secs > 0 ? (_pos.inMilliseconds / (secs * 1000)).clamp(0.0, 1.0) : 0.0;
    final shownSecs = _pos > Duration.zero ? _pos.inSeconds : secs;
    return SizedBox(
      width: 220,
      child: Row(
        children: [
          Semantics(
            button: true,
            label: _playing ? 'Pause voice message' : 'Play voice message',
            excludeSemantics: true,
            child: GestureDetector(
              onTap: widget.m.pending ? null : _toggle,
              child: Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(shape: BoxShape.circle, color: mine ? Colors.white.withValues(alpha: 0.2) : V.violet),
                child: widget.m.pending
                    ? const Padding(
                        padding: EdgeInsets.all(9),
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Icon(_playing ? Icons.pause_rounded : Icons.play_arrow_rounded, color: Colors.white, size: 22),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: SizedBox(
              height: 24,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  for (final (i, b) in _bars.indexed)
                    Expanded(
                      child: Center(
                        child: Container(
                          width: 2.5,
                          height: b.toDouble(),
                          decoration: BoxDecoration(borderRadius: BorderRadius.circular(2), color: (i / _bars.length) < progress ? fg : fg.withValues(alpha: 0.35)),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text('${shownSecs ~/ 60}:${(shownSecs % 60).toString().padLeft(2, '0')}', style: VT.label(11.5, color: fg.withValues(alpha: 0.85))),
        ],
      ),
    );
  }
}

/// Recording a voice note: a red dot, the time, cancel and send.
class RecordingBar extends StatelessWidget {
  const RecordingBar({super.key, required this.seconds, required this.max, required this.onCancel, required this.onSend});
  final int seconds;
  final int max;
  final VoidCallback onCancel;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 52,
      padding: const EdgeInsets.only(left: 6, right: 6),
      decoration: BoxDecoration(
        color: V.surface,
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: V.pink.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          IconButton(
            tooltip: 'Cancel recording',
            onPressed: onCancel,
            icon: const Icon(SolarIconsOutline.trashBinMinimalistic, color: V.muted, size: 20),
          ),
          Container(
            width: 10,
            height: 10,
            decoration: const BoxDecoration(color: V.bad, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Text('${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}', style: VT.title(15, weight: FontWeight.w600)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Recording… up to ${max}s',
              overflow: TextOverflow.ellipsis,
              style: VT.body(12.5, color: V.muted),
            ),
          ),
          CircleIconButton(icon: SolarIconsBold.plain, size: 40, iconSize: 19, color: Colors.white, background: V.violet, tooltip: 'Send voice message', onTap: onSend),
        ],
      ),
    );
  }
}

/// "typing…" as a little bubble on their side.
class TypingBubble extends StatelessWidget {
  const TypingBubble({super.key, required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      label: '${name.split(' ').first} is typing',
      excludeSemantics: true,
      child: Align(
        alignment: Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: const BoxDecoration(
            color: V.surface2,
            borderRadius: BorderRadius.only(topLeft: Radius.circular(18), topRight: Radius.circular(18), bottomRight: Radius.circular(18), bottomLeft: Radius.circular(6)),
          ),
          child: Text('typing…', style: VT.body(13, color: V.text2)),
        ),
      ),
    );
  }
}
