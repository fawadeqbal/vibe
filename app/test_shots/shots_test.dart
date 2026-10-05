// Screenshot harness for the redesign (not part of the app's test suite).
// Run: flutter test --update-goldens test_shots/shots_test.dart
// Test-only helpers (mock prefs, wallet debugSet) are fine in this harness.
// ignore_for_file: invalid_use_of_visible_for_testing_member
import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/mock/mock_data.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/follows_provider.dart';
import 'package:vibe_app/providers/inbox_provider.dart';
import 'package:vibe_app/providers/match_provider.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/home/home_shell.dart';
import 'package:vibe_app/screens/match/filters_sheet.dart';
import 'package:vibe_app/screens/match/report_sheet.dart';
import 'package:vibe_app/screens/match/safety_sheet.dart';
import 'package:vibe_app/screens/onboarding/permissions_screen.dart';
import 'package:vibe_app/screens/onboarding/profile_setup_screen.dart';
import 'package:vibe_app/screens/onboarding/signin_screen.dart';
import 'package:vibe_app/screens/onboarding/welcome_screen.dart';
import 'package:vibe_app/screens/social/chat_screen.dart';
import 'package:vibe_app/screens/social/inbox_screen.dart';
import 'package:vibe_app/screens/splash_screen.dart';
import 'package:vibe_app/screens/store/checkout_screen.dart';
import 'package:vibe_app/screens/store/vip_screen.dart';
import 'package:vibe_app/screens/store/wallet_screen.dart';

// ── fake network: pravatar URLs served from a local cache ──────────────
List<int> _bytesFor(Uri u) {
  final img = u.queryParameters['img'] ?? '1';
  final f = File('/root/imgcache/400_$img.jpg');
  return f.existsSync() ? f.readAsBytesSync() : <int>[];
}

class _FakeHttp extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? c) => _Client();
}

class _Client implements HttpClient {
  @override
  bool autoUncompress = true;
  @override
  Future<HttpClientRequest> getUrl(Uri url) async => _Req(url);
  @override
  dynamic noSuchMethod(Invocation i) => null;
}

class _Req implements HttpClientRequest {
  _Req(this.url);
  final Uri url;
  @override
  final HttpHeaders headers = _Headers();
  @override
  Future<HttpClientResponse> close() async => _Resp(_bytesFor(url));
  @override
  dynamic noSuchMethod(Invocation i) => null;
}

class _Headers implements HttpHeaders {
  @override
  void add(String name, Object value, {bool preserveHeaderCase = false}) {}
  @override
  dynamic noSuchMethod(Invocation i) => null;
}

class _Resp extends Stream<List<int>> implements HttpClientResponse {
  _Resp(this.bytes);
  final List<int> bytes;
  @override
  int get statusCode => bytes.isEmpty ? 404 : 200;
  @override
  int get contentLength => bytes.length;
  @override
  HttpClientResponseCompressionState get compressionState => HttpClientResponseCompressionState.notCompressed;
  @override
  StreamSubscription<List<int>> listen(void Function(List<int>)? onData, {Function? onError, void Function()? onDone, bool? cancelOnError}) =>
      Stream<List<int>>.fromIterable([bytes]).listen(onData, onError: onError, onDone: onDone, cancelOnError: cancelOnError);
  @override
  dynamic noSuchMethod(Invocation i) => null;
}

Future<void> _font(String family, List<String> paths) async {
  final l = FontLoader(family);
  for (final p in paths) {
    l.addFont(Future.value(ByteData.view(File(p).readAsBytesSync().buffer)));
  }
  await l.load();
}

class H {
  late MockBackend backend;
  late WalletProvider wallet;
  late SocialProvider social;
  late SessionProvider session;
  late MatchProvider match;
  late InboxProvider inbox;
  late FollowsProvider follows;

