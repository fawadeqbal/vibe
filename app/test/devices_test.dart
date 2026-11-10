import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/screens/profile/devices_screen.dart';

/// Three devices; signing out removes them here like the server would.
class _FakeSession extends LocalSessionProvider {
  _FakeSession(super.backend);
  final ended = <String>[];
  final now = DateTime.now();
  late var list = [
    DeviceSession(id: 'a', client: 'android', device: 'Samsung SM-A515F · Android 13', signedInAt: now, lastActiveAt: now, current: true),
    DeviceSession(id: 'b', client: 'web', device: 'Chrome on Windows', signedInAt: now, lastActiveAt: now.subtract(const Duration(hours: 3)), current: false),
    DeviceSession(id: 'c', client: 'android', device: 'Pixel 7 · Android 14', signedInAt: now, lastActiveAt: now.subtract(const Duration(days: 2)), current: false),
  ];

  @override
  Future<List<DeviceSession>> devices() async => list;

  @override
  Future<void> endDevice(String id) async {
    ended.add(id);
    list = list.where((d) => d.id != id).toList();
  }

  @override
  Future<int> endOtherDevices() async {
    final n = list.where((d) => !d.current).length;
    list = list.where((d) => d.current).toList();
    return n;
  }
}

void main() {
  testWidgets('Devices: this phone first, sign one out, then all the others', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final s = _FakeSession(MockBackend());
    await tester.pumpWidget(
      ChangeNotifierProvider<SessionProvider>.value(
        value: s,
        child: MaterialApp(theme: V.theme(), home: const DevicesScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Samsung SM-A515F · Android 13'), findsOneWidget);
    expect(find.text('This phone'), findsOneWidget);
    expect(find.text('Chrome on Windows'), findsOneWidget);
    expect(find.textContaining('Website · Active'), findsOneWidget);

    // Sign out the browser (confirm first).
    await tester.tap(find.text('Sign out').first);
    await tester.pumpAndSettle();
    expect(find.text('Sign out Chrome on Windows?'), findsOneWidget);
    await tester.tap(find.widgetWithText(TextButton, 'Sign out').last);
    await tester.pumpAndSettle();
    expect(s.ended, ['b']);
    expect(find.text('Chrome on Windows'), findsNothing);

    // Then every other one.
    await tester.tap(find.text('Sign out of all other devices'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out all'));
    await tester.pumpAndSettle();
    expect(find.text('Pixel 7 · Android 14'), findsNothing);
    expect(find.text('Sign out of all other devices'), findsNothing);
    expect(find.text('Samsung SM-A515F · Android 13'), findsOneWidget);
  });
}
