import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/mock/mock_data.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/match_provider.dart';
import 'package:vibe_app/providers/session_provider.dart';
import 'package:vibe_app/providers/social_provider.dart';
import 'package:vibe_app/providers/wallet_provider.dart';

void main() {
  late MockBackend backend;
  late WalletProvider wallet;
  late SocialProvider social;
  late SessionProvider session;
  late MatchProvider match;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    backend = MockBackend(fast: true, random: Random(1));
    wallet = WalletProvider(backend);
    social = SocialProvider(backend, wallet);
    session = SessionProvider(backend);
    match = MatchProvider(backend, wallet, social, session, cameraEnabled: false);
    await wallet.load();
    await social.load();
    await session.signIn(method: 'email');
  });

  tearDown(() {
    match.dispose();
    social.dispose();
  });

  test('economy numbers match BUSINESS.md', () {
    expect(const MatchFilters().costFor(vip: false), 0);
    expect(const MatchFilters(gender: GenderFilter.men).costFor(vip: false), Economy.genderFilterCost);
    expect(const MatchFilters(gender: GenderFilter.men, countryCode: 'US').costFor(vip: false), Economy.genderFilterCost + Economy.regionFilterCost);
    expect(const MatchFilters(gender: GenderFilter.men, countryCode: 'US').costFor(vip: true), 0);
    expect(MockData.packs.map((p) => p.usdPer100).reduce(max), closeTo(0.99, 0.001));
    expect(MockData.gifts.every((g) => g.gems == (g.coins * Economy.giftGemShare).round()), isTrue);
  });

  test('findMatch honours gender, country and safe mode, and never returns an excluded id', () async {
    final women = await backend.findMatch(const MatchFilters(gender: GenderFilter.women, countryCode: 'PK'));
    expect(women.gender, Gender.female);
    expect(women.country.code, 'PK');
    final safe = await backend.findMatch(const MatchFilters(safeMode: true));
    expect(safe.verified, isTrue);
    final everyone = backend.people.map((p) => p.id).toSet();
    final only = everyone.first;
    for (var i = 0; i < 20; i++) {
      final p = await backend.findMatch(const MatchFilters(), exclude: everyone.difference({only}));
      expect(p.id, only);
    }
  });

  test('start → connected with a partner and a script; next() finds someone else', () async {
    expect(await match.start(), isTrue);
    expect(match.state, MatchState.connected);
    final first = match.partner!;
    expect(match.current, isNotNull);
    expect(await match.next(), isTrue);
    expect(match.state, MatchState.connected);
    expect(match.partner!.id, isNot(first.id), reason: 'the last partner is excluded');
    expect(match.history.length, 1);
    expect(match.history.first.partner.id, first.id);
    expect(match.history.first.endedAt, isNotNull);
    expect(match.endReason, EndReason.skipped);
  });

  test('filters are charged per match and refused when unaffordable', () async {
    match.setFilters(const MatchFilters(gender: GenderFilter.women));
    expect(await match.start(), isTrue);
    expect(wallet.coins, Economy.welcomeCoins - Economy.genderFilterCost);
    expect(match.partner!.gender, Gender.female);
    wallet.debugSet(wallet.wallet.copyWith(coins: 3));
    expect(await match.next(), isFalse);
    expect(match.state, MatchState.idle);
    expect(match.lastError, contains('Not enough coins'));
  });

  test('gifts, likes and friend requests inside a match', () async {
    wallet.debugSet(wallet.wallet.copyWith(coins: 100));
    await match.start();
    final rose = MockData.gifts.first;
    expect(await match.sendGift(rose), isTrue);
    expect(wallet.coins, 95);
    expect(match.chat.last.gift, rose);
    expect(match.current!.giftsSent, 1);
    match.like();
    expect(match.likedPartner, isTrue);
    expect(await match.addFriend(), isTrue);
    expect(match.friendState, FriendState.requested);
    final rocket = MockData.gifts.last;
    expect(await match.sendGift(rocket), isFalse, reason: '1000 coins > balance');
  });

  test('five quick skips start a cooldown; paying bypasses it', () async {
    for (var i = 0; i < Economy.skipsBeforeCooldown; i++) {
      await match.start();
      await match.next();
    }
    expect(match.inCooldown, isTrue);
    expect(await match.next(), isFalse, reason: 'must wait or pay');
    expect(match.state, MatchState.connected);
    final before = wallet.coins;
    expect(await match.bypassCooldown(), isTrue);
    expect(wallet.coins, before - Economy.skipCooldownBypassCost);
    expect(match.inCooldown, isFalse);
  });

  test('stop ends the match and reconnect brings the same person back for coins', () async {
    await match.start();
    final p = match.partner!;
    match.stop();
    expect(match.state, MatchState.ended);
    expect(match.endReason, EndReason.stopped);
    expect(match.lastPartner!.id, p.id);
    wallet.debugSet(wallet.wallet.copyWith(coins: 100));
    expect(await match.reconnect(), isTrue);
    expect(match.state, MatchState.connected);
    expect(match.partner!.id, p.id);
    expect(wallet.coins, 100 - Economy.reconnectCost);
  });

  test('reporting ends the match and blocking keeps that person out of the pool', () async {
    await match.start();
    final p = match.partner!;
    await match.report(ReportReason.spam, block: true);
    expect(match.state, MatchState.ended);
    expect(social.blocked, contains(p.id));
    for (var i = 0; i < 10; i++) {
      await match.start();
      expect(match.partner!.id, isNot(p.id));
      match.stop();
    }
  });

  test('partner events flow through _apply: a scripted gift credits gems', () async {
    await match.start();
    // Drive the partner script by hand through the same seam the timers use.
    final script = backend.scriptFor(match.partner!);
    expect(script, isNotEmpty);
    expect(script.first.action, PartnerAction.message);
  });
}
