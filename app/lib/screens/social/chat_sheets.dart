import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/follows_provider.dart';
import '../../providers/social_provider.dart';
import '../match/report_sheet.dart';
import '../profile/user_profile_screen.dart';

Future<bool> _confirm(BuildContext context, String title, String body, String ok) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
        TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(ok, style: const TextStyle(color: V.bad))),
      ],
    ),
  );
  return r ?? false;
}

/// ⋯ in a chat: who this is (and since when), their profile, calls, then
/// remove, report and block. (Design: Chat · more; web: openChatMore.)
/// Returns true when the chat is gone (removed, blocked).
Future<bool> showChatMore(BuildContext context, {required Friend f, required List<(String, Future<void> Function(), bool)> callItems}) async {
  final p = f.profile;
  final first = p.name.split(' ').first;
  final callsSub = f.calls.on ? (f.calls.video ? 'Voice and video allowed' : 'Voice calls allowed') : (f.calls.mine ? 'Waiting for $first' : 'Off');
  final pick = await showVibeSheet<String>(
    context,
    child: Builder(
      builder: (ctx) {
        Widget row(String v, IconData icon, String title, {String? sub, bool bad = false}) => InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => Navigator.of(ctx).pop(v),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 4),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: bad ? V.bad.withValues(alpha: 0.12) : Colors.white.withValues(alpha: 0.05), borderRadius: BorderRadius.circular(12)),
                  child: Icon(icon, size: 20, color: bad ? V.bad : V.text2),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: VT.title(15, weight: FontWeight.w600, color: bad ? V.bad : V.text)),
                      if (sub != null) Text(sub, style: VT.body(12, color: V.text2)),
                    ],
                  ),
                ),
                if (!bad) const Icon(SolarIconsOutline.altArrowRight, size: 18, color: V.muted),
              ],
            ),
          ),
        );
        return Material(
          type: MaterialType.transparency,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    VAvatar(url: p.avatarUrl, name: p.name, size: 48, ring: true),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(p.name, style: VT.title(17), overflow: TextOverflow.ellipsis),
                          Text('Friends since ${Fmt.date(f.since)}${f.streak.count > 0 ? ' · ${f.streak.count}-day streak' : ''}', style: VT.body(12.5, color: V.text2), overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                row('profile', SolarIconsBold.user, 'View profile'),
                if (callItems.isNotEmpty) ...[
                  Padding(padding: const EdgeInsets.fromLTRB(4, 12, 4, 4), child: Text('CALLS · ${callsSub.toUpperCase()}', style: VT.overline())),
                  for (final (i, (label, _, bad)) in callItems.indexed) row('calls$i', bad ? SolarIconsBold.phoneCallingRounded : SolarIconsBold.phone, label, bad: bad),
                ],
                const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Divider(height: 1, color: V.lineSoft)),
                row('remove', SolarIconsBold.userMinusRounded, 'Remove friend', sub: 'You can still find each other on calls'),
                row('report', SolarIconsBold.flag, 'Report $first', bad: true),
                row('block', SolarIconsBold.forbiddenCircle, 'Block $first', sub: "$first can't message or meet you again", bad: true),
              ],
            ),
          ),
        );
      },
    ),
  );
  if (pick == null || !context.mounted) return false;
  final social = context.read<SocialProvider>();
  if (pick == 'profile') {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => UserProfileScreen(userId: p.id)));
    return false;
  }
  if (pick.startsWith('calls')) {
    await callItems[int.parse(pick.substring(5))].$2();
    return false;
  }
  if (pick == 'remove') {
    if (!await _confirm(context, 'Remove $first?', "You'll stop being friends. Your chat goes too.", 'Remove')) return false;
    await social.remove(p.id);
    return true;
  }
  if (pick == 'block') {
    if (!await _confirm(context, 'Block $first?', "You won't see each other in Discover, matches or chats.", 'Block')) return false;
    await social.block(p);
    return true;
  }
  if (pick == 'report') {
    final follows = context.read<FollowsProvider>();
    final choice = await showReportSheet(context, name: p.name, where: ReportContext.person);
    if (choice == null) return false;
    await follows.report(p.id, choice.reason, note: choice.note, block: choice.block);
    if (context.mounted) toast(context, 'Thanks. $first was reported${choice.block ? ' and blocked' : ''}.');
    return choice.block;
  }
  return false;
}

/// A chat with nothing in it yet: "Say hi to Sana", what you have in common,
/// a wave, and three openers that send with one tap. (Design: Chat · empty.)
class ChatHello extends StatelessWidget {
  const ChatHello({super.key, required this.friend, required this.myInterests, required this.onSend});
  final Profile friend;
  final List<String> myInterests;
  final ValueChanged<String> onSend;

  @override
  Widget build(BuildContext context) {
    final first = friend.name.split(' ').first;
    final shared = friend.interests.where(myInterests.contains).toList();
    final topic = shared.isNotEmpty ? shared.first : (friend.interests.isNotEmpty ? friend.interests.first : null);
    final openers = [
      topic != null ? 'What ${topic.toLowerCase()} are you into lately?' : 'What are you into lately?',
      "Where's the next place you want to go?",
      'Hi $first! Fun call earlier',
    ];
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 32, 20, 20),
      children: [
        Center(child: VAvatar(url: friend.avatarUrl, name: friend.name, size: 88, ring: true)),
        const SizedBox(height: 16),
        Text.rich(
          TextSpan(children: [
            const TextSpan(text: 'Say hi to '),
            TextSpan(text: first, style: VT.serif(28, color: V.pinkSoft)),
          ]),
          textAlign: TextAlign.center,
          style: VT.display(24),
        ),
        const SizedBox(height: 4),
        Text(shared.isNotEmpty ? 'You met on a call · you both like ${shared.take(2).join(' and ')}' : 'You met on a call', textAlign: TextAlign.center, style: VT.body(13.5, color: V.text2)),
        const SizedBox(height: 16),
        Center(
          child: Semantics(
            button: true,
            label: 'Send a wave',
            excludeSemantics: true,
            child: GestureDetector(
              onTap: () => onSend('👋'),
              child: Container(
                height: 40,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(color: V.gold.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20), border: Border.all(color: V.gold.withValues(alpha: 0.3))),
                child: Row(mainAxisSize: MainAxisSize.min, children: [const Text('👋', style: TextStyle(fontSize: 16)), const SizedBox(width: 8), Text('Send a wave', style: VT.label(14, color: V.gold, weight: FontWeight.w700))]),
              ),
            ),
          ),
        ),
        const SizedBox(height: 28),
        Padding(padding: const EdgeInsets.only(left: 4, bottom: 8), child: Text('OR START WITH', style: VT.overline())),
        for (final o in openers)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Material(
              color: V.surface,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: V.line)),
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () => onSend(o),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
                  child: Row(children: [Expanded(child: Text(o, style: VT.body(14, weight: FontWeight.w500))), const Icon(SolarIconsBold.plain, size: 17, color: V.muted)]),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
