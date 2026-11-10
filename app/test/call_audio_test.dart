import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/services/calls/call_audio.dart';

const ear = AudioOutput(AudioRoute.earpiece, 'earpiece', 'Earpiece');
const speaker = AudioOutput(AudioRoute.speaker, 'speaker', 'Speakerphone');
const buds = AudioOutput(AudioRoute.bluetooth, 'bluetooth', 'Galaxy Buds2');
const wired = AudioOutput(AudioRoute.wired, 'wired-headset', 'Wired Headset');

Future<void> settle() => Future<void>.delayed(Duration.zero);

void main() {
  test('a voice call starts on the earpiece with the screen off at your ear; one tap: speaker, and back', () async {
    final b = MemoryAudioBackend([ear, speaker]);
    final a = CallAudio(b)..sync(live: true, voice: true);
    await settle();
    expect(a.current, ear);
    expect(a.current!.label, 'Phone');
    expect(b.selected, ear);
    expect(b.proximityOn, isTrue);
    expect(a.hasHeadphones, isFalse);

    await a.toggle();
    expect(a.current, speaker);
    expect(a.onSpeaker, isTrue);
    expect(b.proximityOn, isFalse, reason: 'never screen-off on the speaker');
    await a.toggle();
    expect(a.current, ear);
    expect(b.proximityOn, isTrue);

    a.sync(live: false, voice: true);
    await settle();
    expect(a.current, isNull);
    expect(b.proximityOn, isFalse, reason: 'the call ended');
  });

  test('a video call starts on the speaker, no proximity; turning video on in a voice call leaves the earpiece', () async {
    final b = MemoryAudioBackend([ear, speaker]);
    final v = CallAudio(b)..sync(live: true, voice: false);
    await settle();
    expect(v.current, speaker);
    expect(b.proximityOn, isFalse);

    final b2 = MemoryAudioBackend([ear, speaker]);
    final a = CallAudio(b2)..sync(live: true, voice: true);
    await settle();
    expect(a.current, ear);
    a.sync(live: true, voice: false);
    await settle();
    await settle();
    expect(a.current, speaker);
    expect(b2.proximityOn, isFalse);
  });

  test('Bluetooth or headphones take over; when they go, a voice call goes back to the earpiece, never out loud', () async {
    final b = MemoryAudioBackend([ear, speaker, buds]);
    final a = CallAudio(b)..sync(live: true, voice: true);
    await settle();
    expect(a.current, buds);
    expect(a.current!.label, 'Galaxy Buds2');
    expect(a.hasHeadphones, isTrue);
    expect(b.proximityOn, isFalse);

    b.change([ear, speaker]);
    await settle();
    expect(a.current, ear);
    expect(b.proximityOn, isTrue);

    b.change([ear, speaker, wired]);
    await settle();
    expect(a.current, wired, reason: 'headphones plugged in mid-call');
    expect(a.current!.label, 'Headphones');

    await a.choose(speaker);
    expect(a.current, speaker);
    b.change([ear, speaker]);
    await settle();
    expect(a.current, speaker, reason: 'what you chose is still there');
  });

  test('a video call falls back to the speaker when Bluetooth goes', () async {
    final b = MemoryAudioBackend([ear, speaker, buds]);
    final a = CallAudio(b)..sync(live: true, voice: false);
    await settle();
    expect(a.current, buds);
    b.change([ear, speaker]);
    await settle();
    expect(a.current, speaker);
  });

  test('flutter_webrtc outputs map to routes', () {
    expect(WebrtcAudioBackend.routeOf('earpiece', 'Earpiece'), AudioRoute.earpiece);
    expect(WebrtcAudioBackend.routeOf('speaker', 'Speakerphone'), AudioRoute.speaker);
    expect(WebrtcAudioBackend.routeOf('bluetooth', 'Galaxy Buds2'), AudioRoute.bluetooth);
    expect(WebrtcAudioBackend.routeOf('wired-headset', 'Wired Headset'), AudioRoute.wired);
    expect(WebrtcAudioBackend.routeOf('x', 'y'), isNull);
  });
}
