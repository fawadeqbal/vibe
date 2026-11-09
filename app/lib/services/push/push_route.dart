import 'dart:async';

import 'package:flutter/foundation.dart';

/// Where a tapped notification should take you, from its `data`
/// (`route`: chat + friendId | friends (+ userId) | inbox | wallet | store | match | profile + userId | follow-requests | invite | partner | discover | call | notifications).
@immutable
class PushRoute {
  const PushRoute(this.target, {this.friendId, this.userId, this.purchaseId, this.cashoutId});

  final PushTarget target;
  final String? friendId;

  /// The person to show (route `profile`).
  final String? userId;
  final String? purchaseId;
  final String? cashoutId;

  /// Null for data the app doesn't route (old app version, missing route).
  static PushRoute? fromData(Map<String, dynamic> data) {
    String? s(String k) {
      final v = data[k];
      return v is String && v.isNotEmpty ? v : null;
    }

    return switch (s('route')) {
      // A chat without a friend id still lands on the friends list.
      'chat' => s('friendId') != null ? PushRoute(PushTarget.chat, friendId: s('friendId')) : const PushRoute(PushTarget.friends),
      // A friend request: their profile (Accept / Decline); without a person, the Notifications page.
      'friends' => s('userId') != null ? PushRoute(PushTarget.profile, userId: s('userId')) : const PushRoute(PushTarget.notifications),
      'notifications' => const PushRoute(PushTarget.notifications),
      'inbox' => const PushRoute(PushTarget.inbox),
      'wallet' => PushRoute(PushTarget.wallet, purchaseId: s('purchaseId'), cashoutId: s('cashoutId')),
      'store' => PushRoute(PushTarget.store, purchaseId: s('purchaseId')),
      // Vibe Hour started: back to the lobby.
      'match' => const PushRoute(PushTarget.match),
      'profile' => s('userId') != null ? PushRoute(PushTarget.profile, userId: s('userId')) : null,
      'follow-requests' => const PushRoute(PushTarget.followRequests),
      // A friend joined / got active, a milestone: the Invite friends screen.
      'invite' => const PushRoute(PushTarget.invite),
      // Creator partner news: the partner screen.
      'partner' => const PushRoute(PushTarget.partner),
      // A match or a like in Discover.
      'discover' => const PushRoute(PushTarget.discover),
      // A friend is calling: the app shows the ring when it opens.
      'call' => PushRoute(PushTarget.call, friendId: s('friendId')),
      _ => null,
    };
  }

  @override
  bool operator ==(Object other) => other is PushRoute && other.target == target && other.friendId == friendId && other.userId == userId && other.purchaseId == purchaseId && other.cashoutId == cashoutId;
  @override
  int get hashCode => Object.hash(target, friendId, userId, purchaseId, cashoutId);
  @override
  String toString() => 'PushRoute($target${friendId != null ? ', $friendId' : ''})';
}

enum PushTarget { chat, friends, inbox, wallet, store, match, profile, followRequests, invite, partner, discover, call, notifications }

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
const pushChannels = <String, String>{
  'messages': 'Messages',
  'social': 'Friends',
  'payments': 'Payments',
  'inbox': 'News from Vibe',
  'engagement': 'Streaks and Vibe Hour',
};
