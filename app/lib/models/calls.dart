import 'models.dart';

/// What the server says about calls in one chat (GET /friends/:id/calls).
class CallState {
  const CallState({this.mine = false, this.theirs = false, this.canAsk = false, this.askAfter, this.askBlockedBy});
  final bool mine;
  final bool theirs;
  bool get on => mine && theirs;
  final bool canAsk;
  final DateTime? askAfter;

  /// `messages` (both must write first) or `wait` (asked too recently).
  final String? askBlockedBy;
}

/// Someone calling you.
class IncomingCall {
  const IncomingCall({required this.callId, required this.from, required this.expiresAt});
  final String callId;
  final Profile from;
  final DateTime expiresAt;
}

enum OutgoingStatus { ringing, declined, noAnswer, busy, paused, error }

/// Your call, ringing on their side — or how it ended.
class OutgoingCall {
  const OutgoingCall({required this.to, this.callId, this.status = OutgoingStatus.ringing, this.reply, this.message});
  final Profile to;
  final String? callId;
  final OutgoingStatus status;
  final String? reply;
  final String? message;

  OutgoingCall copyWith({String? callId, OutgoingStatus? status, String? reply, String? message}) =>
      OutgoingCall(to: to, callId: callId ?? this.callId, status: status ?? this.status, reply: reply ?? this.reply, message: message ?? this.message);
}
