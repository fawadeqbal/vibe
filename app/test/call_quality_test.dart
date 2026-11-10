import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/services/calls/call_quality.dart';

void main() {
  test('only a ceiling on video: lower with Data saver, never zero (same as the web)', () {
    expect(videoCeiling(dataSaver: false), videoMaxBitrate);
    expect(videoCeiling(dataSaver: true), videoMaxBitrateSaver);
    expect(videoMaxBitrateSaver, greaterThan(0));
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
