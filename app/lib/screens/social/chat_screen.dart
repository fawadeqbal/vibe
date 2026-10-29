import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../models/calls.dart';
import '../../providers/calls_provider.dart';
import '../../providers/follows_provider.dart';
import '../../providers/social_provider.dart';
import '../../services/app_services.dart';
import '../match/report_sheet.dart';
import '../match/gift_sheet.dart';
import '../profile/user_profile_screen.dart';
import '../store/store_screen.dart';
import 'chat_calls.dart';
import 'chat_tools.dart';
import 'streaks.dart';

/// Text chat with a friend. Gifts here earn them gems too — that is what
/// keeps friends on the app between matches.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.friendId});
  final String friendId;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _text = TextEditingController();
  final _scroll = ScrollController();
  final _focus = FocusNode();

  late final SocialProvider _social = context.read<SocialProvider>();
  late final AppServices _services = context.read<AppServices>();

  ChatMessage? _replyTo;
  bool _emoji = false;
  bool _recording = false;
  int _recSeconds = 0;
  Timer? _recTimer;
  int _lastCount = -1;

  @override
  void initState() {
    super.initState();
    _social.ensureMessages(widget.friendId);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<CallsProvider>().loadState(widget.friendId);
    });
  }

  @override
  void dispose() {
    _social.leaveChat(widget.friendId);
    _recTimer?.cancel();
    if (_recording) _services.voice.cancel();
    _text.dispose();
    _scroll.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final social = context.read<SocialProvider>();
    final text = _text.text;
    if (text.trim().isEmpty) return;
    final reply = _replyTo?.id;
    _text.clear();
    setState(() => _replyTo = null);
    try {
      await social.sendMessage(widget.friendId, text, replyToId: reply);
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
    _toBottom();
  }

  void _typed(String v) {
    setState(() {}); // mic ↔ send
    if (v.trim().isNotEmpty) _social.typingTo(widget.friendId);
  }

  void _insertEmoji(String e) {
    final t = _text.text;
    final sel = _text.selection;
    final at = sel.isValid ? sel.start : t.length;
    final end = sel.isValid ? sel.end : t.length;
    _text.value = TextEditingValue(
      text: t.replaceRange(at, end, e),
      selection: TextSelection.collapsed(offset: at + e.length),
    );
    _typed(_text.text);
  }

  Future<void> _sendMedia(MessageKind kind, Uint8List bytes, String type, {int? seconds, int? w, int? h}) async {
    final reply = _replyTo?.id;
    setState(() => _replyTo = null);
    _toBottom();
    try {
      await _social.sendMedia(widget.friendId, kind, bytes, contentType: type, seconds: seconds, w: w, h: h, replyToId: reply);
    } on ApiException catch (e) {
      if (mounted) toast(context, e.code == 'FEATURE_DISABLED' ? (kind == MessageKind.photo ? 'Photos are off right now' : 'Voice messages are off right now') : e.message, error: true);
    } catch (_) {
      if (mounted) toast(context, "Couldn't send that — check your connection", error: true);
    }
    _toBottom();
  }

  Future<void> _photo({required bool camera}) async {
    final media = _services.media;
    if (!media.available) {
      toast(context, 'Photos need the phone app');
      return;
    }
    try {
      final img = await media.pickPhoto(camera: camera);
      if (img == null || !mounted) return;
      int? w, h;
      try {
        final decoded = await decodeImageFromList(img.bytes);
        w = decoded.width;
        h = decoded.height;
        decoded.dispose();
      } catch (_) {}
      await _sendMedia(MessageKind.photo, img.bytes, img.contentType, w: w, h: h);
    } on FormatException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } catch (_) {
      if (mounted) toast(context, "Couldn't open the ${camera ? 'camera' : 'gallery'}", error: true);
    }
  }

  Future<void> _startRecording() async {
    final rec = _services.voice;
    if (!rec.available) {
      toast(context, 'Voice messages need the phone app');
      return;
    }
    try {
      if (!await rec.start()) {
        if (mounted) toast(context, 'Allow the microphone to send voice messages', error: true);
        return;
      }
    } catch (_) {
      if (mounted) toast(context, "Couldn't start the microphone", error: true);
      return;
    }
    if (!mounted) return;
    HapticFeedback.lightImpact();
    setState(() {
      _recording = true;
      _recSeconds = 0;
      _emoji = false;
    });
    _recTimer?.cancel();
    _recTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _recSeconds++);
      if (_recSeconds >= Economy.chatVoiceNoteMaxSeconds) _stopRecording(send: true);
    });
  }

  Future<void> _stopRecording({required bool send}) async {
    if (!_recording) return;
    _recTimer?.cancel();
    setState(() => _recording = false);
    if (!send) {
      await _services.voice.cancel();
      return;
    }
    final clip = await _services.voice.stop();
    if (clip == null) {
      if (mounted) toast(context, 'Hold on a little longer to record');
      return;
    }
    await _sendMedia(MessageKind.voice, clip.bytes, clip.contentType, seconds: clip.seconds.clamp(1, Economy.chatVoiceNoteMaxSeconds));
  }

  Future<void> _plus(String name) async {
    FocusScope.of(context).unfocus();
    final pick = await showVibeSheet<String>(
      context,
      child: Builder(
        builder: (ctx) {
          Widget row(String v, IconData icon, Color tint, String label, String sub) => ListTile(
            leading: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: tint.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(14)),
              child: Icon(icon, size: 20, color: tint),
            ),
            title: Text(label, style: VT.title(15, weight: FontWeight.w600)),
            subtitle: Text(sub, style: VT.body(12, color: V.muted)),
            onTap: () => Navigator.of(ctx).pop(v),
          );
          return Material(
            type: MaterialType.transparency,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (Economy.chatPhotosEnabled) ...[
                    row('gallery', SolarIconsBold.gallery, V.pinkSoft, 'Photo', 'From your gallery'),
                    row('camera', SolarIconsBold.camera, V.lavender, 'Camera', 'Take a photo now'),
                  ],
                  if (Economy.chatVoiceNotesEnabled) row('voice', Icons.mic_rounded, const Color(0xFF60A5FA), 'Voice message', 'Up to ${Economy.chatVoiceNoteMaxSeconds} seconds'),
                  row('gift', SolarIconsBold.gift, V.gold, 'Gift', 'They earn gems from it'),
                  row('emoji', SolarIconsBold.smileCircle, V.warn, 'Emoji', 'Add emoji to your message'),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (!mounted || pick == null) return;
    switch (pick) {
      case 'gallery':
        await _photo(camera: false);
      case 'camera':
        await _photo(camera: true);
      case 'voice':
        await _startRecording();
      case 'gift':
        await _gift(name);
      case 'emoji':
        setState(() => _emoji = true);
    }
  }

  Future<void> _longPress(ChatMessage m, Friend f) async {
    if (m.isSystem) return;
    HapticFeedback.selectionClick();
    final a = await showMessageMenu(context, m);
    if (a == null || !mounted) return;
    try {
      switch (a) {
        case ReactAction(:final emoji):
          await _social.react(widget.friendId, m.id, m.reactionMine == emoji ? null : emoji);
        case PlainAction(action: SimpleAction.reply):
          setState(() => _replyTo = m);
          _focus.requestFocus();
        case PlainAction(action: SimpleAction.copy):
          await copyMessage(context, m);
        case PlainAction(action: SimpleAction.unsend):
          await _social.unsend(widget.friendId, m.id);
        case PlainAction(action: SimpleAction.report):
          final follows = context.read<FollowsProvider>();
          final choice = await showReportSheet(context, name: f.profile.name);
          if (choice == null || !mounted) return;
          await follows.report(f.profile.id, choice.reason, note: choice.note, block: choice.block);
          if (choice.block) await _social.load();
          if (mounted) toast(context, 'Thanks. ${f.profile.name.split(' ').first} was reported${choice.block ? ' and blocked' : ''}.');
      }
    } on ApiException catch (e) {
      if (mounted) toast(context, e.status == 409 ? 'Too late to unsend this one' : e.message, error: true);
    }
  }

  void _toBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
    });
  }

  Future<void> _gift(String name) async {
    final social = context.read<SocialProvider>();
    final g = await showGiftSheet(context, toName: name);
    if (g == null || !mounted) return;
    if (!await social.sendGift(widget.friendId, g) && mounted) {
      final go = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Not enough coins'),
          content: Text('A ${g.name} costs ${g.coins} coins.'),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Not now')),
            TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Get coins')),
          ],
        ),
      );
      if (go == true && mounted) Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StoreScreen(asPage: true)));
    }
    _toBottom();
  }

  @override
  Widget build(BuildContext context) {
    final social = context.watch<SocialProvider>();
    final f = social.friend(widget.friendId);
    if (f == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const EmptyState(icon: SolarIconsBold.userCrossRounded, title: 'Not friends any more', body: 'This conversation is gone.'),
      );
    }
    final msgs = social.messages(widget.friendId);
    final typing = social.isTyping(widget.friendId);
    // After the frame: markRead notifies listeners, which must not happen
    // during build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<SocialProvider>().markRead(widget.friendId);
    });
    final count = msgs.length + (typing ? 1 : 0);
    if (count != _lastCount) {
      _lastCount = count;
      _toBottom();
    }
    // "Seen" under your last message once they've read it.
    final lastMine = msgs.lastIndexWhere((m) => m.fromMe && !m.isSystem);
    final seenAt = social.seenAt(widget.friendId);
    final seen = lastMine >= 0 && (msgs[lastMine].readAt != null || (seenAt != null && !seenAt.isBefore(msgs[lastMine].at))) && !msgs[lastMine].pending;
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 64,
        titleSpacing: 0,
        leading: Center(
          child: CircleIconButton(icon: SolarIconsOutline.arrowLeft, tooltip: 'Back', onTap: () => Navigator.of(context).maybePop()),
        ),
        leadingWidth: 64,
        shape: const Border(bottom: BorderSide(color: V.lineSoft)),
        title: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => UserProfileScreen(userId: widget.friendId))),
          child: Row(
            children: [
              Stack(
                children: [
                  VAvatar(url: f.profile.avatarUrl, name: f.profile.name, size: 40),
                  if (f.online)
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: V.ok,
                          border: Border.all(color: V.bg, width: 2),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            f.profile.name,
                            overflow: TextOverflow.ellipsis,
                            style: VT.title(16, weight: FontWeight.w600),
                          ),
                        ),
                        if (f.profile.verified)
                          const Padding(
                            padding: EdgeInsets.only(left: 4),
                            child: Icon(SolarIconsBold.verifiedCheck, size: 15, color: V.trust),
                          ),
                        if (f.streak.count > 0)
                          Padding(
                            padding: const EdgeInsets.only(left: 6),
                            child: StreakChip(streak: f.streak, showEndsTonight: false, onTap: () => showStreakSheet(context, f)),
                          ),
                        if (f.streak.restorable)
                          Padding(
                            padding: const EdgeInsets.only(left: 6),
                            child: RestoreStreakButton(friend: f),
                          ),
                      ],
                    ),
                    Text(
                      typing
                          ? 'typing…'
                          : f.online
                          ? 'Online'
                          : 'Last seen ${Fmt.ago(f.since)}',
                      style: VT.label(
                        11.5,
                        color: typing
                            ? V.pinkSoft
                            : f.online
                            ? V.ok
                            : V.muted,
                        weight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          if (f.state == FriendState.friends) CallButton(friend: f),
          PopupMenuButton<String>(
            icon: const Icon(SolarIconsBold.menuDots),
            onSelected: (v) async {
              if (v.startsWith('calls')) {
                await callsMenuItems(context, f)[int.parse(v.substring(5))].$2();
                return;
              }
              if (v == 'remove') {
                await social.remove(widget.friendId);
              } else if (v == 'block') {
                await social.block(f.profile);
              }
              if (context.mounted) Navigator.of(context).pop();
            },
            itemBuilder: (_) {
              final callItems = callsMenuItems(context, f);
              return [
                if (f.state == FriendState.friends && context.read<CallsProvider>().enabled)
                  for (final (i, (label, _, bad)) in callItems.indexed)
                    PopupMenuItem(
                      value: 'calls$i',
                      child: Text(label, style: bad ? const TextStyle(color: V.bad) : null),
                    ),
                const PopupMenuItem(value: 'remove', child: Text('Remove friend')),
                const PopupMenuItem(
                  value: 'block',
                  child: Text('Block', style: TextStyle(color: V.bad)),
                ),
              ];
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: msgs.isEmpty
                ? EmptyState(icon: SolarIconsBold.handShake, title: 'Say hi to ', accent: f.profile.name, body: 'You met in a match. ${f.profile.bio}')
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                    itemCount: msgs.length + (typing ? 1 : 0),
                    itemBuilder: (context, i) {
                      if (i == msgs.length) return TypingBubble(name: f.profile.name);
                      final m = msgs[i];
                      if (m.isSystem) {
                        return SystemLine(m: m, onCallBack: f.calls.on ? (video) => context.read<CallsProvider>().ring(f.profile, video && f.calls.video ? CallMedia.video : CallMedia.voice) : null);
                      }
                      return _Bubble(
                        m: m,
                        friendName: f.profile.name,
                        seen: seen && i == lastMine,
                        onLongPress: () => _longPress(m, f),
                        onReactionTap: m.reactionMine != null ? () => _social.react(widget.friendId, m.id, null) : null,
                      );
                    },
                  ),
          ),
          if (f.state == FriendState.friends) CallsCard(friend: f),
          if (_emoji && !_recording) EmojiPanel(onPick: _insertEmoji),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_replyTo != null && !_recording)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: ReplyQuote(
                        quote: ReplyRef(id: _replyTo!.id, fromMe: _replyTo!.fromMe, kind: _replyTo!.kind.name, text: _replyTo!.text),
                        friendName: f.profile.name,
                        onClose: () => setState(() => _replyTo = null),
                      ),
                    ),
                  if (_recording)
                    RecordingBar(seconds: _recSeconds, max: Economy.chatVoiceNoteMaxSeconds, onCancel: () => _stopRecording(send: false), onSend: () => _stopRecording(send: true))
                  else
                    Row(
                      children: [
                        CircleIconButton(
                          icon: SolarIconsOutline.addCircle,
                          size: 48,
                          iconSize: 24,
                          color: V.text2,
                          background: V.surface2,
                          tooltip: 'Photo, voice, gift',
                          onTap: () => _plus(f.profile.name),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Container(
                            height: 52,
                            padding: const EdgeInsets.only(left: 6, right: 6),
                            decoration: BoxDecoration(
                              color: V.surface,
                              borderRadius: BorderRadius.circular(26),
                              border: Border.all(color: V.line),
                            ),
                            child: Row(
                              children: [
                                IconButton(
                                  tooltip: _emoji ? 'Keyboard' : 'Emoji',
                                  visualDensity: VisualDensity.compact,
                                  onPressed: () {
                                    setState(() => _emoji = !_emoji);
                                    if (_emoji) {
                                      FocusScope.of(context).unfocus();
                                    } else {
                                      _focus.requestFocus();
                                    }
                                  },
                                  icon: Icon(_emoji ? Icons.keyboard_rounded : SolarIconsOutline.smileCircle, size: 22, color: _emoji ? V.pinkSoft : V.muted),
                                ),
                                Expanded(
                                  child: TextField(
                                    controller: _text,
                                    focusNode: _focus,
                                    textInputAction: TextInputAction.send,
                                    onSubmitted: (_) => _send(),
                                    onChanged: _typed,
                                    onTap: () {
                                      if (_emoji) setState(() => _emoji = false);
                                    },
                                    style: VT.body(15),
                                    decoration: InputDecoration(
                                      hintText: 'Message',
                                      filled: false,
                                      border: InputBorder.none,
                                      enabledBorder: InputBorder.none,
                                      focusedBorder: InputBorder.none,
                                      isDense: true,
                                      contentPadding: EdgeInsets.zero,
                                      hintStyle: VT.body(15, color: V.muted),
                                    ),
                                  ),
                                ),
                                if (_text.text.trim().isEmpty && Economy.chatVoiceNotesEnabled)
                                  CircleIconButton(
                                    icon: Icons.mic_rounded,
                                    size: 40,
                                    iconSize: 19,
                                    color: Colors.white,
                                    background: V.violet,
                                    tooltip: 'Record a voice message',
                                    onTap: _startRecording,
                                  )
                                else
                                  CircleIconButton(icon: SolarIconsBold.plain, size: 40, iconSize: 19, color: Colors.white, background: V.violet, tooltip: 'Send', onTap: _send),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One message: text, gift, photo or voice note, with its reply quote,
/// reaction, time and "Seen".
class _Bubble extends StatelessWidget {
  const _Bubble({required this.m, required this.friendName, required this.seen, required this.onLongPress, this.onReactionTap});
  final ChatMessage m;
  final String friendName;
  final bool seen;
  final VoidCallback onLongPress;
  final VoidCallback? onReactionTap;

  @override
  Widget build(BuildContext context) {
    final mine = m.fromMe;
    final gift = m.gift != null && !m.unsent;
    final media = !m.unsent && (m.kind == MessageKind.photo || m.kind == MessageKind.voice);
    final photo = media && m.kind == MessageKind.photo;
    final plainMine = mine && !gift && !m.unsent;
    final fg = plainMine ? Colors.white : V.text;
    final reactions = [?m.reactionTheirs, ?m.reactionMine];
    final bubble = Container(
      padding: photo ? const EdgeInsets.all(4) : EdgeInsets.symmetric(horizontal: gift ? 14 : 12, vertical: gift ? 10 : 8),
      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
      decoration: BoxDecoration(
        color: m.unsent
            ? Colors.transparent
            : gift
            ? V.gold.withValues(alpha: 0.12)
            : (mine ? V.violet : V.surface2),
        borderRadius: BorderRadius.only(
          topLeft: const Radius.circular(18),
          topRight: const Radius.circular(18),
          bottomLeft: Radius.circular(mine ? 18 : 6),
          bottomRight: Radius.circular(mine ? 6 : 18),
        ),
        border: m.unsent
            ? Border.all(color: V.lineStrong)
            : gift
            ? Border.all(color: V.gold.withValues(alpha: 0.4))
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (m.replyTo != null && !m.unsent)
            Padding(
              padding: EdgeInsets.all(photo ? 4 : 0),
              child: ReplyQuote(quote: m.replyTo!, friendName: friendName, onMine: plainMine),
            ),
          if (gift) Text(m.gift!.emoji, style: const TextStyle(fontSize: 30)),
          if (m.unsent)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.block_rounded, size: 14, color: V.muted),
                const SizedBox(width: 6),
                Text(
                  mine ? 'You unsent a message' : 'Message unsent',
                  style: VT.body(14, color: V.muted).copyWith(fontStyle: FontStyle.italic),
                ),
              ],
            )
          else if (photo)
            PhotoBubble(m: m)
          else if (m.kind == MessageKind.voice)
            VoiceNoteBubble(m: m)
          else
            Text(m.text, style: VT.body(15, color: fg)),
          const SizedBox(height: 2),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: photo ? 6 : 0),
            child: Text(
              m.pending ? 'Sending…' : Fmt.time(m.at),
              style: VT.label(10, color: plainMine ? Colors.white70 : V.muted, weight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
    return Padding(
      padding: EdgeInsets.only(bottom: reactions.isNotEmpty ? 16 : 6),
      child: Column(
        crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onLongPress: m.pending ? null : onLongPress,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                bubble,
                if (reactions.isNotEmpty)
                  Positioned(
                    bottom: -14,
                    right: mine ? null : -4,
                    left: mine ? -4 : null,
                    child: Semantics(
                      button: onReactionTap != null,
                      label: 'Reactions ${reactions.join(' ')}${onReactionTap != null ? ', tap to remove yours' : ''}',
                      excludeSemantics: true,
                      child: GestureDetector(
                        onTap: onReactionTap,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: V.surface3,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: V.bg, width: 2),
                          ),
                          child: Text(reactions.toSet().join(), style: const TextStyle(fontSize: 14, fontFamilyFallback: emojiFonts)),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          if (seen)
            Padding(
              padding: const EdgeInsets.only(top: 2, right: 4),
              child: Text(
                'Seen',
                style: VT.label(10.5, color: V.muted, weight: FontWeight.w600),
              ),
            ),
        ],
      ),
    );
  }
}
