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

/// A note from the Vibe team about your account (Account status).
class AccountNote {
  const AccountNote({required this.id, required this.type, required this.title, required this.body, required this.at});
  final String id;

  /// `account.warning`, `account.paused` or `account.appeal`.
  final String type;
  final String title;
  final String body;
  final DateTime at;

  factory AccountNote.fromJson(Map<String, dynamic> m) => AccountNote(
    id: '${m['id'] ?? ''}',
    type: '${m['type'] ?? ''}',
    title: '${m['title'] ?? ''}',
    body: '${m['body'] ?? ''}',
    at: DateTime.tryParse('${m['createdAt']}')?.toLocal() ?? DateTime.now(),
  );
}

/// Me → Account status: the pause (if any), your appeal, and the team's notes.
class AccountStatus {
  const AccountStatus({this.pausedUntil, this.appealStatus, this.appealAt, this.notes = const []});
  final DateTime? pausedUntil;

  /// OPEN, ACCEPTED or REJECTED; null when you haven't appealed this pause.
  final String? appealStatus;
  final DateTime? appealAt;
  final List<AccountNote> notes;

  factory AccountStatus.fromJson(Map<String, dynamic> m) {
    final appeal = m['appeal'] is Map ? Map<String, dynamic>.from(m['appeal'] as Map) : null;
    return AccountStatus(
      pausedUntil: DateTime.tryParse('${m['pausedUntil']}')?.toLocal(),
      appealStatus: appeal?['status'] as String?,
      appealAt: appeal == null ? null : DateTime.tryParse('${appeal['createdAt']}')?.toLocal(),
      notes: [for (final n in (m['notes'] as List? ?? const [])) AccountNote.fromJson(Map<String, dynamic>.from(n as Map))],
    );
  }
}

enum CallLogKind { missed, declined, ended }

/// One call with a friend (from the call lines in the chat).
class CallLogEntry {
  const CallLogEntry({required this.id, required this.kind, required this.video, required this.at, this.seconds, this.outgoing});
  final String id;
  final CallLogKind kind;
  final bool video;
  final int? seconds;

  /// You rang (true), they rang (false), or unknown (null).
  final bool? outgoing;
  final DateTime at;

  factory CallLogEntry.fromJson(Map<String, dynamic> m) => CallLogEntry(
    id: '${m['id'] ?? ''}',
    kind: switch (m['kind']) {
      'missed' => CallLogKind.missed,
      'declined' => CallLogKind.declined,
      _ => CallLogKind.ended,
    },
    video: m['video'] != false,
    seconds: (m['seconds'] as num?)?.toInt(),
    outgoing: m['outgoing'] as bool?,
    at: DateTime.tryParse('${m['createdAt']}')?.toLocal() ?? DateTime.now(),
  );
}

/// Your calls with one friend (a missed call opens this).
class CallHistory {
  const CallHistory({this.friendSince, this.streak = 0, this.calls = const []});
  final DateTime? friendSince;
  final int streak;
  final List<CallLogEntry> calls;

  factory CallHistory.fromJson(Map<String, dynamic> m) => CallHistory(
    friendSince: DateTime.tryParse('${m['friendSince']}')?.toLocal(),
    streak: (m['streak'] as num?)?.toInt() ?? 0,
    calls: [for (final c in (m['calls'] as List? ?? const [])) CallLogEntry.fromJson(Map<String, dynamic>.from(c as Map))],
  );
}
