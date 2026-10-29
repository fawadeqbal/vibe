import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/api/api_exception.dart';
import 'package:vibe_app/core/api/mappers.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/calls_provider.dart';
import 'package:vibe_app/providers/follows_provider.dart';
import 'package:vibe_app/providers/match_provider.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/match/voice_call.dart';
import 'package:vibe_app/screens/social/chat_calls.dart';
import 'package:vibe_app/screens/social/chat_screen.dart';
import 'package:vibe_app/screens/social/chat_tools.dart';
import 'package:vibe_app/services/app_services.dart';

const _sana = Profile(id: 'u2', name: 'Sana Iqbal', age: 24, gender: Gender.female, country: Country('PK', 'Pakistan', '🇵🇰'), avatarUrl: '');

void main() {
  group('mappers', () {
    test('photos, voice notes, replies, reactions, unsent and seen', () {
      final photo = ApiMap.message({
        'id': 'm1',
        'fromMe': false,
        'kind': 'photo',
        'text': '📷 Photo',
        'meta': {'url': 'https://cdn/x.jpg', 'w': 800, 'h': 600},
        'replyTo': {'id': 'm0', 'fromMe': true, 'kind': 'text', 'text': 'send a pic', 'unsent': false},
        'reactions': {'mine': '❤️', 'theirs': null},
        'unsent': false,
        'at': '2026-10-29T10:00:00Z',
      });
      expect(photo.kind, MessageKind.photo);
      expect(photo.mediaUrl, 'https://cdn/x.jpg');
      expect(photo.replyTo?.text, 'send a pic');
      expect(photo.replyTo?.fromMe, isTrue);
      expect(photo.reactionMine, '❤️');
      expect(photo.reactionTheirs, isNull);

      final voice = ApiMap.message({'id': 'm2', 'fromMe': true, 'kind': 'voice', 'text': '🎤 Voice message', 'meta': {'url': 'u', 'seconds': 7}, 'readAt': '2026-10-29T10:01:00Z'});
      expect(voice.kind, MessageKind.voice);
      expect(voice.meta?['seconds'], 7);
      expect(voice.readAt, isNotNull);

      final gone = ApiMap.message({'id': 'm3', 'fromMe': true, 'text': '', 'unsent': true});
      expect(gone.unsent, isTrue);
      expect(SocialProvider.lastLine(gone), 'Message unsent');
      expect(const ReplyRef(id: 'x', fromMe: false, kind: 'voice', text: '🎤 Voice message').preview, '🎤 Voice message');
    });

    test('calls: voice only vs voice and video', () {
      final voice = ApiMap.callsView({'mine': true, 'theirs': true, 'mineVideo': false, 'theirsVideo': true});
      expect(voice.on, isTrue);
      expect(voice.video, isFalse);
      // Older servers send only mine/theirs: that meant video.
      final old = ApiMap.callsView({'mine': true, 'theirs': true});
      expect(old.video, isTrue);
    });
  });

  group('offline chat tools', () {
    late MockBackend backend;
    late WalletProvider wallet;
    late SocialProvider social;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      backend = MockBackend();
      wallet = WalletProvider(backend);
      social = SocialProvider(backend, wallet);
      await social.load();
      await social.addMatched(Friend(profile: _sana, state: FriendState.friends, since: DateTime.now()));
    });

    tearDown(() => social.dispose());

    test('reply, react (and take it back), unsend', () async {
      await social.sendMessage('u2', 'hello');
      final first = social.messages('u2').last;
      await social.sendMessage('u2', 'about that', replyToId: first.id);
      final reply = social.messages('u2').last;
      expect(reply.replyTo?.id, first.id);
      expect(reply.replyTo?.text, 'hello');

      await social.react('u2', first.id, '😂');
      expect(social.messages('u2').firstWhere((m) => m.id == first.id).reactionMine, '😂');
      await social.react('u2', first.id, '😂');
      expect(social.messages('u2').firstWhere((m) => m.id == first.id).reactionMine, isNull);

      expect(SocialProvider.canUnsend(reply), isTrue);
      await social.unsend('u2', reply.id);
      final gone = social.messages('u2').firstWhere((m) => m.id == reply.id);
      expect(gone.unsent, isTrue);
      expect(gone.text, '');
      expect(social.friend('u2')!.lastMessage, 'Message unsent');
    });

    test('too late to unsend; photos and voice notes; switched off', () async {
      final old = ChatMessage(id: 'o', fromMe: true, text: 'x', at: DateTime.now().subtract(Duration(minutes: Economy.chatUnsendMinutes + 1)));
      expect(SocialProvider.canUnsend(old), isFalse);
      expect(SocialProvider.canUnsend(ChatMessage(id: 't', fromMe: false, text: 'x', at: DateTime.now())), isFalse);

      await social.sendMedia('u2', MessageKind.photo, Uint8List.fromList([1, 2, 3]), contentType: 'image/jpeg', w: 4, h: 3);
      final photo = social.messages('u2').last;
      expect(photo.kind, MessageKind.photo);
      expect(photo.localBytes, isNotNull);
      expect(photo.meta?['w'], 4);
      await social.sendMedia('u2', MessageKind.voice, Uint8List.fromList([1]), contentType: 'audio/mp4', seconds: 5);
      expect(social.messages('u2').last.meta?['seconds'], 5);

      Economy.chatVoiceNotesEnabled = false;
      await expectLater(social.sendMedia('u2', MessageKind.voice, Uint8List(1), contentType: 'audio/mp4', seconds: 2), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'FEATURE_DISABLED')));
      Economy.chatVoiceNotesEnabled = true;
    });

    test('they read it, type, then answer', () async {
      await social.sendMessage('u2', 'hey');
      final sent = social.messages('u2').last;
      await Future<void>.delayed(const Duration(milliseconds: 1000));
      expect(social.isTyping('u2'), isTrue);
      expect(social.seenAt('u2')!.isBefore(sent.at), isFalse);
      await Future<void>.delayed(const Duration(seconds: 6));
      expect(social.isTyping('u2'), isFalse);
      expect(social.messages('u2').last.fromMe, isFalse);
    });
  });

  group('screens', () {
    testWidgets('chat: bubbles, reactions, replies, blurred photos, voice notes and Seen', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final backend = MockBackend();
      final wallet = WalletProvider(backend);
      final social = SocialProvider(backend, wallet);
      final match = MatchProvider(backend, wallet, social, SessionProvider(backend), cameraEnabled: false);
      final calls = CallsProvider(social, match);
      await tester.runAsync(() async {
        await social.load();
        await social.addMatched(Friend(profile: _sana, state: FriendState.friends, since: DateTime.now(), calls: const CallsView(mine: true, theirs: true)));
        await social.sendMessage('u2', 'first');
        final first = social.messages('u2').last;
        await social.react('u2', first.id, '❤️');
        await social.sendMessage('u2', 'a reply', replyToId: first.id);
        await social.sendMedia('u2', MessageKind.voice, Uint8List(1), contentType: 'audio/mp4', seconds: 9);
      });
      await tester.pumpWidget(MultiProvider(
        providers: [
          ChangeNotifierProvider<SocialProvider>.value(value: social),
          ChangeNotifierProvider<CallsProvider>.value(value: calls),
          ChangeNotifierProvider<FollowsProvider>(create: (_) => FollowsProvider(backend, social)),
          Provider<AppServices>.value(value: AppServices.none()),
        ],
        child: MaterialApp(theme: V.theme(), home: const ChatScreen(friendId: 'u2')),
      ));
      await tester.pump();
      expect(find.text('a reply'), findsOneWidget);
      expect(find.text('You'), findsOneWidget); // the quote's author
      expect(find.text('❤️'), findsOneWidget); // reaction chip
      expect(find.text('0:09'), findsOneWidget); // voice note length
      // Voice only (no video yet): a phone, no camera.
      expect(find.bySemanticsLabel('Voice call Sana Iqbal'), findsOneWidget);
      expect(find.bySemanticsLabel('Video call Sana Iqbal'), findsNothing);
      // Empty composer → mic; typing → send.
      expect(find.byTooltip('Record a voice message'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'hi 👋');
      await tester.pump();
      expect(find.byTooltip('Send'), findsOneWidget);

      // Long-press → reactions and actions.
      await tester.longPress(find.text('a reply'));
      await tester.pumpAndSettle();
      expect(find.text('Reply'), findsOneWidget);
      expect(find.text('Copy'), findsOneWidget);
      expect(find.text('Unsend'), findsOneWidget);
      expect(find.text('Report'), findsNothing); // yours
      await tester.tap(find.text('Reply'));
      await tester.pumpAndSettle();
      expect(find.text('Replying to You'), findsOneWidget);

      // Voice call lines say voice.
      await tester.pumpWidget(MaterialApp(
        theme: V.theme(),
        home: Scaffold(body: Center(child: SystemLine(m: ChatMessage(id: 's', fromMe: false, text: 'Missed voice call', at: DateTime.now(), kind: MessageKind.system, meta: const {'event': 'call_missed', 'video': false})))),
      ));
      expect(find.textContaining('Missed voice call'), findsOneWidget);

      // Their photo shows blurred until tapped.
      await tester.pumpWidget(MaterialApp(
        theme: V.theme(),
        home: Scaffold(body: Center(child: PhotoBubble(m: ChatMessage(id: 'p', fromMe: false, text: '📷 Photo', at: DateTime.now(), kind: MessageKind.photo, meta: const {'url': 'x', 'w': 4, 'h': 3}, localBytes: Uint8List(4))))),
      ));
      expect(find.text('Photo · tap to view'), findsOneWidget);
      await tester.tap(find.byType(PhotoBubble));
      await tester.pump();
      expect(find.text('Photo · tap to view'), findsNothing);
      social.dispose();
      match.dispose();
    });

    testWidgets('ask sheet: voice only or voice and video', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final backend = MockBackend();
      final wallet = WalletProvider(backend);
      final social = SocialProvider(backend, wallet);
      final match = MatchProvider(backend, wallet, social, SessionProvider(backend), cameraEnabled: false);
      final calls = CallsProvider(social, match);
      await tester.pumpWidget(MultiProvider(
        providers: [ChangeNotifierProvider<CallsProvider>.value(value: calls)],
        child: MaterialApp(theme: V.theme(), home: Scaffold(body: AskCallsSheet(friend: Friend(profile: _sana, state: FriendState.friends, since: DateTime.now())))),
      ));
      expect(find.text('Voice calls'), findsOneWidget);
      expect(find.text('Voice and video calls'), findsOneWidget);
      expect(find.text('Ask to allow voice and video'), findsOneWidget);
      await tester.tap(find.text('Voice calls'));
      await tester.pump();
      expect(find.text('Ask to allow voice calls'), findsOneWidget);
      match.dispose();
    });

    testWidgets('voice call: mute, turn on video when allowed, their ask', (tester) async {
      tester.view.physicalSize = const Size(1170, 2532);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      SharedPreferences.setMockInitialValues({});
      final backend = MockBackend();
      final wallet = WalletProvider(backend);
      final social = SocialProvider(backend, wallet);
      final match = MatchProvider(backend, wallet, social, SessionProvider(backend), cameraEnabled: false);
      await tester.runAsync(() async {
        await social.load();
        await social.addMatched(Friend(profile: _sana, state: FriendState.friends, since: DateTime.now(), calls: const CallsView(mine: true, theirs: true, mineVideo: true, theirsVideo: true)));
        await match.beginFriendCall(_sana, voice: true);
      });
      expect(match.voiceCall, isTrue);
      Widget app() => MultiProvider(
            providers: [ChangeNotifierProvider<SocialProvider>.value(value: social), ChangeNotifierProvider<MatchProvider>.value(value: match)],
            child: MaterialApp(theme: V.theme(), home: Scaffold(body: Consumer<MatchProvider>(builder: (_, m, _) => VoiceCallView(m: m, onReport: () {})))),
          );
      await tester.pumpWidget(app());
      expect(find.text('Sana'), findsOneWidget);
      expect(find.text('Camera stays off. Not recorded.'), findsOneWidget);
      expect(find.text('Video'), findsOneWidget);
      expect(find.text('Mute'), findsOneWidget);

      (match as dynamic).debugTheyAskVideo();
      await tester.pump();
      expect(find.text('Sana wants to turn on video'), findsOneWidget);
      expect(find.text('Stay on voice'), findsOneWidget);
      await tester.tap(find.text('Stay on voice'));
      await tester.pump();
      expect(match.videoAsk, VideoAsk.none);
      expect(match.voiceCall, isTrue);
      match.stop();
      await tester.pump(const Duration(seconds: 1));
      match.dispose();
      social.dispose();
    });
  });
}