  Future<void> init({bool slowMatch = false, bool vip = false, bool withFriends = true}) async {
    SharedPreferences.setMockInitialValues({});
    backend = MockBackend(fast: true, random: Random(4));
    final people = backend.people;
    Profile byName(String n) => people.firstWhere((p) => p.name == n);
    if (withFriends) {
      final now = DateTime.now();
      await backend.saveFriends([
        Friend(profile: byName('Priya'), state: FriendState.friends, since: now.subtract(const Duration(days: 2)), lastMessage: 'send me your playlist later', unread: 2, online: true),
        Friend(profile: byName('Mert'), state: FriendState.friends, since: now.subtract(const Duration(days: 3)), lastMessage: 'haha same', online: false),
        Friend(profile: byName('Julia'), state: FriendState.friends, since: now.subtract(const Duration(days: 1)), online: true),
        Friend(profile: byName('Elif'), state: FriendState.incoming, since: now),
        Friend(profile: byName('Liam'), state: FriendState.requested, since: now),
      ]);
      await backend.saveChats({
        byName('Priya').id: [
          ChatMessage(id: 'a', fromMe: false, text: 'hey! that was fun 😄', at: now.subtract(const Duration(minutes: 9))),
          ChatMessage(id: 'b', fromMe: true, text: 'right?? your cat stole the show', at: now.subtract(const Duration(minutes: 8))),
          ChatMessage(id: 'c', fromMe: true, text: 'Sent a Rose', at: now.subtract(const Duration(minutes: 7)), gift: MockData.gifts.first),
          ChatMessage(id: 'd', fromMe: false, text: 'aww thank you!! 🥹', at: now.subtract(const Duration(minutes: 6))),
          ChatMessage(id: 'e', fromMe: false, text: 'send me your playlist later', at: now.subtract(const Duration(minutes: 5))),
        ],
        byName('Mert').id: [ChatMessage(id: 'f', fromMe: false, text: 'haha same', at: now.subtract(const Duration(hours: 1)))],
      });
      await backend.saveMatches([
        MatchRecord(id: 'm1', partner: byName('Omar'), startedAt: now.subtract(const Duration(minutes: 21)), endedAt: now.subtract(const Duration(minutes: 20, seconds: 12))),
        MatchRecord(id: 'm2', partner: byName('Sofia'), startedAt: now.subtract(const Duration(minutes: 16, seconds: 32)), endedAt: now.subtract(const Duration(minutes: 12)), liked: true, likedMe: true, giftsReceived: 1),
      ]);
    }
    wallet = WalletProvider(backend);
    social = SocialProvider(backend, wallet);
    session = SessionProvider(backend);
    match = MatchProvider(slowMatch ? MockBackend(fast: false, random: Random(4)) : backend, wallet, social, session, cameraEnabled: false);
    await wallet.load();
    wallet.debugSet(wallet.wallet.copyWith(coins: 340, gems: 1280, streakDay: 2, vipUntil: vip ? DateTime.now().add(const Duration(days: 20)) : null));
    await social.load();
    await session.signIn(method: 'phone');
    await session.saveProfile(session.me!.copyWith(
      name: 'Sana',
      age: 23,
      gender: Gender.female,
      avatarUrl: 'https://i.pravatar.cc/400?img=47',
      bio: 'Night owl. Ask me about my playlist.',
      interests: ['Music', 'Travel', 'Coffee'],
      matches: 128,
      likes: 46,
    ));
    await session.finishOnboarding();
    await match.load();
    follows = FollowsProvider(backend, social);
    await follows.load();
    inbox = InboxProvider();
    if (withFriends) await inbox.load();
  }

  Widget app(Widget home) => MultiProvider(
        providers: [
          Provider<MockBackend>.value(value: backend),
          ChangeNotifierProvider.value(value: session),
          ChangeNotifierProvider.value(value: wallet),
          ChangeNotifierProvider.value(value: social),
          ChangeNotifierProvider.value(value: match),
          ChangeNotifierProvider.value(value: inbox),
          ChangeNotifierProvider<FollowsProvider>.value(value: follows),
        ],
        child: RepaintBoundary(key: const ValueKey('root'), child: MaterialApp(debugShowCheckedModeBanner: false, theme: V.theme(), home: home)),
      );
}

