import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/services/ads/rewarded_ads.dart';

/// A fixed network, to check which one the server's answer picks.
class _Fixed implements RewardedAds {
  _Fixed(this.name);
  final String name;
  @override
  bool get available => true;
  @override
  Future<void> refresh() async {}
  @override
  Future<AdResult> show(BuildContext context, {required String userId}) async => AdResult(AdOutcome.rewarded, token: name);
}

void main() {
  http.Response json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

  ApiClient api(Map<String, dynamic> setup, {List<String>? calls}) => ApiClient(
        baseUrl: 'https://api.test/v1',
        tokens: MemoryTokenStore(),
        httpClient: MockClient((req) async {
          calls?.add('${req.method} ${req.url.path}?${req.url.query}');
          if (req.url.path.endsWith('/wallet/rewards/ad/setup')) return json(setup);
          if (req.url.path.endsWith('/wallet/rewards/ad/start')) return json({...setup, 'token': 'vTok12345'});
          return json({}, 404);
        }),
      );

  group('ServerRewardedAds picks the network the admin chose', () {
    test('off → the fallback (hidden in release)', () async {
      final ads = ServerRewardedAds(api: api({'provider': 'off'}), platform: 'android');
      await ads.refresh();
      expect(ads.available, isFalse);
    });

    test('admob → this build\'s AdMob, or nothing without an ad unit', () async {
      final withUnit = ServerRewardedAds(api: api({'provider': 'admob', 'config': {}}), platform: 'android', admob: _Fixed('admob'));
      await withUnit.refresh();
      expect(withUnit.current, isA<_Fixed>());
      final without = ServerRewardedAds(api: api({'provider': 'admob', 'config': {}}), platform: 'android');
      await without.refresh();
      expect(without.available, isFalse);
    });

    test('monetag → the /ad-frame page with the server token', () async {
      final calls = <String>[];
      final ads = ServerRewardedAds(
        api: api({'provider': 'monetag', 'config': {'zoneId': '9876543', 'sdkUrl': 'https://libtl.com/sdk.js', 'frameUrl': 'https://app.test/ad-frame'}}, calls: calls),
        platform: 'ios',
        openPage: (context, url) async => 'rewarded',
      );
      await ads.refresh();
      expect(ads.current, isA<MonetagRewardedAds>());
      expect(calls.first, contains('platform=ios'));
    });
  });

  testWidgets('Monetag: rewarded with the token; closed = dismissed; failed = no video', (t) async {
    late BuildContext ctx;
    await t.pumpWidget(MaterialApp(home: Builder(builder: (c) {
      ctx = c;
      return const SizedBox();
    })));
    Uri? opened;
    String? reply = 'rewarded';
    final ads = MonetagRewardedAds(
      frameUrl: 'https://app.test/ad-frame',
      start: () async => 'vTok12345',
      open: (context, url) async {
        opened = url;
        return reply;
      },
    );
    final r = await ads.show(ctx, userId: 'u1');
    expect(r.outcome, AdOutcome.rewarded);
    expect(r.token, 'vTok12345');
    expect(opened.toString(), 'https://app.test/ad-frame?t=vTok12345');

    reply = null;
    expect((await ads.show(ctx, userId: 'u1')).outcome, AdOutcome.dismissed);
    reply = 'failed:no feed';
    expect((await ads.show(ctx, userId: 'u1')).outcome, AdOutcome.noFill);
  });
}
