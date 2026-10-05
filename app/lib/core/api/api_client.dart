import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show MediaType;

import 'api_config.dart';
import 'api_exception.dart';
import 'token_store.dart';

/// JSON over HTTP with the session handled for you: adds the bearer token,
/// refreshes it once on expiry (one refresh shared by concurrent calls),
/// retries, and turns every failure into an [ApiException].
class ApiClient {
  ApiClient({String? baseUrl, http.Client? httpClient, TokenStore? tokens, Map<String, String> defaultHeaders = const {}})
      : _base = baseUrl ?? ApiConfig.restBase,
        _http = httpClient ?? http.Client(),
        tokens = tokens ?? SecureTokenStore(),
        _defaultHeaders = Map.unmodifiable(defaultHeaders);

  final String _base;
  final http.Client _http;
  final TokenStore tokens;

  /// Sent with every request (e.g. `X-App-Store` on store builds).
  final Map<String, String> _defaultHeaders;

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

  /// `multipart/form-data` upload of one file (avatar, selfie). Same session
  /// handling and errors as the JSON calls; the body is rebuilt on retry.
  Future<dynamic> upload(String path, {required String field, required List<int> bytes, required String filename, required String contentType, Map<String, String> fields = const {}}) {
    final type = contentType.split('/');
    return _dispatch(path, () {
      final req = http.MultipartRequest('POST', Uri.parse('$_base$path'))
        ..fields.addAll(fields)
        ..files.add(http.MultipartFile.fromBytes(field, bytes, filename: filename, contentType: MediaType(type.first, type.length > 1 ? type[1] : 'octet-stream')));
      return req;
    }, timeout: const Duration(seconds: 60));
  }

  /// A fresh key for `Idempotency-Key` (one per user action, reused on retry).
  static String newIdempotencyKey() {
    final r = Random.secure();
    return List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  }

  Future<dynamic> _send(String method, String path, {Object? body, Map<String, String>? query, Map<String, String>? headers}) {
    final uri = Uri.parse('$_base$path').replace(queryParameters: query);
    return _dispatch(path, () {
      final req = http.Request(method, uri)..headers.addAll(headers ?? const {});
      if (body != null) {
        req.headers['Content-Type'] = 'application/json';
        req.body = jsonEncode(body);
      }
      return req;
    });
  }

  /// Sends a freshly built request, refreshing the session once on 401.
  Future<dynamic> _dispatch(String path, http.BaseRequest Function() build, {Duration timeout = const Duration(seconds: 20), bool retried = false}) async {
    final req = build();
    req.headers.addAll({..._defaultHeaders, 'Accept': 'application/json', ...req.headers});
    if (_access != null) req.headers['Authorization'] = 'Bearer $_access';
    http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(timeout));
    } on TimeoutException catch (e) {
      throw ApiException.network(e);
    } catch (e) {
      throw ApiException.network(e);
    }
    final decoded = res.body.isEmpty ? null : _tryJson(res.body);
    if (res.statusCode >= 200 && res.statusCode < 300) return decoded;
    final err = ApiException.fromBody(res.statusCode, decoded);
    if (res.statusCode == 401 && !retried && _refresh != null && !path.startsWith('/auth/')) {
      if (await refreshSession()) return _dispatch(path, build, timeout: timeout, retried: true);
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
