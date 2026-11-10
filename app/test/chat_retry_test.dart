import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/realtime_client.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/providers/social_provider.dart';

/// On a weak connection a message shows at once, keeps trying with one key, and goes out once.
void main() {
  test('a dropped send is retried with the same Idempotency-Key, and the message shows once', () async {
    final keys = <String?>[];
    var tries = 0;
    final api = ApiClient(
      baseUrl: 'https://api.test/v1',
      tokens: MemoryTokenStore(),
      httpClient: MockClient((req) async {
        if (req.method == 'POST' && req.url.path.endsWith('/friends/u1/messages')) {
          keys.add(req.headers['Idempotency-Key']);
          if (++tries == 1) throw http.ClientException('connection reset');
          return http.Response(
            jsonEncode({'id': 'm1', 'friendId': 'u1', 'kind': 'text', 'text': 'are you there?', 'fromMe': true, 'createdAt': '2026-11-10T10:00:00Z'}),
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('[]', 200, headers: {'content-type': 'application/json'});
      }),
    );
    await api.setTokens({'accessToken': 'a1', 'refreshToken': 'r1'});
    final social = RemoteSocialProvider(api, RealtimeClient(api));

    final sending = social.sendMessage('u1', 'are you there? ');
    await Future<void>.delayed(Duration.zero);
    expect(social.messages('u1').single.pending, isTrue, reason: 'shows at once, faded');
    await sending;
    expect(tries, 2);
    expect(keys.toSet().length, 1, reason: 'one key for every try');
    expect(keys.first, isNotNull);
    final msgs = social.messages('u1');
    expect(msgs.map((m) => m.id), ['m1']);
    expect(msgs.single.pending, isFalse);
    expect(msgs.single.failed, isFalse);
  });

  test('a refused message (not a network problem) is taken back and reported', () async {
    final api = ApiClient(
      baseUrl: 'https://api.test/v1',
      tokens: MemoryTokenStore(),
      httpClient: MockClient((req) async => http.Response(jsonEncode({'error': {'code': 'FORBIDDEN', 'message': 'You can only message friends'}}), 403, headers: {'content-type': 'application/json'})),
    );
    await api.setTokens({'accessToken': 'a1', 'refreshToken': 'r1'});
    final social = RemoteSocialProvider(api, RealtimeClient(api));
    await expectLater(social.sendMessage('u1', 'hi'), throwsA(anything));
    expect(social.messages('u1'), isEmpty);
  });
}
