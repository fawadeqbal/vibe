import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../core/mock/mock_data.dart';
import '../models/discover.dart';
import '../models/filters.dart';
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
/// Back after a few days: likes waiting and new people since then.
class WelcomeBack {
  const WelcomeBack({required this.awayDays, required this.likesSince, required this.newPeople});
  final int awayDays;
  final int likesSince;
  final int newPeople;
}

abstract class DiscoverProvider extends ChangeNotifier {
  DiscoverProvider.base(this._social);

  factory DiscoverProvider(SocialProvider social, WalletProvider wallet) = LocalDiscoverProvider;

  final SocialProvider _social;

  List<DiscoverCard> _deck = [];
  bool _loading = false;
  bool _exhausted = false;
  bool _failed = false;
  bool _offline = false;
  DiscoverStatus? _status;
  DiscoverFilters _filters = const DiscoverFilters();
  DiscoverCard? _lastPassed;
  LikedYou? _likedYou;
  Friend? _matched;

  /// Everyone swiped this visit, answered by the server or not. A refill can
  /// race a swipe the server hasn't saved yet and bring that person back;
  /// filtering them out stops the "card comes back" flicker.
  final Set<String> _swipedIds = {};

  /// Swipes still on their way (undo waits for them).
  final Set<Future<SwipeOutcome>> _pendingSwipes = {};

  /// Only the newest swipe's answer may update the counters.
  int _swipeSeq = 0;

  /// A card that just came back on top (the server said no, or undo): the screen eases it in.
  String? get returnedId => _returnedId;
  String? _returnedId;
  void clearReturned() => _returnedId = null;

  /// Topping up a low deck: with nobody on screen, show the skeleton, not "nobody left".
  bool get refilling => _refilling;
  bool _refilling = false;

  List<DiscoverCard> get deck => List.unmodifiable(_deck);
  DiscoverCard? get top => _deck.isEmpty ? null : _deck.first;
  bool get loading => _loading;
  bool get exhausted => _exhausted;

  /// The last load failed: the screen offers Try again ([offline] when it
  /// was the connection).
  bool get failed => _failed;
  bool get offline => _offline;
  DiscoverStatus? get status => _status;
  DiscoverFilters get filters => _filters;

  /// The filter pass ran out while extra filters were on: they were turned
  /// off (the screen says so once).
  bool get filtersExpired => _filtersExpired;
  bool _filtersExpired = false;
  void clearFiltersExpired() => _filtersExpired = false;

  /// Opens the extra filters for a while: 'ok', or 'coins' when short.
  Future<String> buyFilterPass();

  /// The pass ran out (or VIP ended): keep age and verified only, tell the screen once.
  /// The saved filters stay as they are (they come back with a pass or VIP).
  @protected
  Future<void> filtersLocked() async {
    _filters = _filters.freeOnly();
    _filtersExpired = true;
    onFiltersLocked?.call();
    await loadStatus();
  }

  /// Told when the server says gender/country are locked (the app marks the shared filters).
  VoidCallback? onFiltersLocked;

  /// The shared filters (models/filters.dart) changed, here or on Home: use them.
  Future<void> applyShared(SharedFilters s, {required bool extraOpen}) async {
    final f = s.usesExtra && !extraOpen ? s.freeOnly() : s;
    final next = DiscoverFilters(gender: f.gender, minAge: f.minAge, maxAge: f.maxAge, countryCode: f.countryCode ?? '', verifiedOnly: f.verifiedOnly);
    if (_sameFilters(next, _filters)) return;
    if (_deck.isEmpty && !_exhausted && !_loading) {
      _filters = next;
      notifyListeners();
      return;
    }
    await setFilters(next);
  }

