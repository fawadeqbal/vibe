import 'dart:convert';
import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

import '../../models/models.dart';
import 'mock_data.dart';
import 'serializers.dart';

/// What the partner's side "does" during a mocked match, at an offset from
/// the moment the match connected. A real backend replaces this with socket
/// events; the match provider does not care which.
enum PartnerAction { message, like, gift, friendRequest, leave }

class PartnerEvent {
  const PartnerEvent(this.at, this.action, {this.text, this.gift});
  final Duration at;
  final PartnerAction action;
  final String? text;
  final Gift? gift;
}

/// The stand-in for the Vibe server. Everything is local and persisted
/// with SharedPreferences, so the demo survives a restart. The seam to a
/// real API is this class: keep the method names, swap the bodies.
class MockBackend {
  MockBackend({Random? random, bool fast = false})
      : _rnd = random ?? Random(),
        _fast = fast;

  final Random _rnd;

  /// Tests: no simulated network delays.
  final bool _fast;

  Future<void> _wait(int ms) => _fast ? Future<void>.value() : Future<void>.delayed(Duration(milliseconds: ms));
  SharedPreferences? _prefs;
  final List<Profile> _people = MockData.people();

  static const _kProfile = 'vibe.profile';
  static const _kWallet = 'vibe.wallet';
  static const _kTx = 'vibe.transactions';
  static const _kFriends = 'vibe.friends';
  static const _kChats = 'vibe.chats';
  static const _kMatches = 'vibe.matches';
  static const _kBlocked = 'vibe.blocked';
  static const _kOnboarded = 'vibe.onboarded';

  Future<void> init() async {
    _prefs ??= await SharedPreferences.getInstance();
  }

  List<Profile> get people => List.unmodifiable(_people);

  // ── session ───────────────────────────────────────────────────────────

  Future<Profile?> restoreProfile() async {
    await init();
    final raw = _prefs!.getString(_kProfile);
    if (raw == null) return null;
    return Json.toProfile(Map<String, dynamic>.from(jsonDecode(raw) as Map));
  }

  Future<void> saveProfile(Profile p) async {
    await init();
    await _prefs!.setString(_kProfile, jsonEncode(Json.profile(p)));
  }

  bool get onboarded => _prefs?.getBool(_kOnboarded) ?? false;
  Future<void> setOnboarded(bool v) async {
    await init();
    await _prefs!.setBool(_kOnboarded, v);
  }

  /// "Sign in" with an e-mail code or a social account: the mock just mints
  /// a fresh, incomplete profile. Delay so the button shows its busy state.
  Future<Profile> signIn({required String method, String? email}) async {
    await _wait(900);
    final id = 'me-${DateTime.now().millisecondsSinceEpoch}';
    final p = Profile(id: id, name: '', age: 18, gender: Gender.other, country: MockData.country('PK'), avatarUrl: 'https://i.pravatar.cc/400?img=${1 + _rnd.nextInt(70)}');
    await saveProfile(p);
    return p;
  }

  Future<void> signOut() async {
    await init();
    for (final k in [_kProfile, _kWallet, _kTx, _kFriends, _kChats, _kMatches, _kBlocked, _kOnboarded]) {
      await _prefs!.remove(k);
    }
  }

  // ── wallet + ledger ───────────────────────────────────────────────────

  Future<Wallet> loadWallet() async {
    await init();
    final raw = _prefs!.getString(_kWallet);
    if (raw == null) return Wallet(coins: Economy.welcomeCoins, gems: 0);
    return Json.toWallet(Map<String, dynamic>.from(jsonDecode(raw) as Map));
  }

  Future<void> saveWallet(Wallet w) async {
    await init();
    await _prefs!.setString(_kWallet, jsonEncode(Json.wallet(w)));
  }

  Future<List<Transaction>> loadTransactions() async {
    await init();
    final raw = _prefs!.getString(_kTx);
    if (raw == null) return [];
    return (jsonDecode(raw) as List).map((e) => Json.toTransaction(Map<String, dynamic>.from(e as Map))).toList();
  }

  Future<void> saveTransactions(List<Transaction> tx) async {
    await init();
    await _prefs!.setString(_kTx, jsonEncode(tx.map(Json.transaction).toList()));
  }

  /// A mocked payment: waits, then either succeeds or (1 in 12) fails the
  /// way a real gateway does, so the error path is visible too.
  Future<String> charge({required PaymentMethod method, required double usd, String? phone}) async {
    await _wait(1200 + _rnd.nextInt(1200));
    if (!_fast && _rnd.nextInt(12) == 0) {
      throw PaymentException(switch (method) {
        PaymentMethod.jazzCash || PaymentMethod.easypaisa => 'The wallet declined the payment. Check your balance and try again.',
        PaymentMethod.card => 'Your bank declined the card. Try another card.',
        PaymentMethod.bank => 'Transfer reference not recognised yet.',
        _ => 'The store could not complete the purchase. Nothing was charged.',
      });
    }
    return 'VB-${DateTime.now().millisecondsSinceEpoch.toRadixString(36).toUpperCase()}';
  }

  /// A rewarded ad: the "video" runs for a few seconds in the UI; here we
  /// only pretend to talk to the ad network.
  Future<bool> loadRewardedAd() async {
    await _wait(700);
    return _fast || _rnd.nextInt(10) != 0; // no fill 10% of the time
  }

  // ── matching ──────────────────────────────────────────────────────────

