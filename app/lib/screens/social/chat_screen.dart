import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../providers/social_provider.dart';
import '../match/gift_sheet.dart';
import '../profile/user_profile_screen.dart';
import '../store/store_screen.dart';
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

  late final SocialProvider _social = context.read<SocialProvider>();

  @override
  void initState() {
    super.initState();
    _social.ensureMessages(widget.friendId);
  }

  @override
  void dispose() {
    _social.leaveChat(widget.friendId);
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final social = context.read<SocialProvider>();
    final text = _text.text;
    _text.clear();
    try {
      await social.sendMessage(widget.friendId, text);
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
    _toBottom();
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
          actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Not now')), TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Get coins'))],
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
      return Scaffold(appBar: AppBar(), body: const EmptyState(icon: Icons.person_off_rounded, title: 'Not friends any more', body: 'This conversation is gone.'));
    }
    final msgs = social.messages(widget.friendId);
    // After the frame: markRead notifies listeners, which must not happen
    // during build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<SocialProvider>().markRead(widget.friendId);
    });
    _toBottom();
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 64,
        titleSpacing: 0,
        leading: Center(child: CircleIconButton(icon: Icons.arrow_back_rounded, tooltip: 'Back', onTap: () => Navigator.of(context).maybePop())),
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
                  Positioned(right: 0, bottom: 0, child: Container(width: 12, height: 12, decoration: BoxDecoration(shape: BoxShape.circle, color: V.ok, border: Border.all(color: V.bg, width: 2)))),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(child: Text(f.profile.name, overflow: TextOverflow.ellipsis, style: VT.title(16, weight: FontWeight.w600))),
                      if (f.profile.verified) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(Icons.verified_rounded, size: 15, color: V.trust)),
                      if (f.streak.count > 0) Padding(padding: const EdgeInsets.only(left: 6), child: StreakChip(streak: f.streak, showEndsTonight: false, onTap: () => showStreakSheet(context, f))),
                      if (f.streak.restorable) Padding(padding: const EdgeInsets.only(left: 6), child: RestoreStreakButton(friend: f)),
                    ],
                  ),
                  Text(f.online ? 'Online' : 'Last seen ${Fmt.ago(f.since)}', style: VT.label(11.5, color: f.online ? V.ok : V.muted, weight: FontWeight.w500)),
                ],
              ),
            ),
          ],
        ),
        ),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_horiz_rounded),
            onSelected: (v) async {
              if (v == 'remove') {
                await social.remove(widget.friendId);
              } else if (v == 'block') {
                await social.block(f.profile);
              }
              if (context.mounted) Navigator.of(context).pop();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'remove', child: Text('Remove friend')),
              PopupMenuItem(value: 'block', child: Text('Block', style: TextStyle(color: V.bad))),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: msgs.isEmpty
                ? EmptyState(icon: Icons.waving_hand_rounded, title: 'Say hi to ', accent: f.profile.name, body: 'You met in a match. ${f.profile.bio}')
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                    itemCount: msgs.length,
                    itemBuilder: (context, i) {
                      final m = msgs[i];
                      final mine = m.fromMe;
                      return Align(
                        alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 6),
                          padding: EdgeInsets.symmetric(horizontal: m.gift != null ? 14 : 12, vertical: m.gift != null ? 10 : 8),
                          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
                          decoration: BoxDecoration(
                            color: m.gift != null ? V.gold.withValues(alpha: 0.12) : (mine ? V.violet : V.surface2),
                            borderRadius: BorderRadius.only(topLeft: const Radius.circular(18), topRight: const Radius.circular(18), bottomLeft: Radius.circular(mine ? 18 : 6), bottomRight: Radius.circular(mine ? 6 : 18)),
                            border: m.gift != null ? Border.all(color: V.gold.withValues(alpha: 0.4)) : null,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (m.gift != null) Text(m.gift!.emoji, style: const TextStyle(fontSize: 30)),
                              Text(m.text, style: VT.body(15, color: mine && m.gift == null ? Colors.white : V.text)),
                              const SizedBox(height: 2),
                              Text(Fmt.time(m.at), style: VT.label(10, color: mine && m.gift == null ? Colors.white70 : V.muted, weight: FontWeight.w500)),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
              child: Row(
                children: [
                  CircleIconButton(icon: Icons.redeem_rounded, size: 52, iconSize: 24, color: V.gold, background: V.gold.withValues(alpha: 0.12), tooltip: 'Send a gift', onTap: () => _gift(f.profile.name)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Container(
                      height: 52,
                      padding: const EdgeInsets.only(left: 18, right: 6),
                      decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(26), border: Border.all(color: V.line)),
                      child: Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _text,
                              textInputAction: TextInputAction.send,
                              onSubmitted: (_) => _send(),
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
                          CircleIconButton(icon: Icons.send_rounded, size: 40, iconSize: 19, color: Colors.white, background: V.violet, tooltip: 'Send', onTap: _send),
                        ],
                      ),
                    ),
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
