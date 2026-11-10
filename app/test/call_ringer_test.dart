import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/services/push/call_ringer.dart';

void main() {
  test('one notification id per call, stable, so the missed call can stop the ringing', () {
    expect(CallRinger.idFor('c-1'), CallRinger.idFor('c-1'));
    expect(CallRinger.idFor('c-1'), isNot(CallRinger.idFor('c-2')));
    expect(CallRinger.idFor('c-1'), greaterThanOrEqualTo(0));
  });

  test('only call pushes are handled here; in the app the call shows itself', () async {
    expect(await CallRinger.handle({'open': 'chat', 'friendId': 'u1'}), isFalse);
    expect(await CallRinger.handle({'open': 'call'}), isFalse); // no call id
    expect(await CallRinger.handle({'open': 'call', 'callId': 'c1'}, foreground: true), isTrue);
  });
}
