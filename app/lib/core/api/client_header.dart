import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// "android/0.1.5" or "ios/1.0.0": which app (and version) is calling, for
/// the server's app-vs-web numbers.
Future<String> clientHeader() async {
  final os = defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
  try {
    final v = (await PackageInfo.fromPlatform()).version;
    return v.isEmpty ? os : '$os/$v';
  } catch (_) {
    return os;
  }
}

/// The phone's name for Settings → Devices ("Samsung SM-A515F · Android 13"),
/// URL-encoded for the X-Device header (headers are Latin-1). Null when the
/// platform can't tell (tests, iOS for now).
Future<String?> deviceHeader() async {
  if (defaultTargetPlatform != TargetPlatform.android) return null;
  try {
    final name = await const MethodChannel('vibe/device').invokeMethod<String>('name');
    return name == null || name.trim().isEmpty ? null : Uri.encodeComponent(name.trim());
  } catch (_) {
    return null;
  }
}
