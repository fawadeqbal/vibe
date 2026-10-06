part of 'referrals_provider.dart';

/// Server mode: `GET /referrals` when the Invite screen opens (and after
/// every live change), `GET /referrals/preview/:code` for the welcome
/// screen, `POST /referrals/claim`. Friends' progress and milestones
/// arrive over the socket.
class RemoteReferralsProvider extends ReferralsProvider {
  RemoteReferralsProvider(this._api, this._rt) : super.base() {
    _subs = [
      _rt.on(Ev.referralUpdated).listen((e) {
        final raw = e['referral'];
        final event = ReferralEvent.parse(e['event']);
        if (raw is! Map || event == null) return;
        try {
          applyUpdate(ReferralUpdate(person: ApiMap.referralPerson(Map<String, dynamic>.from(raw)), event: event, coins: ApiMap.i(e['coins'])));
        } catch (_) {
          // A shape we don't know: the reload below still brings the change.
        }
        _reloadQuietly();
      }),
      _rt.on(Ev.referralMilestone).listen((e) {
        try {
          announceMilestone(MilestoneReached.fromJson(e));
        } catch (_) {}
        _reloadQuietly();
      }),
      _rt.on(Ev.affiliateUpdated).listen((e) {
        final text = switch (e['event']) {
          'approved' => "You're a Vibe creator partner 🎉",
          'reactivated' => 'Your creator partner account is active again',
          'suspended' => 'Your creator partner account is paused',
          'rejected' => 'Your creator partner application was not approved',
          'payout_paid' => 'Partner payout sent 💸',
          'payout_rejected' => 'Partner payout returned',
          _ => null,
        };
        if (text != null) announcePartner(text);
        // The partner link shows on the Invite screen once ACTIVE.
        _reloadQuietly();
      }),
    ];
  }

  final ApiClient _api;
  final RealtimeClient _rt;
  late final List<StreamSubscription<Map<String, dynamic>>> _subs;

  @override
  bool get isRemote => true;

  void _reloadQuietly() {
    if (_view != null && _api.hasSession) unawaited(load());
  }

  @override
  Future<void> load() => guardLoad(() async {
        if (!_api.hasSession) return;
        setView(ApiMap.referrals(Map<String, dynamic>.from(await _api.get('/referrals') as Map)));
      });

  @override
  Future<InvitePreview> preview(String code, {String? source}) async {
    final c = InviteLinks.normalizeCode(code);
    if (c == null) return InvitePreview.invalid;
    final s = InviteLinks.normalizeSource(source);
    final r = await _api.get('/referrals/preview/${Uri.encodeComponent(c)}', query: s == null ? null : {'s': s});
    return InvitePreview.fromJson(Map<String, dynamic>.from(r as Map));
  }

  @override
  Future<ClaimResult> claim(String code) async {
    ReferralsProvider.checkCode(code);
    final r = ClaimResult.fromJson(Map<String, dynamic>.from(await _api.post('/referrals/claim', {'code': code.trim().toUpperCase()}) as Map));
    _reloadQuietly();
    return r;
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }
}
