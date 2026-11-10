import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/screens/social/chat_preview.dart';

void main() {
  final at = DateTime.utc(2026, 11, 10, 10);
  Friend f(LastMessage? last, [String? text = 'hey']) => Friend(
        profile: const Profile(id: 'u', name: 'Sana', age: 23, gender: Gender.female, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: ''),
        state: FriendState.friends,
        since: at,
        lastMessage: text,
        lastMessageAt: at,
        last: last,
      );

  test('their text as is; yours with You: and a tick; seen from the list or a live receipt', () {
    expect(ChatPreview.of(f(const LastMessage(fromMe: false))).text, 'hey');
    final mine = ChatPreview.of(f(const LastMessage(fromMe: true)));
    expect((mine.text, mine.ticks), ('You: hey', PreviewTicks.sent));
    expect(ChatPreview.of(f(const LastMessage(fromMe: true, read: true))).ticks, PreviewTicks.seen);
    expect(ChatPreview.of(f(const LastMessage(fromMe: true)), seenAt: at.add(const Duration(seconds: 5))).ticks, PreviewTicks.seen);
  });

  test('photos, voice notes, gifts, missed calls, unsent, nothing yet', () {
    expect(ChatPreview.of(f(const LastMessage(fromMe: false, kind: MessageKind.photo), '')).text, 'Photo');
    expect(ChatPreview.of(f(const LastMessage(fromMe: true, kind: MessageKind.voice, seconds: 14), '')).text, 'You: Voice message · 0:14');
    expect(ChatPreview.of(f(const LastMessage(fromMe: false, kind: MessageKind.gift), '🌹 Rose')).icon, PreviewIcon.gift);
    final missed = ChatPreview.of(f(const LastMessage(fromMe: false, kind: MessageKind.system, event: 'call_missed'), 'Missed video call'));
    expect((missed.missed, missed.icon, missed.ticks), (true, PreviewIcon.callMissed, null));
    expect(ChatPreview.of(f(const LastMessage(fromMe: true, unsent: true), '')).text, 'You unsent a message');
    expect(ChatPreview.of(f(null, null)).text, 'Say hi 👋');
  });
}
