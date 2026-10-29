import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../core/mock/mock_data.dart';
import '../models/discover.dart';
import '../models/models.dart';
import 'social_provider.dart';
import 'wallet_provider.dart';

part 'discover_provider_local.dart';
part 'discover_provider_remote.dart';

/// Discover: a deck of real people, one at a time. Two likes make a match —
/// friends, chat open. The server counts likes and charges coins; this
/// keeps the deck, the counters and "liked you", and announces matches
/// ([matches]) so the "It's a match" dialog can open wherever you are.
///
/// [LocalDiscoverProvider] runs the offline demo on mock people;
/// [RemoteDiscoverProvider] talks to `/discover/*` and the socket.
abstract class DiscoverProvider extends ChangeNotifier {
  DiscoverProvider.base(this._social);

  factory DiscoverProvider(SocialProvider social, WalletProvider wallet) = LocalDiscoverProvider;

  final SocialProvider _social;

  List<DiscoverCard> _deck = [];
  bool _loading = false;
  bool _exhausted = false;
  DiscoverStatus? _status;
  DiscoverFilters _filters = const DiscoverFilters();
  DiscoverCard? _lastPassed;
  LikedYou? _likedYou;
  Friend? _matched;

  List<DiscoverCard> get deck => List.unmodifiable(_deck);
  DiscoverCard? get top => _deck.isEmpty ? null : _deck.first;
  bool get loading => _loading;
  bool get exhausted => _exhausted;
  DiscoverStatus? get status => _status;
  DiscoverFilters get filters => _filters;

  /// A pass that can still be undone.
  DiscoverCard? get lastPassed => _lastPassed;
  LikedYou? get likedYou => _likedYou;

  /// The match to celebrate (your swipe, or theirs over the socket).
  Friend? get matched => _matched;

  /// New likes waiting (the Discover tab badge).
  int get badge => _status?.likedYouUnseen ?? 0;
  bool get enabled => _status?.enabled ?? Economy.discoverEnabled;

  static const _filtersKey = 'vibe.discover.filters';

  /// Loads status and a fresh deck.
  Future<void> load() async {
    if (_loading) return;
    _loading = true;
    notifyListeners();
    await _readFilters();
    try {
      await Future.wait([loadStatus(), fetchDeck(replace: true)]);
    } catch (_) {
      // The screen shows what it has; status says when Discover is off.
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> loadStatus();

  @protected
  Future<List<DiscoverCard>> fetchCards();

  @protected
  Future<void> fetchDeck({required bool replace}) async {
    final fresh = await fetchCards();
    final have = replace ? <String>{} : _deck.map((c) => c.profile.id).toSet();
    _deck = replace ? fresh : [..._deck, ...fresh.where((c) => !have.contains(c.profile.id))];
    _exhausted = fresh.isEmpty || _deck.isEmpty;
    notifyListeners();
  }

  /// Tops the deck up when it runs low.
  Future<void> refill() async {
    if (_deck.length > 4 || _loading) return;
    try {
      await fetchDeck(replace: false);
    } catch (_) {}
  }

  Future<void> _readFilters() async {
    try {
      final p = await SharedPreferences.getInstance();
      final raw = p.getStringList(_filtersKey);
      if (raw == null || raw.length != 3) return;
      _filters = DiscoverFilters(
        gender: WantedGender.values.firstWhere((g) => g.name == raw[0], orElse: () => WantedGender.anyone),
        minAge: (int.tryParse(raw[1]) ?? 18).clamp(18, 99),
        maxAge: (int.tryParse(raw[2]) ?? 60).clamp(18, 99),
      );
    } catch (_) {}
  }

  Future<void> setFilters(DiscoverFilters f) async {
    _filters = DiscoverFilters(gender: f.gender, minAge: f.minAge, maxAge: f.maxAge < f.minAge ? f.minAge : f.maxAge);
    _deck = [];
    _lastPassed = null;
    _loading = true;
    notifyListeners();
    try {
      final p = await SharedPreferences.getInstance();
      await p.setStringList(_filtersKey, [_filters.gender.name, '${_filters.minAge}', '${_filters.maxAge}']);
    } catch (_) {}
    try {
      await fetchDeck(replace: true);
    } catch (_) {}
    _loading = false;
    notifyListeners();
  }

  /// Like, Super Like or pass. The card leaves the deck at once and comes
  /// back if the server says no.
  Future<SwipeOutcome> swipe(DiscoverCard c, SwipeKind kind) async {
    final before = _deck;
    _deck = _deck.where((x) => x.profile.id != c.profile.id).toList();
    notifyListeners();
    final r = await doSwipe(c, kind);
    if (!r.ok) {
      _deck = [c, ..._deck.where((x) => x.profile.id != c.profile.id)];
      if (r.failure == SwipeFailure.outOfLikes && _status != null) _status = _status!.copyWith(likesLeft: 0);
      notifyListeners();
      return r;
    }
    _lastPassed = kind == SwipeKind.pass ? c : null;
    if (r.matched != null) {
      _matched = r.matched;
      unawaited(_social.addMatched(r.matched!));
    }
    notifyListeners();
    unawaited(refill());
    if (before.length == 1 && _deck.isEmpty) unawaited(refill());
    return r;
  }

  @protected
  Future<SwipeOutcome> doSwipe(DiscoverCard c, SwipeKind kind);

  /// Brings back the last pass. "coins" when it can't be paid for.
  Future<String> undo() async {
    if (_lastPassed == null) return 'nothing';
    final r = await doUndo();
    if (r == null) return 'coins';
    _deck = [r, ..._deck.where((x) => x.profile.id != r.profile.id)];
    _lastPassed = null;
    notifyListeners();
    return 'ok';
  }

  /// The card that came back, or null when it couldn't be paid for.
  @protected
  Future<DiscoverCard?> doUndo();

  /// More likes for coins. False when it can't be paid for.
  Future<bool> buyLikes();

  Future<void> loadLikedYou();

  /// Clears the "new likes" badge.
  void markLikesSeen() {
    if (_status != null && _status!.likedYouUnseen > 0) {
      _status = _status!.copyWith(likedYouUnseen: 0);
      notifyListeners();
    }
    unawaited(sendLikesSeen());
  }

  @protected
  Future<void> sendLikesSeen();

  Future<void> setVisible(bool visible);

  void dismissMatch() {
    _matched = null;
    notifyListeners();
  }

  /// Someone matched with you (socket) — offline demo calls it too.
  @protected
  void onMatched(Friend f) {
    _matched ??= f;
    _deck = _deck.where((c) => c.profile.id != f.profile.id).toList();
    notifyListeners();
  }

  void clear() {
    _deck = [];
    _status = null;
    _lastPassed = null;
    _likedYou = null;
    _matched = null;
    _exhausted = false;
    notifyListeners();
  }
}
