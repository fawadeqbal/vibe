import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/services/push/call_ringer.dart';
import 'package:vibe_calls/vibe_calls.dart';

void main() {
  test('a call has one notification id: stable, positive, and the same as the native side', () {
    // FNV-1a 32-bit of "abc" is 0x1a47e90b; the native side (Call.java) masks to 31 bits too.
    expect(VibeCalls.notificationId('abc'), 0x1a47e90b & 0x7fffffff);
    expect(VibeCalls.notificationId(''), 0x811c9dc5 & 0x7fffffff);
    const id = 'cmh8x0k2p0001abcd';
    expect(CallRinger.idFor(id), VibeCalls.notificationId(id));
    expect(CallRinger.idFor(id), greaterThanOrEqualTo(0));
  });
}
