import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/core/api/api_exception.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/discover.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/screens/discover/discover_states.dart';
import 'package:vibe_app/screens/match/call_states.dart';

const _sana = Profile(id: 'u2', name: 'Sana', age: 24, gender: Gender.female, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: '');

Widget _app(Widget child) => MaterialApp(theme: V.theme(), home: Scaffold(body: SingleChildScrollView(child: child)));

void main() {
  test('paused countdown: a clock under a day, days and hours beyond', () {
    expect(pausedFor(65), '01:05');
    expect(pausedFor(23 * 3600 + 41 * 60 + 5), '23:41:05');
    expect(pausedFor(86400), '1 day');
    expect(pausedFor(2 * 86400 + 4 * 3600 + 30), '2 days 4h');
    expect(pausedFor(-5), '00:00');
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

    testWidgets('partner camera off says so', (t) async {
      await t.pumpWidget(MaterialApp(theme: V.theme(), home: const Scaffold(body: CameraOffCover(partner: _sana))));
      expect(find.text('Sana turned their camera off'), findsOneWidget);
      expect(find.textContaining('still talk'), findsOneWidget);
    });

    testWidgets('appeal: needs a few words, sends, shows the server error', (t) async {
      final sent = <String>[];
      var fail = true;
      Future<void> send(String m) async {
        if (fail) {
          fail = false;
          throw ApiException('RATE_LIMITED', 'Slow down a little');
        }
        sent.add(m);
      }

      await t.pumpWidget(_app(AppealSheet(send: send)));
      await t.tap(find.text('Send'));
      expect(sent, isEmpty); // too short: disabled
      await t.enterText(find.byType(TextField), 'I was only saying hi, honestly.');
      await t.pump();
      await t.tap(find.text('Send'));
      await t.pump();
      expect(find.text('Slow down a little'), findsOneWidget);
      await t.tap(find.text('Send'));
      await t.pump();
      expect(sent, ['I was only saying hi, honestly.']);
    });

    testWidgets('welcome back lists what happened', (t) async {
      await t.pumpWidget(_app(const WelcomeBackSheet(awayDays: 3, likesSince: 2, newPeople: 1, freeLikes: 20)));
      expect(find.text('2 people liked you'), findsOneWidget);
      expect(find.text('1 new person to see'), findsOneWidget);
      expect(find.text('Your 20 free likes are ready'), findsOneWidget);
      expect(find.text('See who liked you'), findsOneWidget);
    });

    testWidgets('all caught up: tell me when new people join', (t) async {
      bool? asked;
      Widget deck(bool on) => MaterialApp(
            theme: V.theme(),
            home: Scaffold(body: SizedBox(height: 800, child: DeckEmpty(filters: const DiscoverFilters(), onSetFilters: (_) {}, onEditFilters: () {}, notifyOn: on, onNotify: (v) => asked = v))),
          );
      await t.pumpWidget(deck(false));
      await t.tap(find.text('Tell me when new people join'));
      expect(asked, true);
      await t.pumpWidget(deck(true));
      expect(find.text("We'll tell you when new people join"), findsOneWidget);
      await t.tap(find.text('Turn off'));
      expect(asked, false);
    });
  });
}
