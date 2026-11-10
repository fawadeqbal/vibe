import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/core/theme/vibe_widgets.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/store/wallet_history.dart';

void main() {
  test('history pages through every line, newest first, and filters coins or gems', () async {
    SharedPreferences.setMockInitialValues({});
    final w = WalletProvider(MockBackend());
    await w.load();
    for (var i = 0; i < 12; i++) {
      await w.earn(1, 'Reward $i');
    }
    final p1 = await w.historyPage(limit: 5);
    expect(p1.items.map((t) => t.title).take(2), ['Reward 11', 'Reward 10']);
    expect(p1.next, isNotNull);
    final p2 = await w.historyPage(limit: 5, cursor: p1.next);
    final p3 = await w.historyPage(limit: 5, cursor: p2.next);
    final all = [...p1.items, ...p2.items, ...p3.items];
    expect(all, hasLength(13)); // 12 rewards + the welcome bonus
    expect(p3.next, isNull);
    expect({for (final t in all) t.id}, hasLength(13));
    expect((await w.historyPage(currency: 'gems')).items, isEmpty);
    expect((await w.transactionDetail(all.first.id))?.tx.title, 'Reward 11');
    expect(await w.transactionDetail('nope'), isNull);
  });

  testWidgets('a paged list loads the next page as you scroll and stops at the end', (tester) async {
    var calls = 0;
    Future<ListPage<String>> load(String? cursor) async {
      calls++;
      final start = cursor == null ? 0 : int.parse(cursor);
      final items = [for (var i = start; i < start + 20 && i < 45; i++) 'Row $i'];
      final end = start + items.length;
      return (items: items, next: end < 45 ? '$end' : null);
    }

    await tester.pumpWidget(
      MaterialApp(
        theme: V.theme(),
        home: Scaffold(
          body: PagedList<String>(
            load: load,
            idOf: (s) => s,
            build: (items) => [for (final s in items) SizedBox(height: 60, child: Text(s))],
            empty: const EmptyState(icon: Icons.inbox, title: 'Nothing', body: ''),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(calls, 1);
    expect(find.text('Row 0'), findsOneWidget);
    for (var i = 0; i < 12; i++) {
      await tester.drag(find.byType(ListView), const Offset(0, -900));
      await tester.pumpAndSettle();
    }
    expect(find.text('Row 44'), findsOneWidget);
    expect(calls, 3);
    // At the end: no more calls however far you scroll.
    await tester.drag(find.byType(ListView), const Offset(0, -900));
    await tester.pumpAndSettle();
    expect(calls, 3);
  });
}
