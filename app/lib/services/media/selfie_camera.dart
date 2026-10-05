import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'image_prep.dart';

/// The live front camera for the selfie check: a preview to show and single
/// JPEG frames to send. Frames are the camera's own view (not mirrored); only
/// the preview is mirrored, like a mirror.
abstract class SelfieCamera {
  bool get available;

  /// Opens the camera, or borrows [shared] (the match screen's open front camera)
  /// so a phone's camera is never opened twice. Throws if it can't open.
  Future<SelfieCameraSession> open({MediaStream? shared});
}

abstract class SelfieCameraSession {
  Widget preview();

  /// One upright JPEG (≤ 1600 px), or null if the camera stopped.
  Future<List<int>?> grab();

  /// Stops the camera (a borrowed one keeps running).
  Future<void> close();
}

class NoSelfieCamera implements SelfieCamera {
  const NoSelfieCamera();
  @override
  bool get available => false;
  @override
  Future<SelfieCameraSession> open({MediaStream? shared}) => throw UnsupportedError('No camera');
}

/// flutter_webrtc: the same camera stack as calls. `captureFrame` hands back an
/// upright frame (JPEG on Android, PNG on iOS); it is re-encoded as JPEG off the UI thread.
class WebRtcSelfieCamera implements SelfieCamera {
  const WebRtcSelfieCamera();

  @override
  bool get available => true;

  @override
  Future<SelfieCameraSession> open({MediaStream? shared}) async {
    final owned = shared == null;
    final stream = shared ??
        await navigator.mediaDevices.getUserMedia({
          'audio': false,
          'video': {'facingMode': 'user', 'width': 1280, 'height': 960},
        });
    final renderer = RTCVideoRenderer();
    await renderer.initialize();
    renderer.srcObject = stream;
    return _WebRtcSession(stream, renderer, owned: owned);
  }
}

class _WebRtcSession implements SelfieCameraSession {
  _WebRtcSession(this._stream, this._renderer, {required this.owned});
  final MediaStream _stream;
  final RTCVideoRenderer _renderer;
  final bool owned;

  @override
  Widget preview() => RTCVideoView(_renderer, mirror: true, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover);

  @override
  Future<List<int>?> grab() async {
    final tracks = _stream.getVideoTracks();
    if (tracks.isEmpty) return null;
    final raw = (await tracks.first.captureFrame()).asUint8List();
    final prepared = await compute(_prepare, raw);
    return prepared.bytes;
  }

  @override
  Future<void> close() async {
    _renderer.srcObject = null;
    await _renderer.dispose();
    if (owned) {
      for (final t in _stream.getTracks()) {
        await t.stop();
      }
      await _stream.dispose();
    }
  }
}

PreparedImage _prepare(Uint8List bytes) => ImagePrep.prepare(bytes, jpegOnly: true);
