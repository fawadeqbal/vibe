import 'dart:math' as math;

/// Keeps calls going on weak and expensive connections. Every two seconds the
/// call reads its own stats (how fast we can send, how much is lost, how long
/// a round trip takes), picks a level, and sends video to match it: sharp when
/// the line is good, smaller and slower when it isn't, and none at all when
/// even that won't fit — voice always goes first. Data saver caps the level.
///
/// The same rules are on the web (src/lib/call-quality.ts).
enum CallLevel { audio, poor, fair, good }

/// What the sender does at a level. `video: false` = video paused, voice only.
class SendProfile {
  const SendProfile({required this.video, required this.maxBitrate, required this.maxFramerate, required this.scaleResolutionDownBy});
  final bool video;

  /// Bits per second.
  final int maxBitrate;
  final int maxFramerate;
  final double scaleResolutionDownBy;
}

/// Camera capture (before the encoder scales it down): 480×640 portrait is
/// plenty for a phone screen.
const captureWidth = 480;
const captureHeight = 640;
const captureFrameRate = 24;

/// Voice: Opus at up to 32 kbit/s, with loss recovery (FEC) and near-silence
/// while nobody talks (DTX).
const audioMaxBitrate = 32000;

const profiles = <CallLevel, SendProfile>{
  CallLevel.good: SendProfile(video: true, maxBitrate: 650000, maxFramerate: 24, scaleResolutionDownBy: 1),
  CallLevel.fair: SendProfile(video: true, maxBitrate: 300000, maxFramerate: 15, scaleResolutionDownBy: 1.5),
  CallLevel.poor: SendProfile(video: true, maxBitrate: 120000, maxFramerate: 10, scaleResolutionDownBy: 2),
  CallLevel.audio: SendProfile(video: false, maxBitrate: 0, maxFramerate: 0, scaleResolutionDownBy: 1),
};

/// One reading of the connection (from getStats). Unknown values are null.
class LinkSample {
  const LinkSample({this.availableOutgoingBitrate, this.roundTripTime, this.fractionLost});

  /// What WebRTC thinks we can send, bits per second.
  final double? availableOutgoingBitrate;

  /// Seconds.
  final double? roundTripTime;

  /// 0–1, what the other side reports losing of what we send.
  final double? fractionLost;
}

/// The level this one reading supports (before smoothing).
CallLevel levelFor(LinkSample s) {
  final bw = s.availableOutgoingBitrate;
  final loss = s.fractionLost ?? 0;
  final rtt = s.roundTripTime ?? 0;
  if ((bw != null && bw < 90000) || loss > 0.2 || rtt > 1.5) return CallLevel.audio;
  if ((bw != null && bw < 260000) || loss > 0.1 || rtt > 0.8) return CallLevel.poor;
  if ((bw != null && bw < 650000) || loss > 0.04 || rtt > 0.4) return CallLevel.fair;
  return CallLevel.good;
}

/// Smooths the readings: drops a level after 2 bad readings in a row (about
/// 4 s), climbs one level only after 5 good ones (about 10 s), so video
/// doesn't flap on a shaky line. Data saver never goes above `poor`.
class QualityGovernor {
  QualityGovernor({bool dataSaver = false}) : _dataSaver = dataSaver {
    if (dataSaver) level = CallLevel.poor;
  }

  CallLevel level = CallLevel.good;
  bool _dataSaver;
  int _down = 0;
  int _up = 0;

  void setDataSaver(bool on) {
    _dataSaver = on;
    if (on && level.index > CallLevel.poor.index) level = CallLevel.poor;
  }

  CallLevel get _ceiling => _dataSaver ? CallLevel.poor : CallLevel.good;

  /// Feed one reading; returns the level to send at now.
  CallLevel push(LinkSample s) {
    final seen = CallLevel.values[math.min(levelFor(s).index, _ceiling.index)];
    if (seen.index < level.index) {
      _up = 0;
      if (++_down >= 2) {
        level = seen;
        _down = 0;
      }
    } else if (seen.index > level.index) {
      _down = 0;
      if (++_up >= 5) {
        level = CallLevel.values[level.index + 1];
        _up = 0;
      }
    } else {
      _down = 0;
      _up = 0;
    }
    return level;
  }
}

/// Reads a [LinkSample] out of stats records (`type` + `values`).
LinkSample sampleFrom(Iterable<({String type, Map<dynamic, dynamic> values})> stats) {
  double? bw;
  double? rtt;
  double? lost;
  double? n(Object? v) => v is num ? v.toDouble() : (v is String ? double.tryParse(v) : null);
  for (final r in stats) {
    final v = r.values;
    final chosen = v['nominated'] == true || v['nominated'] == 'true' || v['selected'] == true;
    if (r.type == 'candidate-pair' && chosen && v['state'] == 'succeeded') {
      bw = n(v['availableOutgoingBitrate']) ?? bw;
      rtt = n(v['currentRoundTripTime']) ?? rtt;
    }
    if (r.type == 'remote-inbound-rtp') {
      final f = n(v['fractionLost']);
      if (f != null) lost = math.max(lost ?? 0, f);
    }
  }
  return LinkSample(availableOutgoingBitrate: bw, roundTripTime: rtt, fractionLost: lost);
}

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
