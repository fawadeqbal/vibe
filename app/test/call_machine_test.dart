import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/models/call_machine.dart';
import 'package:vibe_app/models/calls.dart';
import 'package:vibe_app/models/models.dart';

const _asad = Profile(id: 'a', name: 'Asad Khan', age: 25, gender: Gender.male, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: '');
const _sana = Profile(id: 's', name: 'Sana Malik', age: 24, gender: Gender.female, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: '');

CallSnap _snap({CallStatus state = CallStatus.ringing, CallEndReason? reason, int version = 1, bool reached = false, String? answeredBy, String? reply, String id = 'c1'}) =>
    CallSnap(callId: id, state: state, reason: reason, version: version, media: CallMedia.video, from: _asad, to: _sana, expiresAt: DateTime(2026), reached: reached, answeredBy: answeredBy, reply: reply);

void main() {
  test('parses a server snapshot; anything else is not one', () {
    Profile p(Map<String, dynamic> m) => m['id'] == 'a' ? _asad : _sana;
    final c = CallSnap.parse({'callId': 'c1', 'state': 'ended', 'reason': 'no_answer', 'version': 4, 'media': 'voice', 'from': {'id': 'a'}, 'to': {'id': 's'}, 'reply': null}, p);
    expect(c?.state, CallStatus.ended);
    expect(c?.reason, CallEndReason.noAnswer);
    expect(c?.version, 4);
    expect(c?.media, CallMedia.voice);
    expect(CallSnap.parse({'callId': 'c1', 'state': 'weird', 'from': {}, 'to': {}}, p), isNull);
    expect(CallSnap.parse({'state': 'ringing'}, p), isNull);
  });

  test('keeps the newest: older or repeated versions are ignored, another call always wins', () {
    expect(CallSnap.isNewer(null, _snap()), isTrue);
    expect(CallSnap.isNewer(_snap(version: 3), _snap(version: 2)), isFalse);
    expect(CallSnap.isNewer(_snap(version: 3), _snap(version: 3)), isFalse);
    expect(CallSnap.isNewer(_snap(version: 3), _snap(version: 4)), isTrue);
    expect(CallSnap.isNewer(_snap(version: 9), _snap(id: 'c2')), isTrue);
  });

  test('the caller: Calling… → Ringing… → the call screen; every ending has its own screen', () {
    expect(callViewOf(_snap(), 'a', 'd').outgoing?.status, OutgoingStatus.ringing);
    expect(callViewOf(_snap(reached: true), 'a', 'd').outgoing?.reached, isTrue);
    for (final s in [CallStatus.connecting, CallStatus.live]) {
      final v = callViewOf(_snap(state: s), 'a', 'd');
      expect([v.incoming, v.outgoing, v.notice], [null, null, null]);
    }
    OutgoingStatus? ended(CallEndReason r) => callViewOf(_snap(state: CallStatus.ended, reason: r, reply: 'Call me in 10 min'), 'a', 'd').outgoing?.status;
    expect(ended(CallEndReason.unavailable), OutgoingStatus.unavailable);
    expect(ended(CallEndReason.gone), OutgoingStatus.unavailable);
    expect(ended(CallEndReason.declined), OutgoingStatus.declined);
    expect(callViewOf(_snap(state: CallStatus.ended, reason: CallEndReason.declined, reply: 'Call me in 10 min'), 'a', 'd').outgoing?.reply, 'Call me in 10 min');
    expect(ended(CallEndReason.noAnswer), OutgoingStatus.noAnswer);
    expect(ended(CallEndReason.busy), OutgoingStatus.busy);
    expect(ended(CallEndReason.failed), OutgoingStatus.failed);
    expect(ended(CallEndReason.turnedOff), OutgoingStatus.turnedOff);
    for (final r in [CallEndReason.cancelled, CallEndReason.hungUp, CallEndReason.dropped]) {
      expect(ended(r), isNull);
    }
  });

  test('the person called: the ring; then hung up, answered on another device, too late, couldn\'t connect', () {
    expect(callViewOf(_snap(), 's', 'phone').incoming?.callId, 'c1');
    expect(callViewOf(_snap(state: CallStatus.connecting, answeredBy: 'phone'), 's', 'phone').notice, isNull);
    expect(callViewOf(_snap(state: CallStatus.connecting, answeredBy: 'laptop'), 's', 'phone').notice?.kind, NoticeKind.elsewhere);
    expect(callViewOf(_snap(state: CallStatus.live, answeredBy: 'laptop'), 's', 'phone').notice?.kind, NoticeKind.elsewhere);
    NoticeKind? ended(CallEndReason r, {bool tried = false}) => callViewOf(_snap(state: CallStatus.ended, reason: r), 's', 'phone', acceptTried: tried).notice?.kind;
    expect(ended(CallEndReason.cancelled), NoticeKind.hungUp);
    expect(ended(CallEndReason.cancelled, tried: true), NoticeKind.over);
    expect(ended(CallEndReason.noAnswer, tried: true), NoticeKind.over);
    expect(ended(CallEndReason.failed), NoticeKind.failed);
    for (final r in [CallEndReason.noAnswer, CallEndReason.declined, CallEndReason.gone, CallEndReason.unavailable, CallEndReason.hungUp, CallEndReason.dropped]) {
      expect(ended(r), isNull);
    }
    final other = callViewOf(_snap(), 'x', 'd');
    expect([other.incoming, other.outgoing, other.notice], [null, null, null]);
  });
}
