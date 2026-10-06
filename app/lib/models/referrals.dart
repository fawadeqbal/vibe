/// Invites and creator partners: who you invited and how far they are, the
/// milestones, the invite preview on the welcome screen and the late
/// "Have an invite code?" claim. Shapes follow `GET /referrals` and
/// friends (see docs/specs/2026-10-06-referrals-affiliates-api.md).
library;

import 'models.dart';

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
int _i(Object? v) => (v as num?)?.toInt() ?? 0;
String? _s(Object? v) => v is String && v.isNotEmpty ? v : null;

enum ReferralStatus {
  /// Joined; not verified / not enough calls yet.
  pending,

  /// Did everything; coins arrive after the hold.
  qualified,

  /// Both of you got your coins.
  rewarded,

  /// Not eligible (same device, bot, deleted, staff).
  rejected;

  static ReferralStatus parse(Object? v) => switch ('$v'.toUpperCase()) {
        'QUALIFIED' => qualified,
        'REWARDED' => rewarded,
        'REJECTED' => rejected,
        _ => pending,
      };

  String get wire => name.toUpperCase();
}

enum MilestoneReward { vip, coins }

/// "3 friends → 7 days of VIP".
class ReferralMilestone {
  const ReferralMilestone({required this.count, required this.kind, required this.amount, this.reached = false});
  final int count;
  final MilestoneReward kind;

  /// VIP days or coins.
  final int amount;
  final bool reached;

  String get rewardLabel => kind == MilestoneReward.vip ? '$amount days of VIP' : '${_thousands(amount)} coins';
  String get shortLabel => kind == MilestoneReward.vip ? '${amount}d VIP' : _thousands(amount);

  ReferralMilestone copyWith({bool? reached}) => ReferralMilestone(count: count, kind: kind, amount: amount, reached: reached ?? this.reached);

  factory ReferralMilestone.fromJson(Map<String, dynamic> m) {
    final r = Map<String, dynamic>.from(m['reward'] as Map? ?? const {});
    return ReferralMilestone(
      count: _i(m['count']),
      kind: r['kind'] == 'coins' ? MilestoneReward.coins : MilestoneReward.vip,
      amount: _i(r['amount']),
      reached: m['reached'] == true,
    );
  }
}

/// How far an invited friend is toward activation.
class ReferralSteps {
  const ReferralSteps({this.verified = false, this.verifyNeeded = true, this.calls = 0, this.callsNeeded = 3});
  final bool verified;
  final bool verifyNeeded;

  /// Capped at [callsNeeded].
  final int calls;
  final int callsNeeded;

  bool get done => (verified || !verifyNeeded) && calls >= callsNeeded;

  factory ReferralSteps.fromJson(Map<String, dynamic> m) => ReferralSteps(
        verified: m['verified'] == true,
        verifyNeeded: m['verifyNeeded'] != false,
        calls: _i(m['calls']),
        callsNeeded: _i(m['callsNeeded']),
      );
}

/// Someone who joined with your invite.
class ReferralPerson {
  const ReferralPerson({
    required this.id,
    required this.profile,
    required this.status,
    this.rejectReason,
    this.steps = const ReferralSteps(),
    this.coins = 0,
    required this.createdAt,
    this.qualifiedAt,
    this.rewardedAt,
  });

  final String id;
  final Profile profile;
  final ReferralStatus status;

  /// `same_device`, `bot`, `invitee_deleted`, or `staff: <text>`.
  final String? rejectReason;
  final ReferralSteps steps;

  /// Coins you were paid for them.
  final int coins;
  final DateTime createdAt;
  final DateTime? qualifiedAt;
  final DateTime? rewardedAt;

  /// The first name only (that's all the server shares anyway).
  String get firstName => firstNameOf(profile.name);

  /// A reason you can show to the inviter.
  String get rejectText {
    final r = rejectReason ?? '';
    if (r == 'same_device') return 'Joined on the same phone as you';
    if (r == 'bot') return 'Not a real account';
    if (r == 'invitee_deleted') return 'Deleted their account';
    if (r.startsWith('staff:')) return r.substring(6).trim().isEmpty ? 'Not eligible' : r.substring(6).trim();
    return 'Not eligible';
  }

