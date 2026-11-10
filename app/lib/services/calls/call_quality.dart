/// Calls on weak and expensive connections, the simple way (like WhatsApp):
/// video never pauses. WebRTC's own congestion control already lowers the
/// resolution and frame rate when the line gets worse and raises them again
/// when it recovers; we only set a ceiling (lower with Data saver) and let
/// voice go first. No stats polling, no levels.
///
/// The same numbers are on the web (src/lib/call-quality.ts).
library;

/// Camera capture (before the encoder scales it down): 480×640 portrait is
/// plenty for a phone screen.
const captureWidth = 480;
const captureHeight = 640;
const captureFrameRate = 24;

/// Voice: Opus at up to 32 kbit/s, with loss recovery (FEC) and near-silence
/// while nobody talks (DTX).
const audioMaxBitrate = 32000;

/// The most video we send, bits per second. WebRTC goes lower by itself whenever the line needs it.
const videoMaxBitrate = 700000;

/// With Data saver on: about a third of the data, still moving video.
const videoMaxBitrateSaver = 250000;

int videoCeiling({required bool dataSaver}) => dataSaver ? videoMaxBitrateSaver : videoMaxBitrate;

/// Opus tuned for weak lines: in-band FEC (rebuilds lost packets), DTX
/// (almost nothing sent while you're quiet), mono, capped bitrate.
String tuneOpus(String sdp) {
  final pt = RegExp(r'a=rtpmap:(\d+) opus/48000', caseSensitive: false).firstMatch(sdp)?.group(1);
  if (pt == null) return sdp;
  const want = {'useinbandfec': '1', 'usedtx': '1', 'stereo': '0', 'maxaveragebitrate': '$audioMaxBitrate'};
  final line = RegExp('^a=fmtp:$pt (.*)\$', multiLine: true);
  final m = line.firstMatch(sdp);
  if (m == null) {
    final rtpmap = RegExp('^(a=rtpmap:$pt opus/48000[^\\r\\n]*)', multiLine: true);
    return sdp.replaceFirstMapped(rtpmap, (x) => '${x[1]}\r\na=fmtp:$pt ${want.entries.map((e) => '${e.key}=${e.value}').join(';')}');
  }
  final params = <String, String>{};
  for (final kv in m[1]!.trim().split(';').where((s) => s.isNotEmpty)) {
    final i = kv.indexOf('=');
    if (i > 0) params[kv.substring(0, i)] = kv.substring(i + 1);
  }
  params.addAll(want);
  return sdp.replaceFirst(line, 'a=fmtp:$pt ${params.entries.map((e) => '${e.key}=${e.value}').join(';')}');
}
