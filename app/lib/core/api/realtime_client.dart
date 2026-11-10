import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import 'api_client.dart';
import 'api_config.dart';
import 'api_exception.dart';

/// Event names the server pushes (mirror of backend `ServerEvent`).
class Ev {
  Ev._();
  static const walletUpdated = 'wallet:updated';
  static const paymentUpdated = 'payment:updated';
  static const cashoutUpdated = 'cashout:updated';
  static const accountBanned = 'account:banned';

  /// This device was signed out from another device's Settings → Devices (or by the team).
  static const sessionEnded = 'session:ended';
  static const accountWarning = 'account:warning';
  static const announcement = 'system:announcement';
  static const matchSearching = 'match:searching';

  /// You asked to be told when someone's looking (POST /match/notify-me), and someone is. One-shot.
  static const matchSomeoneLooking = 'match:someone-looking';
  static const matchFound = 'match:found';
  static const matchEnded = 'match:ended';
  static const matchChat = 'match:chat';
  static const matchLiked = 'match:liked';
  static const matchGift = 'match:gift';
  static const matchFriendRequest = 'match:friend-request';
  static const matchError = 'match:error';
  static const matchMutual = 'match:mutual';
  static const matchGame = 'match:game';
  static const matchGameAnswer = 'match:game-answer';
  static const matchGameClosed = 'match:game-closed';
  static const rtcSignal = 'rtc:signal';

  /// Only your last partner is waiting: `{ partner: { id, name, avatarUrl }, at }`.
  static const matchRematchSoon = 'match:rematch-soon';

  /// Your partner's camera / mic: `{ matchId, camOn, micOn }`.
  static const matchMedia = 'match:media';
  static const matchPartnerConnection = 'match:partner-connection';
  static const matchResumed = 'match:resumed';

  /// A moderator answered your appeal: `{ status, note }`.
  static const accountAppeal = 'account:appeal';

  /// New people joined Discover (you asked): `{ count }`.
  static const discoverNewPeople = 'discover:new-people';
  static const friendRequest = 'social:friend-request';
  static const friendAccepted = 'social:friend-accepted';
  static const friendRemoved = 'social:friend-removed';
  static const followNew = 'social:follow-new';
  static const followRequest = 'social:follow-request';
  static const followAccepted = 'social:follow-accepted';
  static const followRemoved = 'social:follow-removed';
  static const message = 'social:message';
  static const presence = 'social:presence';
  static const streak = 'social:streak';
  static const vibeHour = 'engagement:vibe-hour';
  static const momentNew = 'moments:new';
  static const levelUp = 'progress:level-up';
  static const goalReached = 'wallet:goal-reached';
  static const inboxMessage = 'inbox:message';

  /// A new line on the Notifications page: `{ item, unread }`.
  static const activityNew = 'activity:new';
  static const notificationShow = 'notification:show';

  /// Notifications were read (maybe on another device): `{ unread }`.
  static const activityRead = 'activity:read';
  static const catalogUpdated = 'catalog:updated';
  static const referralUpdated = 'referral:updated';
  static const referralMilestone = 'referral:milestone';
  static const affiliateUpdated = 'affiliate:updated';

  /// You and someone liked each other in Discover: `{ friend }`.
  static const discoverMatch = 'discover:match';

  /// Someone liked you in Discover: `{ superLike, from, unseen }`.
  static const discoverLiked = 'discover:liked';

  /// Video calls in a chat changed: `{ friendId, mine, theirs, asked?, from? }`.
  static const callConsent = 'call:consent';

  /// A friend is calling you: `{ callId, from, expiresAt }`.
  static const callIncoming = 'call:incoming';

  /// Your call is ringing on their side: `{ callId, to, expiresAt }`.
  static const callRinging = 'call:ringing';

  /// A ringing call stopped: `{ callId, reason, reply?, from? }`.
  static const callEnded = 'call:ended';

  /// Voice call → video: `{ matchId, state: asked|on|declined, from? }`.
  static const callVideo = 'call:video';

  /// A friend is typing to you: `{ friendId }`.
  static const chatTyping = 'chat:typing';

  /// A message changed (reaction, unsent): the full message view.
  static const messageUpdated = 'message:updated';

  /// They read your messages: `{ friendId, at }`.
  static const messagesRead = 'message:read';

  /// Your messages reached your friend's phone or an open tab: `{ friendId, at }` (two grey ticks).
  static const messagesDelivered = 'message:delivered';
}

class RealtimeEvent {
  const RealtimeEvent(this.name, this.data);
  final String name;
  final Map<String, dynamic> data;
}

