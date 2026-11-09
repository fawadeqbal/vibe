import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/follows.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/follows_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/profile/follow_lists_screen.dart';
import 'package:vibe_app/screens/profile/user_profile_screen.dart';

/// A scripted FollowsProvider: tests set the views and read the calls.
class FakeFollows extends FollowsProvider {
  FakeFollows(this.views, {this.pages = const {}}) : super.base();
  final Map<String, ProfileView> views;
  final Map<FollowList, List<FollowEntry>> pages;
  final calls = <String>[];

  @override
  Future<void> load() async {}

  @override
  Future<ProfileView?> view(String userId) async {
    final v = views[userId];
    if (v != null) remember(userId, v.follow);
    return v;
  }

  @override
  Future<FollowState> follow(String userId) async {
    calls.add('follow $userId');
    final v = views[userId];
    if (v != null) {
      views[userId] = ProfileView(profile: v.profile, tier: ProfileTier.following, follow: FollowState.following, followers: 1, following: 0, stats: const ProfileStats(matches: 3, likes: 2, gifts: 1));
    }
    remember(userId, FollowState.following);
    return FollowState.following;
  }

  @override
  Future<void> unfollow(String userId) async => calls.add('unfollow $userId');
  @override
  Future<FollowPage> list(FollowList which, {String? cursor}) async => FollowPage(pages[which] ?? const [], null);
  @override
  Future<void> accept(String userId) async => calls.add('accept $userId');
  @override
  Future<void> decline(String userId) async => calls.add('decline $userId');
  @override
  Future<void> removeFollower(String userId) async => calls.add('remove $userId');
  @override
  Future<void> report(String userId, ReportReason reason, {String? note, bool block = true}) async => calls.add('report $userId');
  @override
  Future<bool> setPrivacy({bool? privateAccount, bool? hideStats}) async => true;
}

const sana = Profile(id: 'u2', name: 'Sana', age: 23, gender: Gender.female, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: '', bio: 'Coffee first', interests: ['Music', 'Travel']);

late SocialProvider lastSocial;

Future<FakeFollows> pump(WidgetTester tester, FakeFollows follows, Widget screen) async {
  SharedPreferences.setMockInitialValues({});
  final backend = MockBackend();
  final wallet = WalletProvider(backend);
  final social = SocialProvider(backend, wallet);
  lastSocial = social;
  tester.view.physicalSize = const Size(412 * 3, 892 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MultiProvider(
    providers: [
      ChangeNotifierProvider<WalletProvider>.value(value: wallet),
      ChangeNotifierProvider<SocialProvider>.value(value: social),
      ChangeNotifierProvider<FollowsProvider>.value(value: follows),
    ],
    child: MaterialApp(theme: V.theme(), home: screen),
  ));
  await tester.pumpAndSettle();
  return follows;
}

