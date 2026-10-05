import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../core/mock/mock_backend.dart';
import '../models/follows.dart';
import '../models/models.dart';
import 'social_provider.dart';

part 'follows_provider_local.dart';
part 'follows_provider_remote.dart';

/// One-way follows and the tiered profile view.
///
/// Following never unlocks chat — that stays with [SocialProvider] friends.
/// [LocalFollowsProvider] is the offline demo; [RemoteFollowsProvider] talks
/// to the Vibe API and hears about new followers live.
abstract class FollowsProvider extends ChangeNotifier {
  FollowsProvider.base();

  factory FollowsProvider(MockBackend backend, SocialProvider social) = LocalFollowsProvider;

  FollowSettings _settings = const FollowSettings();
  final Map<String, FollowState> _states = {};
  final StreamController<FollowNotice> _notices = StreamController<FollowNotice>.broadcast();

  /// Your numbers and privacy switches.
  FollowSettings get settings => _settings;

  /// What we last heard about your follow towards [userId].
  FollowState stateOf(String userId) => _states[userId] ?? FollowState.none;

  /// "X started following you" and friends, for an in-app toast.
  Stream<FollowNotice> get notices => _notices.stream;

  @protected
  void remember(String userId, FollowState state) {
    _states[userId] = state;
    notifyListeners();
  }

  @protected
  void announce(FollowNotice notice) {
    if (!_notices.isClosed) _notices.add(notice);
  }

  /// Sign-out: forget the previous account.
  void clear() {
    _states.clear();
    _settings = const FollowSettings();
    notifyListeners();
  }

  Future<void> load();

  /// Null when the profile can't be shown (never met, blocked, gone).
  Future<ProfileView?> view(String userId);

  /// Follows, or sends a request to a private account.
  Future<FollowState> follow(String userId);

  /// Unfollows, or takes back a request.
  Future<void> unfollow(String userId);

  Future<FollowPage> list(FollowList which, {String? cursor});
  Future<void> accept(String userId);
  Future<void> decline(String userId);
  Future<void> removeFollower(String userId);
  Future<void> report(String userId, ReportReason reason, {String? note, bool block = true});

  /// False when it could not be saved (the switch flips back).
  Future<bool> setPrivacy({bool? privateAccount, bool? hideStats});

  @override
  void dispose() {
    _notices.close();
    super.dispose();
  }
}
