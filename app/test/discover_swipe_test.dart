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
import 'package:vibe_app/screens/discover/discover_card.dart';
import 'package:vibe_app/screens/discover/discover_screen.dart';

http.Response json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

Map<String, dynamic> person(String id) => {'profile': {'id': id, 'name': 'P $id', 'age': 24}};
Map<String, dynamic> status(int likesLeft) => {'enabled': true, 'likesLeft': likesLeft, 'hasPhoto': true, 'visible': true, 'showInDiscover': true, 'likedYou': {'count': 0, 'unseen': 0}};

/// A Discover talking to a server whose swipe answers wait until the test releases them.
class Server {
  final swipes = <Completer<http.Response>>[];
  final sent = <String>[];
  var deck = <Map<String, dynamic>>[person('a'), person('b'), person('c')];
  var undo = Completer<http.Response>();
  late final RemoteDiscoverProvider d;

  Future<void> start() async {
    final api = ApiClient(
      baseUrl: 'https://api.test/v1',
      tokens: MemoryTokenStore(),
      httpClient: MockClient((req) async {
        sent.add('${req.method} ${req.url.path}');
        switch ('${req.method} ${req.url.path}') {
          case 'GET /v1/discover/status':
            return json(status(5));
          case 'GET /v1/discover/deck':
            return json({'items': deck});
          case 'POST /v1/discover/swipes':
            final c = Completer<http.Response>();
            swipes.add(c);
            return c.future;
          case 'POST /v1/discover/undo':
            return undo.future;
          default:
            return json({});
        }
      }),
    );
    await api.setTokens({'accessToken': 'a1', 'refreshToken': 'r1'});
    SharedPreferences.setMockInitialValues({});
    d = RemoteDiscoverProvider(api, RealtimeClient(api), RemoteSocialProvider(api, RealtimeClient(api)));
    await d.load();
  }

  List<String> get ids => d.deck.map((c) => c.profile.id).toList();
}

void main() {
  group('Discover swipes', () {
    test('the card leaves and the like is counted at once, before the server answers', () async {
      final s = Server();
      await s.start();
      unawaited(s.d.swipe(s.d.top!, SwipeKind.like));
      expect(s.ids, ['b', 'c']);
      expect(s.d.status!.likesLeft, 4);
    });

    test('never brings back someone whose swipe is still on its way (the refill race)', () async {
      final s = Server();
      await s.start();
      s.deck = [person('a'), person('d')]; // the server hasn't saved the pass on "a" yet
      unawaited(s.d.swipe(s.d.top!, SwipeKind.pass));
      await pumpEventQueue();
      expect(s.d.refilling, isFalse);
      expect(s.ids, ['b', 'c', 'd']);
    });

    test('only the newest answer updates the counters, so they never jump back', () async {
      final s = Server();
      await s.start();
      final first = s.d.swipe(s.d.deck[0], SwipeKind.like);
      final second = s.d.swipe(s.d.deck[0], SwipeKind.like);
      expect(s.d.status!.likesLeft, 3);
      await pumpEventQueue();
      s.swipes[1].complete(json({'matched': false, 'status': status(3)}));
      await second;
      s.swipes[0].complete(json({'matched': false, 'status': status(4)})); // late, older answer
      await first;
      expect(s.d.status!.likesLeft, 3);
    });

    test('a refused swipe puts the card back on top, marked to ease in, and restores the counter', () async {
      final s = Server();
      await s.start();
      final r = s.d.swipe(s.d.top!, SwipeKind.like);
      await pumpEventQueue();
      s.swipes[0].complete(json({'error': {'code': 'OUT_OF_LIKES', 'message': 'Out of likes'}}, 429));
      expect((await r).failure, SwipeFailure.outOfLikes);
      expect(s.ids.first, 'a');
      expect(s.d.returnedId, 'a');
      expect(s.d.status!.likesLeft, 0);
    });

    test('undo waits for the pass to reach the server first', () async {
      final s = Server();
      await s.start();
      final pass = s.d.swipe(s.d.top!, SwipeKind.pass);
      final undo = s.d.undo();
      await pumpEventQueue();
      expect(s.sent.where((x) => x.contains('/undo')), isEmpty, reason: 'undo is not sent before the pass is saved');
      s.swipes[0].complete(json({'matched': false, 'status': status(5)}));
      await pass;
      await pumpEventQueue();
      expect(s.sent.where((x) => x.contains('/undo')), hasLength(1));
      s.undo.complete(json({'card': person('a'), 'status': status(5)}));
      expect(await undo, 'ok');
      expect(s.ids.first, 'a');
      expect(s.d.returnedId, 'a');
    });

    test('counts like the server: a Super Like never uses a daily like', () {
      const st = DiscoverStatus(likesLeft: 3, freeSuperLikesLeft: 2);
      expect(afterSwipe(st, SwipeKind.like)!.likesLeft, 2);
      expect(afterSwipe(st, SwipeKind.superLike)!.likesLeft, 3);
      expect(afterSwipe(st, SwipeKind.superLike)!.freeSuperLikesLeft, 1);
      expect(afterSwipe(st, SwipeKind.pass), same(st));
    });
  });

  group('Discover screen', () {
    testWidgets('after a swipe the next card moves up in place: never shown at the old drag position', (t) async {
      // A server that hasn't answered the swipe yet — like a phone on a slow network.
      final s = Server();
      await t.runAsync(s.start);
      final d = s.d;
      await t.binding.setSurfaceSize(const Size(400, 860));
      await t.pumpWidget(ChangeNotifierProvider<DiscoverProvider>.value(
        value: d,
        child: MaterialApp(theme: V.theme(), home: const DiscoverScreen()),
      ));
      await t.pump(const Duration(milliseconds: 500));
      expect(d.deck.length, greaterThan(2));

      Finder card(String id) => find.byWidgetPredicate((w) => w is DiscoverCardView && w.card.profile.id == id);
      final first = d.deck[0].profile.id;
      final next = d.deck[1].profile.id;
      final home = t.getCenter(card(first)).dx;
      final nextState = t.element(card(next));

      // Drag well past the threshold and let go: a pass.
      await t.drag(card(first), const Offset(-220, 0));
      var worst = 0.0;
      for (var i = 0; i < 40; i++) {
        await t.pump(const Duration(milliseconds: 16));
        if (card(next).evaluate().isNotEmpty) worst = (t.getCenter(card(next)).dx - home).abs() > worst ? (t.getCenter(card(next)).dx - home).abs() : worst;
      }
      await t.pump(const Duration(milliseconds: 500));

      expect(d.top!.profile.id, next);
      expect(worst, lessThan(1), reason: 'the next card stays in the centre column the whole time');
      expect(identical(t.element(card(next)), nextState), isTrue, reason: 'same widget moved up — the photo is not reloaded');

      // Now the server answers; nothing on screen moves.
      for (final c in s.swipes) {
        c.complete(json({'matched': false, 'status': status(5)}));
      }
      await t.pump(const Duration(seconds: 1));
      expect(d.top!.profile.id, next);
      await t.pumpWidget(const SizedBox());
      await t.pump(const Duration(seconds: 30)); // let the API client's timeouts lapse
    });
  });
}
