import 'package:flutter/foundation.dart';

/// Where a tapped notification should take you, from its `data`
/// (`route`: chat + friendId | friends | inbox | wallet | store | match | profile + userId | follow-requests | invite | partner).
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
      'friends' => const PushRoute(PushTarget.friends),
      'inbox' => const PushRoute(PushTarget.inbox),
      'wallet' => PushRoute(PushTarget.wallet, purchaseId: s('purchaseId'), cashoutId: s('cashoutId')),
      'store' => PushRoute(PushTarget.store, purchaseId: s('purchaseId')),
      // Vibe Hour started: back to the lobby.
      'match' => const PushRoute(PushTarget.match),
      'profile' => s('userId') != null ? PushRoute(PushTarget.profile, userId: s('userId')) : null,
      'follow-requests' => const PushRoute(PushTarget.followRequests),
      // A friend joined / got active, a milestone: the Invite friends screen.
      'invite' => const PushRoute(PushTarget.invite),
      // Creator partner news: the web dashboard, in the browser.
      'partner' => const PushRoute(PushTarget.partner),
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

enum PushTarget { chat, friends, inbox, wallet, store, match, profile, followRequests, invite, partner }

/// Android notification channels (ids = the server's `category`).
const pushChannels = <String, String>{
  'messages': 'Messages',
  'social': 'Friends',
  'payments': 'Payments',
  'inbox': 'News from Vibe',
  'engagement': 'Streaks and Vibe Hour',
};
