// One set of filters for random matches and Discover: the sheet and chips
// write FiltersProvider, which feeds both; gender/country need the pass.
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/filters.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/discover_provider.dart';
import 'package:vibe_app/providers/filters_provider.dart';
import 'package:vibe_app/providers/match_provider.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/filters/filter_chips.dart';
import 'package:vibe_app/screens/filters/filters_sheet.dart';

void main() {
  late WalletProvider wallet;
  late SocialProvider social;
  late SessionProvider session;
  late MatchProvider match;
  late DiscoverProvider discover;
  late FiltersProvider filters;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final backend = MockBackend(fast: true, random: Random(1));
    wallet = WalletProvider(backend);
    social = SocialProvider(backend, wallet);
    session = SessionProvider(backend);
    match = MatchProvider(backend, wallet, social, session, cameraEnabled: false);
    discover = DiscoverProvider(social, wallet);
    filters = FiltersProvider(wallet);
    await wallet.load();
    await session.signIn(method: 'email');
    wireSharedFilters(filters, match, discover);
  });

  test('a change reaches random matches and Discover', () async {
    await filters.save(const SharedFilters(gender: WantedGender.women, minAge: 22, maxAge: 30, countryCode: 'PK', verifiedOnly: true));
    expect(match.filters.gender, GenderFilter.women);
    expect(match.filters.countryCode, 'PK');
    expect(match.filters.safeMode, isTrue);
    expect((match.filters.minAge, match.filters.maxAge), (22, 30));
    // Locked: Discover uses the free part until there's a pass.
    expect(discover.filters.gender, WantedGender.anyone);
    expect((discover.filters.minAge, discover.filters.verifiedOnly), (22, true));
    expect(await filters.buyPass(), 'ok');
    expect(discover.filters.gender, WantedGender.women);
    expect(discover.filters.countryCode, 'PK');
  });

  test('age and verified only are free; gender and country are not', () {
    expect(const SharedFilters(minAge: 30, verifiedOnly: true).usesExtra, isFalse);
    expect(const SharedFilters(gender: WantedGender.men).usesExtra, isTrue);
    expect(const SharedFilters(countryCode: 'IN').usesExtra, isTrue);
    expect(const SharedFilters(gender: WantedGender.men, countryCode: 'IN', minAge: 25).freeOnly(), const SharedFilters(minAge: 25));
  });

  testWidgets('the sheet saves, then offers the pass when gender is locked; the chips show it', (t) async {
    t.view.physicalSize = const Size(412 * 3, 1000 * 3);
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    await t.pumpWidget(MultiProvider(
      providers: [
        ChangeNotifierProvider<FiltersProvider>.value(value: filters),
        ChangeNotifierProvider.value(value: session),
      ],
      child: MaterialApp(
        theme: V.theme(),
        home: Scaffold(
          body: Builder(builder: (c) => Column(children: [FilterChips(onOpen: () => showFiltersSheet(c)), TextButton(onPressed: () => showFiltersSheet(c), child: const Text('open'))])),
        ),
      ),
    ));
    expect(find.text('Anyone'), findsOneWidget);
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    expect(find.text('One set of filters for random matches and Discover.'), findsOneWidget);
    await t.tap(find.text('Women').last);
    await t.ensureVisible(find.text('Done'));
    await t.pumpAndSettle();
    await t.tap(find.text('Done'));
    await t.pumpAndSettle();
    expect(filters.filters.gender, WantedGender.women);
    expect(find.text('Turn on gender and country'), findsOneWidget);
    await t.tap(find.text('Not now'));
    await t.pumpAndSettle();
    // The chip says Women, with a lock while it's not open.
    expect(find.text('Women'), findsOneWidget);
    // Verified only switches right in the chip row.
    await t.drag(find.byType(ListView), const Offset(-300, 0));
    await t.pumpAndSettle();
    await t.tap(find.text('Verified only'));
    await t.pumpAndSettle();
    expect(filters.filters.verifiedOnly, isTrue);
  });
}
