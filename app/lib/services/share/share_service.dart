import 'dart:typed_data';

import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

/// Sharing invites and cards, and opening the partner page. [PlatformShare]
/// uses the system share sheet (share_plus) and url_launcher; tests use
/// [RecordingShare].
abstract class ShareService {
  /// The system share sheet with text. False when it couldn't open.
  Future<bool> shareText(String text, {String? subject});

  /// The system share sheet with a PNG and text.
  Future<bool> shareImage(Uint8List png, String text, {String fileName = 'vibe.png'});

  /// WhatsApp with the text ready to send (the app, else wa.me in the browser).
  Future<bool> whatsApp(String text);

  /// A web page in the browser (the creator partner dashboard).
  Future<bool> openUrl(String url);
}

class PlatformShare implements ShareService {
  const PlatformShare();

  @override
  Future<bool> shareText(String text, {String? subject}) async {
    try {
      final r = await SharePlus.instance.share(ShareParams(text: text, subject: subject));
      return r.status != ShareResultStatus.unavailable;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> shareImage(Uint8List png, String text, {String fileName = 'vibe.png'}) async {
    try {
      final r = await SharePlus.instance.share(ShareParams(text: text, files: [XFile.fromData(png, mimeType: 'image/png', name: fileName)], fileNameOverrides: [fileName]));
      return r.status != ShareResultStatus.unavailable;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> whatsApp(String text) async {
    final q = Uri.encodeComponent(text);
    for (final url in ['whatsapp://send?text=$q', 'https://wa.me/?text=$q']) {
      try {
        if (await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication)) return true;
      } catch (_) {
        // Not installed / no handler: try the next one.
      }
    }
    return false;
  }

  @override
  Future<bool> openUrl(String url) async {
    try {
      return await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }
}

/// Records what would have been shared (tests, and the desktop demo).
class RecordingShare implements ShareService {
  RecordingShare({this.result = true, this.imageResult = true, this.whatsAppInstalled = true});
  bool result;

  /// False: sharing an image fails (old share targets), text still works.
  bool imageResult;
  bool whatsAppInstalled;
  final texts = <String>[];
  final images = <(Uint8List, String)>[];
  final whatsApps = <String>[];
  final urls = <String>[];

  @override
  Future<bool> shareText(String text, {String? subject}) async {
    texts.add(text);
    return result;
  }

  @override
  Future<bool> shareImage(Uint8List png, String text, {String fileName = 'vibe.png'}) async {
    images.add((png, text));
    return result && imageResult;
  }

  @override
  Future<bool> whatsApp(String text) async {
    whatsApps.add(text);
    return whatsAppInstalled;
  }

  @override
  Future<bool> openUrl(String url) async {
    urls.add(url);
    return result;
  }
}
