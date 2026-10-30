import 'package:flutter/foundation.dart';
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
