import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/core/config/legal_links.dart';

void main() {
  test('legal pages point at the website pages edited in admin', () {
    expect(legalUri(LegalPage.terms).toString(), '$kSiteUrl/terms/');
    expect(legalUri(LegalPage.privacy).toString(), '$kSiteUrl/privacy/');
    expect(legalUri(LegalPage.guidelines).toString(), '$kSiteUrl/guidelines/');
    expect(legalUri(LegalPage.childSafety).toString(), '$kSiteUrl/child-safety/');
  });
}
