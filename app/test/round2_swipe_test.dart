import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/screens/match/swipe.dart';

void main() {
  test('swipe up: far enough or a quick flick; never down', () {
    expect(isSwipeNext(-swipeNextPx, 0), isTrue);
    expect(isSwipeNext(-60, -100), isFalse);
    expect(isSwipeNext(-60, -900), isTrue);
    expect(isSwipeNext(-20, -2000), isFalse);
    expect(isSwipeNext(200, 0), isFalse);
  });

  testWidgets('swipe up calls next; a small drag stays; double-tap likes', (t) async {
    var next = 0, likes = 0;
    await t.pumpWidget(MaterialApp(
      theme: V.theme(),
      home: Scaffold(body: SwipeStage(onNext: () => next++, onLike: () => likes++, child: const ColoredBox(color: V.surface2, child: SizedBox.expand()))),
    ));
    await t.drag(find.byType(SwipeStage), const Offset(0, -60));
    await t.pumpAndSettle();
    expect(next, 0);
    await t.drag(find.byType(SwipeStage), const Offset(0, -220));
    await t.pump();
    expect(next, 1);
    await t.pumpAndSettle();

    final c = t.getCenter(find.byType(SwipeStage));
    await t.tapAt(c);
    await t.pump(const Duration(milliseconds: 80));
    await t.tapAt(c);
    await t.pumpAndSettle();
    expect(likes, 1);
  });

  testWidgets('first-call hint: seen once', (t) async {
    SharedPreferences.setMockInitialValues({});
    expect(await swipeHintSeen(), isFalse);
    var done = false;
    await t.pumpWidget(MaterialApp(theme: V.theme(), home: Scaffold(body: SwipeHint(onDone: () => done = true))));
    expect(find.textContaining('next person'), findsOneWidget);
    await t.tap(find.text('Got it'));
    expect(done, isTrue);
    await markSwipeHintSeen();
    expect(await swipeHintSeen(), isTrue);
  });
}