  /// Finds a partner matching the filters. Delay grows when filters narrow
  /// the pool, which is what happens on a real service too.
  Future<Profile> findMatch(MatchFilters f, {Set<String> exclude = const {}, bool boosted = false}) async {
    final pool = _people.where((p) {
      if (exclude.contains(p.id)) return false;
      if (f.gender == GenderFilter.women && p.gender != Gender.female) return false;
      if (f.gender == GenderFilter.men && p.gender != Gender.male) return false;
      if (f.countryCode != null && p.country.code != f.countryCode) return false;
      if (f.safeMode && !p.verified) return false;
      return true;
    }).toList();
    final candidates = pool.isEmpty ? _people.where((p) => !exclude.contains(p.id)).toList() : pool;
    final base = boosted ? 600 : 1400;
    final narrow = f.gender != GenderFilter.anyone || f.countryCode != null ? 900 : 0;
    await _wait(base + narrow + _rnd.nextInt(1500));
    return candidates[_rnd.nextInt(candidates.length)];
  }

  /// Pre-writes what the partner will do during this match.
  List<PartnerEvent> scriptFor(Profile partner) {
    final events = <PartnerEvent>[];
    var t = 2 + _rnd.nextInt(4);
    events.add(PartnerEvent(Duration(seconds: t), PartnerAction.message, text: MockData.openers[_rnd.nextInt(MockData.openers.length)]));
    final lines = 1 + _rnd.nextInt(4);
    for (var i = 0; i < lines; i++) {
      t += 5 + _rnd.nextInt(9);
      events.add(PartnerEvent(Duration(seconds: t), PartnerAction.message, text: MockData.replies[_rnd.nextInt(MockData.replies.length)]));
    }
    if (_rnd.nextInt(10) < 4) events.add(PartnerEvent(Duration(seconds: 8 + _rnd.nextInt(20)), PartnerAction.like));
    if (_rnd.nextInt(10) < 2) events.add(PartnerEvent(Duration(seconds: 15 + _rnd.nextInt(25)), PartnerAction.gift, gift: MockData.gifts[_rnd.nextInt(3)]));
    if (_rnd.nextInt(10) < 3) events.add(PartnerEvent(Duration(seconds: 20 + _rnd.nextInt(30)), PartnerAction.friendRequest));
    if (_rnd.nextInt(10) < 6) events.add(PartnerEvent(Duration(seconds: 35 + _rnd.nextInt(80)), PartnerAction.leave));
    events.sort((a, b) => a.at.compareTo(b.at));
    return events;
  }

  /// A quick reply in a chat with a friend.
  String friendReply() => MockData.replies[_rnd.nextInt(MockData.replies.length)];

  /// People who "liked you" for the VIP teaser: a few random profiles.
  List<Profile> likedYou({int count = 6, Set<String> exclude = const {}}) {
    final pool = _people.where((p) => !exclude.contains(p.id)).toList()..shuffle(_rnd);
    return pool.take(count).toList();
  }

  // ── social ────────────────────────────────────────────────────────────

  Future<List<Friend>> loadFriends() async {
    await init();
    final raw = _prefs!.getString(_kFriends);
    if (raw == null) return [];
    return (jsonDecode(raw) as List).map((e) => Json.toFriend(Map<String, dynamic>.from(e as Map))).toList();
  }

  Future<void> saveFriends(List<Friend> friends) async {
    await init();
    await _prefs!.setString(_kFriends, jsonEncode(friends.map(Json.friend).toList()));
  }

  Future<Map<String, List<ChatMessage>>> loadChats() async {
    await init();
    final raw = _prefs!.getString(_kChats);
    if (raw == null) return {};
    final m = Map<String, dynamic>.from(jsonDecode(raw) as Map);
    return m.map((k, v) => MapEntry(k, (v as List).map((e) => Json.toMessage(Map<String, dynamic>.from(e as Map))).toList()));
  }

  Future<void> saveChats(Map<String, List<ChatMessage>> chats) async {
    await init();
    await _prefs!.setString(_kChats, jsonEncode(chats.map((k, v) => MapEntry(k, v.map(Json.message).toList()))));
  }

  Future<Set<String>> loadBlocked() async {
    await init();
    return (_prefs!.getStringList(_kBlocked) ?? const []).toSet();
  }

  Future<void> saveBlocked(Set<String> ids) async {
    await init();
    await _prefs!.setStringList(_kBlocked, ids.toList());
  }

  Future<List<MatchRecord>> loadMatches() async {
    await init();
    final raw = _prefs!.getString(_kMatches);
    if (raw == null) return [];
    return (jsonDecode(raw) as List).map((e) => Json.toMatchRecord(Map<String, dynamic>.from(e as Map))).toList();
  }

  Future<void> saveMatches(List<MatchRecord> records) async {
    await init();
    // Keep the ledger bounded.
    final keep = records.length > 200 ? records.sublist(records.length - 200) : records;
    await _prefs!.setString(_kMatches, jsonEncode(keep.map(Json.matchRecord).toList()));
  }

  Future<void> report({required String userId, required ReportReason reason, String? note}) async {
    await _wait(400);
  }

  Future<void> requestCashout({required int gems, required PaymentMethod method, required String account}) async {
    await _wait(900);
  }

  Future<bool> verifySelfie() async {
    await _wait(2000);
    return true;
  }
}

class PaymentException implements Exception {
  PaymentException(this.message);
  final String message;
  @override
  String toString() => message;
}
