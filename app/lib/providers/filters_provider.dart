import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../models/filters.dart';
import '../models/models.dart';
import 'discover_provider.dart';
import 'match_provider.dart';
import 'wallet_provider.dart';

/// The filters you meet people with, shared by random matches and Discover
/// (backend `/filters`), and the one filter pass that opens gender and
/// country in both. This base is the offline demo: saved on the device, the
/// pass paid from the mock wallet.
class FiltersProvider extends ChangeNotifier {
  FiltersProvider(this._wallet);

  final WalletProvider? _wallet;
  SharedFilters _filters = SharedFilters.defaults;
  DateTime? _passUntil;
  bool _loaded = false;

  SharedFilters get filters => _filters;
  bool get loaded => _loaded;

  /// Gender and country open right now (VIP, Vibe Hour or a pass).
  FilterAccess get access {
    final now = DateTime.now();
    final pass = _passUntil != null && _passUntil!.isAfter(now) ? _passUntil : null;
    final base = (cost: Economy.discoverFilterPassCost, hours: Economy.discoverFilterPassHours);
    if (Economy.discoverPremiumFilters == 0) return FilterAccess(reason: 'free', passUntil: pass, passCost: base.cost, passHours: base.hours);
    if (_wallet?.isVip == true) return FilterAccess(reason: 'vip', passUntil: pass, passCost: base.cost, passHours: base.hours);
    if (pass != null) return FilterAccess(reason: 'pass', passUntil: pass, passCost: base.cost, passHours: base.hours);
    if (Economy.filtersFree) return FilterAccess(reason: 'vibe_hour', passCost: base.cost, passHours: base.hours);
    return FilterAccess(unlocked: false, reason: null, passCost: base.cost, passHours: base.hours);
  }

  /// Starting won't be refused: no gender/country, or they're open.
  bool get ready => !_filters.usesExtra || access.unlocked;

  static const _key = 'vibe.filters';

  Future<void> load() async {
    try {
      final raw = (await SharedPreferences.getInstance()).getString(_key);
      if (raw != null) _filters = SharedFilters.fromJson(Map<String, dynamic>.from(jsonDecode(raw) as Map));
    } catch (_) {}
    _loaded = true;
    notifyListeners();
  }

  /// Saves at once (both screens update); false when it couldn't be saved.
  Future<bool> save(SharedFilters f) async {
    final next = f.maxAge < f.minAge ? f.copyWith(maxAge: f.minAge) : f;
    final prev = _filters;
    _filters = next;
    notifyListeners();
    try {
      await persist(next);
      return true;
    } catch (_) {
      _filters = prev;
      notifyListeners();
      return false;
    }
  }

  @protected
  Future<void> persist(SharedFilters f) async => (await SharedPreferences.getInstance()).setString(_key, jsonEncode(f.toJson()));

  /// The filter pass: 'ok', 'coins' when you can't afford it, or 'error'.
  Future<String> buyPass() async {
    final a = access;
    if (a.unlocked && a.reason != 'vibe_hour') return 'ok';
    final w = _wallet;
    if (w == null || !await w.spend(a.passCost, 'Filter pass · ${a.passHours} hours')) return 'coins';
    _passUntil = DateTime.now().add(Duration(hours: a.passHours));
    notifyListeners();
    return 'ok';
  }

  void clear() {
    _filters = SharedFilters.defaults;
    _passUntil = null;
    _loaded = false;
    notifyListeners();
  }
}

/// The server keeps your filters and the pass (GET/PUT /filters, POST /filters/pass).
class RemoteFiltersProvider extends FiltersProvider {
  RemoteFiltersProvider(this._api) : super(null);
  final ApiClient _api;
  FilterAccess _access = const FilterAccess(unlocked: false, reason: null);

  @override
  FilterAccess get access => _access;

  void _apply(Object? r) {
    final m = r is Map ? Map<String, dynamic>.from(r) : const <String, dynamic>{};
    _filters = SharedFilters.fromJson(m['filters'] is Map ? Map<String, dynamic>.from(m['filters'] as Map) : const {});
    _access = filterAccessFromJson(m['access'] is Map ? Map<String, dynamic>.from(m['access'] as Map) : const {});
    _loaded = true;
    notifyListeners();
  }

  @override
  Future<void> load() async {
    if (!_api.hasSession) return;
    try {
      _apply(await _api.get('/filters'));
    } on ApiException catch (_) {}
  }

  @override
  Future<void> persist(SharedFilters f) async => _apply(await _api.put('/filters', f.toJson()));

  @override
  Future<String> buyPass() async {
    try {
      _apply(await _api.post('/filters/pass'));
      return 'ok';
    } on ApiException catch (e) {
      return e.isInsufficientCoins ? 'coins' : 'error';
    }
  }

  /// The server said they're locked (a pass ran out): show it until the next load.
  void markLocked() {
    _access = FilterAccess(unlocked: false, reason: null, passCost: _access.passCost, passHours: _access.passHours);
    notifyListeners();
  }
}

/// One set of filters: every change goes to random matches and Discover, and
/// both ask it whether gender/country are open.
void wireSharedFilters(FiltersProvider filters, MatchProvider match, DiscoverProvider discover) {
  void push() {
    final f = filters.filters;
    match.setFilters(MatchFilters(
      gender: switch (f.gender) {
        WantedGender.women => GenderFilter.women,
        WantedGender.men => GenderFilter.men,
        _ => GenderFilter.anyone,
      },
      countryCode: f.countryCode,
      safeMode: f.verifiedOnly,
      minAge: f.minAge,
      maxAge: f.maxAge,
    ));
    unawaited(discover.applyShared(f, extraOpen: filters.access.unlocked));
  }

  match.extraFiltersOpen = () => filters.access.unlocked;
  discover.onFiltersLocked = () {
    if (filters is RemoteFiltersProvider) filters.markLocked();
  };
  filters.addListener(push);
  push();
}
