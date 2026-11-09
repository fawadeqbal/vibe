import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/api/mappers.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/core/util/format.dart';
import 'package:vibe_app/models/follows.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/activity_provider.dart';
import 'package:vibe_app/providers/follows_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/notifications/notifications_screen.dart';
import 'package:vibe_app/services/push/push_route.dart';

import 'user_profile_test.dart' show FakeFollows;

void main() {
  group('presence', () {
    test('Online wins; otherwise last seen from when they left; nothing when unknown', () {
      expect(Fmt.presence(true, DateTime.now().subtract(const Duration(hours: 3))), 'Online');
      expect(Fmt.presence(false, DateTime.now().subtract(const Duration(minutes: 5))), 'Last seen 5m ago');
      expect(Fmt.presence(false, null), isNull);
      expect(Fmt.presence(null, null), isNull);
    });

    test('a friend reads lastSeenAt, never the friendship date', () {
      final f = ApiMap.friend({'profile': {'id': 'u1', 'name': 'Sara'}, 'state': 'friends', 'since': '2026-01-01T00:00:00Z', 'lastSeenAt': '2026-11-09T11:55:00Z'});
      expect(f.lastSeenAt, DateTime.utc(2026, 11, 9, 11, 55).toLocal());
      expect(ApiMap.friend({'profile': {'id': 'u1'}, 'state': 'incoming', 'since': '2026-01-01T00:00:00Z'}).lastSeenAt, isNull);
    });

    test('profile view: met and last seen', () {
      final v = ApiMap.profileView({'profile': {'id': 'u1'}, 'tier': 'friends', 'rel': {}, 'met': true, 'online': false, 'lastSeenAt': '2026-11-09T11:00:00Z'});
      expect(v.met, isTrue);
      expect(v.lastSeenAt, isNotNull);
      expect(ApiMap.profileView({'profile': {'id': 'u1'}, 'tier': 'following', 'rel': {}}).met, isFalse);
    });
  });

  group('notifications', () {
    test('maps a line with who it is from and where you stand', () {
      final i = ApiMap.activityItem({
        'id': 'a1',
        'type': 'friend.request',
        'title': 'New friend request',
        'body': 'Sara wants to be friends',
        'data': {'route': 'friends', 'userId': 'u1', 'junk': 5},
        'actor': {'id': 'u1', 'name': 'Sara Khan'},
        'rel': {'friend': 'incoming', 'follow': 'following', 'followsYou': true, 'followRequest': false},
        'read': false,
        'createdAt': '2026-11-09T11:00:00Z',
      });
      expect(i.actor?.name, 'Sara Khan');
      expect(i.rel?.friend, FriendState.incoming);
      expect(i.rel?.follow, FollowState.following);
      expect(i.data, {'route': 'friends', 'userId': 'u1'});
      expect(i.read, isFalse);
    });

    test("Vibe's own lines have no person, and odd values fall back", () {
      expect(ApiMap.activityItem({'id': 'a2', 'type': 'payment.update', 'actor': null, 'rel': null}).actor, isNull);
      final odd = ApiMap.activityItem({'id': 'a3', 'actor': {'id': 'u'}, 'rel': {'friend': 'weird', 'follow': 'x'}});
      expect(odd.rel?.friend, FriendState.none);
      expect(odd.rel?.follow, FollowState.none);
    });

    testWidgets('the page: new and earlier lines, follow back right there, badge cleared', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final backend = MockBackend();
      final wallet = WalletProvider(backend);
      final social = SocialProvider(backend, wallet);
      final follows = FakeFollows({});
      final activity = ActivityProvider();
      await activity.load();
      expect(activity.unread, 1);
      tester.view.physicalSize = const Size(412 * 3, 892 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MultiProvider(
        providers: [
          ChangeNotifierProvider<WalletProvider>.value(value: wallet),
          ChangeNotifierProvider<SocialProvider>.value(value: social),
          ChangeNotifierProvider<FollowsProvider>.value(value: follows),
          ChangeNotifierProvider<ActivityProvider>.value(value: activity),
        ],
        child: MaterialApp(theme: V.theme(), home: const Scaffold(body: Center(child: NotificationsBell()))),
      ));
      expect(find.text('1'), findsOneWidget);

      await tester.tap(find.byType(NotificationsBell));
      await tester.pumpAndSettle();
      expect(find.text('Notifications'), findsOneWidget);
      expect(find.text('New'), findsOneWidget);
      expect(find.text('Earlier'), findsOneWidget);
      expect(find.textContaining('Sana started following you'), findsOneWidget);
      expect(find.textContaining('Your coins are in your wallet'), findsOneWidget);
      expect(activity.unread, 0);

      await tester.tap(find.text('Follow back'));
      await tester.pumpAndSettle();
      expect(follows.calls, ['follow demo-sana']);
    });

    testWidgets('no ActivityProvider (older test setups): the bell still draws', (tester) async {
      await tester.pumpWidget(MaterialApp(theme: V.theme(), home: const Scaffold(body: NotificationsBell(glass: true))));
      expect(find.byType(NotificationsBell), findsOneWidget);
    });
  });

  group('one place for notifications', () {
    test('a collapsed line keeps its count', () {
      expect(ApiMap.activityItem({'id': 'a', 'type': 'chat.message', 'count': 3}).count, 3);
      expect(ApiMap.activityItem({'id': 'b', 'type': 'chat.message'}).count, 1);
    });

    testWidgets('tapping a line deep-links exactly like its push', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final backend = MockBackend();
      final wallet = WalletProvider(backend);
      final social = SocialProvider(backend, wallet);
      final activity = ActivityProvider();
      await activity.load();
      final opened = <PushRoute>[];
      final sub = DeepLinks.stream.listen(opened.add);
      addTearDown(sub.cancel);
      tester.view.physicalSize = const Size(412 * 3, 892 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MultiProvider(
        providers: [
          ChangeNotifierProvider<WalletProvider>.value(value: wallet),
          ChangeNotifierProvider<SocialProvider>.value(value: social),
          ChangeNotifierProvider<FollowsProvider>.value(value: FakeFollows({})),
          ChangeNotifierProvider<ActivityProvider>.value(value: activity),
        ],
        child: MaterialApp(theme: V.theme(), home: const NotificationsScreen()),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Payment received'));
      await tester.pump();
      expect(opened, [const PushRoute(PushTarget.wallet)]);
      await tester.tap(find.textContaining('Sana started following you'));
      await tester.pump();
      expect(opened.last, const PushRoute(PushTarget.profile, userId: 'demo-sana'));
    });

    testWidgets('friend requests (theirs and yours) are on the Notifications page now', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final backend = MockBackend();
      final wallet = WalletProvider(backend);
      final social = SocialProvider(backend, wallet);
      const zara = Profile(id: 'z1', name: 'Zara Ali', age: 24, gender: Gender.female, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: '', bio: '', interests: []);
      social.receiveRequest(zara);
      final activity = ActivityProvider();
      await activity.load();
      tester.view.physicalSize = const Size(412 * 3, 892 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MultiProvider(
        providers: [
          ChangeNotifierProvider<WalletProvider>.value(value: wallet),
          ChangeNotifierProvider<SocialProvider>.value(value: social),
          ChangeNotifierProvider<FollowsProvider>.value(value: FakeFollows({})),
          ChangeNotifierProvider<ActivityProvider>.value(value: activity),
        ],
        child: MaterialApp(theme: V.theme(), home: const NotificationsScreen()),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Friend requests · 1'), findsOneWidget);
      expect(find.text('Zara Ali, 24'), findsOneWidget);
      await tester.tap(find.text('Accept'));
      await tester.pumpAndSettle();
      expect(social.stateOf('z1'), FriendState.friends);
      expect(find.text('Friend requests · 1'), findsNothing);
    });
  });
}
