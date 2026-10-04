import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class Tokens {
  const Tokens(this.access, this.refresh);
  final String access;
  final String refresh;
}

/// Where the session lives between launches. The default keeps tokens in
/// the platform keystore/keychain; tests use [MemoryTokenStore].
abstract class TokenStore {
  Future<Tokens?> read();
  Future<void> write(Tokens tokens);
  Future<void> clear();
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage]) : _s = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _s;
  static const _kAccess = 'vibe.access';
  static const _kRefresh = 'vibe.refresh';

  @override
  Future<Tokens?> read() async {
    final a = await _s.read(key: _kAccess);
    final r = await _s.read(key: _kRefresh);
    return a == null || r == null ? null : Tokens(a, r);
  }

  @override
  Future<void> write(Tokens t) async {
    await _s.write(key: _kAccess, value: t.access);
    await _s.write(key: _kRefresh, value: t.refresh);
  }

  @override
  Future<void> clear() async {
    await _s.delete(key: _kAccess);
    await _s.delete(key: _kRefresh);
  }
}

class MemoryTokenStore implements TokenStore {
  Tokens? _t;
  @override
  Future<Tokens?> read() async => _t;
  @override
  Future<void> write(Tokens t) async => _t = t;
  @override
  Future<void> clear() async => _t = null;
}
