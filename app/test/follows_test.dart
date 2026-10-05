import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/mappers.dart';
import 'package:vibe_app/core/api/realtime_client.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/models/follows.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/follows_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/services/push/push_route.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('follow mappers', () {
    test('matched tier: no counts, no stats', () {
      final v = ApiMap.profileView({
        'profile': {'id': 'u2', 'name': 'Sana', 'age': 23, 'countryCode': 'PK'},
        'tier': 'matched',
        'rel': {'follow': 'requested', 'followsYou': true, 'friend': 'none'},
      });
      expect(v.tier, ProfileTier.matched);
      expect(v.follow, FollowState.requested);
      expect(v.followsYou, isTrue);
      expect(v.friend, FriendState.none);
      expect(v.followers, isNull);
      expect(v.stats, isNull);
      expect(v.statsHidden, isFalse);
      expect(v.online, isNull);
    });

    test('following tier with hidden stats', () {
      final v = ApiMap.profileView({
        'profile': {'id': 'u2'},
        'tier': 'following',
        'rel': {'follow': 'following'},
        'counts': {'followers': 12, 'following': 3},
        'stats': 'hidden',
      });
      expect(v.followers, 12);
      expect(v.following, 3);
      expect(v.stats, isNull);
      expect(v.statsHidden, isTrue);
    });

    test('friends tier with stats and presence; unknown values fall back', () {
      final v = ApiMap.profileView({
        'profile': {'id': 'u2'},
        'tier': 'friends',
        'rel': {'friend': 'friends', 'follow': 'bogus'},
        'counts': {'followers': 1, 'following': 1},
        'stats': {'matches': 40, 'likes': 9, 'gifts': 3},
        'online': true,
      });
      expect(v.tier, ProfileTier.friends);
      expect(v.friend, FriendState.friends);
      expect(v.follow, FollowState.none);
      expect(v.stats!.matches, 40);
      expect(v.online, isTrue);
      expect(ApiMap.profileView({'profile': {'id': 'x'}, 'tier': 'admin'}).tier, ProfileTier.matched);
    });

    test('entries, settings, report reasons', () {
      final e = ApiMap.followEntry({'profile': {'id': 'u3', 'name': 'Ali'}, 'since': '2026-10-05T10:00:00Z', 'followsBack': true});
      expect(e.profile.id, 'u3');
      expect(e.followsBack, isTrue);
      final s = ApiMap.followSettings({'followers': 4, 'following': 1, 'privateAccount': true});
      expect([s.followers, s.following, s.privateAccount, s.hideStats], [4, 1, true, false]);
      expect(ApiMap.reportReasonOut(ReportReason.harassment), 'HARASSMENT');
      expect(const FollowNotice(FollowNoticeKind.request, Profile(id: 'a', name: 'Sana', age: 20, gender: Gender.female, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: '')).text, 'Sana wants to follow you');
    });
  });

  group('RemoteFollowsProvider', () {
    http.Response json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

    test('follow, view, lists and privacy hit the right endpoints', () async {
      final sent = <String>[];
      final api = ApiClient(
        baseUrl: 'https://api.test/v1',
        tokens: MemoryTokenStore(),
        httpClient: MockClient((req) async {
          sent.add('${req.method} ${req.url.path}${req.body.isEmpty ? '' : ' ${req.body}'}');
          return switch ('${req.method} ${req.url.path}') {
            'POST /v1/follows/u2' => json({'state': 'requested'}),
            'GET /v1/users/u2/view' => json({'profile': {'id': 'u2', 'name': 'Sana'}, 'tier': 'matched', 'rel': {'follow': 'requested'}}),
            'GET /v1/users/gone/view' => json({'error': {'code': 'NOT_FOUND', 'message': 'User not found'}}, 404),
            'GET /v1/me/followers' => json({'items': [{'profile': {'id': 'u3', 'name': 'Ali'}, 'since': '2026-10-05T10:00:00Z', 'followsBack': false}], 'nextCursor': 'c1'}),
            'PATCH /v1/me' => json({'id': 'u1', 'followers': 4, 'following': 1, 'privateAccount': true, 'hideStats': false}),
            _ => json({'id': 'u1', 'followers': 3, 'following': 1}),
          };
        }),
      );
      await api.setTokens({'accessToken': 'a1', 'refreshToken': 'r1'});
      final p = RemoteFollowsProvider(api, RealtimeClient(api));

      expect(await p.follow('u2'), FollowState.requested);
      expect(p.stateOf('u2'), FollowState.requested);
      expect((await p.view('u2'))!.tier, ProfileTier.matched);
      expect(await p.view('gone'), isNull);
      final page = await p.list(FollowList.followers);
      expect(page.items.single.profile.name, 'Ali');
      expect(page.nextCursor, 'c1');
      expect(await p.setPrivacy(privateAccount: true), isTrue);
      expect(p.settings.privateAccount, isTrue);
      expect(p.settings.followers, 4);
      expect(sent, contains('PATCH /v1/me {"privateAccount":true}'));
    });
  });

  group('LocalFollowsProvider', () {
    test('offline demo: follow is instant and opens the profile', () async {
      SharedPreferences.setMockInitialValues({});
      final backend = MockBackend();
      final social = SocialProvider(backend, WalletProvider(backend));
      final follows = FollowsProvider(backend, social);
      final someone = backend.people.first;

      expect((await follows.view(someone.id))!.tier, ProfileTier.matched);
      await follows.follow(someone.id);
      final v = (await follows.view(someone.id))!;
      expect(v.tier, ProfileTier.following);
      expect(v.followers, isNotNull);
      expect(follows.settings.following, 1);
      expect((await follows.list(FollowList.following)).items.single.profile.id, someone.id);
      await follows.unfollow(someone.id);
      expect(follows.settings.following, 0);
      expect(await follows.view('nobody'), isNull);
    });
  });

  test('push routes for follows', () {
    expect(PushRoute.fromData({'route': 'profile', 'userId': 'u9', 'category': 'social'}), const PushRoute(PushTarget.profile, userId: 'u9'));
    expect(PushRoute.fromData({'route': 'profile'}), isNull);
    expect(PushRoute.fromData({'route': 'follow-requests'}), const PushRoute(PushTarget.followRequests));
  });
}