  ReferralPerson copyWith({ReferralStatus? status, ReferralSteps? steps, int? coins, DateTime? rewardedAt, DateTime? qualifiedAt}) => ReferralPerson(
        id: id,
        profile: profile,
        status: status ?? this.status,
        rejectReason: rejectReason,
        steps: steps ?? this.steps,
        coins: coins ?? this.coins,
        createdAt: createdAt,
        qualifiedAt: qualifiedAt ?? this.qualifiedAt,
        rewardedAt: rewardedAt ?? this.rewardedAt,
      );
}

class ReferralRewards {
  const ReferralRewards({required this.inviterCoins, required this.inviteeCoins, required this.activationCalls, required this.requireVerified, this.holdHours = 24});

  /// From the catalog rules (before `GET /referrals` answers, and offline).
  factory ReferralRewards.fromEconomy() => ReferralRewards(
        inviterCoins: Economy.inviteRewardCoins,
        inviteeCoins: Economy.inviteeRewardCoins,
        activationCalls: Economy.referralActivationCalls,
        requireVerified: Economy.referralRequireVerified,
        holdHours: Economy.referralHoldHours,
      );

  final int inviterCoins;
  final int inviteeCoins;
  final int activationCalls;
  final bool requireVerified;
  final int holdHours;

  factory ReferralRewards.fromJson(Map<String, dynamic> m) => ReferralRewards(
        inviterCoins: _i(m['inviterCoins']),
        inviteeCoins: _i(m['inviteeCoins']),
        activationCalls: _i(m['activationCalls']),
        requireVerified: m['requireVerified'] == true,
        holdHours: m['holdHours'] == null ? 24 : _i(m['holdHours']),
      );
}

class ReferralStats {
  const ReferralStats({this.joined = 0, this.pending = 0, this.rewarded = 0, this.rejected = 0, this.coinsEarned = 0});
  final int joined;

  /// Pending + qualified.
  final int pending;
  final int rewarded;
  final int rejected;
  final int coinsEarned;

  factory ReferralStats.fromJson(Map<String, dynamic> m) => ReferralStats(
        joined: _i(m['joined']),
        pending: _i(m['pending']),
        rewarded: _i(m['rewarded']),
        rejected: _i(m['rejected']),
        coinsEarned: _i(m['coinsEarned']),
      );

  /// Recounted from the people list (offline mock, live updates).
  factory ReferralStats.of(List<ReferralPerson> people) => ReferralStats(
        joined: people.length,
        pending: people.where((p) => p.status == ReferralStatus.pending || p.status == ReferralStatus.qualified).length,
        rewarded: people.where((p) => p.status == ReferralStatus.rewarded).length,
        rejected: people.where((p) => p.status == ReferralStatus.rejected).length,
        coinsEarned: people.fold(0, (s, p) => s + p.coins),
      );
}

/// A creator partner's own link (only for ACTIVE partners).
class PartnerLink {
  const PartnerLink({required this.code, required this.link});
  final String code;
  final String link;
}

/// `GET /referrals`: the Invite friends screen.
class ReferralsView {
  const ReferralsView({
    required this.code,
    required this.link,
    required this.rewards,
    this.stats = const ReferralStats(),
    this.milestones = const [],
    this.people = const [],
    this.affiliate,
  });

  final String code;

  /// `https://vibe.fawadiqbal.dev/i/<CODE>`.
  final String link;
  final ReferralRewards rewards;
  final ReferralStats stats;
  final List<ReferralMilestone> milestones;

  /// Latest 50, newest first.
  final List<ReferralPerson> people;
  final PartnerLink? affiliate;

  /// The next milestone not reached yet, and how many friends are missing.
  ({ReferralMilestone milestone, int remaining})? get next {
    for (final m in milestones) {
      if (!m.reached && m.count > stats.rewarded) return (milestone: m, remaining: m.count - stats.rewarded);
    }
    return null;
  }

  /// The link with a channel: `…/i/CODE?s=whatsapp`.
  String linkFor(String? channel) => inviteLinkWithChannel(link, channel);

  ReferralsView copyWith({List<ReferralPerson>? people, ReferralStats? stats, List<ReferralMilestone>? milestones}) => ReferralsView(
        code: code,
        link: link,
        rewards: rewards,
        stats: stats ?? this.stats,
        milestones: milestones ?? this.milestones,
        people: people ?? this.people,
        affiliate: affiliate,
      );
}