Future<void> settle(WidgetTester t, {int ms = 600}) async {
  for (var i = 0; i < 3; i++) {
    await t.runAsync(() => Future<void>.delayed(Duration(milliseconds: ms)));
    await t.pump(const Duration(milliseconds: 400));
  }
}

Future<void> snap(WidgetTester t, String name) async {
  await settle(t);
  await expectLater(find.byKey(const ValueKey('root')), matchesGoldenFile('shots/$name.png'));
}

Future<void> cleanup(WidgetTester t, H h) async {
  h.match.stop();
  h.match.dismissEnded();
  await t.pumpWidget(const SizedBox());
  await t.pump(const Duration(minutes: 5));
}

void shot(String name, Future<void> Function(WidgetTester t, H h) body, {bool slowMatch = false, bool vip = false, bool withFriends = true}) {
  testWidgets(name, (t) async {
    await HttpOverrides.runWithHttpOverrides(() async {
      t.view.physicalSize = const Size(412 * 2, 892 * 2);
      t.view.devicePixelRatio = 2;
      t.view.padding = const FakeViewPadding(top: 40 * 2, bottom: 24 * 2);
      t.view.viewPadding = const FakeViewPadding(top: 40 * 2, bottom: 24 * 2);
      final h = H();
      await t.runAsync(() => h.init(slowMatch: slowMatch, vip: vip, withFriends: withFriends));
      await body(t, h);
      await cleanup(t, h);
      t.view.reset();
    }, _FakeHttp());
  });
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    const f = '/root/vibe/assets/fonts';
    await _font('Geist', ['$f/Geist-Regular.ttf', '$f/Geist-Medium.ttf', '$f/Geist-SemiBold.ttf', '$f/Geist-Bold.ttf', '$f/Geist-ExtraBold.ttf']);
    await _font('GeistMono', ['$f/GeistMono-Medium.ttf', '$f/GeistMono-SemiBold.ttf']);
    await _font('InstrumentSerif', ['$f/InstrumentSerif-Regular.ttf', '$f/InstrumentSerif-Italic.ttf']);
    await _font('MaterialIcons', ['/root/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf']);
    await _font('NotoColorEmoji', ['/root/fonts/NotoColorEmoji.ttf']);
  });

  shot('00_splash', (t, h) async {
    await t.pumpWidget(h.app(const SplashScreen()));
    await t.pump(const Duration(milliseconds: 600));
    await expectLater(find.byKey(const ValueKey('root')), matchesGoldenFile('shots/00_splash.png'));
  });

  shot('01_welcome', (t, h) async {
    await t.pumpWidget(h.app(WelcomeScreen(onContinue: () {})));
    await snap(t, '01_welcome');
  });

  shot('01b_welcome_slide3', (t, h) async {
    await t.pumpWidget(h.app(WelcomeScreen(onContinue: () {})));
    await settle(t);
    await t.drag(find.byType(PageView), const Offset(-400, 0));
    await t.pumpAndSettle();
    await t.drag(find.byType(PageView), const Offset(-400, 0));
    await t.pumpAndSettle();
    await snap(t, '01b_welcome_slide3');
  });

  shot('02_lobby', (t, h) async {
    await t.pumpWidget(h.app(const HomeShell()));
    await snap(t, '02_lobby');
  });

  shot('02b_lobby_filters', (t, h) async {
    h.match.setFilters(const MatchFilters(gender: GenderFilter.women, countryCode: 'TR', safeMode: true));
    await t.pumpWidget(h.app(const HomeShell()));
    await snap(t, '02b_lobby_filters');
  });

  shot('03_searching', (t, h) async {
    h.match.setFilters(const MatchFilters(safeMode: true));
    await t.pumpWidget(h.app(const HomeShell()));
    await settle(t);
    unawaited(h.match.start());
    await t.pump(const Duration(milliseconds: 300));
    await snap(t, '03_searching');
    h.match.stop();
    await t.pump(const Duration(seconds: 10));
  }, slowMatch: true);

  Future<void> connect(WidgetTester t, H h, {bool blur = false}) async {
    h.match.setAutoBlur(blur);
    await t.pumpWidget(h.app(const HomeShell()));
    await settle(t);
    unawaited(h.match.start());
    for (var i = 0; i < 10; i++) {
      await t.pump(const Duration(milliseconds: 100));
    }
  }

  shot('04_live_call', (t, h) async {
    await connect(t, h);
    await t.pump(const Duration(seconds: 6));
    h.match.sendMessage('Lahore! you?');
    h.match.like();
    await t.pump(const Duration(seconds: 9));
    await snap(t, '04_live_call');
  });

  shot('04b_live_blurred', (t, h) async {
    await connect(t, h, blur: true);
    await snap(t, '04b_live_blurred');
  });

  shot('05_ended', (t, h) async {
    await connect(t, h);
    await t.pump(const Duration(seconds: 20));
    h.match.like();
    h.match.stop();
    await t.pump(const Duration(milliseconds: 300));
    await snap(t, '05_ended');
  });

  shot('06_gift_sheet', (t, h) async {
    await connect(t, h);
    await t.pump(const Duration(seconds: 3));
    await t.tap(find.text('Gift'));
    await t.pumpAndSettle();
    await t.tap(find.text('Coffee'));
    await t.pumpAndSettle();
    await snap(t, '06_gift_sheet');
  });

  Future<void> tab(WidgetTester t, H h, String label) async {
    await t.pumpWidget(h.app(const HomeShell()));
    await settle(t);
    await t.tap(find.text(label).last);
    await t.pumpAndSettle();
  }

  shot('07_store', (t, h) async {
    await tab(t, h, 'Store');
    await snap(t, '07_store');
  });

  shot('07b_store_scrolled', (t, h) async {
    await tab(t, h, 'Store');
    await t.drag(find.byType(ListView).last, const Offset(0, -600));
    await t.pumpAndSettle();
    await snap(t, '07b_store_scrolled');
  });

  shot('08_vip', (t, h) async {
    await t.pumpWidget(h.app(const VipScreen()));
    await snap(t, '08_vip');
  });

  shot('08b_vip_scrolled', (t, h) async {
    await t.pumpWidget(h.app(const VipScreen()));
    await settle(t);
    await t.drag(find.byType(ListView), const Offset(0, -700));
    await t.pumpAndSettle();
    await snap(t, '08b_vip_scrolled');
  });

  shot('09_chats', (t, h) async {
    await tab(t, h, 'Chats');
    await snap(t, '09_chats');
  });

  shot('10_profile', (t, h) async {
    await tab(t, h, 'Me');
    await snap(t, '10_profile');
  });

  shot('10b_profile_scrolled', (t, h) async {
    await tab(t, h, 'Me');
    await t.drag(find.byType(ListView).last, const Offset(0, -700));
    await t.pumpAndSettle();
    await snap(t, '10b_profile_scrolled');
  });

  shot('10c_profile_bottom', (t, h) async {
    await tab(t, h, 'Me');
    await t.drag(find.byType(ListView).last, const Offset(0, -2000));
    await t.pumpAndSettle();
    await snap(t, '10c_profile_bottom');
  });

  shot('11_signin', (t, h) async {
    await t.pumpWidget(h.app(const SignInScreen()));
    await snap(t, '11_signin');
  });

  shot('11b_signin_code', (t, h) async {
    await t.pumpWidget(h.app(const SignInScreen()));
    await t.enterText(find.byType(TextField), 'Sara.Khan@gmail.com');
    await t.tap(find.text('Send code'));
    await t.pump(const Duration(milliseconds: 200));
    await t.pump(const Duration(seconds: 2));
    await snap(t, '11b_signin_code');
  });

  shot('12_profile_setup', (t, h) async {
    await t.pumpWidget(h.app(const ProfileSetupScreen()));
    await snap(t, '12_profile_setup');
  });

  shot('13_permissions', (t, h) async {
    await t.pumpWidget(h.app(const PermissionsScreen()));
    await snap(t, '13_permissions');
  });

  shot('14_filters_sheet', (t, h) async {
    await t.pumpWidget(h.app(const HomeShell()));
    await settle(t);
    unawaited(showFiltersSheet(t.element(find.byType(HomeShell))));
    await t.pumpAndSettle();
    await snap(t, '14_filters_sheet');
  });

  shot('15_safety_sheet', (t, h) async {
    await t.pumpWidget(h.app(const HomeShell()));
    await settle(t);
    unawaited(showSafetySheet(t.element(find.byType(HomeShell))));
    await t.pumpAndSettle();
    await snap(t, '15_safety_sheet');
  });

  shot('16_report_sheet', (t, h) async {
    await t.pumpWidget(h.app(const HomeShell()));
    await settle(t);
    unawaited(showReportSheet(t.element(find.byType(HomeShell)), name: 'Sofia'));
    await t.pumpAndSettle();
    await t.tap(find.text('Looks under 18'));
    await t.pumpAndSettle();
    await snap(t, '16_report_sheet');
  });

  shot('17_chat', (t, h) async {
    final id = h.social.friends.firstWhere((f) => f.profile.name == 'Priya').profile.id;
    await t.pumpWidget(h.app(ChatScreen(friendId: id)));
    await snap(t, '17_chat');
  });

  shot('18_wallet', (t, h) async {
    await t.pumpWidget(h.app(const WalletScreen()));
    await snap(t, '18_wallet');
  });

  shot('19_checkout', (t, h) async {
    await t.pumpWidget(h.app(CheckoutScreen(pack: MockData.packs[2])));
    await snap(t, '19_checkout');
  });

  shot('20_chats_empty', (t, h) async {
    await tab(t, h, 'Chats');
    await snap(t, '20_chats_empty');
  }, withFriends: false);

  shot('22_inbox', (t, h) async {
    await t.pumpWidget(h.app(const InboxScreen()));
    await snap(t, '22_inbox');
  });

  shot('21_store_vip', (t, h) async {
    await tab(t, h, 'Store');
    await snap(t, '21_store_vip');
  }, vip: true);
  for (final name in ['Match', 'Store', 'Chats', 'Me']) {
    shot('30_large_text_$name', (t, h) async {
      t.platformDispatcher.textScaleFactorTestValue = 1.3;
      await tab(t, h, name);
      await snap(t, '30_large_text_$name');
      t.platformDispatcher.clearTextScaleFactorTestValue();
    });
  }
  shot('31_large_text_call', (t, h) async {
    t.platformDispatcher.textScaleFactorTestValue = 1.3;
    await connect(t, h);
    await t.pump(const Duration(seconds: 6));
    await snap(t, '31_large_text_call');
    t.platformDispatcher.clearTextScaleFactorTestValue();
  });
  shot('32_small_phone_lobby', (t, h) async {
    t.view.physicalSize = const Size(360 * 2, 700 * 2);
    await t.pumpWidget(h.app(const HomeShell()));
    await snap(t, '32_small_phone_lobby');
  });
  shot('33_small_phone_welcome', (t, h) async {
    t.view.physicalSize = const Size(360 * 2, 700 * 2);
    await t.pumpWidget(h.app(WelcomeScreen(onContinue: () {})));
    await snap(t, '33_small_phone_welcome');
  });
}
