import 'dart:convert';

import 'package:crypto/crypto.dart';

/// What the Vibe server said about a store receipt.
enum ServerAnswer {
  /// Verified and delivered (SUCCEEDED).
  succeeded,

  /// Still open: Play says the payment is pending (slow card, cash).
  open,

  /// Verified as not payable (FAILED / EXPIRED / REFUNDED, or a 402 decline).
  declined,

  /// 409: this receipt was already redeemed (coins/VIP delivered before).
  alreadyRedeemed,

  /// Network / server error: we don't know yet.
  error,
}

/// The store-billing rules in one place (unit-tested):
///
/// * Google Play consumables are **not** consumed by the app: the server
///   verifies, delivers, then consumes/acknowledges. The app only calls
///   `completePurchase` (an acknowledge) once the server delivered, or the
///   receipt was already redeemed. A declined Android purchase stays
///   unacknowledged so Play refunds it automatically after 3 days.
/// * StoreKit transactions are always finished once the server gave a
///   definite answer — otherwise iOS redelivers them forever.
/// * Unknown outcomes (offline, 5xx) are never completed; they are retried.
class StoreRules {
  StoreRules._();

  static bool shouldComplete({required bool android, required ServerAnswer answer}) => switch (answer) {
        ServerAnswer.succeeded || ServerAnswer.alreadyRedeemed => true,
        ServerAnswer.declined => !android,
        ServerAnswer.open || ServerAnswer.error => false,
      };

  /// Should a purchase from the store stream be sent to the server?
  /// `purchased` always; `restored` only while unfinished (unacknowledged on
  /// Play / unfinished on iOS) — finished ones were delivered already.
  static bool shouldVerify({required bool purchased, required bool restored, required bool pendingComplete}) => purchased || (restored && pendingComplete);

  /// One idempotency key per store receipt, so a receipt redelivered after a
  /// crash or on the next launch maps to the same server purchase.
  static String idempotencyKey(String receipt) => 'store-${sha256.convert(utf8.encode(receipt)).toString().substring(0, 48)}';
}