/// Adds `?s=<channel>` to an invite link (replacing one already there).
String inviteLinkWithChannel(String link, String? channel) {
  if (channel == null || channel.isEmpty) return link;
  final uri = Uri.tryParse(link);
  if (uri == null) return link;
  return uri.replace(queryParameters: {...uri.queryParameters, 's': channel}).toString();
}

/// `GET /referrals/preview/:code` — "Ali invited you".
class InvitePreview {
  const InvitePreview({required this.valid, this.partner = false, this.name, this.avatarUrl, this.inviteeCoins = 0});
  final bool valid;

  /// A creator partner's code (their display name, not a first name).
  final bool partner;
  final String? name;
  final String? avatarUrl;
  final int inviteeCoins;

  static const invalid = InvitePreview(valid: false);

  factory InvitePreview.fromJson(Map<String, dynamic> m) => InvitePreview(
        valid: m['valid'] == true,
        partner: m['kind'] == 'affiliate',
        name: _s(m['name']),
        avatarUrl: _s(m['avatarUrl']),
        inviteeCoins: _i(m['inviteeCoins']),
      );
}

/// `POST /referrals/claim` answer.
class ClaimResult {
  const ClaimResult({required this.status, required this.inviterName, this.partner = false, this.inviteeCoins = 0, this.rejectReason});
  final ReferralStatus status;
  final String inviterName;
  final bool partner;
  final int inviteeCoins;
  final String? rejectReason;

  factory ClaimResult.fromJson(Map<String, dynamic> m) => ClaimResult(
        status: ReferralStatus.parse(m['status']),
        inviterName: _s((m['inviter'] as Map?)?['name']) ?? 'your friend',
        partner: m['kind'] == 'affiliate',
        inviteeCoins: _i(m['inviteeCoins']),
        rejectReason: _s(m['rejectReason']),
      );
}

/// `user.invitedBy` — who brought you (first name or partner name).
class InvitedBy {
  const InvitedBy({required this.name, this.status = ReferralStatus.pending});
  final String name;
  final ReferralStatus status;

  static InvitedBy? fromJson(Object? v) {
    if (v is! Map) return null;
    final name = _s(v['name']);
    return name == null ? null : InvitedBy(name: name, status: ReferralStatus.parse(v['status']));
  }
}

enum ReferralEvent {
  joined,
  qualified,
  rewarded,
  rejected,

  /// A step (a call, the selfie) without a status change — no toast.
  progress;

  static ReferralEvent? parse(Object? v) => switch (v) { 'joined' => joined, 'qualified' => qualified, 'rewarded' => rewarded, 'rejected' => rejected, _ => null };
}

/// `referral:updated` — one of your friends moved on.
class ReferralUpdate {
  const ReferralUpdate({required this.person, required this.event, this.coins = 0});
  final ReferralPerson person;
  final ReferralEvent event;
  final int coins;

  /// The toast for it (null: nothing worth interrupting for).
  String? get notice => switch (event) {
        ReferralEvent.joined => '${person.firstName} joined Vibe with your invite 🎉',
        ReferralEvent.rewarded => '+${_thousands(coins)} coins — ${person.firstName} is now active',
        ReferralEvent.qualified => '${person.firstName} is all set · your coins are on the way',
        ReferralEvent.rejected || ReferralEvent.progress => null,
      };
}

/// `referral:milestone` — the celebration sheet.
class MilestoneReached {
  const MilestoneReached({required this.index, required this.count, required this.reward});
  final int index;
  final int count;
  final ReferralMilestone reward;

  factory MilestoneReached.fromJson(Map<String, dynamic> m) {
    final count = _i(m['count']);
    return MilestoneReached(index: _i(m['index']), count: count, reward: ReferralMilestone.fromJson({'count': count, 'reward': m['reward'], 'reached': true}));
  }
}

/// "Ali Khan" → "Ali".
String firstNameOf(String name) {
  final t = name.trim();
  if (t.isEmpty) return t;
  return t.split(RegExp(r'\s+')).first;
}

String _thousands(int n) {
  final s = n.abs().toString();
  final b = StringBuffer(n < 0 ? '-' : '');
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return b.toString();
}

/// Parses dates for the person mapper (lives in core/api/mappers.dart).
DateTime? referralDate(Object? v) => _date(v);
