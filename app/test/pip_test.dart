import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/screens/calls/call_ui.dart';

void main() {
  const size = Size(390, 844);
  test('each corner keeps clear of the header, the controls and the safe areas (same as the web)', () {
    expect(pipPoint(PipCorner.tr, size, EdgeInsets.zero), const Offset(278, 78));
    expect(pipPoint(PipCorner.tl, size, EdgeInsets.zero), const Offset(12, 78));
    expect(pipPoint(PipCorner.br, size, EdgeInsets.zero), const Offset(278, 572));
    expect(pipPoint(PipCorner.bl, size, const EdgeInsets.only(top: 47, bottom: 34)), const Offset(12, 538));
  });

  test('let go: it snaps to the nearest corner', () {
    expect(pipNearest(const Offset(20, 100), size), PipCorner.tl);
    expect(pipNearest(const Offset(260, 90), size), PipCorner.tr);
    expect(pipNearest(const Offset(30, 600), size), PipCorner.bl);
    expect(pipNearest(const Offset(250, 500), size), PipCorner.br);
  });

  testWidgets('tap swaps, drag moves it to another corner', (t) async {
    var taps = 0;
    PipCorner? corner;
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 390,
          height: 844,
          child: PipLayer(onTap: () => taps++, onCorner: (c) => corner = c, child: const ColoredBox(color: Colors.red)),
        ),
      ),
    ));
    final tile = find.byType(ColoredBox).last;
    expect(t.getTopLeft(tile).dx, greaterThan(200)); // starts top right
    await t.tap(tile);
    expect(taps, 1);
    await t.drag(tile, const Offset(-250, 500));
    await t.pumpAndSettle();
    expect(corner, PipCorner.bl);
    expect(t.getTopLeft(tile).dx, lessThan(40));
    expect(taps, 1);
  });
}
