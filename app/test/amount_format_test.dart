import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/core/theme/vibe_widgets.dart';
import 'package:vibe_app/core/util/format.dart';

void main() {
  test('amounts go short in at most 5 characters and never round up (same as web)', () {
    const cases = {
      0: '0',
      30: '30',
      9999: '9,999',
      10000: '10K',
      12345: '12.3K',
      99999: '99.9K',
      100000: '100K',
      999999: '999K',
      1000000: '1M',
      1250000: '1.25M',
      1259999: '1.25M',
      45678901: '45.6M',
      999999999: '999M',
      3400000000: '3.4B',
      1200000000000: '1.2T',
      5000000000000000: '999T+',
      -12345: '-12.3K',
    };
    cases.forEach((n, want) {
      expect(Fmt.compact(n), want, reason: '$n');
      expect(Fmt.compact(n).replaceAll('-', '').length, lessThanOrEqualTo(5));
    });
    expect(Fmt.figure(999999), '999,999');
    expect(Fmt.figure(1234567), '1.23M');
    expect(Fmt.pkrCompact(12499.6), 'Rs 12.5K');
    expect(Fmt.usdCompact(12.5), '\$12.50');
    expect(Fmt.usdCompact(1250000), '\$1.25M');
  });

  testWidgets('the coin chip is the same width at 30, 9,999 and 1.25M', (t) async {
    final widths = <double>[];
    for (final n in [30, 9999, 12345, 1250000, 3400000000]) {
      await t.pumpWidget(MaterialApp(theme: V.theme(), home: Scaffold(body: Center(child: CoinChip(coins: n, onTap: () {})))));
      widths.add(t.getSize(find.byType(CoinChip)).width);
      expect(find.bySemanticsLabel(RegExp('^${Fmt.thousands(n)} coins')), findsOneWidget);
    }
    expect(widths.toSet().length, 1, reason: '$widths');
  });
}
