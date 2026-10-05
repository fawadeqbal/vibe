import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';

import 'image_prep.dart';

/// Camera / gallery for the profile photo and the verification selfie.
abstract class MediaPicker {
  bool get available;

  /// Null when the person backed out. Throws [FormatException] for unusable files.
  Future<PreparedImage?> pickPhoto({required bool camera});

  /// Front camera, always a JPEG.
  Future<PreparedImage?> takeSelfie();
}

class NoMediaPicker implements MediaPicker {
  const NoMediaPicker();
  @override
  bool get available => false;
  @override
  Future<PreparedImage?> pickPhoto({required bool camera}) async => null;
  @override
  Future<PreparedImage?> takeSelfie() async => null;
}

/// `image_picker`, resized on the device (≤ 1600 px, JPEG 85 %) and checked
/// against the server's limits in a background isolate.
class DeviceMediaPicker implements MediaPicker {
  DeviceMediaPicker([ImagePicker? picker]) : _picker = picker ?? ImagePicker();
  final ImagePicker _picker;

  @override
  bool get available => true;

  @override
  Future<PreparedImage?> pickPhoto({required bool camera}) => _pick(camera ? ImageSource.camera : ImageSource.gallery, CameraDevice.rear, jpegOnly: false);

  @override
  Future<PreparedImage?> takeSelfie() => _pick(ImageSource.camera, CameraDevice.front, jpegOnly: true);

  Future<PreparedImage?> _pick(ImageSource source, CameraDevice camera, {required bool jpegOnly}) async {
    final file = await _picker.pickImage(
      source: source,
      preferredCameraDevice: camera,
      maxWidth: ImagePrep.maxSide.toDouble(),
      maxHeight: ImagePrep.maxSide.toDouble(),
      imageQuality: ImagePrep.jpegQuality,
      requestFullMetadata: false,
    );
    if (file == null) return null;
    final bytes = await file.readAsBytes();
    return compute(_prepare, (bytes, jpegOnly));
  }
}

PreparedImage _prepare((Uint8List, bool) a) => ImagePrep.prepare(a.$1, jpegOnly: a.$2);
