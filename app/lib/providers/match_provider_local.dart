part of 'match_provider.dart';

/// The offline mock: the partner is a scripted profile whose actions
/// (messages, likes, gifts, leaving) replay on timers from [MockBackend].
class LocalMatchProvider extends MatchProvider {
  LocalMatchProvider(this._backend, WalletProvider wallet, SocialProvider social, SessionProvider session, {bool cameraEnabled = true})
    : super.base(wallet, social, session, cameraEnabled: cameraEnabled);

  final MockBackend _backend;
  final List<Timer> _timers = [];
  int _searchToken = 0;
  final List<DateTime> _recentSkips = [];

  @override
  Future<void> load() async {
    _history = await _backend.loadMatches();
    notifyListeners();
  }

  /// Starts searching. Charges the filter cost up front (a real service
  /// charges per match too); returns false — and stays idle — when the
  /// user cannot afford the filters they picked.
  @override
  Future<bool> start() async {
    if (_state == MatchState.searching) return true;
    _needsCoins = false;
    if (!await _chargeFilters()) return false;
    _endReason = null;
    _lastError = null;
    _state = MatchState.searching;
    notifyListeners();
    return _search();
  }

  Future<bool> _chargeFilters() async {
    final cost = filterCost;
    if (cost > 0 && !await _wallet.spend(cost, 'Filters · ${_filterLabel()}')) {
      _lastError = 'Not enough coins for these filters.';
      _needsCoins = true;
      _state = MatchState.idle;
      notifyListeners();
      return false;
    }
    return true;
  }

  Future<bool> _search() async {
    unawaited(ensureCamera());
    final token = ++_searchToken;
    try {
      final exclude = {..._social.blocked, if (_lastPartner != null) _lastPartner!.id};
      final p = await _backend.findMatch(_filters, exclude: exclude, boosted: _wallet.isBoosted);
      if (token != _searchToken || _state != MatchState.searching) return true; // cancelled meanwhile
      _connect(p);
    } catch (e) {
      if (token != _searchToken) return true;
      _lastError = 'Could not find anyone: $e';
      _state = MatchState.idle;
      notifyListeners();
    }
    return true;
  }

