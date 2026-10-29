// Smoke test against a real local backend (not part of `flutter test`):
//   SMOKE_A=<json> SMOKE_B=<json> flutter test test_smoke/chat_tools_smoke_test.dart
// SMOKE_A / SMOKE_B: `{ "id", "access", "refresh" }` for two users who are
// friends (calls off). Checks chat tools and call levels end to end.
// ignore_for_file: avoid_print
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/realtime_client.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/calls_provider.dart';
import 'package:vibe_app/providers/match_provider.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';

const base = 'http://localhost:3000/v1';

class Side {
  Side(this.id, this.api, this.rt, this.social, this.calls);
  final String id;
  final ApiClient api;
  final RealtimeClient rt;
  final SocialProvider social;
  final CallsProvider calls;
}

Future<Side> side(String json) async {
  final j = jsonDecode(json) as Map<String, dynamic>;
  final api = ApiClient(baseUrl: base, tokens: MemoryTokenStore());
  await api.setTokens({'accessToken': j['access'], 'refreshToken': j['refresh']});
  final rt = RealtimeClient(api, url: 'http://localhost:3000')..connect();
  final social = RemoteSocialProvider(api, rt);
  final wallet = RemoteWalletProvider(api, rt);
  final match = RemoteMatchProvider(api, rt, wallet, social, RemoteSessionProvider(api), cameraEnabled: false);
  final calls = RemoteCallsProvider(api, rt, social, match);
  await social.load();
  return Side(j['id'] as String, api, rt, social, calls);
}

Future<void> until(bool Function() ok, String what) async {
  for (var i = 0; i < 50; i++) {
    if (ok()) return;
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
  fail('timed out waiting for: $what');
}

void main() {
  test('chat tools and call levels against the local backend', () async {
    final env = Platform.environment;
    final a = await side(env['SMOKE_A']!);
    final b = await side(env['SMOKE_B']!);
    await a.social.ensureMessages(b.id);
    await b.social.ensureMessages(a.id);
    await Future<void>.delayed(const Duration(seconds: 1)); // sockets up

    // Text + reply.
    await a.social.sendMessage(b.id, 'hey from the app');
    await until(() => b.social.messages(a.id).any((m) => m.text == 'hey from the app'), 'B gets the text');
    final first = b.social.messages(a.id).lastWhere((m) => m.text == 'hey from the app');
    await b.social.sendMessage(a.id, 'replying', replyToId: first.id);
    await until(() => a.social.messages(b.id).any((m) => m.text == 'replying' && m.replyTo?.text == 'hey from the app'), 'A gets the reply with its quote');
    print('text + reply: ok');

    // Typing and seen.
    a.social.typingTo(b.id);
    await until(() => b.social.isTyping(a.id), 'B sees typing');
    b.social.markRead(a.id);
    await until(() => a.social.seenAt(b.id) != null, 'A sees Seen');
    print('typing + seen: ok');

    // Reactions.
    await b.social.react(a.id, first.id, '😂');
    await until(() => a.social.messages(b.id).any((m) => m.id == first.id && m.reactionTheirs == '😂'), 'A sees the reaction');
    await b.social.react(a.id, first.id, null);
    await until(() => a.social.messages(b.id).any((m) => m.id == first.id && m.reactionTheirs == null), 'reaction removed');
    print('reactions: ok');

    // Photo and voice note.
    final jpg = File('/tmp/imgcache/400_47.jpg').readAsBytesSync();
    await a.social.sendMedia(b.id, MessageKind.photo, jpg, contentType: 'image/jpeg', w: 400, h: 400);
    await until(() => b.social.messages(a.id).any((m) => m.kind == MessageKind.photo && m.mediaUrl != null), 'B gets the photo');
    expect(a.social.messages(b.id).where((m) => m.pending), isEmpty);
    expect(a.social.messages(b.id).where((m) => m.kind == MessageKind.photo).length, 1, reason: 'no duplicate after upload');
    final m4a = File(env['SMOKE_M4A']!).readAsBytesSync();
    await a.social.sendMedia(b.id, MessageKind.voice, m4a, contentType: 'audio/mp4', seconds: 2);
    await until(() => b.social.messages(a.id).any((m) => m.kind == MessageKind.voice && m.meta?['seconds'] == 2), 'B gets the voice note');
    print('photo + voice: ok (${b.social.messages(a.id).lastWhere((m) => m.kind == MessageKind.photo).mediaUrl})');

    // Unsend.
    final mine = a.social.messages(b.id).lastWhere((m) => m.kind == MessageKind.voice);
    await a.social.unsend(b.id, mine.id);
    await until(() => b.social.messages(a.id).any((m) => m.id == mine.id && m.unsent), 'B sees it unsent');
    print('unsend: ok');

    // Calls: A asks for voice only, B says yes → voice on, no video.
    await a.calls.allow(b.id, video: false);
    await until(() => b.social.friend(a.id)!.calls.theirs && !b.social.friend(a.id)!.calls.theirsVideo, 'B sees the voice ask');
    final st = await b.calls.allow(a.id, video: true);
    expect(st.on, isTrue);
    expect(st.video, isFalse, reason: 'the lower level wins');
    await until(() => a.social.friend(b.id)!.calls.on, 'A sees calls on');
    expect(a.social.friend(b.id)!.calls.video, isFalse);
    await a.calls.allow(b.id, video: true);
    await until(() => b.social.friend(a.id)!.calls.video, 'video on for both');
    print('call levels: ok');

    await a.calls.turnOff(b.id);
    a.rt.disconnect();
    b.rt.disconnect();
  }, timeout: const Timeout(Duration(minutes: 2)));
}
