import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/screens/social/message_status.dart';

void main() {
  final at = DateTime.utc(2026, 11, 10, 21, 40);
  final later = at.add(const Duration(minutes: 2));
  final earlier = at.subtract(const Duration(minutes: 40));
  ChatMessage m({bool fromMe = true, bool pending = false, bool failed = false, DateTime? deliveredAt, DateTime? readAt, MessageKind kind = MessageKind.text}) =>
      ChatMessage(id: 'm', fromMe: fromMe, text: 'hi', at: at, kind: kind, pending: pending, failed: failed, deliveredAt: deliveredAt, readAt: readAt);

  test('sending → sent → delivered → seen; failed; none for theirs and system lines', () {
    expect(messageStatus(m(pending: true)), MessageStatus.sending);
    expect(messageStatus(m()), MessageStatus.sent);
    expect(messageStatus(m(deliveredAt: at)), MessageStatus.delivered);
    expect(messageStatus(m(deliveredAt: at, readAt: later)), MessageStatus.seen);
    expect(messageStatus(m(failed: true)), MessageStatus.failed);
    expect(messageStatus(m(fromMe: false)), isNull);
    expect(messageStatus(m(kind: MessageKind.system)), isNull);
  });

  test('live receipts count for everything sent before them', () {
    expect(messageStatus(m(), deliveredAt: later), MessageStatus.delivered);
    expect(messageStatus(m(), seenAt: later), MessageStatus.seen);
    expect(messageStatus(m(), seenAt: earlier, deliveredAt: earlier), MessageStatus.sent);
  });

  test('info times: seen implies delivered', () {
    final t = statusTimes(m(readAt: later));
    expect((t.sent, t.delivered, t.seen), (at, later, later));
    final d = statusTimes(m(), deliveredAt: later);
    expect((d.delivered, d.seen), (later, null));
  });
}
