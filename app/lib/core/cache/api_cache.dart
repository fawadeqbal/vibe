import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

/// The last answers to a few GETs (your profile, friends and chats, the
/// newest messages of each chat, wallet, notifications, prices), kept on the
/// phone. The app shows them at once on launch — even offline — and the
/// fresh answer replaces them a moment later. Cleared on sign-out.
///
/// Files under the app's support folder (`api-cache/`), one per key. Tests
/// and the offline demo use [ApiCache.memory].
class ApiCache {
  ApiCache._(this._dir);

  /// On disk (the app).
  factory ApiCache.disk() => ApiCache._(null);

  /// In memory only (tests).
  factory ApiCache.memory() => ApiCache._(null).._memoryOnly = true;

  Directory? _dir;
  bool _memoryOnly = false;
  final Map<String, Object?> _mem = {};

  Future<Directory?> _root() async {
    if (_memoryOnly) return null;
    if (_dir != null) return _dir;
    try {
      final d = Directory('${(await getApplicationSupportDirectory()).path}/api-cache');
      if (!await d.exists()) await d.create(recursive: true);
      return _dir = d;
    } catch (_) {
      _memoryOnly = true; // no disk (web build, a test): memory only
      return null;
    }
  }

  static String _file(String key) => '${key.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_')}.json';

  /// The cached JSON for [key], or null.
  Future<Object?> read(String key) async {
    if (_mem.containsKey(key)) return _mem[key];
    final d = await _root();
    if (d == null) return null;
    try {
      final f = File('${d.path}/${_file(key)}');
      if (!await f.exists()) return null;
      return _mem[key] = jsonDecode(await f.readAsString());
    } catch (e) {
      debugPrint('cache read $key failed: $e');
      return null;
    }
  }

  Future<void> write(String key, Object? json) async {
    _mem[key] = json;
    final d = await _root();
    if (d == null) return;
    try {
      final f = File('${d.path}/${_file(key)}');
      final tmp = File('${f.path}.tmp');
      await tmp.writeAsString(jsonEncode(json), flush: true);
      await tmp.rename(f.path); // never a half-written file
    } catch (e) {
      debugPrint('cache write $key failed: $e');
    }
  }

  /// Everything (sign-out, a different person signing in).
  Future<void> clear() async {
    _mem.clear();
    final d = await _root();
    if (d == null) return;
    try {
      await for (final f in d.list()) {
        await f.delete();
      }
    } catch (_) {}
  }
}
