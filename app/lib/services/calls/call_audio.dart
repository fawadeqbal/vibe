import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:vibe_calls/vibe_calls.dart';

/// Where a call's sound plays.
enum AudioRoute { earpiece, speaker, bluetooth, wired }

/// One place the call can play through: its kind, the id to select it, and a name ("Galaxy Buds2").
@immutable
class AudioOutput {
  const AudioOutput(this.route, this.id, this.name);
  final AudioRoute route;
  final String id;
  final String name;

  /// What the button and the list say.
  String get label => switch (route) {
    AudioRoute.earpiece => 'Phone',
    AudioRoute.speaker => 'Speaker',
    AudioRoute.wired => 'Headphones',
    AudioRoute.bluetooth => name.trim().isEmpty ? 'Bluetooth' : name.trim(),
  };

  /// The line under it in the list.
  String get detail => switch (route) {
    AudioRoute.earpiece => 'Hold it to your ear',
    AudioRoute.speaker => 'Out loud',
    AudioRoute.wired => 'Wired',
    AudioRoute.bluetooth => 'Bluetooth',
  };

  @override
  bool operator ==(Object other) => other is AudioOutput && other.route == route && other.id == id;
  @override
  int get hashCode => Object.hash(route, id);
}

/// What [CallAudio] drives: the phone's outputs and the proximity sensor.
abstract class AudioBackend {
  Future<List<AudioOutput>> outputs();
  Future<void> select(AudioOutput o);

  /// Called when headphones or Bluetooth connect or disconnect.
  set onChange(VoidCallback? f);

  /// Screen off at your ear (only asked for on the earpiece in a voice call).
  Future<void> proximity(bool on);
}

/// The call's sound, like a phone call (the design: "Call audio on the phone app"):
///
/// * voice calls start on the earpiece, video calls on the speaker;
/// * Bluetooth or wired headphones take over when they're there or connect;
/// * when they disconnect it goes back to the earpiece in a voice call (never
///   suddenly out loud), the speaker in a video call;
/// * one tap switches earpiece ⇄ speaker; with headphones around the button
///   opens the list ([choose]);
/// * on the earpiece in a voice call the screen turns off at your ear.
class CallAudio extends ChangeNotifier {
  CallAudio([AudioBackend? backend]) : _backend = backend ?? WebrtcAudioBackend();

  final AudioBackend _backend;
  List<AudioOutput> _outputs = const [];
  AudioOutput? _current;
  bool _live = false;
  bool _voice = false;
  bool _proximity = false;

  /// Where it plays now (null outside a call).
  AudioOutput? get current => _current;
  List<AudioOutput> get outputs => _outputs;

  /// Headphones or Bluetooth are there: the button opens the list instead of toggling.
  bool get hasHeadphones => _outputs.any((o) => o.route == AudioRoute.bluetooth || o.route == AudioRoute.wired);

  bool get onSpeaker => _current?.route == AudioRoute.speaker;

  /// Follows the call: [live] while connected, [voice] while it's voice only. Cheap to call often.
  void sync({required bool live, required bool voice}) {
    if (live && !_live) {
      _live = true;
      _voice = voice;
      unawaited(_start());
    } else if (live && voice != _voice) {
      _voice = voice;
      unawaited(_modeChanged());
    } else if (!live && _live) {
      _live = false;
      _current = null;
      _backend.onChange = null;
      unawaited(_setProximity());
    }
  }

  Future<void> _start() async {
    _backend.onChange = () => unawaited(_devicesChanged());
    _outputs = await _list();
    await _use(_preferred());
  }

  /// Voice → video: off the earpiece onto the speaker (you're looking at the screen now). Video → voice: stays.
  Future<void> _modeChanged() async {
    await Future<void>.value(); // never inside the caller's notify
    if (!_voice && _current?.route == AudioRoute.earpiece) {
      final s = _find(AudioRoute.speaker);
      if (s != null) await _use(s);
    }
    await _setProximity();
    notifyListeners();
  }

  /// One tap: earpiece ⇄ speaker (from headphones: the speaker).
  Future<void> toggle() async {
    if (!_live) return;
    final next = onSpeaker ? (_find(AudioRoute.earpiece) ?? _find(AudioRoute.speaker)) : _find(AudioRoute.speaker);
    if (next != null) await _use(next);
  }

  Future<void> choose(AudioOutput o) => _use(o);

