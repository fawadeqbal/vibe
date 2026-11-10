import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/core/data/countries.dart';
import 'package:vibe_app/core/mock/mock_data.dart';
import 'package:vibe_app/core/theme/vibe_dropdown.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';

void main() {
  test('every country once (ISO 3166-1 plus Kosovo), A–Z, each with a flag', () {
    expect(allCountries.length, 250);
    expect(allCountries.map((c) => c.code).toSet().length, 250);
    for (final code in ['PK', 'IN', 'IL', 'AF', 'XK', 'PS', 'TW', 'AE', 'GB', 'US', 'BD', 'SA']) {
      expect(findCountry(code), isNotNull, reason: code);
    }
    final names = [for (final c in allCountries) fold(c.name)];
    expect(names, [...names]..sort());
    for (final c in allCountries) {
      expect(c.flag.runes.length, 2, reason: c.code);
    }
    expect(MockData.country('ZZ').code, 'PK', reason: 'unknown → Pakistan, not the first in the list');
    expect(fold('Côte d’Ivoire'), "cote d'ivoire");
    expect(fold('Türkiye'), 'turkiye');
  });

  testWidgets('the dropdown: a sheet with every country, Pakistan suggested, search by other names, tap to pick', (t) async {
    t.view.physicalSize = const Size(390 * 3, 844 * 3);
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    String value = 'PK';
    await t.pumpWidget(MaterialApp(
      theme: V.theme(),
      home: Scaffold(
        body: StatefulBuilder(
          builder: (context, set) => Padding(
            padding: const EdgeInsets.all(16),
            child: VibeDropdown(label: 'Country', value: value, options: countryOptions(), suggested: const ['PK'], onChanged: (v) => set(() => value = v)),
          ),
        ),
      ),
    ));
    expect(find.text('Pakistan'), findsOneWidget);
    await t.tap(find.text('Pakistan'));
    await t.pumpAndSettle();
    expect(find.text('SUGGESTED'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget, reason: 'a long list gets a search box');

    await t.enterText(find.byType(TextField), 'uae');
    await t.pumpAndSettle();
    expect(find.text('United Arab Emirates'), findsOneWidget);
    expect(find.text('SUGGESTED'), findsNothing);
    await t.tap(find.text('United Arab Emirates'));
    await t.pumpAndSettle();
    expect(value, 'AE');
    expect(find.text('United Arab Emirates'), findsOneWidget, reason: 'the button shows the pick');

    await t.tap(find.text('United Arab Emirates'));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField), 'zzzz');
    await t.pumpAndSettle();
    expect(find.text('Nothing called “zzzz”'), findsOneWidget);
  });

  testWidgets('a short list has no search box', (t) async {
    await t.pumpWidget(MaterialApp(
      theme: V.theme(),
      home: Scaffold(
        body: VibeDropdown(label: 'Platform', value: 'tiktok', options: const [DropdownOption('tiktok', 'TikTok'), DropdownOption('youtube', 'YouTube')], onChanged: (_) {}),
      ),
    ));
    await t.tap(find.text('TikTok'));
    await t.pumpAndSettle();
    expect(find.byType(TextField), findsNothing);
    expect(find.text('YouTube'), findsOneWidget);
  });
}
