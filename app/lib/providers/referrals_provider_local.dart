part of 'referrals_provider.dart';

/// The offline mock: six friends at every stage (two rewarded, one about to
/// be paid, two on their way, one not eligible), your demo code, and the
/// demo codes in [MockData.inviteCodes] for previews and claims.
class LocalReferralsProvider extends ReferralsProvider {
  LocalReferralsProvider(this._backend, {this.seed = true}) : super.base();

  final MockBackend _backend;

  /// False: start with nobody invited yet (tests, empty state).
  final bool seed;
  bool _claimed = false;

  @override
  Future<void> load() async {
    if (_view != null) return;
    final rewards = ReferralRewards.fromEconomy();
    final people = seed ? _seedPeople(rewards) : const <ReferralPerson>[];
    final stats = ReferralStats.of(people);
    setView(ReferralsView(
      code: MockData.myInviteCode,
      link: ApiConfig.inviteLink(MockData.myInviteCode),
      rewards: rewards,
      stats: stats,
      milestones: [for (final m in Economy.referralMilestones) m.copyWith(reached: stats.rewarded >= m.count)],
      people: people,
    ));
  }

  List<ReferralPerson> _seedPeople(ReferralRewards r) {
    final ps = _backend.people;
    if (ps.length < 6) return const [];
    final now = DateTime.now();
    ReferralSteps steps({bool verified = true, int calls = 0}) => ReferralSteps(verified: verified, verifyNeeded: r.requireVerified, calls: calls.clamp(0, r.activationCalls), callsNeeded: r.activationCalls);
    return [
      ReferralPerson(id: 'ref-1', profile: ps[0], status: ReferralStatus.pending, steps: steps(calls: r.activationCalls - 1), createdAt: now.subtract(const Duration(hours: 5))),
      ReferralPerson(id: 'ref-2', profile: ps[1], status: ReferralStatus.pending, steps: steps(verified: false), createdAt: now.subtract(const Duration(hours: 20))),
      ReferralPerson(id: 'ref-3', profile: ps[2], status: ReferralStatus.qualified, steps: steps(calls: r.activationCalls), createdAt: now.subtract(const Duration(days: 2)), qualifiedAt: now.subtract(const Duration(hours: 3))),
      ReferralPerson(id: 'ref-4', profile: ps[3], status: ReferralStatus.rewarded, steps: steps(calls: r.activationCalls), coins: r.inviterCoins, createdAt: now.subtract(const Duration(days: 6)), rewardedAt: now.subtract(const Duration(days: 4))),
      ReferralPerson(id: 'ref-5', profile: ps[4], status: ReferralStatus.rejected, rejectReason: 'same_device', steps: steps(verified: false), createdAt: now.subtract(const Duration(days: 8))),
      ReferralPerson(id: 'ref-6', profile: ps[5], status: ReferralStatus.rewarded, steps: steps(calls: r.activationCalls), coins: r.inviterCoins, createdAt: now.subtract(const Duration(days: 12)), rewardedAt: now.subtract(const Duration(days: 10))),
    ];
  }

  @override
  Future<InvitePreview> preview(String code, {String? source}) async {
    final known = MockData.inviteCodes[InviteLinks.normalizeCode(code)];
    if (known == null) return InvitePreview.invalid;
    return InvitePreview(valid: true, partner: known.$2, name: known.$1, inviteeCoins: Economy.inviteeRewardCoins);
  }

  @override
  Future<ClaimResult> claim(String code) async {
    ReferralsProvider.checkCode(code);
    final c = InviteLinks.normalizeCode(code)!;
    if (c == MockData.myInviteCode) throw ApiException('INVITE_SELF', "That's your own code.", status: 403);
    if (_claimed) throw ApiException('INVITE_ALREADY_USED', 'You already used an invite code.', status: 409);
    final known = MockData.inviteCodes[c];
    if (known == null) throw ApiException('INVITE_CODE_INVALID', 'No invite with that code.', status: 404);
    _claimed = true;
    return ClaimResult(status: ReferralStatus.pending, inviterName: known.$1, partner: known.$2, inviteeCoins: Economy.inviteeRewardCoins);
  }

  /// Demo (and tests): the friend closest to done takes one step — a call,
  /// the selfie, qualifying, or getting paid — and the screen, the toast
  /// and a reached milestone react like they do live.
  ReferralUpdate? advanceDemo() {
    final v = _view;
    if (v == null) return null;
    final r = v.rewards;
    final order = [ReferralStatus.qualified, ReferralStatus.pending];
    ReferralPerson? who;
    for (final s in order) {
      final candidates = v.people.where((p) => p.status == s).toList()..sort((a, b) => b.steps.calls.compareTo(a.steps.calls));
      if (candidates.isNotEmpty) {
        who = candidates.first;
        break;
      }
    }
    if (who == null) return null;
    final now = DateTime.now();
    final ReferralUpdate u;
    if (who.status == ReferralStatus.qualified) {
      u = ReferralUpdate(person: who.copyWith(status: ReferralStatus.rewarded, coins: r.inviterCoins, rewardedAt: now), event: ReferralEvent.rewarded, coins: r.inviterCoins);
    } else {
      final s = who.steps;
      final steps = s.verifyNeeded && !s.verified
          ? ReferralSteps(verified: true, verifyNeeded: true, calls: s.calls, callsNeeded: s.callsNeeded)
          : ReferralSteps(verified: s.verified, verifyNeeded: s.verifyNeeded, calls: (s.calls + 1).clamp(0, s.callsNeeded), callsNeeded: s.callsNeeded);
      u = steps.done
          ? ReferralUpdate(person: who.copyWith(status: ReferralStatus.qualified, steps: steps, qualifiedAt: now), event: ReferralEvent.qualified)
          : ReferralUpdate(person: who.copyWith(steps: steps), event: ReferralEvent.progress);
    }
    final before = v.stats.rewarded;
    applyUpdate(u, recount: true);
    final after = _view!.stats.rewarded;
    final ms = _view!.milestones;
    for (var i = 0; i < ms.length; i++) {
      if (before < ms[i].count && after >= ms[i].count) announceMilestone(MilestoneReached(index: i + 1, count: after, reward: ms[i]));
    }
    return u;
  }

  /// Demo (and tests): someone new joins with your link.
  void joinDemo(Profile p) {
    final r = rewards;
    applyUpdate(
      ReferralUpdate(
        person: ReferralPerson(id: 'ref-${DateTime.now().microsecondsSinceEpoch}', profile: p, status: ReferralStatus.pending, steps: ReferralSteps(verifyNeeded: r.requireVerified, callsNeeded: r.activationCalls), createdAt: DateTime.now()),
        event: ReferralEvent.joined,
      ),
      recount: true,
    );
  }

  @override
  void clear() {
    _claimed = false;
    super.clear();
  }
}
