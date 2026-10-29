import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:record/record.dart';

/// A recorded voice note, ready to upload.
class VoiceClip {
  const VoiceClip(this.bytes, this.seconds, {this.contentType = 'audio/mp4'});
  final Uint8List bytes;
  final int seconds;
  final String contentType;
}

/// The microphone for voice notes in chats.
abstract class VoiceRecorder {
  bool get available;

  /// False when the mic is not allowed.
  Future<bool> start();

  /// The note, or null when it was too short to keep.
  Future<VoiceClip?> stop();
  Future<void> cancel();
}

class NoVoiceRecorder implements VoiceRecorder {
  const NoVoiceRecorder();
  @override
  bool get available => false;
  @override
  Future<bool> start() async => false;
  @override
  Future<VoiceClip?> stop() async => null;
  @override
  Future<void> cancel() async {}
}

/// `record`: AAC in an .m4a (plays on Android, iOS and in browsers).
class DeviceVoiceRecorder implements VoiceRecorder {
  DeviceVoiceRecorder();
  AudioRecorder? _rec;
  DateTime? _started;

  @override
  bool get available => true;

  @override
  Future<bool> start() async {
    final rec = _rec ??= AudioRecorder();
    if (!await rec.hasPermission()) return false;
    final path = '${Directory.systemTemp.path}/vibe_voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
    await rec.start(const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 64000, sampleRate: 44100, numChannels: 1), path: path);
    _started = DateTime.now();
    return true;
  }

  @override
  Future<VoiceClip?> stop() async {
    final rec = _rec;
    final started = _started;
    _started = null;
    if (rec == null || started == null) return null;
    final path = await rec.stop();
    if (path == null) return null;
    final file = File(path);
    final ms = DateTime.now().difference(started).inMilliseconds;
    try {
      if (ms < 700) return null;
      return VoiceClip(await file.readAsBytes(), (ms / 1000).ceil());
    } finally {
      file.delete().ignore();
    }
  }

  @override
  Future<void> cancel() async {
    _started = null;
    try {
      await _rec?.cancel();
    } catch (_) {}
  }
}
