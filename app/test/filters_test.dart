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

  testWidgets('the sheet saves, then offers the pass when gender is locked; the tags show it', (t) async {
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
          body: Builder(builder: (c) => Column(children: [FilterButton(onOpen: () => showFiltersSheet(c)), FilterTags(onOpen: () => showFiltersSheet(c)), TextButton(onPressed: () => showFiltersSheet(c), child: const Text('open'))])),
        ),
      ),
    ));
    // Nothing set: just the button, no tags, no dot.
    expect(find.text('Clear'), findsNothing);
    expect(find.bySemanticsLabel('Filters'), findsOneWidget);
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
    // Only what's set shows: a Women tag (locked while it's not open), and
    // the button gets its dot.
    expect(find.text('Women'), findsOneWidget);
    expect(find.bySemanticsLabel('Women (needs the filter pass)'), findsOneWidget);
    expect(find.bySemanticsLabel('Filters (some are on)'), findsOneWidget);
    await filters.save(filters.filters.copyWith(verifiedOnly: true));
    await t.pumpAndSettle();
    expect(find.text('Verified'), findsOneWidget);
    // × drops just that one.
    await t.tap(find.bySemanticsLabel('Remove Women'));
    await t.pumpAndSettle();
    expect(filters.filters.gender, WantedGender.anyone);
    expect(filters.filters.verifiedOnly, isTrue);
    // Clear drops the rest, and the row goes away.
    await t.tap(find.text('Clear'));
    await t.pumpAndSettle();
    expect(filters.filters, SharedFilters.defaults);
    expect(find.text('Clear'), findsNothing);
  });
}
