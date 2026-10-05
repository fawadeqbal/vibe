import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';

/// Sign-in nonces (Apple, Facebook Limited Login). The provider gets
/// SHA-256(raw) and puts it in the ID token; the server gets the raw value
/// and checks the hash, so a stolen token can't be replayed.
class Nonce {
  Nonce._();

  static const _chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';

  /// A random URL-safe string (default 32 chars; the server accepts 8–200).
  static String generate([int length = 32, Random? random]) {
    final r = random ?? Random.secure();
    return List.generate(length, (_) => _chars[r.nextInt(_chars.length)]).join();
  }

  /// Lower-case hex SHA-256, what Apple / Facebook expect as the request nonce.
  static String sha256Hex(String raw) => sha256.convert(utf8.encode(raw)).toString();
}
