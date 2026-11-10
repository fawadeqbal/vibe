import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/api_exception.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/core/data/countries.dart';
import 'package:vibe_app/core/theme/vibe_dropdown.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/providers/catalog_provider.dart';
import 'package:vibe_app/screens/region_unavailable_screen.dart';

ApiClient _api(int status, Map<String, dynamic> body) => ApiClient(
      baseUrl: 'https://api.test/v1',
      tokens: MemoryTokenStore(),
      httpClient: MockClient((_) async => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'})),
    );

void main() {
  tearDown(() => setBlockedCountries(defaultBlockedCountries));

  test('blocked countries are left out of country pickers, following the catalog', () {
    List<String> codes() => [for (final o in countryOptions()) o.value];
    expect(codes().length, 250 - defaultBlockedCountries.length);
    for (final c in ['IN', 'IL', 'AF']) {
      expect(codes(), isNot(contains(c)));
    }
    CatalogProvider().apply({
      'blockedCountries': ['BD'],
    });
    expect(codes(), contains('IN'));
    expect(codes(), isNot(contains('BD')));
    // Still has a name (old profiles, chips).
    expect(findCountry('IN')?.name, 'India');
  });

  test('a 451 REGION_UNAVAILABLE flips the app to the region screen; a field error does not', () async {
    final blocked = _api(451, {
      'error': {'code': 'REGION_UNAVAILABLE', 'message': "Vibe isn't available in your region."},
    });
    await expectLater(blocked.get('/catalog'), throwsA(isA<ApiException>().having((e) => e.isRegionUnavailable, 'region', true)));
    expect(blocked.regionBlocked.value, isTrue);

    final field = _api(400, {
      'error': {'code': 'COUNTRY_NOT_SUPPORTED', 'message': "Phone numbers from India can't be used on Vibe."},
    });
    await expectLater(field.post('/wallet/payout-accounts', {}), throwsA(isA<ApiException>()));
    expect(field.regionBlocked.value, isFalse);
  });

  testWidgets('the region screen fits a small phone', (t) async {
    t.view.physicalSize = const Size(360 * 3, 640 * 3);
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(theme: V.theme(), home: const RegionUnavailableScreen()));
    await t.pump(const Duration(seconds: 1));
    expect(find.textContaining("isn't available in your"), findsOneWidget);
    expect(find.text('Delete my account'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