/// One Socket.IO connection for the whole app. Authenticates with the
/// current access token on every (re)connect, exposes server pushes as a
/// stream, and turns acked emits into futures that throw [ApiException].
class RealtimeClient {
  RealtimeClient(this._api, {String? url}) : _url = url ?? ApiConfig.socketUrl;

  final ApiClient _api;
  final String _url;
  io.Socket? _socket;
  final _events = StreamController<RealtimeEvent>.broadcast();
  final _connected = StreamController<bool>.broadcast();
  bool _isConnected = false;
  bool _active = true;

  Stream<RealtimeEvent> get events => _events.stream;
  Stream<bool> get connection => _connected.stream;
  bool get isConnected => _isConnected;

  Stream<Map<String, dynamic>> on(String event) => events.where((e) => e.name == event).map((e) => e.data);

  void connect() {
    if (_socket != null) return;
    final s = io.io(
      _url,
      io.OptionBuilder()
          .setTransports(['websocket'])
          // Our own manager: socket_io_client caches one per URL, which would
          // hand a later client (a new sign-in, a second account in tests)
          // the old connection and its auth.
          .enableForceNew()
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(8000)
          // `client`: which Vibe this is (android/ios), so admin can tell app users from web users.
          // `active`: in the foreground or not, so a reconnect in the background still gets pushes.
          .setAuthFn((cb) => cb({'token': _api.accessToken, if (_api.clientName != null) 'client': _api.clientName, 'active': _active}))
          .build(),
    );
    s.onConnect((_) => _setConnected(true));
    s.onDisconnect((_) => _setConnected(false));
    s.onConnectError((err) async {
      // Not offered in this country: stop trying (the app shows the region screen).
      if ('$err'.contains('REGION_UNAVAILABLE')) {
        _api.regionBlocked.value = true;
        return disconnect();
      }
      // Expired token: refresh, then the next reconnect attempt uses the new one.
      if ('$err'.contains('TOKEN_EXPIRED') || '$err'.contains('UNAUTHENTICATED')) await _api.refreshSession();
    });
    s.onAny((event, data) {
      if (data is Map) _events.add(RealtimeEvent(event, Map<String, dynamic>.from(data)));
    });
    _socket = s..connect();
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
    _setConnected(false);
  }

  /// Sends and waits for the server's `{ ok, data | error }` ack.
  Future<dynamic> request(String event, [Map<String, dynamic> payload = const {}]) async {
    final s = _socket;
    if (s == null) throw ApiException.network('not connected');
    if (!s.connected) await connection.firstWhere((c) => c).timeout(const Duration(seconds: 8), onTimeout: () => throw ApiException.network('socket offline'));
    final done = Completer<dynamic>();
    s.emitWithAck(
      event,
      payload,
      ack: (dynamic res) {
        if (done.isCompleted) return;
        if (res is Map && res['ok'] == true) {
          done.complete(res['data']);
        } else if (res is Map && res['error'] is Map) {
          done.completeError(ApiException.fromBody(0, res));
        } else {
          done.completeError(ApiException('INTERNAL', 'Unexpected reply'));
        }
      },
    );
    return done.future.timeout(const Duration(seconds: 12), onTimeout: () => throw ApiException.network('no reply to $event'));
  }

  /// The app came to the foreground (true) or left it (false). The server
  /// sends phone pushes while no device is in the foreground, even though
  /// the socket is still connected; in the foreground the app shows its own
  /// banner instead.
  void setActive(bool active) {
    if (_active == active) return;
    _active = active;
    final s = _socket;
    if (s != null && s.connected) s.emit('presence:active', {'active': active});
  }

  DateTime _lastCheck = DateTime.fromMillisecondsSinceEpoch(0);

  /// Back in the app: the phone may have frozen it and the connection died
  /// without anyone noticing (up to 40 s, then a back-off). Check at once
  /// with a ping and reconnect now if it doesn't answer, so you're "Active
  /// now" again straight away and nothing is missed.
  void checkAlive() {
    final s = _socket;
    if (s == null) return;
    final now = DateTime.now();
    if (now.difference(_lastCheck) < const Duration(seconds: 3)) return;
    _lastCheck = now;
    if (!s.connected) {
      s.connect(); // skip the back-off wait
      return;
    }
    var answered = false;
    s.emitWithAck('presence:ping', <String, dynamic>{}, ack: (_) => answered = true);
    Timer(const Duration(seconds: 4), () {
      if (answered || !identical(_socket, s)) return;
      // No answer: the line is dead even though it looks open. Start a fresh one.
      s.disconnect();
      s.connect();
    });
  }

  void _setConnected(bool v) {
    _isConnected = v;
    _connected.add(v);
  }
}
