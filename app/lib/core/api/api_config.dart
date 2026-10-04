/// Where the Vibe API lives. Set at build time:
///
///   flutter run --dart-define=VIBE_API=http://10.0.2.2:3000
///
/// (10.0.2.2 is the host machine from the Android emulator; use your PC's
/// LAN IP from a real phone.) Without it the app runs fully offline on the
/// built-in mock, exactly as before.
class ApiConfig {
  ApiConfig._();

  static const String baseUrl = String.fromEnvironment('VIBE_API');

  static bool get enabled => baseUrl.isNotEmpty;

  /// Testing the TURN relay: `--dart-define=VIBE_FORCE_RELAY=true` makes
  /// every call go through TURN, even on the same Wi-Fi. If calls still
  /// connect, the relay works. Never ship a store build with this on.
  static const bool forceRelay = bool.fromEnvironment('VIBE_FORCE_RELAY');

  /// REST lives under /v1; sockets connect to the root.
  static String get restBase => '${baseUrl.replaceAll(RegExp(r'/+$'), '')}/v1';
  static String get socketUrl => baseUrl.replaceAll(RegExp(r'/+$'), '');
}
