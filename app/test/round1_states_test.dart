import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/discover.dart';
import 'package:vibe_app/screens/discover/discover_states.dart';
import 'package:vibe_app/screens/match/match_sheets.dart';

Widget _app(Widget child) => MaterialApp(theme: V.theme(), home: Scaffold(body: SingleChildScrollView(child: child)));

void main() {
  setUp(() {});

  group('discover filters that hide people', () {
    test('none for the defaults; each one removable on its own', () {
      expect(activeFilters(const DiscoverFilters()), isEmpty);
      final a = activeFilters(const DiscoverFilters(gender: WantedGender.women, minAge: 22, maxAge: 30));
      expect(a.map((x) => x.label), ['Women', 'Ages 22–30']);
      expect(a.first.without.gender, WantedGender.anyone);
      expect(a.first.without.minAge, 22);
      expect(a.last.without.minAge, 18);
      expect(a.last.without.gender, WantedGender.women);
    });
  });

  group('screens', () {
    setUp(() {
      final binding = TestWidgetsFlutterBinding.ensureInitialized();
      binding.platformDispatcher.views.first.physicalSize = const Size(1170, 2532);
      binding.platformDispatcher.views.first.devicePixelRatio = 3;
    });
    tearDown(() {
      final v = TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
      v.resetPhysicalSize();
      v.resetDevicePixelRatio();
    });

    testWidgets('filters too narrow: remove one, or show everyone', (t) async {
      DiscoverFilters? picked;
      await t.pumpWidget(MaterialApp(
        theme: V.theme(),
        home: Scaffold(
          body: SizedBox(
            height: 700,
            child: DeckEmpty(filters: const DiscoverFilters(gender: WantedGender.men, minAge: 40, maxAge: 41), onSetFilters: (f) => picked = f, onEditFilters: () {}),
          ),
        ),
      ));
      expect(find.text('Men'), findsOneWidget);
      expect(find.text('Ages 40–41'), findsOneWidget);
      await t.tap(find.byTooltip('Remove Men'));
      expect(picked?.gender, WantedGender.anyone);
      expect(picked?.minAge, 40);
      await t.tap(find.text('Show everyone'));
      expect(picked?.minAge, 18);
    });

    testWidgets('all caught up without filters', (t) async {
      await t.pumpWidget(MaterialApp(theme: V.theme(), home: Scaffold(body: SizedBox(height: 700, child: DeckEmpty(filters: const DiscoverFilters(), onSetFilters: (_) {}, onEditFilters: () {}, onMeetLive: () {})))));
      expect(find.text('Meet someone live'), findsOneWidget);
      expect(find.textContaining('caught up'), findsOneWidget);
    });

    testWidgets('no photo, offline, out of likes', (t) async {
      var looked = false;
      await t.pumpWidget(MaterialApp(theme: V.theme(), home: Scaffold(body: SizedBox(height: 760, child: NoPhotoPanel(onAddPhoto: () {}, onLookAround: () => looked = true)))));
      expect(find.text('Add a photo'), findsWidgets);
      await t.tap(find.text('Just look around for now'));
      expect(looked, isTrue);

      var retried = false;
      await t.pumpWidget(MaterialApp(theme: V.theme(), home: Scaffold(body: SizedBox(height: 700, child: DeckOffline(offline: true, onRetry: () => retried = true)))));
      expect(find.textContaining('offline'), findsOneWidget);
      await t.tap(find.text('Try again'));
      expect(retried, isTrue);

      await t.pumpWidget(_app(OutOfLikesBanner(resetsAt: DateTime.now().add(const Duration(hours: 3)), onMore: () {})));
      expect(find.textContaining('3 hours'), findsOneWidget);
    });

    testWidgets('camera blocked sheet: steps, Try again', (t) async {
      CameraFix? fix;
      await t.pumpWidget(MaterialApp(
        theme: V.theme(),
        home: Builder(builder: (ctx) => Scaffold(body: Center(child: TextButton(onPressed: () async => fix = await Navigator.of(ctx).push(MaterialPageRoute(builder: (_) => const Scaffold(body: CameraBlockedSheet(checkPermissions: false)))), child: const Text('go'))))),
      ));
      await t.tap(find.text('go'));
      await t.pumpAndSettle();
      expect(find.text("Vibe can't use your camera"), findsOneWidget);
      expect(find.text('Open Settings'), findsOneWidget);
      await t.tap(find.text("I've allowed it — try again"));
      await t.pumpAndSettle();
      expect(fix, CameraFix.retry);
    });

    testWidgets('filter needs coins: free option, no video row without ads', (t) async {
      await t.pumpWidget(_app(const FilterCoinsSheet(cost: 10, coins: 4, filterLabel: 'Women', adsAvailable: false)));
      expect(find.text('Match with anyone — free'), findsOneWidget);
      expect(find.text('You have 4'), findsOneWidget);
      expect(find.textContaining('video'), findsNothing);
    });

    testWidgets('cooldown sheet counts down and carries on by itself', (t) async {
      CooldownChoice? choice;
      await t.pumpWidget(MaterialApp(
        theme: V.theme(),
        home: Builder(
          builder: (ctx) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () async => choice = await Navigator.of(ctx).push(MaterialPageRoute(builder: (_) => Scaffold(body: CooldownSheet(until: DateTime.now().add(const Duration(seconds: 2)), bypassCost: 5, skipped: 5)))),
                child: const Text('go'),
              ),
            ),
          ),
        ),
      ));
      await t.tap(find.text('go'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 400));
      expect(find.textContaining('Skip the wait'), findsOneWidget);
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 2300)));
      await t.pump(const Duration(milliseconds: 300));
      await t.pumpAndSettle();
      expect(choice, CooldownChoice.next);
    });
  });
}
