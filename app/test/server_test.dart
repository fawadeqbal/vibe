// End-to-end against a running Vibe API (server mode). Skipped unless
// VIBE_API_TEST points at a server started with OTP_FIXED_CODE=1234 and
// DEV_BOTS_AFTER_MS>0, e.g.:
//
//   VIBE_API_TEST=http://127.0.0.1:3000 flutter test test/server_test.dart
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:vibe_app/core/api/api_client.dart';
import 'package:vibe_app/core/api/realtime_client.dart';
import 'package:vibe_app/core/api/token_store.dart';
import 'package:vibe_app/core/mock/mock_data.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/providers/catalog_provider.dart';
import 'package:vibe_app/providers/inbox_provider.dart';
import 'package:vibe_app/providers/match_provider.dart';
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

void main() {
  final base = Platform.environment['VIBE_API_TEST'];

  test('server mode: sign in, wallet, purchase, match with a dev bot', () async {
    final api = ApiClient(baseUrl: '$base/v1', tokens: MemoryTokenStore());
    final rt = RealtimeClient(api, url: base);
    final session = RemoteSessionProvider(api);
    final wallet = RemoteWalletProvider(api, rt);
    final social = RemoteSocialProvider(api, rt);
    final match = RemoteMatchProvider(api, rt, wallet, social, session, cameraEnabled: false);

    // Sign up with an e-mailed code.
    await session.restore();
    final email = 'flutter${1000000 + Random().nextInt(8999999)}@vibe.test';
    await session.requestCode(email);
    await session.signIn(method: 'email', email: email, code: '1234');
    expect(session.signedIn, isTrue);
    expect(session.profileReady, isFalse);

    await session.saveProfile(session.me!.copyWith(name: 'Solo', age: 25, gender: Gender.male, country: MockData.country('PK'), interests: ['Music', 'Travel', 'Tech']));
    await session.finishOnboarding();
    expect(session.onboarded, isTrue);
    expect(session.inviteCode, isNotNull);

    // Wallet: welcome coins, check-in, a card purchase.
    rt.connect();
    await wallet.load();
    expect(wallet.coins, Economy.welcomeCoins);
    expect(await wallet.checkIn(), 5);
    expect(await wallet.checkIn(), isNull);
    final p = await wallet.startPurchase(pack: MockData.packs.first, method: PaymentMethod.card, cardToken: 'tok_4242');
    expect(p.status, PurchaseStatus.succeeded);
    expect(wallet.coins, 30 + 5 + 100);
    final otp = await wallet.startPurchase(pack: MockData.packs.first, method: PaymentMethod.jazzCash, phone: '03001234567');
    expect(otp.status, PurchaseStatus.needsOtp);
    final done = await wallet.confirmPurchase(otp, otp: '1234', method: PaymentMethod.jazzCash);
    expect(done.status, PurchaseStatus.succeeded);
    expect(wallet.coins, 235);
    await until(() => wallet.transactions.length >= 4);

    // Match: nobody else is online, so a dev bot takes the call.
    await social.load();
    await match.load();
    expect(await match.start(), isTrue);
    await until(() => match.isConnected, timeout: const Duration(seconds: 10));
    expect(match.partner, isNotNull);
    match.sendMessage('Lahore! you?');
    await until(() => match.chat.any((c) => !c.fromMe), timeout: const Duration(seconds: 12));

    expect(await match.sendGift(MockData.gifts.first), isTrue);
    await until(() => wallet.coins == 230);

    match.stop();
    await until(() => match.state == MatchState.ended);
    expect(match.lastPartner, isNotNull);
    expect(match.history, isNotEmpty);

    // Reconnect costs 20 coins and brings the same person back.
    final again = match.lastPartner!.id;
    expect(await match.reconnect(), isTrue);
    await until(() => match.isConnected);
    expect(match.partner!.id, again);
    await until(() => wallet.coins == 210);
    match.stop();
    await until(() => match.state == MatchState.ended);

    // E-mail updates switch.
    expect(session.emailUpdates, isTrue);
    expect(await session.setEmailUpdates(false), isTrue);
    await session.refreshMe();
    expect(session.emailUpdates, isFalse);
    expect(await session.setEmailUpdates(true), isTrue);

    // "Messages from Vibe": empty at first; with staff credentials, a
    // message sent from the admin API arrives live.
    final inbox = RemoteInboxProvider(api, rt);
    await inbox.load();
    expect(inbox.loaded, isTrue);
    expect(inbox.messages, isEmpty);
    final staffEmail = Platform.environment['VIBE_STAFF_EMAIL'];
    final staffPassword = Platform.environment['VIBE_STAFF_PASSWORD'];
    if (staffEmail != null && staffPassword != null) {
      final login = jsonDecode((await http.post(Uri.parse('$base/v1/admin/auth/login'), headers: {'content-type': 'application/json'}, body: jsonEncode({'email': staffEmail, 'password': staffPassword}))).body) as Map;
      final staffToken = (login['tokens'] as Map)['accessToken'] as String;
      final sent = await http.post(
        Uri.parse('$base/v1/admin/messages'),
        headers: {'content-type': 'application/json', 'authorization': 'Bearer $staffToken'},
        body: jsonEncode({'name': 'Flutter test', 'sendEmail': false, 'sendInApp': true, 'audience': 'USERS', 'userIds': [session.me!.id], 'subject': 'Hello from the team', 'heading': 'Hi {{name}},', 'body': 'Thanks for testing **Vibe**.'}),
      );
      expect(sent.statusCode, 201, reason: sent.body);
      await until(() => inbox.unread == 1);
      expect(inbox.latest!.title, 'Hello from the team');
      expect(inbox.latest!.body, contains('Hi Solo,'));
      await inbox.markAllRead();
      await inbox.load();
      expect(inbox.unread, 0);

      // Prices changed in the admin panel reach the app live.
      final catalog = RemoteCatalogProvider(api, rt);
      await catalog.load();
      final boost = Economy.boostCost;
      Future<void> setBoost(int coins) async {
        final r = await http.put(
          Uri.parse('$base/v1/admin/economy/rules'),
          headers: {'content-type': 'application/json', 'authorization': 'Bearer $staffToken'},
          body: jsonEncode({'value': {'boostCost': coins}}),
        );
        expect(r.statusCode, 200, reason: r.body);
      }

      await setBoost(boost + 7);
      await until(() => Economy.boostCost == boost + 7);
      await setBoost(boost);
      await until(() => Economy.boostCost == boost);
      catalog.dispose();
    }
    inbox.dispose();

    await session.signOut();
    rt.disconnect();
    expect(session.signedIn, isFalse);
  }, skip: base == null ? 'set VIBE_API_TEST to run against a server' : false, timeout: const Timeout(Duration(minutes: 2)));
}
