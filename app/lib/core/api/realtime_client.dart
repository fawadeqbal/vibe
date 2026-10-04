import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import 'api_client.dart';
import 'api_config.dart';
import 'api_exception.dart';

/// Event names the server pushes (mirror of backend `ServerEvent`).
class Ev {
  Ev._();
  static const walletUpdated = 'wallet:updated';
  static const accountBanned = 'account:banned';
  static const accountWarning = 'account:warning';
  static const announcement = 'system:announcement';
  static const matchSearching = 'match:searching';
  static const matchFound = 'match:found';
  static const matchEnded = 'match:ended';
  static const matchChat = 'match:chat';
  static const matchLiked = 'match:liked';
  static const matchGift = 'match:gift';
  static const matchFriendRequest = 'match:friend-request';
  static const matchError = 'match:error';
  static const rtcSignal = 'rtc:signal';
  static const friendRequest = 'social:friend-request';
  static const friendAccepted = 'social:friend-accepted';
  static const friendRemoved = 'social:friend-removed';
  static const message = 'social:message';
  static const inboxMessage = 'inbox:message';
  static const catalogUpdated = 'catalog:updated';
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
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(8000)
          .setAuthFn((cb) => cb({'token': _api.accessToken}))
          .build(),
    );
    s.onConnect((_) => _setConnected(true));
    s.onDisconnect((_) => _setConnected(false));
    s.onConnectError((err) async {
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

  void _setConnected(bool v) {
    _isConnected = v;
    _connected.add(v);
  }
}
