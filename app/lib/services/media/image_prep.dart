import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// A photo ready to upload.
class PreparedImage {
  const PreparedImage(this.bytes, this.contentType);
  final Uint8List bytes;
  final String contentType;
}

/// Makes picked photos acceptable to the server (`POST /me/avatar`,
/// `POST /me/verification`: JPEG/PNG/WebP, at most 5 MB). The picker already
/// resizes to ≤ 1600 px at JPEG 85 %; this re-encodes only what still
/// doesn't fit (HEIC that slipped through, huge PNGs, odd formats). Pure
/// Dart, so it can run in an isolate and in tests.
class ImagePrep {
  ImagePrep._();

  static const maxSide = 1600;

  /// Under the server's 5 MB limit with room for the multipart envelope.
  static const maxBytes = 4718592; // 4.5 MB
  static const jpegQuality = 85;

  /// The image type from its magic bytes, or null.
  static String? sniff(Uint8List b) {
    if (b.length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return 'image/jpeg';
    if (b.length >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47) return 'image/png';
    if (b.length >= 12 && b[0] == 0x52 && b[1] == 0x49 && b[2] == 0x46 && b[3] == 0x46 && b[8] == 0x57 && b[9] == 0x45 && b[10] == 0x42 && b[11] == 0x50) return 'image/webp';
    return null;
  }

  /// Returns the bytes unchanged when they already fit, else a ≤ [maxSide]
  /// JPEG. [jpegOnly] forces JPEG (selfies). Throws [FormatException] for
  /// data that isn't an image.
  static PreparedImage prepare(Uint8List bytes, {bool jpegOnly = false}) {
    final type = sniff(bytes);
    final fits = type != null && bytes.length <= maxBytes && (!jpegOnly || type == 'image/jpeg');
    if (fits) return PreparedImage(bytes, type);
    img.Image? decoded;
    try {
      decoded = img.decodeImage(bytes);
    } catch (_) {
      // Truncated / unknown data makes some decoders throw instead of returning null.
    }
    if (decoded == null) throw const FormatException('That file is not a photo we can use. Try a JPEG or PNG.');
    var image = img.bakeOrientation(decoded);
    if (image.width > maxSide || image.height > maxSide) {
      image = image.width >= image.height ? img.copyResize(image, width: maxSide) : img.copyResize(image, height: maxSide);
    }
    var quality = jpegQuality;
    var out = img.encodeJpg(image, quality: quality);
    while (out.length > maxBytes && quality > 40) {
      quality -= 15;
      out = img.encodeJpg(image, quality: quality);
    }
    return PreparedImage(out, 'image/jpeg');
  }
}
