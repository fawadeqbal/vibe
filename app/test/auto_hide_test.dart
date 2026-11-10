import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/screens/calls/auto_hide.dart';

void main() {
  testWidgets('hides 4 s after the last tap; a tap brings them back', (tester) async {
    final a = AutoHide();
    final seen = <bool>[];
    a.addListener(() => seen.add(a.shown));
    a.poke();
    await tester.pump(autoHideDelay - const Duration(milliseconds: 1));
    expect(a.shown, isTrue);
    a.poke();
    await tester.pump(autoHideDelay - const Duration(milliseconds: 1));
    expect(a.shown, isTrue);
    await tester.pump(const Duration(milliseconds: 1));
    expect(a.shown, isFalse);
    a.poke();
    expect(a.shown, isTrue);
    expect(seen, [false, true]);
    a.dispose();
  });

  testWidgets('a tap on the video hides them at once', (tester) async {
    final a = AutoHide()..poke();
    a.hide();
    expect(a.shown, isFalse);
    a.poke();
    await tester.pump(autoHideDelay);
    expect(a.shown, isFalse);
    a.dispose();
  });

  testWidgets('stay up while held, then count down again', (tester) async {
    final a = AutoHide()..poke();
    await tester.pump(autoHideDelay);
    expect(a.shown, isFalse);
    a.hold(true);
    expect(a.shown, isTrue);
    a.hide();
    await tester.pump(autoHideDelay * 3);
    expect(a.shown, isTrue);
    a.hold(false);
    await tester.pump(autoHideDelay);
    expect(a.shown, isFalse);
    a.dispose();
  });
}
