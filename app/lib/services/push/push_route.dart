import 'dart:async';

import 'package:flutter/foundation.dart';

/// Where a tapped notification should take you, from its `data`: `open` (the
/// page it is about) or, for older notifications, `route` — the same table as
/// the server's `webPath` and the web's `notificationPath`.
@immutable
class PushRoute {
  const PushRoute(this.target, {this.friendId, this.userId, this.purchaseId, this.cashoutId, this.messageId, this.noteId});

  final PushTarget target;
  final String? friendId;

  /// The person to show (profile, calls with them).
  final String? userId;
  final String? purchaseId;
  final String? cashoutId;

  /// The chat message to scroll to (a reaction, a gift), or the Vibe team message.
  final String? messageId;

  /// The line on the Notifications page (Account status highlights it).
  final String? noteId;

  /// Null for data the app doesn't route (a newer server, missing route).
  static PushRoute? fromData(Map<String, dynamic> data) {
    String? s(String k) {
      final v = data[k];
      return v is String && v.isNotEmpty ? v : null;
    }

    final open = s('open') ?? s('route');
    return switch (open) {
      // A chat (at a message when there is one); without a friend id, the friends list.
      'chat' => s('friendId') != null ? PushRoute(PushTarget.chat, friendId: s('friendId'), messageId: s('messageId')) : const PushRoute(PushTarget.friends),
      // A friend request: their profile (Accept / Decline); without a person, the Notifications page.
      'friends' => s('userId') != null ? PushRoute(PushTarget.profile, userId: s('userId')) : const PushRoute(PushTarget.notifications),
      'notifications' => const PushRoute(PushTarget.notifications),
      'inbox' => const PushRoute(PushTarget.inbox),
      'wallet' => PushRoute(PushTarget.wallet, purchaseId: s('purchaseId'), cashoutId: s('cashoutId')),
      'goals' => const PushRoute(PushTarget.wallet),
      'store' => PushRoute(PushTarget.store, purchaseId: s('purchaseId')),
      // Vibe Hour started, someone's looking: the lobby.
      'match' => const PushRoute(PushTarget.match),
      'profile' => s('userId') != null ? PushRoute(PushTarget.profile, userId: s('userId')) : null,
      'follow-requests' => const PushRoute(PushTarget.followRequests),
      'invite' => const PushRoute(PushTarget.invite),
      'partner' => const PushRoute(PushTarget.partner),
      'discover' => const PushRoute(PushTarget.discover),
      'liked-you' => const PushRoute(PushTarget.likedYou),
      // A friend is calling: the app shows the ring when it opens.
      'call' => PushRoute(PushTarget.call, friendId: s('friendId')),
      // A missed call: your calls with them.
      'calls' => s('userId') != null ? PushRoute(PushTarget.calls, userId: s('userId')) : const PushRoute(PushTarget.friends),
      'payment' => s('purchaseId') != null ? PushRoute(PushTarget.payment, purchaseId: s('purchaseId')) : const PushRoute(PushTarget.wallet),
      'cashout' => s('cashoutId') != null ? PushRoute(PushTarget.cashout, cashoutId: s('cashoutId')) : const PushRoute(PushTarget.wallet),
      'account' => PushRoute(PushTarget.account, noteId: s('noteId')),
      'verification' => const PushRoute(PushTarget.verification),
      'team' => s('messageId') != null ? PushRoute(PushTarget.team, messageId: s('messageId')) : const PushRoute(PushTarget.inbox),
      'recap' => const PushRoute(PushTarget.recap),
      _ => null,
    };
  }

  @override
  bool operator ==(Object other) =>
      other is PushRoute &&
      other.target == target &&
      other.friendId == friendId &&
      other.userId == userId &&
      other.purchaseId == purchaseId &&
      other.cashoutId == cashoutId &&
      other.messageId == messageId &&
      other.noteId == noteId;
  @override
  int get hashCode => Object.hash(target, friendId, userId, purchaseId, cashoutId, messageId, noteId);
  @override
  String toString() => 'PushRoute($target${friendId != null ? ', $friendId' : ''}${userId != null ? ', $userId' : ''})';
}

enum PushTarget {
  chat,
  friends,
  inbox,
  wallet,
  store,
  match,
  profile,
  followRequests,
  invite,
  partner,
  discover,
  likedYou,
  call,
  calls,
  payment,
  cashout,
  account,
  verification,
  team,
  recap,
  notifications,
}

/// In-app deep links: the Notifications page (and anything else) asks the home
/// shell to open a route, exactly as if its push had been tapped.
class DeepLinks {
  DeepLinks._();
  static final _links = StreamController<PushRoute>.broadcast();
  static Stream<PushRoute> get stream => _links.stream;

  /// Opens where [data] (a notification's `route` + ids) leads. False when the app doesn't know the route.
  static bool open(Map<String, dynamic> data) {
    final r = PushRoute.fromData(data);
    if (r == null) return false;
    _links.add(r);
    return true;
  }
}

/// Android notification channels (ids = the server's `category`).
const pushChannels = <String, String>{'messages': 'Messages', 'social': 'Friends', 'payments': 'Payments', 'inbox': 'News from Vibe', 'engagement': 'Streaks and Vibe Hour'};
