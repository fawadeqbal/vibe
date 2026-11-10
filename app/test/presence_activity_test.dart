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
import 'package:vibe_app/screens/notifications/detail_pages.dart';
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
      // Grouped by day: the follow came minutes ago, the payment yesterday.
      expect(find.text('TODAY'), findsOneWidget);
      expect(find.text('THIS WEEK'), findsOneWidget);
      expect(find.text('Mark all read'), findsOneWidget);
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
      // Opening the page clears the bell; the lines stay highlighted until opened.
      expect(activity.unread, 0);
      final line = activity.items.firstWhere((i) => i.title == 'Payment received');
      expect(activity.items.where((i) => !i.read), isNotEmpty);
      await tester.tap(find.textContaining('Payment received'));
      await tester.pump();
      expect(opened, [PushRoute(PushTarget.wallet, activityId: line.id)]);
      // The home shell reads a line when it opens its route (HomeShell._open); here, by hand.
      final unreadLine = activity.items.firstWhere((i) => !i.read);
      await activity.markRead([unreadLine.id]);
      expect(activity.items.firstWhere((i) => i.id == unreadLine.id).read, isTrue);
      await tester.tap(find.textContaining('Sana started following you'));
      await tester.pump();
      expect(opened.last, const PushRoute(PushTarget.profile, userId: 'demo-sana', activityId: 'demo-follow'));
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
      // One strip on the page; the requests themselves one tap away.
      expect(find.text('Zara wants to be friends'), findsOneWidget);
      await tester.tap(find.text('Requests'));
      await tester.pumpAndSettle();
      expect(find.text('FRIEND REQUESTS · 1'), findsOneWidget);
      expect(find.text('Zara Ali, 24'), findsOneWidget);
      await tester.tap(find.text('Accept'));
      await tester.pumpAndSettle();
      expect(social.stateOf('z1'), FriendState.friends);
      expect(find.text('FRIEND REQUESTS · 1'), findsNothing);
    });

    test('every notification opens the thing it is about (`open`), older ones where they used to go (`route`)', () {
      expect(PushRoute.fromData({'route': 'chat', 'open': 'chat', 'friendId': 'u1', 'messageId': 'm1'}), const PushRoute(PushTarget.chat, friendId: 'u1', messageId: 'm1'));
      expect(PushRoute.fromData({'route': 'chat', 'open': 'calls', 'userId': 'u1', 'friendId': 'u1'}), const PushRoute(PushTarget.calls, userId: 'u1'));
      expect(PushRoute.fromData({'route': 'chat', 'open': 'profile', 'userId': 'u2', 'friendId': 'u2'}), const PushRoute(PushTarget.profile, userId: 'u2'));
      expect(PushRoute.fromData({'route': 'discover', 'open': 'liked-you'}), const PushRoute(PushTarget.likedYou));
      expect(PushRoute.fromData({'route': 'wallet', 'open': 'payment', 'purchaseId': 'p1'}), const PushRoute(PushTarget.payment, purchaseId: 'p1'));
      expect(PushRoute.fromData({'route': 'wallet', 'open': 'cashout', 'cashoutId': 'c1'}), const PushRoute(PushTarget.cashout, cashoutId: 'c1'));
      expect(PushRoute.fromData({'route': 'wallet', 'open': 'goals'}), const PushRoute(PushTarget.wallet));
      expect(PushRoute.fromData({'route': 'inbox', 'open': 'account', 'noteId': 'n1'}), const PushRoute(PushTarget.account, noteId: 'n1'));
      expect(PushRoute.fromData({'route': 'profile', 'open': 'verification', 'userId': 'me'}), const PushRoute(PushTarget.verification));
      expect(PushRoute.fromData({'route': 'inbox', 'open': 'team', 'messageId': 'x1'}), const PushRoute(PushTarget.team, messageId: 'x1'));
      expect(PushRoute.fromData({'route': 'inbox', 'open': 'recap'}), const PushRoute(PushTarget.recap));
      // A payment without its id: the wallet.
      expect(PushRoute.fromData({'route': 'wallet', 'open': 'payment'}), const PushRoute(PushTarget.wallet));
    });

    Widget pages(Widget home, {SocialProvider? social}) {
      final backend = MockBackend();
      final wallet = WalletProvider(backend);
      return MultiProvider(
        providers: [
          ChangeNotifierProvider<WalletProvider>.value(value: wallet),
          ChangeNotifierProvider<SocialProvider>.value(value: social ?? SocialProvider(backend, wallet)),
          ChangeNotifierProvider<FollowsProvider>.value(value: FakeFollows({})),
          ChangeNotifierProvider<ActivityProvider>.value(value: ActivityProvider()),
        ],
        child: MaterialApp(theme: V.theme(), home: home),
      );
    }

    testWidgets('a cash-out opens with where it is; a gone one says so instead of opening something else', (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize = const Size(412 * 3, 892 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(pages(const CashoutStatusScreen(id: 'demo-cashout')));
      await tester.pumpAndSettle();
      expect(find.text('Rs 4,500'), findsWidgets);
      expect(find.text('Sent'), findsOneWidget);
      expect(find.text('Requested'), findsWidgets);
      expect(find.text('Open wallet'), findsOneWidget);

      await tester.pumpWidget(pages(const CashoutStatusScreen(id: 'nope')));
      await tester.pumpAndSettle();
      expect(find.text('Not here any more'), findsOneWidget);
    });

    testWidgets('Account status: good standing, and the note a notification was about', (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize = const Size(412 * 3, 892 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(pages(const AccountStatusScreen(noteId: 'demo-warning')));
      await tester.pumpAndSettle();
      expect(find.text('Your account is in good standing'), findsOneWidget);
      expect(find.text('FROM THE VIBE TEAM'), findsOneWidget);
      expect(find.textContaining('One of your Moments was removed'), findsOneWidget);
    });

    testWidgets('a missed call opens your calls with them', (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize = const Size(412 * 3, 892 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final backend = MockBackend();
      final wallet = WalletProvider(backend);
      final social = SocialProvider(backend, wallet);
      const bilal = Profile(id: 'b1', name: 'Bilal Ahmed', age: 25, gender: Gender.male, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: '', bio: '', interests: []);
      social.receiveRequest(bilal);
      await social.accept('b1');
      final friend = social.friend('b1')!;
      await tester.pumpWidget(pages(CallHistoryScreen(userId: friend.profile.id), social: social));
      await tester.pumpAndSettle();
      expect(find.text(friend.profile.name), findsOneWidget);
      expect(find.text('Missed video call'), findsOneWidget);
      expect(find.text('14 min'), findsOneWidget);
      expect(find.text('Message'), findsOneWidget);
    });
  });
}
