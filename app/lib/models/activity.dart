import 'follows.dart';
import 'models.dart';

/// Where you stand with the person a notification is from (decides its button).
class ActivityRel {
  const ActivityRel({this.friend = FriendState.none, this.follow = FollowState.none, this.followsYou = false, this.followRequest = false});
  final FriendState friend;
  final FollowState follow;
  final bool followsYou;

  /// They asked to follow you and it's still waiting.
  final bool followRequest;
}

/// One line on the Notifications page.
class ActivityItem {
  const ActivityItem({required this.id, required this.type, required this.title, required this.body, required this.data, required this.at, this.actor, this.rel, this.read = false, this.count = 1});
  final String id;

  /// Notification type, e.g. `friend.request`, `follow.new`, `payment.update`.
  final String type;
  final String title;
  final String body;

  /// Where a tap leads: `route` + ids (same as a push).
  final Map<String, String> data;

  /// Who it's from; null for Vibe's own (money, account) or if they're gone.
  final Profile? actor;
  final ActivityRel? rel;
  final bool read;

  /// How many notifications this line stands for ("3 new" messages from one chat).
  final int count;
  final DateTime at;

  ActivityItem copyWith({bool? read}) => ActivityItem(id: id, type: type, title: title, body: body, data: data, at: at, actor: actor, rel: rel, read: read ?? this.read, count: count);
}
