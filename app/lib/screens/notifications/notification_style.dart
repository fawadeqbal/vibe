import 'package:flutter/material.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';

/// The filters on the Notifications page.
enum NotificationFilter { all, people, calls, money, account }

/// How a notification looks — the badge on a person's photo, or the
/// coloured tile for Vibe's own (money, account) — and which filter it sits
/// under. Mirror of the web's `notificationStyle`.
class NotificationStyle {
  const NotificationStyle(this.icon, this.color, this.filter);
  final IconData icon;
  final Color color;

  /// Which filter (besides All) shows it; null = only All.
  final NotificationFilter? filter;

  static const _info = Color(0xFF60A5FA);

  /// `title` tells a failure from a success where the type covers both.
  static NotificationStyle of(String type, [String title = '']) {
    final bad = RegExp(r"not completed|returned|couldn.t|stays", caseSensitive: false).hasMatch(title);
    const people = NotificationFilter.people;
    const money = NotificationFilter.money;
    const account = NotificationFilter.account;
    return switch (type) {
      'chat.message' => const NotificationStyle(SolarIconsBold.chatRound, V.pink, people),
      'chat.gift' => const NotificationStyle(SolarIconsBold.gift, V.gold, people),
      'chat.reaction' => const NotificationStyle(SolarIconsBold.heart, V.pink, people),
      'call.missed' || 'call.incoming' => const NotificationStyle(SolarIconsBold.phoneRounded, V.bad, NotificationFilter.calls),
      'call.ask' => const NotificationStyle(SolarIconsBold.videocamera, V.lavender, NotificationFilter.calls),
      'friend.request' => const NotificationStyle(SolarIconsBold.userPlusRounded, V.violet, people),
      'friend.accepted' => const NotificationStyle(SolarIconsBold.userCheckRounded, V.ok, people),
      'follow.new' || 'follow.accepted' => const NotificationStyle(SolarIconsBold.userPlusRounded, V.violet, people),
      'follow.request' => const NotificationStyle(SolarIconsBold.usersGroupRounded, V.violet, people),
      'wave.new' || 'wave.looking' => const NotificationStyle(SolarIconsBold.handShake, V.gold, people),
      'discover.match' => const NotificationStyle(SolarIconsBold.heart, V.pink, people),
      'discover.superLike' => const NotificationStyle(SolarIconsBold.star, V.gold, people),
      'discover.like' || 'reminder.likesWaiting' => const NotificationStyle(SolarIconsBold.heartAngle, V.pink, people),
      'discover.newPeople' => const NotificationStyle(SolarIconsBold.usersGroupTwoRounded, V.lavender, people),
      'match.someoneLooking' => const NotificationStyle(SolarIconsBold.videocamera, V.pink, null),
      'referral.update' || 'referral.milestone' => const NotificationStyle(SolarIconsBold.usersGroupTwoRounded, V.gold, people),
      'reminder.vibeHourLive' || 'reminder.vibeHourSoon' => const NotificationStyle(SolarIconsBold.fire, V.pink, null),
      'reminder.streak' => const NotificationStyle(SolarIconsBold.fire, V.flame, people),
      'reminder.winback' => const NotificationStyle(SolarIconsBold.bolt, V.gold, money),
      'reminder.recap' => const NotificationStyle(SolarIconsBold.graphUp, V.lavender, null),
      'payment.update' => bad ? const NotificationStyle(SolarIconsBold.dangerCircle, V.bad, money) : const NotificationStyle(SolarIconsBold.billList, V.ok, money),
      'cashout.update' => bad ? const NotificationStyle(SolarIconsBold.walletMoney, V.warn, money) : const NotificationStyle(SolarIconsBold.walletMoney, V.gem, money),
      'goal.reached' => const NotificationStyle(SolarIconsBold.cupStar, V.gold, money),
      'partner.update' => const NotificationStyle(SolarIconsBold.crown, V.gold, money),
      'account.warning' => const NotificationStyle(SolarIconsBold.dangerTriangle, V.warn, account),
      'account.paused' => const NotificationStyle(SolarIconsBold.pauseCircle, V.warn, account),
      'account.appeal' => const NotificationStyle(SolarIconsBold.flag, _info, account),
      'account.verification' => bad ? const NotificationStyle(SolarIconsBold.dangerCircle, V.bad, account) : const NotificationStyle(SolarIconsBold.verifiedCheck, _info, account),
      'team.message' => const NotificationStyle(SolarIconsBold.letter, V.pinkSoft, account),
      _ => const NotificationStyle(SolarIconsBold.bell, V.text2, null),
    };
  }
}
