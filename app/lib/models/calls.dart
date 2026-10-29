import 'models.dart';

/// What the server says about calls in one chat (GET /friends/:id/calls).
class CallState {
  const CallState({this.mine = false, this.theirs = false, this.mineVideo = false, this.theirsVideo = false, this.canAsk = false, this.askAfter, this.askBlockedBy});
  final bool mine;
  final bool theirs;
  final bool mineVideo;
  final bool theirsVideo;
  bool get on => mine && theirs;
  bool get video => on && mineVideo && theirsVideo;
  CallsView get view => CallsView(mine: mine, theirs: theirs, mineVideo: mineVideo, theirsVideo: theirsVideo);
  final bool canAsk;
  final DateTime? askAfter;

  /// `messages` (both must write first) or `wait` (asked too recently).
  final String? askBlockedBy;
}

/// Voice only, or voice and video.
enum CallMedia { voice, video }

/// Someone calling you.
class IncomingCall {
  const IncomingCall({required this.callId, required this.from, required this.expiresAt, this.media = CallMedia.video});
  final String callId;
  final Profile from;
  final DateTime expiresAt;
  final CallMedia media;
}

enum OutgoingStatus { ringing, declined, noAnswer, busy, paused, error }

/// Your call, ringing on their side — or how it ended.
class OutgoingCall {
  const OutgoingCall({required this.to, this.callId, this.status = OutgoingStatus.ringing, this.reply, this.message, this.media = CallMedia.video});
  final Profile to;
  final CallMedia media;
  final String? callId;
  final OutgoingStatus status;
  final String? reply;
  final String? message;

  OutgoingCall copyWith({String? callId, OutgoingStatus? status, String? reply, String? message}) =>
      OutgoingCall(to: to, callId: callId ?? this.callId, status: status ?? this.status, reply: reply ?? this.reply, message: message ?? this.message, media: media);
}
