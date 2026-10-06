import 'package:flutter/foundation.dart';

import '../../core/api/api_config.dart';

/// How an invite code reached this phone (`inviteVia` on sign-up).
enum InviteVia {
  /// A tapped link: `vibe://invite?code=` or `https://…/i/<code>`.
  link,

  /// The Play Store install referrer (`vibe_ref=…&utm_source=…`).
  install;

  String get wire => name;

  static InviteVia parse(Object? v) => v == 'install' ? install : link;
}

/// An invite code captured before sign-up, kept until the account exists.
@immutable
class CapturedInvite {
  const CapturedInvite({required this.code, this.source, this.via = InviteVia.link, required this.at});

  /// Upper-case, `[A-Z0-9_]{3,20}`.
  final String code;

  /// The link's `s` / `utm_source` (`whatsapp`, `tiktok`…), lower-case.
  final String? source;
  final InviteVia via;
  final DateTime at;

  /// Codes older than this are dropped (same window as the web app).
  static const maxAge = Duration(days: 30);

  bool expiredAt(DateTime now) => now.difference(at) > maxAge;

  /// The sign-up body fields (`POST /auth/otp/verify`, `POST /auth/social`).
  Map<String, String> toSignUp() => {'inviteCode': code, if (source != null) 'inviteSource': source!, 'inviteVia': via.wire};

  Map<String, dynamic> toJson() => {'code': code, if (source != null) 'source': source, 'via': via.wire, 'at': at.toUtc().toIso8601String()};

  static CapturedInvite? fromJson(Object? v) {
    if (v is! Map) return null;
    final code = InviteLinks.normalizeCode(v['code']);
    if (code == null) return null;
    return CapturedInvite(code: code, source: InviteLinks.normalizeSource(v['source']), via: InviteVia.parse(v['via']), at: DateTime.tryParse('${v['at']}') ?? DateTime.now());
  }

  @override
  bool operator ==(Object other) => other is CapturedInvite && other.code == code && other.source == source && other.via == via;
  @override
  int get hashCode => Object.hash(code, source, via);
  @override
  String toString() => 'CapturedInvite($code, ${source ?? '-'}, ${via.wire})';
}

/// Pure parsing for the ways an invite code arrives. No plugins, so it is
/// unit-tested directly.
class InviteLinks {
  InviteLinks._();

  static final _code = RegExp(r'^[A-Za-z0-9_]{3,20}$');
  static final _source = RegExp(r'^[a-z0-9_-]{1,24}$');

  /// Upper-cased code, or null when it isn't one (server rule `^[A-Za-z0-9_]{3,20}$`).
  static String? normalizeCode(Object? v) {
    if (v is! String) return null;
    final t = v.trim();
    return _code.hasMatch(t) ? t.toUpperCase() : null;
  }

  /// Trimmed, lower-cased source, or null when it isn't valid
  /// (server rule `^[a-z0-9_-]{1,24}$` — anything else would be a 400).
  static String? normalizeSource(Object? v) {
    if (v is! String) return null;
    final t = v.trim().toLowerCase();
    return _source.hasMatch(t) ? t : null;
  }

  /// The Play install referrer string: `vibe_ref=CODE&utm_source=tiktok`.
  /// Organic installs (`utm_source=google-play&utm_medium=organic`) and
  /// anything without a valid `vibe_ref` give null. Handles the string
  /// arriving URL-encoded once more (`vibe_ref%3DCODE%26utm_source%3D…`).
  static CapturedInvite? parseInstallReferrer(String? referrer, {DateTime? now}) {
    if (referrer == null) return null;
    var raw = referrer.trim();
    if (raw.isEmpty) return null;
    // Some paths hand over the whole thing encoded (no '=' left in clear).
    for (var i = 0; i < 2 && !raw.contains('=') && raw.contains('%'); i++) {
      try {
        raw = Uri.decodeComponent(raw);
      } catch (_) {
        return null;
      }
    }
    if (raw.startsWith('?')) raw = raw.substring(1);
    final Map<String, String> params;
    try {
      params = Uri.splitQueryString(raw);
    } catch (_) {
      return null;
    }
    final code = normalizeCode(params['vibe_ref']);
    if (code == null) return null;
    return CapturedInvite(code: code, source: normalizeSource(params['utm_source']), via: InviteVia.install, at: now ?? DateTime.now());
  }

  /// `vibe://invite?code=CODE[&s=src]` or `https://<site>/i/CODE[?s=src]`
  /// (the landing host, with or without `www.`). Null for any other link
  /// (payment returns, other pages).
  static CapturedInvite? parseLink(Uri uri, {DateTime? now, String siteUrl = ApiConfig.siteUrl}) {
    String? code;
    if (uri.scheme == 'vibe') {
      final target = uri.host.isNotEmpty ? uri.host : uri.path.replaceAll('/', '');
      if (target != 'invite') return null;
      code = uri.queryParameters['code'];
    } else if (uri.scheme == 'https' || uri.scheme == 'http') {
      final site = Uri.tryParse(siteUrl);
      final host = uri.host.toLowerCase().replaceFirst(RegExp(r'^www\.'), '');
      final siteHost = (site?.host ?? '').toLowerCase().replaceFirst(RegExp(r'^www\.'), '');
      if (siteHost.isEmpty || host != siteHost) return null;
      final seg = uri.pathSegments.where((s) => s.isNotEmpty).toList();
      if (seg.length != 2 || seg[0] != 'i') return null;
      code = seg[1];
    } else {
      return null;
    }
    final c = normalizeCode(code);
    if (c == null) return null;
    return CapturedInvite(code: c, source: normalizeSource(uri.queryParameters['s']), via: InviteVia.link, at: now ?? DateTime.now());
  }

  /// A device id the server accepts (`^[A-Za-z0-9._:-]{8,128}$`).
  static bool validDeviceId(String? id) => id != null && RegExp(r'^[A-Za-z0-9._:-]{8,128}$').hasMatch(id);
}
