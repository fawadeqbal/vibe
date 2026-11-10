import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/every_minute.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../models/calls.dart';
import '../../providers/calls_provider.dart';
import '../../providers/follows_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/social_provider.dart';
import '../../services/app_services.dart';
import '../match/report_sheet.dart';
import '../match/gift_sheet.dart';
import '../profile/user_profile_screen.dart';
import '../store/store_screen.dart';
import 'chat_calls.dart';
import 'chat_sheets.dart';
import 'chat_tools.dart';
import 'streaks.dart';

/// Text chat with a friend. Gifts here earn them gems too — that is what
/// keeps friends on the app between matches.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.friendId, this.focusMessageId});
  final String friendId;

  /// A message to scroll to and flash once (a notification about a reaction or a gift).
  final String? focusMessageId;

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

  /// The + tools grid under the composer.
  bool _tools = false;
  int _recSeconds = 0;
  Timer? _recTimer;
  int _lastCount = -1;

  /// The message we opened at, while it's flashing; and the count when we got there.
  late String? _focusId = widget.focusMessageId;
  int? _focusedAt;
  final _focusKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _social.ensureMessages(widget.friendId);
    _scroll.addListener(_maybeLoadOlder);
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

  /// Your interests, for "you both like …" (none when there's no session, e.g. in tests).
  List<String> _myInterests(BuildContext context) {
    try {
      return context.read<SessionProvider>().me?.interests ?? const [];
    } on ProviderNotFoundException {
      return const [];
    }
  }

  Future<void> _tool(String pick, String name) async {
    setState(() => _tools = false);
    switch (pick) {
      case 'gallery':
        await _photo(camera: false);
      case 'camera':
        await _photo(camera: true);
      case 'voice':
        await _startRecording();
      case 'gift':
        await _gift(name);
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
          final choice = await showReportSheet(context, name: f.profile.name, where: ReportContext.person);
          if (choice == null || !mounted) return;
          await follows.report(f.profile.id, choice.reason, note: choice.note, block: choice.block);
          if (choice.block) await _social.load();
          if (mounted) toast(context, 'Thanks. ${f.profile.name.split(' ').first} was reported${choice.block ? ' and blocked' : ''}.');
      }
    } on ApiException catch (e) {
      if (mounted) toast(context, e.status == 409 ? 'Too late to unsend this one' : e.message, error: true);
    }
  }

  /// Opened at a message: jump near it (the list is lazy), then centre it, then stop flashing.
  void _toMessage(int index, int total) {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted || !_scroll.hasClients) return;
      // The list is reversed: 0 is the newest, the max extent the oldest loaded.
      final fromNewest = total - 1 - index;
      _scroll.jumpTo(_scroll.position.maxScrollExtent * (total <= 1 ? 0 : fromNewest / (total - 1)));
      await Future<void>.delayed(const Duration(milliseconds: 16));
      final ctx = _focusKey.currentContext;
      if (ctx != null && ctx.mounted) await Scrollable.ensureVisible(ctx, alignment: 0.5, duration: const Duration(milliseconds: 200));
      await Future<void>.delayed(const Duration(milliseconds: 2400));
      if (mounted) setState(() => _focusId = null);
    });
  }

  /// Back to the newest (the list is reversed, so that's offset 0).
  void _toBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients && _scroll.offset > 0) _scroll.animateTo(0, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
    });
  }

  /// Near the top (the oldest loaded): the page before it.
  void _maybeLoadOlder() {
    if (!_scroll.hasClients || _scroll.position.extentAfter > 400) return;
    if (_social.hasOlder(widget.friendId) && !_social.loadingOlder(widget.friendId)) _social.loadOlder(widget.friendId);
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
    // The list is reversed, so it opens on the newest message with no scrolling, new messages stay in
    // view, and older pages added at the far end don't move what you see.
    final count = msgs.length + (typing ? 1 : 0);
    if (count != _lastCount) {
      _lastCount = count;
      // Opened at a message: load older pages until it's there, then go to it.
      if (_focusId != null && _focusedAt == null && msgs.isNotEmpty) {
        final at = msgs.indexWhere((x) => x.id == _focusId);
        if (at >= 0) {
          _focusedAt = msgs.length;
          _toMessage(at, msgs.length);
        } else if (social.hasOlder(widget.friendId)) {
          WidgetsBinding.instance.addPostFrameCallback((_) => _social.loadOlder(widget.friendId));
        }
      }
      // A short chat (or a tall screen): nothing to scroll yet, so fetch older now.
      WidgetsBinding.instance.addPostFrameCallback((_) => _maybeLoadOlder());
    }
    final older = social.hasOlder(widget.friendId) || social.loadingOlder(widget.friendId);
    // "Seen" under your last message once they've read it.
    final lastMine = msgs.lastIndexWhere((m) => m.fromMe && !m.isSystem);
    final seenAt = social.seenAt(widget.friendId);
    final seen = lastMine >= 0 && (msgs[lastMine].readAt != null || (seenAt != null && !seenAt.isBefore(msgs[lastMine].at))) && !msgs[lastMine].pending && !msgs[lastMine].failed;
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
                            child: StreakFlame(streak: f.streak, onTap: () => showStreakSheet(context, f)),
                          ),
                        if (f.streak.restorable)
                          Padding(
                            padding: const EdgeInsets.only(left: 6),
                            child: RestoreStreakButton(friend: f),
                          ),
                      ],
                    ),
                    // "Active 5 min ago" keeps counting while the chat is open.
                    EveryMinute(builder: (_) => Text(
                      typing ? 'typing…' : (Fmt.presence(f.online, f.lastSeenAt) ?? ''),
                      style: VT.label(
                        11.5,
                        color: typing
                            ? V.ok
                            : f.online
                            ? V.ok
                            : V.muted,
                        weight: FontWeight.w500,
                      ),
                    )),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          if (f.state == FriendState.friends) CallButton(friend: f),
          IconButton(
            tooltip: 'More',
            icon: const Icon(SolarIconsBold.menuDots),
            onPressed: () async {
              final calls = f.state == FriendState.friends && context.read<CallsProvider>().enabled ? callsMenuItems(context, f) : const <(String, Future<void> Function(), bool)>[];
              final gone = await showChatMore(context, f: f, callItems: calls);
              if (gone && context.mounted) Navigator.of(context).pop();
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: msgs.isEmpty
                ? ChatHello(friend: f.profile, myInterests: _myInterests(context), onSend: (t) => _social.sendMessage(widget.friendId, t))
                : ListView.builder(
                    controller: _scroll,
                    reverse: true,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                    itemCount: msgs.length + (typing ? 1 : 0) + (older ? 1 : 0),
                    itemBuilder: (context, k) {
                      // Reversed: the typing dots first (at the bottom), then newest → oldest, then "loading older".
                      if (typing && k == 0) return TypingBubble(name: f.profile.name);
                      final j = k - (typing ? 1 : 0);
                      if (j >= msgs.length) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Center(child: social.loadingOlder(widget.friendId) ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2, color: V.pink)) : const SizedBox(height: 20)),
                        );
                      }
                      final i = msgs.length - 1 - j;
                      final m = msgs[i];
                      if (m.isSystem) {
                        return SystemLine(m: m, onCallBack: f.calls.on ? (video) => context.read<CallsProvider>().ring(f.profile, video && f.calls.video ? CallMedia.video : CallMedia.voice) : null);
                      }
                      final next = i + 1 < msgs.length ? msgs[i + 1] : null;
                      final bubble = _Bubble(
                        m: m,
                        friend: f.profile,
                        tail: next == null || next.isSystem || next.fromMe != m.fromMe,
                        friendName: f.profile.name,
                        seen: seen && i == lastMine,
                        onLongPress: () => _longPress(m, f),
                        onReactionTap: m.reactionMine != null ? () => _social.react(widget.friendId, m.id, null) : null,
                      );
                      if (m.id != widget.focusMessageId) return bubble;
                      final on = _focusId == m.id;
                      return AnimatedContainer(
                        key: _focusKey,
                        duration: const Duration(milliseconds: 500),
                        padding: const EdgeInsets.all(3),
                        decoration: BoxDecoration(borderRadius: BorderRadius.circular(22), border: Border.all(color: on ? V.pinkSoft : Colors.transparent, width: 2)),
                        child: bubble,
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
                          icon: _tools ? Icons.close_rounded : Icons.add_rounded,
                          size: 48,
                          iconSize: 24,
                          color: _tools ? V.bg : V.text,
                          background: _tools ? V.text : V.surface2,
                          tooltip: _tools ? 'Close' : 'Photo, camera, voice note, gift',
                          onTap: () {
                            FocusScope.of(context).unfocus();
                            setState(() {
                              _tools = !_tools;
                              _emoji = false;
                            });
                          },
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
                  if (_tools && !_recording) _ToolsPanel(name: f.profile.name.split(' ').first, onPick: (v) => _tool(v, f.profile.name)),
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
  const _Bubble({required this.m, required this.friend, required this.tail, required this.friendName, required this.seen, required this.onLongPress, this.onReactionTap});
  final ChatMessage m;
  final Profile friend;

  /// The last of a run from one side: the corner tightens and their avatar shows.
  final bool tail;
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
      padding: photo ? const EdgeInsets.all(4) : EdgeInsets.symmetric(horizontal: gift ? 14 : 13, vertical: gift ? 10 : 9),
      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
      decoration: BoxDecoration(
        color: m.unsent
            ? Colors.transparent
            : gift
            ? V.gold.withValues(alpha: 0.12)
            : (mine ? (photo ? V.violet : null) : V.surface2),
        gradient: plainMine && !photo ? const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [V.violet, Color(0xFF7C3AED)]) : null,
        borderRadius: BorderRadius.only(
          topLeft: const Radius.circular(20),
          topRight: const Radius.circular(20),
          bottomLeft: Radius.circular(!mine && tail ? 6 : 20),
          bottomRight: Radius.circular(mine && tail ? 6 : 20),
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
            Text(m.text, style: VT.body(14.5, color: fg, height: 1.4)),
          if (m.pending)
            Padding(
              padding: EdgeInsets.fromLTRB(photo ? 6 : 0, 2, photo ? 6 : 0, 0),
              child: Text('Sending…', style: VT.label(10, color: plainMine ? Colors.white70 : V.muted, weight: FontWeight.w500)),
            )
          else if (m.failed)
            Semantics(
              button: true,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => context.read<SocialProvider>().retryMessage(friend.id, m.id).catchError((_) {}),
                child: Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.error_outline_rounded, size: 13, color: plainMine ? Colors.white : V.bad),
                    const SizedBox(width: 4),
                    Text('Not sent · Tap to retry', style: VT.label(10.5, color: plainMine ? Colors.white : V.bad, weight: FontWeight.w700)),
                  ]),
                ),
              ),
            ),
        ],
      ),
    );
    return Padding(
      padding: EdgeInsets.only(bottom: reactions.isNotEmpty ? 16 : (tail ? 10 : 4), left: mine ? 0 : 34),
      child: Column(
        crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onLongPress: m.pending || m.failed ? null : onLongPress,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                bubble,
                if (!mine && tail) Positioned(left: -34, bottom: 0, child: ExcludeSemantics(child: VAvatar(url: friend.avatarUrl, name: friend.name, size: 26))),
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
          if (mine && m.hidden && !m.unsent) Padding(padding: EdgeInsets.only(top: reactions.isNotEmpty ? 12 : 0), child: const HiddenNote()),
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

/// Under the composer after +: photo, camera, voice note, gift, and who sees
/// them. (Design: Chat · tools; web: the same grid in chat-view.tsx.)
class _ToolsPanel extends StatelessWidget {
  const _ToolsPanel({required this.name, required this.onPick});
  final String name;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    Widget tile(String v, IconData icon, Color tint, String label) => Expanded(
      child: Semantics(
        button: true,
        label: label,
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => onPick(v),
          child: Column(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(color: tint.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(16)),
                child: Icon(icon, size: 24, color: tint),
              ),
              const SizedBox(height: 6),
              Text(label, style: VT.label(12, color: V.text2, weight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        children: [
          Row(
            children: [
              if (Economy.chatPhotosEnabled) ...[
                tile('gallery', SolarIconsBold.gallery, const Color(0xFF60A5FA), 'Photo'),
                tile('camera', SolarIconsBold.camera, V.trust, 'Camera'),
              ],
              if (Economy.chatVoiceNotesEnabled) tile('voice', Icons.mic_rounded, V.pinkSoft, 'Voice note'),
              tile('gift', SolarIconsBold.gift, V.gold, 'Gift'),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            'Photos and voice notes go only to $name. You can unsend for ${Economy.chatUnsendMinutes} minutes.',
            textAlign: TextAlign.center,
            style: VT.body(12, color: V.muted),
          ),
        ],
      ),
    );
  }
}
