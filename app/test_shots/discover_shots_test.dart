// Screenshot harness for Discover, calls in chat and the VIP screen (not part
// of the app's test suite). Run:
//   flutter test --update-goldens test_shots/discover_shots_test.dart
// ignore_for_file: invalid_use_of_visible_for_testing_member
import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/calls.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/calls_provider.dart';
import 'package:vibe_app/providers/discover_provider.dart';
import 'package:vibe_app/providers/follows_provider.dart';
import 'package:vibe_app/providers/catalog_provider.dart';
import 'package:vibe_app/providers/engagement_provider.dart';
import 'package:vibe_app/providers/moments_provider.dart';
import 'package:vibe_app/providers/referrals_provider.dart';
import 'package:vibe_app/providers/partner_provider.dart';
import 'package:vibe_app/services/invite/invite_capture.dart';
import 'package:vibe_app/providers/inbox_provider.dart';
import 'package:vibe_app/providers/match_provider.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/discover/discover_screen.dart';
import 'package:vibe_app/screens/discover/discover_sheets.dart';
import 'package:vibe_app/screens/home/home_shell.dart';
import 'package:vibe_app/screens/discover/liked_you_screen.dart';
import 'package:vibe_app/screens/discover/match_dialog.dart';
import 'package:vibe_app/screens/social/call_screens.dart';
import 'package:vibe_app/screens/social/chat_screen.dart';
import 'package:vibe_app/screens/social/chat_calls.dart';
import 'package:vibe_app/screens/social/chat_tools.dart';
import 'package:vibe_app/screens/match/voice_call.dart';
import 'package:vibe_app/screens/store/vip_screen.dart';
import 'package:vibe_app/services/app_services.dart';

// Fake network: any photo URL → a local stand-in portrait (pravatar `img`).
List<int> _bytesFor(Uri u) {
  final img = u.queryParameters['img'] ?? '${(u.toString().hashCode.abs() % 70) + 1}';
  final f = File('/tmp/imgcache/400_$img.jpg');
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
  late DiscoverProvider discover;
  late CallsProvider calls;
  late Profile sana;
  late FollowsProvider follows;
  late InboxProvider inbox;

  Future<void> init({bool vip = false}) async {
    SharedPreferences.setMockInitialValues({});
    backend = MockBackend(fast: true, random: Random(4));
    wallet = WalletProvider(backend);
    social = SocialProvider(backend, wallet);
    session = SessionProvider(backend);
    match = MatchProvider(backend, wallet, social, session, cameraEnabled: false);
    discover = DiscoverProvider(social, wallet);
    calls = CallsProvider(social, match);
    await wallet.load();
    wallet.debugSet(wallet.wallet.copyWith(coins: 340, vipUntil: vip ? DateTime.now().add(const Duration(days: 20)) : null));
    await social.load();
    await session.signIn(method: 'phone');
    await session.saveProfile(session.me!.copyWith(name: 'Wahab', age: 25, avatarUrl: 'https://i.pravatar.cc/400?img=12', bio: 'Here for good conversations.', interests: ['Music', 'Travel', 'Tech']));
    await session.finishOnboarding();
    await match.load();
    follows = FollowsProvider(backend, social);
    await follows.load();
    inbox = InboxProvider();
    sana = backend.people.firstWhere((p) => p.gender == Gender.female);
  }

  Widget app(Widget home) => MultiProvider(
        providers: [
          Provider<MockBackend>.value(value: backend),
          Provider<AppServices>.value(value: AppServices.none()),
          ChangeNotifierProvider.value(value: session),
          ChangeNotifierProvider.value(value: wallet),
          ChangeNotifierProvider.value(value: social),
          ChangeNotifierProvider.value(value: match),
          ChangeNotifierProvider.value(value: discover),
          ChangeNotifierProvider.value(value: calls),
          ChangeNotifierProvider.value(value: inbox),
          ChangeNotifierProvider.value(value: CatalogProvider()),
          ChangeNotifierProvider.value(value: EngagementProvider(backend)),
          ChangeNotifierProvider.value(value: MomentsProvider(backend, session)),
          ChangeNotifierProvider.value(value: ReferralsProvider(backend)),
          ChangeNotifierProvider.value(value: PartnerProvider(verified: () => false)),
          ChangeNotifierProvider.value(value: InviteCapture()),
          ChangeNotifierProvider<FollowsProvider>.value(value: follows),
        ],
        child: RepaintBoundary(key: const ValueKey('root'), child: MaterialApp(debugShowCheckedModeBanner: false, theme: V.theme(), home: home)),
      );
}

Future<void> settle(WidgetTester t, {int ms = 500}) async {
  for (var i = 0; i < 3; i++) {
    await t.runAsync(() => Future<void>.delayed(Duration(milliseconds: ms)));
    await t.pump(const Duration(milliseconds: 400));
  }
}

