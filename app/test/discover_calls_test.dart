import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/mappers.dart';
import 'package:vibe_app/core/api/realtime_client.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/discover.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/calls_provider.dart';
import 'package:vibe_app/providers/discover_provider.dart';
import 'package:vibe_app/providers/match_provider.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/social/chat_calls.dart';
import 'package:vibe_app/screens/store/vip_screen.dart';
import 'package:vibe_app/services/push/push_route.dart';

http.Response json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('mappers', () {
    test('system chat lines keep their event; gifts and text stay as they were', () {
      final sys = ApiMap.message({'id': 'm1', 'fromMe': false, 'kind': 'system', 'text': 'You matched in Discover', 'meta': {'event': 'matched', 'via': 'discover'}, 'at': '2026-10-29T10:00:00Z'});
      expect(sys.isSystem, isTrue);
      expect(sys.event, 'matched');
      expect(sys.gift, isNull);
      final text = ApiMap.message({'id': 'm2', 'fromMe': true, 'text': 'hi'});
      expect(text.kind, MessageKind.text);
      expect(text.isSystem, isFalse);
    });

    test('friends carry who allowed calls', () {
      final f = ApiMap.friend({'profile': {'id': 'u2', 'name': 'Sana'}, 'state': 'friends', 'calls': {'mine': true, 'theirs': true}});
      expect(f.calls.on, isTrue);
      final g = ApiMap.friend({'profile': {'id': 'u3'}, 'state': 'friends'});
      expect(g.calls.on, isFalse);
    });

    test('discover status: unlimited likes for VIP, counts of likes waiting', () {
      final s = ApiMap.discoverStatus({'enabled': true, 'vip': true, 'likesLeft': null, 'likedYou': {'count': 3, 'unseen': 1}, 'superLikeCost': 10});
      expect(s.likesLeft, isNull);
      expect(s.likedYouCount, 3);
      expect(s.likedYouUnseen, 1);
      final free = ApiMap.discoverStatus({'likesLeft': 0});
      expect(free.likesLeft, 0);
    });

    test('push routes for Discover and calls', () {
      expect(PushRoute.fromData({'route': 'discover'})?.target, PushTarget.discover);
      expect(PushRoute.fromData({'route': 'call', 'friendId': 'u2'}), const PushRoute(PushTarget.call, friendId: 'u2'));
    });

    test('free likes come back in plain words', () {
      final now = DateTime(2026, 10, 29, 12);
      expect(comesBackIn(now.add(const Duration(minutes: 40)), now: now), '40 minutes');
      expect(comesBackIn(now.add(const Duration(hours: 3)), now: now), '3 hours');
      expect(comesBackIn(now.add(const Duration(hours: 1)), now: now), '1 hour');
    });
  });

  group('Discover on the server', () {
    test('swipes, out of likes and a match hit the right endpoints', () async {
      final sent = <String>[];
      final api = ApiClient(
        baseUrl: 'https://api.test/v1',
        tokens: MemoryTokenStore(),
        httpClient: MockClient((req) async {
          sent.add('${req.method} ${req.url.path}${req.body.isEmpty ? '' : ' ${req.body}'}');
          final body = req.body.isEmpty ? <String, dynamic>{} : jsonDecode(req.body) as Map<String, dynamic>;
          return switch ('${req.method} ${req.url.path}') {
            'GET /v1/discover/status' => json({'enabled': true, 'likesLeft': 2, 'likedYou': {'count': 1, 'unseen': 1}}),
            'GET /v1/discover/deck' => json({
                'items': [
                  {'profile': {'id': 'u2', 'name': 'Ayesha', 'age': 23}, 'superLikedMe': true},
                  {'profile': {'id': 'u3', 'name': 'Hamza', 'age': 26}},
                ],
              }),
            'POST /v1/discover/swipes' when body['userId'] == 'u2' => json({
                'matched': true,
                'friend': {'profile': {'id': 'u2', 'name': 'Ayesha'}, 'state': 'friends'},
                'coinsSpent': 0,
                'status': {'likesLeft': 1},
              }),
            'POST /v1/discover/swipes' => json({'error': {'code': 'OUT_OF_LIKES', 'message': "You're out of likes for today"}}, 429),
            'GET /v1/friends' => json([]),
            _ => json({}),
          };
        }),
      );
      await api.setTokens({'accessToken': 'a1', 'refreshToken': 'r1'});
      final backend = MockBackend();
      SharedPreferences.setMockInitialValues({});
      final social = RemoteSocialProvider(api, RealtimeClient(api));
      final d = RemoteDiscoverProvider(api, RealtimeClient(api), social);
      await d.load();
      expect(d.deck.map((c) => c.profile.name), ['Ayesha', 'Hamza']);
      expect(d.top!.superLikedMe, isTrue);
      expect(d.status!.likesLeft, 2);

      final r = await d.swipe(d.top!, SwipeKind.like);
      expect(r.ok, isTrue);
      expect(r.matched!.profile.id, 'u2');
      expect(d.matched!.profile.name, 'Ayesha');
      expect(d.status!.likesLeft, 1);

      final out = await d.swipe(d.top!, SwipeKind.like);
      expect(out.failure, SwipeFailure.outOfLikes);
      expect(d.top!.profile.name, 'Hamza', reason: 'the card comes back');
      expect(d.status!.likesLeft, 0);
      expect(sent.where((s) => s.startsWith('POST /v1/discover/swipes')).first, contains('"kind":"like"'));
      expect(backend, isNotNull);
    });
  });

  group('Discover offline', () {
    test('likes count down, a Super Like costs coins, undo brings a pass back', () async {
      SharedPreferences.setMockInitialValues({});
      final backend = MockBackend();
      final wallet = WalletProvider(backend);
      await wallet.load();
      final social = SocialProvider(backend, wallet);
      await social.load();
      final d = DiscoverProvider(social, wallet);
      await d.load();
      expect(d.deck, isNotEmpty);
      final left = d.status!.likesLeft!;

      final first = d.top!;
      await d.swipe(first, SwipeKind.pass);
      expect(d.lastPassed?.profile.id, first.profile.id);
      final coinsBefore = wallet.coins;
      expect(await d.undo(), 'ok');
      expect(d.top!.profile.id, first.profile.id);
      expect(wallet.coins, coinsBefore - Economy.discoverUndoCost);

      // Like until we hit someone who already liked us: a match.
      SwipeOutcome? r;
      while (d.top != null && (r == null || r.matched == null)) {
        r = await d.swipe(d.top!, SwipeKind.like);
        if (!r.ok) break;
      }
      expect(r?.matched, isNotNull);
      expect(d.status!.likesLeft, lessThan(left));
      expect(social.friend(r!.matched!.profile.id), isNotNull);
      expect(social.messages(r.matched!.profile.id).last.event, 'matched');
    });
  });

  group('Discover filters', () {
    test('age is free; the rest need VIP or a pass; status says why', () {
      const f = DiscoverFilters(minAge: 22, maxAge: 28);
      expect(f.usesExtra, isFalse);
      expect(f.copyWith(countryCode: 'PK').usesExtra, isTrue);
      expect(f.copyWith(onlineOnly: true).usesExtra, isTrue);
      expect(const DiscoverFilters(gender: WantedGender.men, countryCode: 'AE', verifiedOnly: true, minAge: 22, maxAge: 28).freeOnly.usesExtra, isFalse);
      final s = ApiMap.discoverStatus({'filters': {'unlocked': false, 'passCost': 30, 'passHours': 12}});
      expect(s.filters.unlocked, isFalse);
      expect(s.filters.passCost, 30);
      expect(ApiMap.discoverStatus({'filters': {'unlocked': true, 'reason': 'vibe_hour'}}).filters.reason, FilterReason.vibeHour);
    });

    test('locked filters on the server fall back to age only', () async {
      final queries = <Map<String, String>>[];
      final api = ApiClient(
        baseUrl: 'https://api.test/v1',
        tokens: MemoryTokenStore(),
        httpClient: MockClient((req) async {
          if (req.url.path == '/v1/discover/deck') {
            queries.add(req.url.queryParameters);
            if (req.url.queryParameters.containsKey('countryCode')) return json({'error': {'code': 'FILTERS_LOCKED', 'message': 'locked'}}, 402);
            return json({'items': []});
          }
          if (req.url.path == '/v1/discover/filter-pass') return json({'filters': {'unlocked': true, 'reason': 'pass'}});
          return json({'filters': {'unlocked': false}});
        }),
      );
      await api.setTokens({'accessToken': 'a1', 'refreshToken': 'r1'});
      SharedPreferences.setMockInitialValues({});
      final d = RemoteDiscoverProvider(api, RealtimeClient(api), RemoteSocialProvider(api, RealtimeClient(api)));
      await d.setFilters(const DiscoverFilters(countryCode: 'PK', minAge: 20, maxAge: 30));
      expect(d.filters.countryCode, '');
      expect(d.filters.minAge, 20);
      expect(d.filtersExpired, isTrue);
      expect(queries.last.containsKey('countryCode'), isFalse);
      expect(await d.buyFilterPass(), isTrue);
      expect(d.status!.filters.reason, FilterReason.pass);
    });

    test('offline: a pass costs coins and opens the filters', () async {
      SharedPreferences.setMockInitialValues({});
      final backend = MockBackend();
      final wallet = WalletProvider(backend);
      await wallet.load();
      final social = SocialProvider(backend, wallet);
      await social.load();
      final d = DiscoverProvider(social, wallet);
      await d.load();
      expect(d.status!.filters.unlocked, isFalse);
      final coins = wallet.coins;
      expect(await d.buyFilterPass(), isTrue);
      expect(wallet.coins, coins - Economy.discoverFilterPassCost);
      expect(d.status!.filters.reason, FilterReason.pass);
      await d.setFilters(const DiscoverFilters(gender: WantedGender.women, verifiedOnly: true));
      expect(d.deck.every((c) => c.profile.gender == Gender.female && c.profile.verified), isTrue);
    });
  });

  group('calls offline', () {
    testWidgets('asking, the friend saying yes, turning calls off', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final backend = MockBackend();
      final wallet = WalletProvider(backend);
      final social = SocialProvider(backend, wallet);
      final session = SessionProvider(backend);
      final match = MatchProvider(backend, wallet, social, session, cameraEnabled: false);
      final calls = CallsProvider(social, match);
      await tester.runAsync(() async {
        await social.load();
        await social.addMatched(Friend(profile: const Profile(id: 'u9', name: 'Sana', age: 24, gender: Gender.female, country: Country('PK', 'Pakistan', ''), avatarUrl: ''), state: FriendState.friends, since: DateTime.now()));
      });
      const id = 'u9';
      expect(social.friend(id)!.calls.on, isFalse);

      await calls.allow(id);
      expect(social.friend(id)!.calls.mine, isTrue);
      expect(social.friend(id)!.calls.on, isFalse);
      await tester.pump(const Duration(seconds: 4));
      expect(social.friend(id)!.calls.on, isTrue, reason: 'the friend said yes');

      await calls.turnOff(id);
      expect(social.friend(id)!.calls.on, isFalse);
      final events = social.messages(id).where((m) => m.isSystem).map((m) => m.event).toList();
      expect(events, ['matched', 'calls_asked', 'calls_on', 'calls_off']);
      calls.dispose();
      match.dispose();
    });
  });

  group('screens', () {
    testWidgets('chat lines from Vibe and the "allow calls" card', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final now = DateTime.now();
      final f = Friend(profile: const Profile(id: 'u2', name: 'Sana Iqbal', age: 24, gender: Gender.female, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: ''), state: FriendState.friends, since: now, calls: const CallsView(theirs: true));
      final backend = MockBackend();
      final wallet = WalletProvider(backend);
      final social = SocialProvider(backend, wallet);
      final match = MatchProvider(backend, wallet, social, SessionProvider(backend), cameraEnabled: false);
      final calls = CallsProvider(social, match);
      await tester.pumpWidget(MultiProvider(
        providers: [ChangeNotifierProvider<CallsProvider>.value(value: calls)],
        child: MaterialApp(
          theme: V.theme(),
          home: Scaffold(
            body: Column(children: [
              SystemLine(m: ChatMessage(id: 's1', fromMe: false, text: 'Missed video call', at: now, kind: MessageKind.system, meta: const {'event': 'call_missed'}), onCallBack: () {}),
              SystemLine(m: ChatMessage(id: 's2', fromMe: true, text: 'Wahab asked to allow video calls', at: now, kind: MessageKind.system, meta: const {'event': 'calls_asked'})),
              CallsCard(friend: f),
            ]),
          ),
        ),
      ));
      expect(find.textContaining('Missed video call'), findsOneWidget);
      expect(find.text('Call back'), findsOneWidget);
      expect(find.textContaining('You asked to allow video calls'), findsOneWidget);
      expect(find.text('Sana wants to allow video calls'), findsOneWidget);
      expect(find.text('Allow calls'), findsOneWidget);
      expect(find.text('Not now'), findsOneWidget);
      match.dispose();
    });

    test('VIP perks and the Free vs VIP table follow the catalog', () {
      final before = Economy.discoverFreeLikesPerDay;
      Economy.discoverFreeLikesPerDay = 25;
      final groups = vipPerkGroups();
      expect(groups.map((g) => g.title), ['Discover', 'Video Match', 'Extras']);
      expect(groups.first.items.first.$2, 'Free accounts get 25 a day.');
      expect(vipComparison().first, ('Likes a day', '25', 'Unlimited'));
      Economy.discoverEnabled = false;
      expect(vipPerkGroups().map((g) => g.title), ['Video Match', 'Extras']);
      Economy.discoverEnabled = true;
      Economy.discoverFreeLikesPerDay = before;
    });
  });
}