  void _connect(Profile p) {
    _partner = p;
    _chat.clear();
    _likedPartner = false;
    _partnerLikedMe = false;
    _partnerAskedToBeFriends = false;
    _elapsed = Duration.zero;
    _current = MatchRecord(id: 'mt${DateTime.now().millisecondsSinceEpoch}', partner: p, startedAt: DateTime.now(), coinsSpent: filterCost);
    _blurUntil = _autoBlur && !_wallet.isVip ? DateTime.now().add(const Duration(seconds: 3)) : null;
    _state = MatchState.connected;
    _session.bumpStats(matches: 1);
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      _elapsed += const Duration(seconds: 1);
      notifyListeners();
    });
    for (final ev in _backend.scriptFor(p)) {
      _timers.add(Timer(ev.at, () => _apply(ev)));
    }
    notifyListeners();
  }

  /// A partner-side event. This is the seam a socket would feed.
  void _apply(PartnerEvent ev) {
    if (_state != MatchState.connected || _partner == null) return;
    switch (ev.action) {
      case PartnerAction.message:
        _chat.add(ChatMessage(id: 'pm${DateTime.now().microsecondsSinceEpoch}', fromMe: false, text: ev.text ?? '', at: DateTime.now()));
        break;
      case PartnerAction.like:
        _partnerLikedMe = true;
        _current = _current?.copyWith(likedMe: true);
        _session.bumpStats(likes: 1);
        break;
      case PartnerAction.gift:
        final g = ev.gift;
        if (g != null) {
          _chat.add(ChatMessage(id: 'pg${DateTime.now().microsecondsSinceEpoch}', fromMe: false, text: 'Sent you a ${g.name}', at: DateTime.now(), gift: g));
          _current = _current?.copyWith(giftsReceived: (_current?.giftsReceived ?? 0) + 1);
          unawaited(_wallet.receiveGems(g.gems, '${g.name} from ${_partner!.name}'));
        }
        break;
      case PartnerAction.friendRequest:
        _partnerAskedToBeFriends = true;
        _social.receiveRequest(_partner!);
        break;
      case PartnerAction.leave:
        _end(EndReason.partnerLeft);
        return;
    }
    notifyListeners();
  }

  /// Swipe to the next person. Enforces the skip cooldown (5 quick skips
  /// a minute, then a 10 s wait) unless bypassed with coins.
  @override
  Future<bool> next({bool payToBypass = false}) async {
    if (_state == MatchState.connected) {
      if (inCooldown) {
        if (!payToBypass) return false;
        if (!await _wallet.spend(Economy.skipCooldownBypassCost, 'Skip cooldown bypass')) {
          _needsCoins = true;
          return false;
        }
        _cooldownUntil = null;
      }
      _noteSkip();
      _end(EndReason.skipped, keepGoing: true);
      if (!await _chargeFilters()) return false;
      return _search();
    }
    return start();
  }

  @override
  void stop() {
    if (_state == MatchState.connected) {
      _end(EndReason.stopped);
    } else if (_state == MatchState.searching) {
      _searchToken++;
      _state = MatchState.idle;
      notifyListeners();
    }
  }

  void _noteSkip() {
    final now = DateTime.now();
    _recentSkips.add(now);
    _recentSkips.removeWhere((t) => now.difference(t) > const Duration(minutes: 1));
    if (_recentSkips.length >= Economy.skipsBeforeCooldown && (_elapsed.inSeconds < 10)) {
      _cooldownUntil = now.add(Economy.skipCooldown);
      _recentSkips.clear();
    }
  }

  void _end(EndReason reason, {bool keepGoing = false}) {
    for (final t in _timers) {
      t.cancel();
    }
    _timers.clear();
    _ticker?.cancel();
    _ticker = null;
    if (_current != null) {
      final rec = _current!.copyWith(endedAt: DateTime.now());
      _history.add(rec);
      unawaited(_backend.saveMatches(_history));
      _current = null;
    }
    _lastPartner = _partner;
    _endReason = reason;
    _state = keepGoing ? MatchState.searching : MatchState.ended;
    if (!keepGoing) unawaited(releaseCamera());
    notifyListeners();
  }

  // ── in-match actions ──────────────────────────────────────────────────

  @override
  void like() {
    if (_state != MatchState.connected || _likedPartner) return;
    _likedPartner = true;
    _current = _current?.copyWith(liked: true);
    notifyListeners();
  }

  @override
  void sendMessage(String text) {
    final t = text.trim();
    if (_state != MatchState.connected || t.isEmpty) return;
    _chat.add(ChatMessage(id: 'mm${DateTime.now().microsecondsSinceEpoch}', fromMe: true, text: t, at: DateTime.now()));
    notifyListeners();
  }

  /// Sends a gift: coins out, gems to the partner (the mock partner is not
  /// a real account, so the gems simply disappear — as they would into
  /// another user's wallet). False when unaffordable.
  @override
  Future<bool> sendGift(Gift g) async {
    if (_state != MatchState.connected || _partner == null) return false;
    if (!await _wallet.spend(g.coins, '${g.name} to ${_partner!.name}', kind: TxKind.gift)) return false;
    _chat.add(ChatMessage(id: 'mg${DateTime.now().microsecondsSinceEpoch}', fromMe: true, text: 'Sent a ${g.name}', at: DateTime.now(), gift: g));
    _current = _current?.copyWith(giftsSent: (_current?.giftsSent ?? 0) + 1, coinsSpent: (_current?.coinsSpent ?? 0) + g.coins);
    // A gift usually earns a thank-you.
    _timers.add(Timer(const Duration(seconds: 2), () => _apply(PartnerEvent(Duration.zero, PartnerAction.message, text: 'omg thank you for the ${g.name.toLowerCase()} ${g.emoji}'))));
    notifyListeners();
    return true;
  }

  /// Friend request during the match. False when it could not be paid for.
  @override
  Future<bool> addFriend() async {
    final p = _partner;
    if (_state != MatchState.connected || p == null) return false;
    return _social.sendRequest(p);
  }

  @override
  Future<void> report(ReportReason reason, {String? note, bool block = false}) async {
    final p = _partner;
    if (p == null) return;
    await _backend.report(userId: p.id, reason: reason, note: note);
    if (block) await _social.block(p);
    _end(EndReason.reported);
  }

  /// Report the person from the call that just ended (the recap card's
  /// "Something wrong?" link). The call is already over, so nothing ends.
  @override
  Future<void> reportLast(ReportReason reason, {String? note, bool block = false}) async {
    final p = _lastPartner;
    if (p == null) return;
    await _backend.report(userId: p.id, reason: reason, note: note);
    if (block) await _social.block(p);
    _endReason = EndReason.reported;
    notifyListeners();
  }

  @override
  Future<void> blockPartner() async {
    final p = _partner;
    if (p == null) return;
    await _social.block(p);
    _end(EndReason.reported);
  }

  /// Call the last person again (paid). False when unaffordable or nobody.
  @override
  Future<bool> reconnect() async {
    final p = _lastPartner;
    if (p == null || _state == MatchState.connected) return false;
    if (!await _wallet.spend(Economy.reconnectCost, 'Reconnect with ${p.name}')) {
      _needsCoins = true;
      return false;
    }
    _state = MatchState.searching;
    _lastPartner = null;
    notifyListeners();
    unawaited(ensureCamera());
    await Future<void>.delayed(const Duration(milliseconds: 1500));
    if (_state != MatchState.searching) return true;
    _connect(p);
    return true;
  }

  String _filterLabel() {
    final parts = <String>[];
    if (_filters.gender == GenderFilter.women) parts.add('women');
    if (_filters.gender == GenderFilter.men) parts.add('men');
    if (_filters.countryCode != null) parts.add(_filters.countryCode!);
    return parts.join(' · ');
  }

  @override
  void dispose() {
    for (final t in _timers) {
      t.cancel();
    }
    super.dispose();
  }
}
