import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/core/api/live_banners.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/screens/notifications/live_banner_overlay.dart';

Map<String, dynamic> show({String key = 'payment.update', String title = 'Payment received', Map<String, dynamic> data = const {'open': 'payment', 'purchaseId': 'p1'}}) =>
    {'key': key, 'group': 'money', 'title': title, 'body': '500 coins added', 'data': data};

void main() {
  test('a banner, but not about the chat you have open', () {
    expect(LiveBanner.from(show())?.title, 'Payment received');
    expect(LiveBanner.from(show(title: '')), isNull);
    bool skip(Map<String, dynamic> d) => d['friendId'] == 'u1';
    expect(LiveBanner.from(show(key: 'chat.message', data: {'open': 'chat', 'friendId': 'u1'}), skip: skip), isNull);
    expect(LiveBanner.from(show(key: 'chat.message', data: {'open': 'chat', 'friendId': 'u2'}), skip: skip), isNotNull);
  });

  testWidgets('one at a time, newer about the same chat replaces the waiting one, hides by itself', (t) async {
    final b = LiveBanners(showFor: const Duration(seconds: 2));
    LiveBanner chat(String friendId) => LiveBanner.from(show(key: 'chat.message', title: 'Sara', data: {'open': 'chat', 'friendId': friendId}))!;
    await t.pumpWidget(MaterialApp(theme: V.theme(), home: LiveBannerOverlay(banners: b, child: const Scaffold())));
    b.push(LiveBanner.from(show())!);
    b.push(chat('u2'));
    b.push(chat('u2'));
    expect(b.waiting, 1);
    await t.pumpAndSettle();
    expect(find.text('Payment received'), findsOneWidget);
    expect(find.text('500 coins added'), findsOneWidget);
    await t.pump(const Duration(seconds: 2));
    await t.pumpAndSettle();
    expect(find.text('Sara'), findsOneWidget);
    await t.tap(find.byTooltip('Close'));
    await t.pumpAndSettle();
    expect(b.current, isNull);
    b.dispose();
  });

  test('catching up keeps older messages, takes the newest page, keeps unsent ones at the bottom', () {
    ChatMessage m(String id, int min, {bool pending = false, DateTime? readAt}) => ChatMessage(id: id, fromMe: false, text: id, at: DateTime.utc(2026, 11, 10, 10, min), pending: pending, readAt: readAt);
    final current = [m('a', 1), m('b', 2), m('c', 3), m('tx1', 4, pending: true)];
    final fresh = [m('c', 3, readAt: DateTime.utc(2026)), m('d', 5), m('e', 6)];
    final out = mergeNewest(current, fresh);
    expect(out.map((x) => x.id), ['a', 'b', 'c', 'd', 'e', 'tx1']);
    expect(out[2].readAt, isNotNull);
  });
}
