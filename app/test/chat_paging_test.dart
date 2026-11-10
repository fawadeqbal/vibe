import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/realtime_client.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/providers/social_provider.dart';

/// A long chat opens on its newest page; scrolling to the top loads the one before, until the start.
void main() {
  // 100 messages, m001 (oldest) … m100 (newest); the server pages newest first.
  final all = [for (var n = 1; n <= 100; n++) 'm${n.toString().padLeft(3, '0')}'];
  final asked = <Map<String, String>>[];

  http.Response page(Map<String, String> q) {
    asked.add(q);
    final limit = int.parse(q['limit'] ?? '30');
    final newestFirst = all.reversed.toList();
    final start = q['cursor'] == null ? 0 : newestFirst.indexOf(q['cursor']!) + 1;
    final items = newestFirst.skip(start).take(limit).toList();
    final more = start + limit < newestFirst.length;
    return http.Response(
      jsonEncode({
        'items': [for (final id in items) {'id': id, 'kind': 'text', 'text': id, 'fromMe': false, 'createdAt': '2026-11-10T10:00:00Z'}],
        'nextCursor': more ? items.last : null,
      }),
      200,
      headers: {'content-type': 'application/json'},
    );
  }

  test('newest page first, then older pages in order, nothing twice, and it stops at the start', () async {
    final api = ApiClient(
      baseUrl: 'https://api.test/v1',
      tokens: MemoryTokenStore(),
      httpClient: MockClient((req) async => req.url.path.endsWith('/messages') ? page(req.url.queryParameters) : http.Response('{}', 200, headers: {'content-type': 'application/json'})),
    );
    await api.setTokens({'accessToken': 'a1', 'refreshToken': 'r1'});
    final social = RemoteSocialProvider(api, RealtimeClient(api));

    await social.ensureMessages('u1');
    var ids = social.messages('u1').map((m) => m.id).toList();
    expect(ids.length, 40);
    expect(ids.first, 'm061');
    expect(ids.last, 'm100', reason: 'oldest → newest on screen, the newest at the bottom');
    expect(social.hasOlder('u1'), isTrue);

    await social.loadOlder('u1');
    ids = social.messages('u1').map((m) => m.id).toList();
    expect(ids.length, 80);
    expect(ids.first, 'm021');
    expect(asked.last['cursor'], 'm061');

    await social.loadOlder('u1');
    ids = social.messages('u1').map((m) => m.id).toList();
    expect(ids, all);
    expect(ids.toSet().length, 100);
    expect(social.hasOlder('u1'), isFalse);

    final before = asked.length;
    await social.loadOlder('u1');
    expect(asked.length, before, reason: 'no more pages to ask for');
  });

  test('the Chats list: whoever texted last first, even for chats not opened yet', () async {
    final now = DateTime.utc(2026, 11, 10, 7);
    Map<String, dynamic> f(String id, DateTime since, DateTime? last) => {
          'profile': {'id': id, 'name': id, 'age': 24},
          'state': 'friends',
          'since': since.toIso8601String(),
          'lastMessage': last == null ? null : 'hi',
          'lastMessageAt': last?.toIso8601String(),
        };
    final friends = [
      f('newFriendOldText', now.subtract(const Duration(days: 1)), now.subtract(const Duration(hours: 20))),
      f('quiet', now.subtract(const Duration(hours: 2)), null),
      f('oldFriendNewText', DateTime.utc(2025), now.subtract(const Duration(minutes: 5))),
    ];
    final api = ApiClient(
      baseUrl: 'https://api.test/v1',
      tokens: MemoryTokenStore(),
      httpClient: MockClient((req) async => http.Response(
            jsonEncode(switch (req.url.path) {
              '/v1/friends' => friends,
              '/v1/blocks' => [],
              _ => {'items': [], 'count': 0, 'people': [], 'previews': []},
            }),
            200,
            headers: {'content-type': 'application/json'},
          )),
    );
    await api.setTokens({'accessToken': 'a1', 'refreshToken': 'r1'});
    final social = RemoteSocialProvider(api, RealtimeClient(api));
    await social.load();
    expect(social.friends.map((x) => x.profile.id), ['oldFriendNewText', 'quiet', 'newFriendOldText']);
    expect(social.lastActivity(social.friends.first).toUtc(), now.subtract(const Duration(minutes: 5)));
  });
}