  static bool _sameFilters(DiscoverFilters a, DiscoverFilters b) =>
      a.gender == b.gender && a.minAge == b.minAge && a.maxAge == b.maxAge && a.countryCode == b.countryCode && a.onlineOnly == b.onlineOnly && a.verifiedOnly == b.verifiedOnly;

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
      _failed = false;
      _offline = false;
    } catch (e) {
      // The screen shows what it has, or "can't reach Vibe" with Try again.
      _failed = true;
      _offline = e is ApiException && e.isNetwork;
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
    final fresh = (await fetchCards()).where((c) => !_swipedIds.contains(c.profile.id)).toList();
    final have = replace ? <String>{} : _deck.map((c) => c.profile.id).toSet();
    _deck = replace ? fresh : [..._deck, ...fresh.where((c) => !have.contains(c.profile.id))];
    _exhausted = fresh.isEmpty || _deck.isEmpty;
    notifyListeners();
  }

  /// Tops the deck up when it runs low.
  Future<void> refill() async {
    if (_deck.length > 4 || _loading || _refilling) return;
    _refilling = true;
    try {
      await fetchDeck(replace: false);
    } catch (_) {
    } finally {
      _refilling = false;
      notifyListeners();
    }
  }

  Future<void> _saveFilters() async {
    final f = _filters;
    try {
      final p = await SharedPreferences.getInstance();
      await p.setStringList(_filtersKey, [f.gender.name, '${f.minAge}', '${f.maxAge}', f.countryCode, f.onlineOnly ? '1' : '0', f.verifiedOnly ? '1' : '0']);
    } catch (_) {}
  }

  Future<void> _readFilters() async {
    try {
      final p = await SharedPreferences.getInstance();
      final raw = p.getStringList(_filtersKey);
      if (raw == null || raw.length < 3) return;
      final cc = raw.length > 3 ? raw[3] : '';
      _filters = DiscoverFilters(
        gender: WantedGender.values.firstWhere((g) => g.name == raw[0], orElse: () => WantedGender.anyone),
        minAge: (int.tryParse(raw[1]) ?? 18).clamp(18, 99),
        maxAge: (int.tryParse(raw[2]) ?? 60).clamp(18, 99),
        countryCode: RegExp(r'^[A-Z]{2}$').hasMatch(cc) ? cc : '',
        onlineOnly: raw.length > 4 && raw[4] == '1',
        verifiedOnly: raw.length > 5 && raw[5] == '1',
      );
    } catch (_) {}
  }

  Future<void> setFilters(DiscoverFilters f) async {
    _filters = f.copyWith(maxAge: f.maxAge < f.minAge ? f.minAge : f.maxAge);
    _filtersExpired = false;
    _deck = [];
    _lastPassed = null;
    _loading = true;
    notifyListeners();
    await _saveFilters();
    try {
      await fetchDeck(replace: true);
      _failed = false;
      _offline = false;
    } catch (e) {
      _failed = true;
      _offline = e is ApiException && e.isNetwork;
    }
    _loading = false;
    notifyListeners();
  }

  /// Like, Super Like or pass. The card leaves the deck and the counters
  /// move at once (synchronously, before the first await — the screen relies
  /// on that); the server's answer only corrects. If the server says no, the
  /// card comes back on top and the counters go back.
  Future<SwipeOutcome> swipe(DiscoverCard c, SwipeKind kind) async {
    final id = c.profile.id;
    final seq = ++_swipeSeq;
    final before = _status;
    _swipedIds.add(id);
    _deck = _deck.where((x) => x.profile.id != id).toList();
    _status = afterSwipe(_status, kind);
    _lastPassed = kind == SwipeKind.pass ? c : null;
    notifyListeners();
    unawaited(refill());

    final pending = doSwipe(c, kind);
    _pendingSwipes.add(pending);
    final SwipeOutcome r;
    try {
      r = await pending;
    } finally {
      _pendingSwipes.remove(pending);
    }

    if (!r.ok) {
      _swipedIds.remove(id);
      _deck = [c, ..._deck.where((x) => x.profile.id != id)];
      _returnedId = id;
      if (_lastPassed?.profile.id == id) _lastPassed = null;
      if (seq == _swipeSeq) _status = before;
      if (r.failure == SwipeFailure.outOfLikes && _status != null) _status = _status!.copyWith(likesLeft: 0);
      notifyListeners();
      return r;
    }
    if (r.status != null && seq == _swipeSeq) _status = r.status;
    if (r.matched != null) {
      _matched ??= r.matched;
      unawaited(_social.addMatched(r.matched!));
    }
    notifyListeners();
    return r;
  }

  @protected
  Future<SwipeOutcome> doSwipe(DiscoverCard c, SwipeKind kind);

  /// Brings back the last pass. "coins" when it can't be paid for.
  Future<String> undo() async {
    // The pass must reach the server before it can be undone.
    if (_pendingSwipes.isNotEmpty) await Future.wait(_pendingSwipes.toList());
    if (_lastPassed == null) return 'nothing';
    final r = await doUndo();
    if (r == null) return 'coins';
    _swipedIds.remove(r.profile.id);
    _deck = [r, ..._deck.where((x) => x.profile.id != r.profile.id)];
    _returnedId = r.profile.id;
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

  /// What happened since the last Discover visit (also records this one). Null = nothing to show.
  Future<WelcomeBack?> welcomeBack() async => null;

  /// "Tell me when new people join": on/off, null until loaded.
  bool? _notifyNew;
  bool? get notifyNew => _notifyNew;
  Future<void> loadNotifyNew() async {}
  Future<void> setNotifyNew(bool on) async {
    _notifyNew = on;
    notifyListeners();
  }

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
    _swipedIds.clear();
    _pendingSwipes.clear();
    _returnedId = null;
    _refilling = false;
    _deck = [];
    _status = null;
    _lastPassed = null;
    _likedYou = null;
    _matched = null;
    _exhausted = false;
    notifyListeners();
  }
}
