import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/core/cache/api_cache.dart';
import 'package:vibe_app/providers/session_provider.dart';

Map<String, dynamic> me(String id, String name) => {'id': id, 'name': name, 'age': 24, 'gender': 'female', 'countryCode': 'PK', 'onboarded': true};

void main() {
  test('GETs with a cache key are kept; sign-out forgets them', () async {
    final cache = ApiCache.memory();
    final api = ApiClient(
      baseUrl: 'https://api.test/v1',
      tokens: MemoryTokenStore(),
      cache: cache,
      httpClient: MockClient((_) async => http.Response(jsonEncode({'coins': 30}), 200, headers: {'content-type': 'application/json'})),
    );
    await api.get('/wallet', cacheKey: 'wallet');
    await Future<void>.delayed(Duration.zero);
    expect(await cache.read('wallet'), {'coins': 30});
    await api.clearSession();
    expect(await cache.read('wallet'), isNull);
  });

  test("the app opens with last time's profile at once, then the fresh one replaces it", () async {
    final cache = ApiCache.memory();
    await cache.write('me', me('u1', 'Sara (cached)'));
    final gate = Completer<void>();
    final api = ApiClient(
      baseUrl: 'https://api.test/v1',
      tokens: MemoryTokenStore(),
      cache: cache,
      httpClient: MockClient((req) async {
        if (req.url.path.endsWith('/me')) {
          await gate.future; // a slow connection
          return http.Response(jsonEncode(me('u1', 'Sara')), 200, headers: {'content-type': 'application/json'});
        }
        return http.Response('{}', 200, headers: {'content-type': 'application/json'});
      }),
    );
    await api.setTokens({'accessToken': 'a1', 'refreshToken': 'r1'});
    final session = RemoteSessionProvider(api);
    await session.restore();
    expect(session.booting, isFalse, reason: 'no waiting on the network');
    expect(session.me?.name, 'Sara (cached)');
    gate.complete();
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(session.me?.name, 'Sara');
  });
}
