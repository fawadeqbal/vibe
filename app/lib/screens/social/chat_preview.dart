import '../../models/models.dart';

enum PreviewIcon { photo, mic, gift, call, callMissed }

enum PreviewTicks { sent, seen }

/// The second line of a chat in the list: what the last message was.
/// Same rules as the web (`chat-preview.ts`).
class ChatPreview {
  const ChatPreview(this.text, {this.icon, this.ticks, this.missed = false});
  final String text;
  final PreviewIcon? icon;
  final PreviewTicks? ticks;

  /// A missed call from them reads in red.
  final bool missed;

  /// [seenAt]: when they last read the chat (live read receipts), for the ticks.
  factory ChatPreview.of(Friend f, {DateTime? seenAt}) {
    final l = f.last;
    final text = f.lastMessage ?? '';
    if (l == null) return ChatPreview(text.isEmpty ? 'Say hi 👋' : text);
    if (l.unsent) return ChatPreview(l.fromMe ? 'You unsent a message' : 'Message unsent');
    final you = l.fromMe ? 'You: ' : '';
    final at = f.lastMessageAt;
    final seen = l.read || (seenAt != null && at != null && !seenAt.isBefore(at));
    final ticks = l.fromMe && l.kind != MessageKind.system ? (seen ? PreviewTicks.seen : PreviewTicks.sent) : null;
    switch (l.kind) {
      case MessageKind.photo:
        return ChatPreview('${you}Photo', icon: PreviewIcon.photo, ticks: ticks);
      case MessageKind.voice:
        final s = l.seconds;
        return ChatPreview('${you}Voice message${s != null && s > 0 ? ' · ${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}' : ''}', icon: PreviewIcon.mic, ticks: ticks);
      case MessageKind.gift:
        return ChatPreview('$you${text.isEmpty ? 'Gift' : text}', icon: PreviewIcon.gift, ticks: ticks);
      case MessageKind.system:
        final call = l.event?.startsWith('call_') ?? false;
        final missed = l.event == 'call_missed' && !l.fromMe;
        return ChatPreview(text, icon: call ? (missed ? PreviewIcon.callMissed : PreviewIcon.call) : null, missed: missed);
      case MessageKind.text:
        return ChatPreview('$you$text', ticks: ticks);
    }
  }
}
