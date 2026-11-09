import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

/// The public website (`--dart-define=SITE_URL=…`). Legal pages live there
/// (/terms/, /privacy/, /guidelines/, /child-safety/), edited in admin → Legal pages.
const String kSiteUrl = String.fromEnvironment('SITE_URL', defaultValue: 'https://vibe.fawadiqbal.dev');

enum LegalPage { terms, privacy, guidelines, childSafety }

Uri legalUri(LegalPage p) => Uri.parse('$kSiteUrl/${switch (p) {
      LegalPage.terms => 'terms',
      LegalPage.privacy => 'privacy',
      LegalPage.guidelines => 'guidelines',
      LegalPage.childSafety => 'child-safety',
    }}/');

/// Opens the page in the browser (in-app browser tab where available).
Future<bool> openLegal(LegalPage p) async {
  try {
    return await launchUrl(legalUri(p), mode: kIsWeb ? LaunchMode.platformDefault : LaunchMode.inAppBrowserView);
  } catch (_) {
    return false;
  }
}
