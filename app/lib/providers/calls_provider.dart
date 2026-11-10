import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../models/call_machine.dart';
import '../models/calls.dart';
import '../models/models.dart';
import 'match_provider.dart';
import 'session_provider.dart';
import 'social_provider.dart';

part 'calls_provider_local.dart';
part 'calls_provider_remote.dart';

/// Calls between friends, from a chat. Calls are off until both allow them
/// ([allow] asks, or says yes to their ask); either can turn them off for
/// both ([turnOff]). A call itself is the server's: every move arrives as
/// `call:state` with the whole snapshot, and [incoming] / [outgoing] /
/// [notice] are worked out from the newest one (models/call_machine.dart).
/// Calls ring only while the app is open.
///
/// [LocalCallsProvider] simulates the friend; [RemoteCallsProvider] talks
/// to `/friends/:id/calls`, `/calls/*` and `call:state`.
abstract class CallsProvider extends ChangeNotifier {
  CallsProvider.base(this._social, this._match);

  factory CallsProvider(SocialProvider social, MatchProvider match) = LocalCallsProvider;

  final SocialProvider _social;
  final MatchProvider _match;

  IncomingCall? _incoming;
  OutgoingCall? _outgoing;
  CallNotice? _notice;

  /// For the person called: why the ring stopped (hung up, answered elsewhere, too late, couldn't connect).
  CallNotice? get notice => _notice;

  void dismissNotice() {
    _notice = null;
    notifyListeners();
  }
  final Map<String, CallState> _states = {};

  IncomingCall? get incoming => _incoming;

  /// Show the ringing call full screen (opened from a push or at launch) rather than as a banner.
  bool get incomingFull => _incomingFull;
  bool _incomingFull = false;

  /// The banner was tapped: full screen.
  void showIncomingFull() {
    if (_incoming == null || _incomingFull) return;
    _incomingFull = true;
    notifyListeners();
  }
  OutgoingCall? get outgoing => _outgoing;
  bool get enabled => Economy.friendCallsEnabled;

  /// The last state read for a chat (canAsk, askAfter), if any.
  CallState? stateFor(String friendId) => _states[friendId];

  @protected
  CallState apply(String friendId, CallState st) {
    _states[friendId] = st;
    _social.setCalls(friendId, st.view);
    notifyListeners();
    return st;
  }

  Future<CallState?> loadState(String friendId);

  /// Ask them, say yes to their ask, or change your level: [video] false =
  /// voice calls only. Throws [ApiException] (CALL_NEEDS_MESSAGES,
  /// CALL_ASK_TOO_SOON).
  Future<CallState> allow(String friendId, {bool video = true});

  /// Turn calls off for both (or "not now" to their ask, or take back yours).
  Future<CallState> turnOff(String friendId);

  Future<void> ring(Profile friend, [CallMedia media = CallMedia.video]);
  /// Pick up; [media] voice answers a video call as voice only.
  Future<void> accept([CallMedia? media]);
  Future<void> decline([String? reply]);
  Future<void> cancel();

  void dismissOutgoing() {
    _outgoing = null;
    notifyListeners();
  }

  /// Asks the server where your call is (at launch, on reconnect, back in the app, and while a call screen is open).
  Future<void> reconcile() async {}

  /// A new ring: banner first. Implementations call this when [incoming] changes.
  @protected
  void setIncoming(IncomingCall? c, {bool full = false}) {
    _incoming = c;
    _incomingFull = c != null && full;
  }

  void clear() {
    setIncoming(null);
    _outgoing = null;
    _notice = null;
    _states.clear();
    notifyListeners();
  }
}
