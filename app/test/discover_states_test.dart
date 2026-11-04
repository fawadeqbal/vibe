import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/realtime_client.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/discover.dart';
import 'package:vibe_app/providers/discover_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/screens/discover/discover_screen.dart';
import 'package:vibe_app/screens/discover/discover_states.dart';

http.Response json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

Map<String, dynamic> status([Map<String, dynamic> x = const {}]) => {
      'enabled': true,
      'likesLeft': 19,
      'hasPhoto': true,
      'visible': true,
      'showInDiscover': true,
      'likedYou': {'count': 0, 'unseen': 0},
      ...x,
    };
Map<String, dynamic> person(String id) => {'profile': {'id': id, 'name': 'Ayesha', 'age': 23}};

/// What the deck endpoint does in a case.
enum Deck { people, none, fails, hangs }

/// Renders Discover against a fake server in one state.
Future<RemoteDiscoverProvider> show(WidgetTester t, {required Size size, Map<String, dynamic> st = const {}, Deck deck = Deck.people, List<String>? filters}) async {
  final hang = Completer<http.Response>();
  final api = ApiClient(
    baseUrl: 'https://api.test/v1',
    tokens: MemoryTokenStore(),
    httpClient: MockClient((req) async {
      switch (req.url.path) {
        case '/v1/discover/status':
          return json(status(st));
        case '/v1/discover/deck':
          return switch (deck) {
            Deck.people => json({'items': [person('a'), person('b')]}),
            Deck.none => json({'items': []}),
            Deck.fails => json({'error': {'code': 'UNAVAILABLE', 'message': 'down'}}, 503),
            Deck.hangs => hang.future,
          };
        default:
          return json({});
      }
    }),
  );
  await t.runAsync(() => api.setTokens({'accessToken': 'a1', 'refreshToken': 'r1'}));
  SharedPreferences.setMockInitialValues({if (filters != null) 'vibe.discover.filters': filters});
  final d = RemoteDiscoverProvider(api, RealtimeClient(api), RemoteSocialProvider(api, RealtimeClient(api)));
  await t.binding.setSurfaceSize(size);
  await t.pumpWidget(ChangeNotifierProvider<DiscoverProvider>.value(value: d, child: MaterialApp(theme: V.theme(), home: DiscoverScreen(onOpenMatch: () {}))));
  for (var i = 0; i < 6; i++) {
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await t.pump(const Duration(milliseconds: 100));
  }
  return d;
}

/// The like button can be tapped (not just shown).
bool likeEnabled(WidgetTester t) {
  final like = find.bySemanticsLabel(RegExp(r'^Like'));
  if (like.evaluate().isEmpty) return false;
  return isSemantics(isEnabled: true).matches(t.getSemantics(like.first), <dynamic, dynamic>{});
}

void main() {
  const small = Size(360, 640);
  const phone = Size(400, 860);

  for (final size in [small, phone]) {
    final at = '${size.width.toInt()}×${size.height.toInt()}';
    group('Discover states at $at', () {
      testWidgets('all caught up: no action buttons, fits', (t) async {
        await show(t, size: size, deck: Deck.none);
        expect(find.text('Meet someone live'), findsOneWidget);
        expect(find.bySemanticsLabel(RegExp(r'^Like')), findsNothing);
        expect(t.takeException(), isNull);
      });

      testWidgets('filters hide everyone: every filter is a chip, fits', (t) async {
        await show(t, size: size, deck: Deck.none, filters: ['women', '22', '30', 'AE', '1', '1']);
        for (final chip in ['Online now', 'Women', 'Verified only', 'Ages 22–30']) {
          expect(find.bySemanticsLabel('Remove $chip'), findsOneWidget, reason: chip);
        }
        expect(find.text('Show everyone'), findsOneWidget);
        expect(find.bySemanticsLabel(RegExp(r'^Like')), findsNothing);
        expect(t.takeException(), isNull);
      });

      testWidgets("can't reach Vibe: retry, no action buttons, fits", (t) async {
        await show(t, size: size, deck: Deck.fails);
        expect(find.text('Try again'), findsOneWidget);
        expect(find.bySemanticsLabel(RegExp(r'^Like')), findsNothing);
        expect(t.takeException(), isNull);
      });

      testWidgets('no photo: the deck is behind the gate — nothing can be swiped', (t) async {
        await show(t, size: size, st: {'hasPhoto': false, 'visible': false});
        expect(find.text('Add a photo'), findsOneWidget);
        expect(find.bySemanticsLabel(RegExp(r'^Like')), findsNothing, reason: 'no swiping a card you cannot see');
        expect(t.takeException(), isNull);
      });

      testWidgets('resting: same frame, header without counters', (t) async {
        await show(t, size: size, st: {'enabled': false}, deck: Deck.none);
        expect(find.byType(DeckResting), findsOneWidget);
        expect(find.textContaining('likes left'), findsNothing);
        expect(t.takeException(), isNull);
      });

      testWidgets('loading: buttons shown but all disabled; after 8 s it says so and offers a retry', (t) async {
        await show(t, size: size, deck: Deck.hangs);
        expect(find.text('Finding people for you…'), findsOneWidget);
        expect(find.bySemanticsLabel(RegExp(r'^Like')), findsOneWidget);
        expect(likeEnabled(t), isFalse);
        await t.pump(const Duration(seconds: 9));
        expect(find.text('Taking longer than usual…'), findsOneWidget);
        expect(find.text('Try again'), findsOneWidget);
        expect(t.takeException(), isNull);
        await t.pumpWidget(const SizedBox());
        await t.pump(const Duration(seconds: 30));
      });

      testWidgets('cards: buttons work', (t) async {
        await show(t, size: size);
        expect(likeEnabled(t), isTrue);
        expect(t.takeException(), isNull);
      });
    });
  }

  test('removing one filter keeps the others', () {
    const f = DiscoverFilters(gender: WantedGender.women, minAge: 22, maxAge: 30, countryCode: 'AE', onlineOnly: true, verifiedOnly: true);
    final gender = activeFilters(f).firstWhere((a) => a.key == 'gender').without;
    expect(gender.gender, WantedGender.anyone);
    expect(gender.countryCode, 'AE');
    expect(gender.onlineOnly, isTrue);
    expect(gender.minAge, 22);
  });
}
