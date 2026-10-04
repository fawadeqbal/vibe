import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import 'api_config.dart';
import 'api_exception.dart';
import 'token_store.dart';

/// JSON over HTTP with the session handled for you: adds the bearer token,
/// refreshes it once on expiry (one refresh shared by concurrent calls),
/// retries, and turns every failure into an [ApiException].
class ApiClient {
  ApiClient({String? baseUrl, http.Client? httpClient, TokenStore? tokens}) : _base = baseUrl ?? ApiConfig.restBase, _http = httpClient ?? http.Client(), tokens = tokens ?? SecureTokenStore();

  final String _base;
  final http.Client _http;
  final TokenStore tokens;

  String? _access;
  String? _refresh;
  Future<bool>? _refreshing;

  /// Called when the session can't be refreshed any more (signed out elsewhere).
  void Function()? onSessionExpired;

  String? get accessToken => _access;
  bool get hasSession => _refresh != null;

  Future<void> restore() async {
    final t = await tokens.read();
    _access = t?.access;
    _refresh = t?.refresh;
  }

  Future<void> setTokens(Map<String, dynamic> pair) async {
    _access = pair['accessToken'] as String;
    _refresh = pair['refreshToken'] as String;
    await tokens.write(Tokens(_access!, _refresh!));
  }

  Future<void> clearSession() async {
    _access = null;
    _refresh = null;
    await tokens.clear();
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) => _send('GET', path, query: query);
  Future<dynamic> post(String path, [Object? body, Map<String, String>? headers]) => _send('POST', path, body: body, headers: headers);
  Future<dynamic> patch(String path, [Object? body]) => _send('PATCH', path, body: body);
  Future<dynamic> delete(String path) => _send('DELETE', path);

  /// A fresh key for `Idempotency-Key` (one per user action, reused on retry).
  static String newIdempotencyKey() {
    final r = Random.secure();
    return List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  }

  Future<dynamic> _send(String method, String path, {Object? body, Map<String, String>? query, Map<String, String>? headers, bool retried = false}) async {
    final uri = Uri.parse('$_base$path').replace(queryParameters: query);
    final req = http.Request(method, uri)
      ..headers['Accept'] = 'application/json'
      ..headers.addAll(headers ?? const {});
    if (_access != null) req.headers['Authorization'] = 'Bearer $_access';
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(const Duration(seconds: 20)));
    } on TimeoutException catch (e) {
      throw ApiException.network(e);
    } catch (e) {
      throw ApiException.network(e);
    }
    final decoded = res.body.isEmpty ? null : _tryJson(res.body);
    if (res.statusCode >= 200 && res.statusCode < 300) return decoded;
    final err = ApiException.fromBody(res.statusCode, decoded);
    if (res.statusCode == 401 && !retried && _refresh != null && !path.startsWith('/auth/')) {
      if (await refreshSession()) return _send(method, path, body: body, query: query, headers: headers, retried: true);
    }
    throw err;
  }

  /// Rotates the refresh token. Concurrent callers share one request.
  Future<bool> refreshSession() {
    return _refreshing ??= () async {
      try {
        final r = _refresh;
        if (r == null) return false;
        final res = await _http.post(Uri.parse('$_base/auth/refresh'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'refreshToken': r}));
        if (res.statusCode != 200) {
          await clearSession();
          onSessionExpired?.call();
          return false;
        }
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        await setTokens(Map<String, dynamic>.from(body['tokens'] as Map));
        return true;
      } catch (_) {
        return false; // offline: keep the session, try again later
      } finally {
        _refreshing = null;
      }
    }();
  }

  static Object? _tryJson(String s) {
    try {
      return jsonDecode(s);
    } catch (_) {
      return s;
    }
  }
}
