import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/profile/blocked_people_screen.dart';

const _sana = Profile(id: 'u2', name: 'Sana', age: 24, gender: Gender.female, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: '');
const _omar = Profile(id: 'u3', name: 'Omar', age: 27, gender: Gender.male, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: '');

class _Social extends LocalSocialProvider {
  _Social(MockBackend b) : super(b, WalletProvider(b));
  final people = [BlockedPerson(_sana, DateTime.now().subtract(const Duration(days: 2))), const BlockedPerson(_omar, null)];
  final unblocked = <String>[];

  @override
  Future<List<BlockedPerson>> blockedPeople() async => [...people];

  @override
  Future<void> unblock(String id) async => unblocked.add(id);
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('lists who you blocked; Unblock asks first, then removes them', (t) async {
    final social = _Social(MockBackend(fast: true, random: Random(1)));
    await t.pumpWidget(ChangeNotifierProvider<SocialProvider>.value(value: social, child: MaterialApp(theme: V.theme(), home: const BlockedPeopleScreen())));
    await t.pumpAndSettle();
    expect(find.text('Sana'), findsOneWidget);
    expect(find.text('Omar'), findsOneWidget);
    expect(find.text('Blocked 2d ago'), findsOneWidget);

    await t.tap(find.text('Unblock').first);
    await t.pumpAndSettle();
    expect(find.text('Unblock Sana?'), findsOneWidget);
    await t.tap(find.text('Cancel'));
    await t.pumpAndSettle();
    expect(social.unblocked, isEmpty);

    await t.tap(find.text('Unblock').first);
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(TextButton, 'Unblock'));
    await t.pumpAndSettle();
    expect(social.unblocked, ['u2']);
    expect(find.text('Sana'), findsNothing);
    expect(find.text('Omar'), findsOneWidget);
  });
}