void main() {
  testWidgets('matched: the profile, a Follow button, stats locked', (tester) async {
    await pump(tester, FakeFollows({'u2': const ProfileView(profile: sana, tier: ProfileTier.matched)}), const UserProfileScreen(userId: 'u2'));
    expect(find.text('Sana, 23'), findsOneWidget);
    expect(find.text('Coffee first'), findsOneWidget);
    expect(find.text('Follow'), findsOneWidget);
    // Never met on a call: no friend request from the profile, and it says why.
    expect(find.text('Add friend'), findsNothing);
    expect(find.textContaining('after you meet on a video call'), findsOneWidget);
    expect(find.text('Follow to see their stats'), findsOneWidget);
    expect(find.textContaining('follower'), findsNothing);
  });

  testWidgets('tapping Follow opens counts and stats', (tester) async {
    final f = await pump(tester, FakeFollows({'u2': const ProfileView(profile: sana, tier: ProfileTier.matched)}), const UserProfileScreen(userId: 'u2'));
    await tester.tap(find.text('Follow'));
    await tester.pumpAndSettle();
    expect(f.calls, ['follow u2']);
    expect(find.text('Following'), findsOneWidget);
    expect(find.text('Likes'), findsOneWidget);
    expect(find.text('Follower'), findsOneWidget); // 1 follower now
  });

  testWidgets('hidden stats and "Follows you"', (tester) async {
    await pump(
      tester,
      FakeFollows({'u2': const ProfileView(profile: sana, tier: ProfileTier.following, follow: FollowState.following, followsYou: true, followers: 128, following: 40, statsHidden: true)}),
      const UserProfileScreen(userId: 'u2'),
    );
    expect(find.text('Stats hidden'), findsOneWidget);
    expect(find.text('Follows you'), findsOneWidget);
    expect(find.textContaining('128'), findsOneWidget);
  });

  testWidgets('a profile you may not see', (tester) async {
    await pump(tester, FakeFollows({}), const UserProfileScreen(userId: 'nobody'));
    expect(find.text('Profile not available'), findsOneWidget);
  });

  testWidgets('followers list: follow back and remove', (tester) async {
    final f = await pump(
      tester,
      FakeFollows({}, pages: {
        FollowList.followers: [FollowEntry(profile: sana, since: DateTime(2026, 10, 1))],
      }),
      const FollowListsScreen(),
    );
    expect(find.text('Sana'), findsOneWidget);
    expect(find.textContaining('Followed you'), findsOneWidget);
    await tester.tap(find.text('Follow back'));
    await tester.pumpAndSettle();
    expect(f.calls, ['follow u2']);
    expect(find.text('Follow back'), findsNothing);
    await tester.tap(find.byTooltip('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove follower'));
    await tester.pumpAndSettle();
    expect(f.calls.last, 'remove u2');
    expect(find.text('No followers yet'), findsOneWidget);
  });

  testWidgets('met: Add friend sends a request, and Request sent can be taken back', (tester) async {
    await pump(tester, FakeFollows({'u2': const ProfileView(profile: sana, tier: ProfileTier.matched, met: true)}), const UserProfileScreen(userId: 'u2'));
    expect(find.textContaining('after you meet on a video call'), findsNothing);
    await tester.tap(find.text('Add friend'));
    await tester.pumpAndSettle();
    expect(lastSocial.stateOf('u2'), FriendState.requested);
    expect(find.text('Request sent'), findsOneWidget);

    await tester.tap(find.text('Request sent'));
    await tester.pumpAndSettle();
    expect(find.text('Cancel your friend request?'), findsOneWidget);
    await tester.tap(find.text('Cancel request'));
    await tester.pumpAndSettle();
    expect(lastSocial.stateOf('u2'), FriendState.none);
    expect(find.text('Add friend'), findsOneWidget);
    // Let the mock's "they answer later" timer run out.
    await tester.pump(const Duration(seconds: 6));
    expect(lastSocial.stateOf('u2'), FriendState.none);
  });

  testWidgets('incoming request: Accept, or Decline right on the profile', (tester) async {
    await pump(tester, FakeFollows({'u2': const ProfileView(profile: sana, tier: ProfileTier.matched, met: true)}), const UserProfileScreen(userId: 'u2'));
    lastSocial.receiveRequest(sana);
    await tester.pumpAndSettle();
    expect(find.text('Accept friend'), findsOneWidget);
    expect(find.text('Sana wants to be friends.'), findsOneWidget);
    await tester.tap(find.text('Decline'));
    await tester.pumpAndSettle();
    expect(lastSocial.stateOf('u2'), FriendState.none);
  });

  testWidgets('someone who follows you gets Follow back', (tester) async {
    await pump(tester, FakeFollows({'u2': const ProfileView(profile: sana, tier: ProfileTier.matched, followsYou: true)}), const UserProfileScreen(userId: 'u2'));
    expect(find.text('Follow back'), findsOneWidget);
    expect(find.text('Follow'), findsNothing);
  });
}
