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

  /// The public site (landing page). Invite links are `<siteUrl>/i/<code>`.
  /// Override with `--dart-define=VIBE_SITE_URL=https://...`.
  static const String siteUrl = String.fromEnvironment('VIBE_SITE_URL', defaultValue: 'https://vibe.fawadiqbal.dev');

  /// The web app (the creator partner dashboard is also at `<webAppUrl>/partner`;
  /// the app has its own partner screen). Override with `--dart-define=VIBE_WEB_URL=https://...`.
  static const String webAppUrl = String.fromEnvironment('VIBE_WEB_URL', defaultValue: 'https://app.vibe.fawadiqbal.dev');

  static String get partnerUrl => '${webAppUrl.replaceAll(RegExp(r'/+$'), '')}/partner';

  /// `https://vibe.fawadiqbal.dev/i/<CODE>` — the share link before
  /// `GET /referrals` answers (the server sends the canonical one).
  static String inviteLink(String code) => '${siteUrl.replaceAll(RegExp(r'/+$'), '')}/i/$code';

  /// Testing the TURN relay: `--dart-define=VIBE_FORCE_RELAY=true` makes
  /// every call go through TURN, even on the same Wi-Fi. If calls still
  /// connect, the relay works. Never ship a store build with this on.
  static const bool forceRelay = bool.fromEnvironment('VIBE_FORCE_RELAY');

  /// REST lives under /v1; sockets connect to the root.
  static String get restBase => '${baseUrl.replaceAll(RegExp(r'/+$'), '')}/v1';
  static String get socketUrl => baseUrl.replaceAll(RegExp(r'/+$'), '');
}
