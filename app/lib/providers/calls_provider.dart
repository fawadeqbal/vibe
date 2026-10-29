import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/mappers.dart';
import '../core/api/realtime_client.dart';
import '../models/calls.dart';
import '../models/models.dart';
import 'match_provider.dart';
import 'social_provider.dart';

part 'calls_provider_local.dart';
part 'calls_provider_remote.dart';

/// Video calls between friends, from a chat. Calls are off until both
/// allow them ([allow] asks, or says yes to their ask); either can turn
/// them off for both ([turnOff]). Then [ring] → they get [incoming] →
/// accepting starts a normal call (a friend call in MatchProvider), and
/// decline / no answer / cancel end it.
///
/// [LocalCallsProvider] simulates the friend; [RemoteCallsProvider] talks
/// to `/friends/:id/calls`, `/calls/*` and the `call:*` socket events.
abstract class CallsProvider extends ChangeNotifier {
  CallsProvider.base(this._social, this._match);

  factory CallsProvider(SocialProvider social, MatchProvider match) = LocalCallsProvider;

  final SocialProvider _social;
  final MatchProvider _match;

  IncomingCall? _incoming;
  OutgoingCall? _outgoing;
  final Map<String, CallState> _states = {};

  IncomingCall? get incoming => _incoming;
  OutgoingCall? get outgoing => _outgoing;
  bool get enabled => Economy.friendCallsEnabled;

  /// The last state read for a chat (canAsk, askAfter), if any.
  CallState? stateFor(String friendId) => _states[friendId];

  @protected
  CallState apply(String friendId, CallState st) {
    _states[friendId] = st;
    _social.setCalls(friendId, CallsView(mine: st.mine, theirs: st.theirs));
    notifyListeners();
    return st;
  }

  Future<CallState?> loadState(String friendId);

  /// Ask them, or say yes to their ask. Throws [ApiException]
  /// (CALL_NEEDS_MESSAGES, CALL_ASK_TOO_SOON).
  Future<CallState> allow(String friendId);

  /// Turn calls off for both (or "not now" to their ask, or take back yours).
  Future<CallState> turnOff(String friendId);

  Future<void> ring(Profile friend);
  Future<void> accept();
  Future<void> decline([String? reply]);
  Future<void> cancel();

  void dismissOutgoing() {
    _outgoing = null;
    notifyListeners();
  }

  /// A call that was already ringing when the app opened.
  Future<void> checkIncoming() async {}

  void clear() {
    _incoming = null;
    _outgoing = null;
    _states.clear();
    notifyListeners();
  }
}
