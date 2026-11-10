import 'calls.dart';
import 'models.dart';

/// Friend calls, the app side of the server's state machine (backend:
/// calls.service.ts; the design: "Calls: one state machine on the server").
/// The server owns every call and sends `call:state` with the whole
/// snapshot on each move; this keeps the newest and works out what this
/// device shows. Pure, so every state is tested.
/// (web: features/calls/call-machine.ts)
enum CallStatus { ringing, connecting, live, ended }

enum CallEndReason { unavailable, busy, cancelled, declined, noAnswer, gone, failed, hungUp, dropped, turnedOff }

const _reasons = {
  'unavailable': CallEndReason.unavailable,
  'busy': CallEndReason.busy,
  'cancelled': CallEndReason.cancelled,
  'declined': CallEndReason.declined,
  'no_answer': CallEndReason.noAnswer,
  'gone': CallEndReason.gone,
  'failed': CallEndReason.failed,
  'hung_up': CallEndReason.hungUp,
  'dropped': CallEndReason.dropped,
  'turned_off': CallEndReason.turnedOff,
};

/// One call as the server sees it right now.
class CallSnap {
  const CallSnap({
    required this.callId,
    required this.state,
    required this.version,
    required this.media,
    required this.from,
    required this.to,
    required this.expiresAt,
    this.reason,
    this.reached = false,
    this.answeredBy,
    this.matchId,
    this.reply,
  });

  final String callId;
  final CallStatus state;
  final CallEndReason? reason;
  final int version;
  final CallMedia media;
  final Profile from;
  final Profile to;
  final bool reached;
  final String? answeredBy;
  final String? matchId;
  final String? reply;
  final DateTime expiresAt;

  /// A `call:state` payload (or a REST reply); null if it isn't one.
  static CallSnap? parse(Map<String, dynamic> m, Profile Function(Map<String, dynamic>) profile) {
    final state = CallStatus.values.where((s) => s.name == m['state']).firstOrNull;
    final from = m['from'], to = m['to'];
    if (m['callId'] is! String || state == null || from is! Map || to is! Map) return null;
    return CallSnap(
      callId: m['callId'] as String,
      state: state,
      reason: _reasons[m['reason']],
      version: m['version'] is int ? m['version'] as int : 0,
      media: m['media'] == 'voice' ? CallMedia.voice : CallMedia.video,
      from: profile(Map<String, dynamic>.from(from)),
      to: profile(Map<String, dynamic>.from(to)),
      reached: m['reached'] == true,
      answeredBy: m['answeredBy'] as String?,
      matchId: m['matchId'] as String?,
      reply: m['reply'] as String?,
      expiresAt: DateTime.tryParse('${m['expiresAt']}') ?? DateTime.now(),
    );
  }

  /// Take [next] over [cur]: another call, or a newer version of this one.
  static bool isNewer(CallSnap? cur, CallSnap next) => cur == null || cur.callId != next.callId || next.version > cur.version;

  bool get active => state == CallStatus.ringing || state == CallStatus.connecting;
}

/// For the person called, after the ring: why it stopped.
enum NoticeKind { hungUp, elsewhere, over, failed }

class CallNotice {
  const CallNotice({required this.callId, required this.kind, required this.from, required this.media});
  final String callId;
  final NoticeKind kind;
  final Profile from;
  final CallMedia media;
}

/// What one device shows for a snapshot.
class CallView {
  const CallView({this.incoming, this.outgoing, this.notice});
  final IncomingCall? incoming;
  final OutgoingCall? outgoing;
  final CallNotice? notice;
}

/// [me]: the signed-in user · [device]: this device's id · [acceptTried]:
/// this device pressed Accept on this call.
CallView callViewOf(CallSnap c, String me, String device, {bool acceptTried = false}) {
  const none = CallView();
  if (c.from.id == me) {
    CallView out(OutgoingStatus s) => CallView(outgoing: OutgoingCall(to: c.to, callId: c.callId, status: s, reply: c.reply, media: c.media, reached: c.reached));
    if (c.state == CallStatus.ringing) return out(OutgoingStatus.ringing);
    if (c.state != CallStatus.ended) return none; // connecting / live: the call screen
    return switch (c.reason) {
      CallEndReason.declined => out(OutgoingStatus.declined),
      CallEndReason.noAnswer => out(OutgoingStatus.noAnswer),
      CallEndReason.busy => out(OutgoingStatus.busy),
      CallEndReason.unavailable || CallEndReason.gone => out(OutgoingStatus.unavailable),
      CallEndReason.failed => out(OutgoingStatus.failed),
      CallEndReason.turnedOff => out(OutgoingStatus.turnedOff),
      _ => none, // cancelled (you), hung up / dropped (the call's own end)
    };
  }
  if (c.to.id != me) return none;
  CallView notice(NoticeKind k) => CallView(notice: CallNotice(callId: c.callId, kind: k, from: c.from, media: c.media));
  if (c.state == CallStatus.ringing) return CallView(incoming: IncomingCall(callId: c.callId, from: c.from, expiresAt: c.expiresAt, media: c.media));
  if (c.state == CallStatus.connecting || c.state == CallStatus.live) {
    return c.answeredBy != null && c.answeredBy != device && !acceptTried ? notice(NoticeKind.elsewhere) : none;
  }
  if (c.reason == CallEndReason.failed) return notice(NoticeKind.failed);
  if (acceptTried && (c.reason == CallEndReason.cancelled || c.reason == CallEndReason.noAnswer || c.reason == CallEndReason.turnedOff)) return notice(NoticeKind.over);
  if (c.reason == CallEndReason.cancelled) return notice(NoticeKind.hungUp);
  return none;
}
