import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/services/calls/call_quality.dart';

const good = LinkSample(availableOutgoingBitrate: 2000000, roundTripTime: 0.05, fractionLost: 0);
const weak = LinkSample(availableOutgoingBitrate: 200000, roundTripTime: 0.3, fractionLost: 0.02);
const awful = LinkSample(availableOutgoingBitrate: 60000, roundTripTime: 2, fractionLost: 0.3);

void main() {
  test('picks a level from bandwidth, loss and round trip (same rules as the web)', () {
    expect(levelFor(good), CallLevel.good);
    expect(levelFor(const LinkSample(availableOutgoingBitrate: 400000)), CallLevel.fair);
    expect(levelFor(weak), CallLevel.poor);
    expect(levelFor(const LinkSample(availableOutgoingBitrate: 2000000, fractionLost: 0.12)), CallLevel.poor);
    expect(levelFor(awful), CallLevel.audio);
    expect(levelFor(const LinkSample()), CallLevel.good);
    expect(profiles[CallLevel.audio]!.video, isFalse);
  });

  test('drops fast, climbs slowly, one level at a time', () {
    final g = QualityGovernor();
    expect(g.push(awful), CallLevel.good);
    expect(g.push(awful), CallLevel.audio);
    for (var i = 0; i < 4; i++) {
      expect(g.push(good), CallLevel.audio);
    }
    expect(g.push(good), CallLevel.poor);
    for (var i = 0; i < 5; i++) {
      g.push(good);
    }
    expect(g.level, CallLevel.fair);
  });

  test('data saver never sends more than the poor-line profile', () {
    final g = QualityGovernor(dataSaver: true);
    expect(g.level, CallLevel.poor);
    for (var i = 0; i < 20; i++) {
      g.push(good);
    }
    expect(g.level, CallLevel.poor);
    final h = QualityGovernor()..setDataSaver(true);
    expect(h.level, CallLevel.poor);
  });

  test('reads the selected pair and the loss the other side reports (Android stats)', () {
    final s = sampleFrom([
      (type: 'candidate-pair', values: {'nominated': true, 'state': 'succeeded', 'availableOutgoingBitrate': 300000.0, 'currentRoundTripTime': 0.12}),
      (type: 'candidate-pair', values: {'nominated': false, 'state': 'waiting', 'availableOutgoingBitrate': 9.0}),
      (type: 'remote-inbound-rtp', values: {'kind': 'audio', 'fractionLost': 0.01}),
      (type: 'remote-inbound-rtp', values: {'kind': 'video', 'fractionLost': 0.06}),
    ]);
    expect(s.availableOutgoingBitrate, 300000);
    expect(s.roundTripTime, 0.12);
    expect(s.fractionLost, 0.06);
  });

  test('tunes Opus for loss and silence', () {
    const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111 63\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1\r\na=rtpmap:63 red/48000/2\r\n';
    final out = tuneOpus(sdp);
    expect(out, contains('a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1;stereo=0;maxaveragebitrate=32000\r\n'));
    expect(out, contains('a=rtpmap:63 red/48000/2'));
    expect(tuneOpus('a=rtpmap:109 opus/48000/2\r\nx'), 'a=rtpmap:109 opus/48000/2\r\na=fmtp:109 useinbandfec=1;usedtx=1;stereo=0;maxaveragebitrate=32000\r\nx');
    expect(tuneOpus('no audio'), 'no audio');
  });
}
