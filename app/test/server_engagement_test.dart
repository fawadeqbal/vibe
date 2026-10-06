// Engagement end-to-end against a running Vibe API (server mode): two people
// meet in a call, play an icebreaker, like each other, become friends, post
// and watch a moment. Skipped unless VIBE_API_TEST points at a server started
// with OTP_FIXED_CODE=1234, e.g.:
//
//   VIBE_API_TEST=http://127.0.0.1:3000 flutter test test/server_engagement_test.dart
import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/api_exception.dart';
import 'package:vibe_app/core/api/realtime_client.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/core/mock/mock_data.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/engagement_provider.dart';
import 'package:vibe_app/providers/match_provider.dart';
import 'package:vibe_app/providers/moments_provider.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';

Future<void> until(bool Function() ok, {Duration timeout = const Duration(seconds: 15)}) async {
  final end = DateTime.now().add(timeout);
  while (!ok()) {
    if (DateTime.now().isAfter(end)) throw TimeoutException('condition not met');
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
}

class Person {
  Person(String base) : api = ApiClient(baseUrl: '$base/v1', tokens: MemoryTokenStore()) {
    rt = RealtimeClient(api, url: base);
    session = RemoteSessionProvider(api);
    wallet = RemoteWalletProvider(api, rt);
    social = RemoteSocialProvider(api, rt);
    match = RemoteMatchProvider(api, rt, wallet, social, session, cameraEnabled: false);
    engagement = RemoteEngagementProvider(api, rt);
    moments = RemoteMomentsProvider(api, rt, session);
  }

  final ApiClient api;
  late final RealtimeClient rt;
  late final SessionProvider session;
  late final WalletProvider wallet;
  late final SocialProvider social;
  late final MatchProvider match;
  late final EngagementProvider engagement;
  late final MomentsProvider moments;

  Future<void> signUp(String name) async {
    await session.restore();
    final email = '${name.toLowerCase()}${1000000 + Random().nextInt(8999999)}@vibe.test';
    await session.requestCode(email);
    await session.signIn(method: 'email', email: email, code: '1234');
    await session.saveProfile(session.me!.copyWith(name: name, age: 24, gender: Gender.female, country: MockData.country('PK'), interests: ['Music', 'Travel', 'Tech']));
    await session.finishOnboarding();
    rt.connect();
    await wallet.load();
    await social.load();
  }

  Future<void> close() async {
    match.stop();
    await session.signOut();
    rt.disconnect();
  }
}

void main() {
  final base = Platform.environment['VIBE_API_TEST'];

  test('server mode: icebreaker, mutual like, friends, streak, moments, progress, wellbeing', () async {
    final a = Person(base!);
    final b = Person(base);
    await a.signUp('Aisha');
    await b.signUp('Bilal');

    // Wellbeing + timezone (sent after sign-in when it differs from the server's).
    await until(() => a.session.wellbeing.tzOffsetMinutes == SessionProvider.deviceTzOffsetMinutes());
    expect(await a.session.saveWellbeing(const WellbeingSettings(quietHoursStart: 1380, quietHoursEnd: 420, breakReminderMinutes: 60)), isTrue);
    await a.session.refreshMe();
    expect(a.session.wellbeing.quietHoursOn, isTrue);
    expect(a.session.wellbeing.breakReminderMinutes, 60);

    // Gem goal lives on the wallet.
    await a.wallet.setGemGoal(1000);
    expect(a.wallet.gemGoal, 1000);
    await a.wallet.load();
    expect(a.wallet.gemGoal, 1000);
    expect(a.wallet.freeBoosts, 0);

    // Meet each other (retry if a dev bot gets one of us first).
    for (var attempt = 0; attempt < 4; attempt++) {
      await Future.wait([a.match.start(), b.match.start()]);
      await until(() => a.match.isConnected && b.match.isConnected, timeout: const Duration(seconds: 12));
      if (a.match.partner!.id == b.session.me!.id) break;
      // ignore: avoid_print
      print('attempt $attempt: A met ${a.match.partner!.name}, B met ${b.match.partner!.name}');
      a.match.stop();
      b.match.stop();
      await until(() => !a.match.isConnected && !b.match.isConnected);
      a.match.dismissEnded();
      b.match.dismissEnded();
    }
    expect(a.match.partner!.id, b.session.me!.id);
    expect(a.match.partner!.level, greaterThanOrEqualTo(1));

    // Icebreaker: A starts, B sees it as the partner's, both answer, both see the reveal.
    await a.match.startGame(IcebreakerGame.wyr);
    expect(a.match.game!.byMe, isTrue);
    await until(() => b.match.game != null);
    expect(b.match.game!.byMe, isFalse);
    expect(b.match.game!.round, a.match.game!.round);
    await a.match.answerGame(0);
    await until(() => b.match.game!.partnerAnswered);
    await b.match.answerGame(1);
    await until(() => a.match.game!.revealed && b.match.game!.revealed);
    expect((a.match.game!.mine, a.match.game!.theirs), (0, 1));
    expect((b.match.game!.mine, b.match.game!.theirs), (1, 0));
    await b.match.nextGame().catchError((Object e) => e is ApiException && e.code == 'RATE_LIMITED' ? null : throw e);
    await a.match.closeGame();
    await until(() => a.match.game == null && b.match.game == null);

    // Mutual like → "It's a vibe!" on both sides.
    a.match.like();
    b.match.like();
    await until(() => a.match.mutualSeq == 1 && b.match.mutualSeq == 1);

    // Friend request in the call, accepted.
    expect(await a.match.addFriend(), isTrue);
    await until(() => b.social.incoming.any((f) => f.profile.id == a.session.me!.id));
    await b.social.accept(a.session.me!.id);
    await until(() => a.social.friend(b.session.me!.id)?.state == FriendState.friends);
    expect(a.social.friend(b.session.me!.id)!.streak.count, 0);
    await expectLater(a.social.restoreStreak(b.session.me!.id), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'STREAK_NOT_RESTORABLE')));

    // The call ends: the recap knows you liked each other; reconnect is free for a while.
    a.match.stop();
    await until(() => a.match.state == MatchState.ended && b.match.state == MatchState.ended);
    expect(a.match.lastMutual, isTrue);
    expect(a.match.reconnectFree, isTrue);
    expect(a.match.reconnectPrice, 0);

    // Moments: A posts, B (a friend now) sees and watches it, A sees who watched.
    final jpeg = img.encodeJpg(img.Image(width: 64, height: 64));
    await a.moments.post(jpeg, caption: 'hello from the test');
    expect(a.moments.mine!.moments.single.caption, 'hello from the test');
    await b.moments.load();
    final group = b.moments.people.firstWhere((g) => g.author.id == a.session.me!.id);
    expect(group.allSeen, isFalse);
    await b.moments.markSeen(group.moments.single);
    final viewers = await a.moments.viewers(a.moments.mine!.moments.single.id);
    expect(viewers.map((v) => v.profile.id), [b.session.me!.id]);
    await a.moments.delete(a.moments.mine!.moments.single.id);
    expect(a.moments.mine!.moments, isEmpty);

    // Progress, leaderboard, recap, Vibe Hour.
    await a.engagement.load();
    expect(a.engagement.loaded, isTrue);
    final p = await a.engagement.loadProgress();
    expect(p.badges, hasLength(10));
    expect(p.level.level, greaterThanOrEqualTo(1));
    final lb = await a.engagement.leaderboard(Board.xp);
    expect(lb.board, Board.xp);
    expect(lb.weekStart, isNotNull);
    expect((await a.engagement.leaderboard(Board.gems)).board, Board.gems);
    expect(await a.engagement.loadRecap(), isNotNull);
    if (Economy.vibeHourMinutes > 0) expect(a.engagement.vibeHour.startsAt, isNotNull);

    a.engagement.dispose();
    b.engagement.dispose();
    await a.close();
    await b.close();
  }, skip: base == null ? 'set VIBE_API_TEST to run against a server' : false, timeout: const Timeout(Duration(minutes: 2)));
}