Future<void> snap(WidgetTester t, String name) async {
  await settle(t);
  await expectLater(find.byKey(const ValueKey('root')), matchesGoldenFile('shots/$name.png'));
}

void shot(String name, Future<void> Function(WidgetTester t, H h) body, {bool vip = false}) {
  testWidgets(name, (t) async {
    await HttpOverrides.runWithHttpOverrides(() async {
      t.view.physicalSize = const Size(412 * 2, 892 * 2);
      t.view.devicePixelRatio = 2;
      t.view.padding = const FakeViewPadding(top: 40 * 2, bottom: 24 * 2);
      t.view.viewPadding = const FakeViewPadding(top: 40 * 2, bottom: 24 * 2);
      final h = H();
      await t.runAsync(() => h.init(vip: vip));
      await body(t, h);
      h.calls.clear();
      h.match.stop();
      await t.pumpWidget(const SizedBox());
      await t.pump(const Duration(minutes: 1));
      t.view.reset();
    }, _FakeHttp());
  });
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    const f = '/home/claude/vibe/app/assets/fonts';
    await _font('Geist', ['$f/Geist-Regular.ttf', '$f/Geist-Medium.ttf', '$f/Geist-SemiBold.ttf', '$f/Geist-Bold.ttf', '$f/Geist-ExtraBold.ttf']);
    await _font('GeistMono', ['$f/GeistMono-Medium.ttf', '$f/GeistMono-SemiBold.ttf']);
    await _font('InstrumentSerif', ['$f/InstrumentSerif-Regular.ttf', '$f/InstrumentSerif-Italic.ttf']);
    await _font('MaterialIcons', ['/opt/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf']);
    await _font('packages/solar_icons/SolarIcons', ['/root/.pub-cache/hosted/pub.dev/solar_icons-0.2.0/fonts/SolarIcons.ttf']);
    await _font('NotoColorEmoji', ['/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf']);
  });

  shot('d1_discover', (t, h) async {
    await t.pumpWidget(h.app(const DiscoverScreen()));
    await snap(t, 'd1_discover');
  });

  for (final size in const [Size(360, 640), Size(390, 844)]) {
    shot('m_lobby_${size.width.toInt()}', (t, h) async {
      t.view.physicalSize = size * 2;
      await t.pumpWidget(h.app(const HomeShell()));
      await snap(t, 'm_lobby_${size.width.toInt()}');
    });
  }

  shot('d0_shell_discover', (t, h) async {
    await t.pumpWidget(h.app(const HomeShell()));
    await settle(t);
    await t.tap(find.bySemanticsLabel(RegExp('^Discover')).last);
    await snap(t, 'd0_shell_discover');
  });

  shot('d2_out_of_likes', (t, h) async {
    await t.pumpWidget(h.app(const DiscoverScreen()));
    await settle(t);
    unawaited(showOutOfLikes(t.element(find.byType(DiscoverScreen))));
    await snap(t, 'd2_out_of_likes');
  });

  shot('d3_filters', (t, h) async {
    await t.pumpWidget(h.app(const DiscoverScreen()));
    await settle(t);
    unawaited(showDiscoverFilters(t.element(find.byType(DiscoverScreen))));
    await snap(t, 'd3_filters');
  });

  shot('d4_match', (t, h) async {
    await t.pumpWidget(h.app(const DiscoverScreen()));
    await settle(t);
    unawaited(showMatchDialog(t.element(find.byType(DiscoverScreen)), Friend(profile: h.sana, state: FriendState.friends, since: DateTime.now(), online: true)));
    await snap(t, 'd4_match');
  });

  shot('d5_liked_you', (t, h) async {
    await t.pumpWidget(h.app(const LikedYouScreen()));
    await snap(t, 'd5_liked_you');
  });

  shot('d6_liked_you_vip', (t, h) async {
    await t.pumpWidget(h.app(const LikedYouScreen()));
    await snap(t, 'd6_liked_you_vip');
  }, vip: true);

  shot('c1_chat_asked', (t, h) async {
    await t.runAsync(() async {
      await h.social.addMatched(Friend(profile: h.sana, state: FriendState.friends, since: DateTime.now(), online: true));
      await h.social.sendMessage(h.sana.id, 'hey! fellow Coke Studio fan?');
    });
    h.social.addSystemLine(h.sana.id, '${h.sana.name.split(' ').first} asked to allow video calls', 'calls_asked');
    h.social.setCalls(h.sana.id, const CallsView(theirs: true));
    await t.pumpWidget(h.app(ChatScreen(friendId: h.sana.id)));
    await snap(t, 'c1_chat_asked');
  });

  shot('c2_chat_on', (t, h) async {
    await t.runAsync(() => h.social.addMatched(Friend(profile: h.sana, state: FriendState.friends, since: DateTime.now(), online: true)));
    h.social.addSystemLine(h.sana.id, 'You both allowed video calls', 'calls_on');
    h.social.addSystemLine(h.sana.id, 'Video call · 12 min', 'call_ended', extra: {'seconds': 720});
    h.social.addSystemLine(h.sana.id, 'Missed video call', 'call_missed');
    h.social.setCalls(h.sana.id, const CallsView(mine: true, theirs: true));
    await t.pumpWidget(h.app(ChatScreen(friendId: h.sana.id)));
    await snap(t, 'c2_chat_on');
  });

  shot('c3_incoming', (t, h) async {
    await t.pumpWidget(h.app(IncomingCallScreen(call: IncomingCall(callId: 'x', from: h.sana, expiresAt: DateTime.now().add(const Duration(seconds: 28))))));
    await snap(t, 'c3_incoming');
  });

  shot('c4_calling', (t, h) async {
    await t.runAsync(() => h.social.addMatched(Friend(profile: h.sana, state: FriendState.friends, since: DateTime.now(), calls: const CallsView(mine: true, theirs: true))));
    h.social.setCalls(h.sana.id, const CallsView(mine: true, theirs: true));
    await t.pumpWidget(h.app(OutgoingCallScreen(onMessage: (_) {})));
    await h.calls.ring(h.sana);
    await snap(t, 'c4_calling');
  });

  Future<void> toolsChat(WidgetTester t, H h, {CallsView calls = const CallsView(mine: true, theirs: true)}) async {
    await t.runAsync(() async {
      await h.social.addMatched(Friend(profile: h.sana, state: FriendState.friends, since: DateTime.now(), online: true));
      await h.social.sendMessage(h.sana.id, 'hey! fellow Coke Studio fan? 🎶');
      final first = h.social.messages(h.sana.id).last;
      await h.social.react(h.sana.id, first.id, '❤️');
      await h.social.sendMessage(h.sana.id, 'which season is your favourite', replyToId: first.id);
      await h.social.sendMedia(h.sana.id, MessageKind.voice, Uint8List(1), contentType: 'audio/mp4', seconds: 14);
    });
    h.social.debugAppend(h.sana.id, ChatMessage(id: 'ph1', fromMe: false, text: '📷 Photo', at: DateTime.now(), kind: MessageKind.photo, meta: const {'w': 400, 'h': 400}, localBytes: File('/tmp/imgcache/400_47.jpg').readAsBytesSync()));
    h.social.setCalls(h.sana.id, calls);
  }

  shot('t1_chat_tools', (t, h) async {
    await toolsChat(t, h);
    await t.pumpWidget(h.app(ChatScreen(friendId: h.sana.id)));
    await snap(t, 't1_chat_tools');
  });

  shot('t2_ask_sheet', (t, h) async {
    await toolsChat(t, h, calls: CallsView.off);
    await t.pumpWidget(h.app(ChatScreen(friendId: h.sana.id)));
    await settle(t);
    unawaited(openAskCalls(t.element(find.byType(ChatScreen)), h.social.friend(h.sana.id)!));
    await snap(t, 't2_ask_sheet');
  });

  shot('t3_they_asked_video', (t, h) async {
    await toolsChat(t, h, calls: const CallsView(theirs: true, theirsVideo: true));
    await t.pumpWidget(h.app(ChatScreen(friendId: h.sana.id)));
    await snap(t, 't3_they_asked_video');
  });

  shot('t4_message_menu', (t, h) async {
    await toolsChat(t, h);
    await t.pumpWidget(h.app(ChatScreen(friendId: h.sana.id)));
    await settle(t);
    unawaited(showMessageMenu(t.element(find.byType(ChatScreen)), h.social.messages(h.sana.id).firstWhere((m) => m.text.startsWith('which'))));
    await snap(t, 't4_message_menu');
  });

  shot('t5_emoji', (t, h) async {
    await toolsChat(t, h);
    await t.pumpWidget(h.app(ChatScreen(friendId: h.sana.id)));
    await settle(t);
    await t.tap(find.byTooltip('Emoji'));
    await snap(t, 't5_emoji');
  });

  shot('t6_voice_call', (t, h) async {
    await t.runAsync(() async {
      await h.social.addMatched(Friend(profile: h.sana, state: FriendState.friends, since: DateTime.now(), calls: const CallsView(mine: true, theirs: true, mineVideo: true, theirsVideo: true)));
      await h.match.beginFriendCall(h.sana, voice: true);
    });
    (h.match as dynamic).debugTheyAskVideo();
    await t.pumpWidget(h.app(Scaffold(body: Consumer<MatchProvider>(builder: (_, m, _) => VoiceCallView(m: m, onReport: () {})))));
    await snap(t, 't6_voice_call');
  });

  shot('v1_vip', (t, h) async {
    t.view.physicalSize = const Size(412 * 2, 1900 * 2);
    await t.pumpWidget(h.app(const VipScreen()));
    await snap(t, 'v1_vip');
  });
}