  Future<void> _devicesChanged() async {
    if (!_live) return;
    final before = _outputs;
    _outputs = await _list();
    final arrived = _outputs.where((o) => (o.route == AudioRoute.bluetooth || o.route == AudioRoute.wired) && !before.contains(o)).toList();
    if (arrived.isNotEmpty) {
      // Headphones just connected: the call moves to them.
      await _use(arrived.last);
    } else if (_current != null && !_outputs.contains(_current)) {
      // What it played through is gone: headphones if any, else the earpiece in a voice call.
      await _use(_preferred());
    } else {
      notifyListeners();
    }
  }

  AudioOutput? _find(AudioRoute r) {
    for (final o in _outputs) {
      if (o.route == r) return o;
    }
    return null;
  }

  AudioOutput? _preferred() =>
      _find(AudioRoute.bluetooth) ?? _find(AudioRoute.wired) ?? (_voice ? (_find(AudioRoute.earpiece) ?? _find(AudioRoute.speaker)) : (_find(AudioRoute.speaker) ?? _find(AudioRoute.earpiece)));

  Future<void> _use(AudioOutput? o) async {
    if (o == null || !_live) return;
    _current = o;
    notifyListeners();
    try {
      await _backend.select(o);
    } catch (_) {}
    await _setProximity();
  }

  Future<void> _setProximity() async {
    final on = _live && _voice && _current?.route == AudioRoute.earpiece;
    if (on == _proximity) return;
    _proximity = on;
    try {
      await _backend.proximity(on);
    } catch (_) {}
  }

  Future<List<AudioOutput>> _list() async {
    try {
      final l = await _backend.outputs();
      if (l.isNotEmpty) return l;
    } catch (_) {}
    // Nothing listed (an emulator, a test): the two every phone has.
    return const [AudioOutput(AudioRoute.earpiece, 'earpiece', 'Earpiece'), AudioOutput(AudioRoute.speaker, 'speaker', 'Speaker')];
  }

  @override
  void dispose() {
    _backend.onChange = null;
    if (_proximity) unawaited(_backend.proximity(false).catchError((_) {}));
    super.dispose();
  }
}

/// The real phone: flutter_webrtc's outputs (Android ids: earpiece, speaker,
/// bluetooth, wired-headset) and the proximity sensor (packages/vibe_calls).
class WebrtcAudioBackend implements AudioBackend {
  static AudioRoute? routeOf(String id, String label) {
    final s = '$id $label'.toLowerCase();
    if (s.contains('bluetooth')) return AudioRoute.bluetooth;
    if (s.contains('wired') || s.contains('headset') || s.contains('headphone')) return AudioRoute.wired;
    if (s.contains('speaker')) return AudioRoute.speaker;
    if (s.contains('earpiece') || s.contains('receiver')) return AudioRoute.earpiece;
    return null;
  }

  @override
  Future<List<AudioOutput>> outputs() async {
    final out = <AudioOutput>[];
    for (final d in await Helper.audiooutputs) {
      final r = routeOf(d.deviceId, d.label);
      if (r != null) out.add(AudioOutput(r, d.deviceId, d.label));
    }
    return out;
  }

  @override
  Future<void> select(AudioOutput o) async {
    if (defaultTargetPlatform == TargetPlatform.android) {
      await Helper.selectAudioOutput(o.id);
    } else {
      await Helper.setSpeakerphoneOn(o.route == AudioRoute.speaker);
    }
  }

  @override
  set onChange(VoidCallback? f) {
    try {
      navigator.mediaDevices.ondevicechange = f == null ? null : (_) => f();
    } catch (_) {}
  }

  @override
  Future<void> proximity(bool on) => VibeCalls.proximity(on);
}

/// No real audio (the offline demo, tests): the outputs it's given, and what was asked of it.
class MemoryAudioBackend implements AudioBackend {
  MemoryAudioBackend([List<AudioOutput>? outputs]) : list = outputs ?? [const AudioOutput(AudioRoute.earpiece, 'earpiece', 'Earpiece'), const AudioOutput(AudioRoute.speaker, 'speaker', 'Speaker')];

  List<AudioOutput> list;
  AudioOutput? selected;
  bool proximityOn = false;
  VoidCallback? _change;

  /// Headphones connected or disconnected.
  void change(List<AudioOutput> now) {
    list = now;
    _change?.call();
  }

  @override
  Future<List<AudioOutput>> outputs() async => List.of(list);

  @override
  Future<void> select(AudioOutput o) async => selected = o;

  @override
  set onChange(VoidCallback? f) => _change = f;

  @override
  Future<void> proximity(bool on) async => proximityOn = on;
}
