import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/api/api_config.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../core/mock/mock_backend.dart';
import '../core/mock/mock_data.dart';
import '../models/models.dart';
import '../services/invite/invite_links.dart';

part 'referrals_provider_local.dart';
part 'referrals_provider_remote.dart';

/// Invite friends: your code and link, the people who joined with it and
/// how far each one is, the milestones, the welcome-screen preview of a
/// captured code and the late "Have an invite code?" claim.
///
/// [LocalReferralsProvider] is the offline mock (a believable list of
/// friends at every stage); [RemoteReferralsProvider] reads
/// `GET /referrals` and hears `referral:updated` / `referral:milestone` /
/// `affiliate:updated` live.
abstract class ReferralsProvider extends ChangeNotifier {
  ReferralsProvider.base();

  factory ReferralsProvider(MockBackend backend, {bool seed}) = LocalReferralsProvider;

  ReferralsView? _view;
  bool _loading = false;
  ApiException? _error;
  final _updates = StreamController<ReferralUpdate>.broadcast();
  final _milestones = StreamController<MilestoneReached>.broadcast();
  final _partner = StreamController<String>.broadcast();

  ReferralsView? get view => _view;
  bool get loading => _loading;

  /// The last load failed (offline) and there is nothing to show yet.
  ApiException? get error => _error;
  bool get isRemote => false;

  /// The reward rules (the server's once loaded, else the catalog's).
  ReferralRewards get rewards => _view?.rewards ?? ReferralRewards.fromEconomy();

  List<ReferralMilestone> get milestones => _view?.milestones.isNotEmpty == true ? _view!.milestones : Economy.referralMilestones;

  /// A friend joined / qualified / was rewarded (toast).
  Stream<ReferralUpdate> get updates => _updates.stream;

  /// A milestone was reached (celebration sheet).
  Stream<MilestoneReached> get milestonesReached => _milestones.stream;

  /// Creator partner news ("You're a Vibe creator partner 🎉").
  Stream<String> get partnerNotices => _partner.stream;

  /// Your link with a channel (`?s=whatsapp`), or null before the first load.
  String? link({String? channel}) => _view == null || _view!.link.isEmpty ? null : _view!.linkFor(channel);

  Future<void> load();

  /// "Ali invited you" for a captured code (public; works signed out).
  Future<InvitePreview> preview(String code, {String? source});

  /// "Have an invite code?" — throws [ApiException] with
  /// `INVITE_CODE_INVALID`, `INVITE_TOO_LATE`, `INVITE_ALREADY_USED`,
  /// `INVITE_SELF` (or `VALIDATION_FAILED` for a malformed code).
  Future<ClaimResult> claim(String code);

  /// Sign-out: forget the previous account.
  void clear() {
    _view = null;
    _error = null;
    _loading = false;
    notifyListeners();
  }

  @protected
  void setView(ReferralsView v) {
    _view = v;
    _error = null;
    notifyListeners();
  }

  /// A friend moved on: update their row now (the exact totals follow with
  /// the next read).
  @protected
  void applyUpdate(ReferralUpdate u, {bool recount = false}) {
    final v = _view;
    if (v != null) {
      final people = [...v.people];
      final i = people.indexWhere((p) => p.id == u.person.id);
      if (i >= 0) {
        people[i] = u.person;
      } else {
        people.insert(0, u.person);
      }
      if (recount) {
        final stats = ReferralStats.of(people);
        setView(v.copyWith(people: people, stats: stats, milestones: [for (final m in v.milestones) m.copyWith(reached: m.reached || stats.rewarded >= m.count)]));
      } else {
        setView(v.copyWith(people: people));
      }
    }
    final notice = u.notice;
    if (notice != null && !_updates.isClosed) _updates.add(u);
  }

  @protected
  void announceMilestone(MilestoneReached m) {
    if (!_milestones.isClosed) _milestones.add(m);
  }

  @protected
  void announcePartner(String text) {
    if (!_partner.isClosed) _partner.add(text);
  }

  @protected
  Future<void> guardLoad(Future<void> Function() fn) async {
    _loading = true;
    notifyListeners();
    try {
      await fn();
    } on ApiException catch (e) {
      _error = e;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Client-side check before `POST /referrals/claim`.
  static void checkCode(String code) {
    if (InviteLinks.normalizeCode(code) == null) {
      throw ApiException('VALIDATION_FAILED', 'Invite codes are 3–20 letters or numbers.', status: 400);
    }
  }

  @override
  void dispose() {
    _updates.close();
    _milestones.close();
    _partner.close();
    super.dispose();
  }
}
