import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/screens/splash_screen.dart';

/// Splash (design handoff "Vibe Splash Live"): the gate keeps the animated
/// splash up until boot is done and the entrance has played, then fades out.
void main() {
  Future<StateSetter> pumpGate(WidgetTester t, bool Function() ready) async {
    late StateSetter set;
    await t.pumpWidget(MaterialApp(
      theme: V.theme(),
      home: StatefulBuilder(builder: (c, s) {
        set = s;
        return SplashGate(ready: ready(), builder: (_) => const Text('HOME'));
      }),
    ));
    return set;
  }

  testWidgets('fast boot still shows the entrance, then fades out', (t) async {
    var ready = false;
    final set = await pumpGate(t, () => ready);
    set(() => ready = true);
    await t.pump(const Duration(milliseconds: 500));
    expect(find.byType(SplashScreen), findsOneWidget);
    expect(find.text('HOME'), findsNothing);
    await t.pump(SplashGate.minVisible);
    await t.pump(const Duration(milliseconds: 300));
    await t.pump();
    expect(find.text('HOME'), findsOneWidget);
    expect(find.byType(SplashScreen), findsNothing);
  });

  testWidgets('slow boot keeps the splash looping until ready', (t) async {
    var ready = false;
    final set = await pumpGate(t, () => ready);
    await t.pump(const Duration(seconds: 5));
    expect(find.byType(SplashScreen), findsOneWidget);
    set(() => ready = true);
    await t.pump();
    await t.pump(const Duration(milliseconds: 300));
    await t.pump();
    expect(find.text('HOME'), findsOneWidget);
  });

  testWidgets('reduced motion: nothing keeps animating after the fades', (t) async {
    await t.pumpWidget(MediaQuery(
      data: const MediaQueryData(disableAnimations: true, size: Size(412, 892)),
      child: MaterialApp(theme: V.theme(), home: const SplashScreen()),
    ));
    await t.pump(const Duration(seconds: 3));
    await t.pumpAndSettle();
    expect(find.text('Vibe'), findsOneWidget);
  });
}
