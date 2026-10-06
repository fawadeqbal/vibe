import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'invite_links.dart';

export 'invite_links.dart';

/// Where the captured code, the "referrer already read" flag and the
/// install id live. [DeviceInviteStore] keeps the code in shared
/// preferences and the device id in the keystore; tests use [MemoryInviteStore].
abstract class InviteStore {
  Future<CapturedInvite?> readInvite();
  Future<void> writeInvite(CapturedInvite? invite);
  Future<bool> referrerChecked();
  Future<void> setReferrerChecked();
  Future<String?> readDeviceId();
  Future<void> writeDeviceId(String id);
}

class DeviceInviteStore implements InviteStore {
  DeviceInviteStore([FlutterSecureStorage? secure]) : _secure = secure ?? const FlutterSecureStorage();
  final FlutterSecureStorage _secure;
  static const _kInvite = 'vibe.invite';
  static const _kChecked = 'vibe.invite.referrerChecked';
  static const _kDevice = 'vibe.deviceId';

  @override
  Future<CapturedInvite?> readInvite() async {
    final raw = (await SharedPreferences.getInstance()).getString(_kInvite);
    if (raw == null) return null;
    try {
      return CapturedInvite.fromJson(jsonDecode(raw));
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> writeInvite(CapturedInvite? invite) async {
    final p = await SharedPreferences.getInstance();
    if (invite == null) {
      await p.remove(_kInvite);
    } else {
      await p.setString(_kInvite, jsonEncode(invite.toJson()));
    }
  }

  @override
  Future<bool> referrerChecked() async => (await SharedPreferences.getInstance()).getBool(_kChecked) ?? false;

  @override
  Future<void> setReferrerChecked() async => (await SharedPreferences.getInstance()).setBool(_kChecked, true);

  @override
  Future<String?> readDeviceId() => _secure.read(key: _kDevice);

  @override
  Future<void> writeDeviceId(String id) => _secure.write(key: _kDevice, value: id);
}

class MemoryInviteStore implements InviteStore {
  MemoryInviteStore({this.invite, this.checked = false, this.deviceId});
  CapturedInvite? invite;
  bool checked;
  String? deviceId;

  @override
  Future<CapturedInvite?> readInvite() async => invite;
  @override
  Future<void> writeInvite(CapturedInvite? i) async => invite = i;
  @override
  Future<bool> referrerChecked() async => checked;
  @override
  Future<void> setReferrerChecked() async => checked = true;
  @override
  Future<String?> readDeviceId() async => deviceId;
  @override
  Future<void> writeDeviceId(String id) async => deviceId = id;
}

/// The Play Store install referrer (Android). Read once per install.
abstract class InstallReferrer {
  /// The raw referrer string, or null (not from Play, not Android, error).
  Future<String?> read();
}

/// `MainActivity.kt` answers on `vibe/install_referrer` with the Play
/// Install Referrer library (`com.android.installreferrer`).
class PlayInstallReferrer implements InstallReferrer {
  const PlayInstallReferrer();
  static const _channel = MethodChannel('vibe/install_referrer');

  @override
  Future<String?> read() async {
    try {
      return await _channel.invokeMethod<String>('get').timeout(const Duration(seconds: 10));
    } catch (_) {
      return null; // not installed from Play, service down, older Play app…
    }
  }
}

class NoInstallReferrer implements InstallReferrer {
  const NoInstallReferrer([this.value]);
  final String? value;
  @override
  Future<String?> read() async => value;
}

/// Invite links as they arrive from the OS.
abstract class InviteLinkSource {
  Future<Uri?> initial();
  Stream<Uri> get links;
}

class AppLinksInviteSource implements InviteLinkSource {
  AppLinksInviteSource([AppLinks? links]) : _links = links;
  final AppLinks? _links;
  AppLinks get _l => _links ?? AppLinks();

  @override
  Future<Uri?> initial() async {
    try {
      return await _l.getInitialLink();
    } catch (_) {
      return null;
    }
  }

  @override
  Stream<Uri> get links {
    try {
      return _l.uriLinkStream.handleError((_) {});
    } catch (_) {
      return const Stream.empty();
    }
  }
}

/// Links you feed by hand (tests, desktop).
class ManualInviteSource implements InviteLinkSource {
  ManualInviteSource([this._initial]);
  final Uri? _initial;
  final _out = StreamController<Uri>.broadcast();

  void add(Uri uri) => _out.add(uri);

  @override
  Future<Uri?> initial() async => _initial;
  @override
  Stream<Uri> get links => _out.stream;
}

/// Attribution before sign-up: reads the Play install referrer once on the
/// first launch, listens for `vibe://invite?code=` and `https://…/i/<code>`
/// links, keeps the newest code until an account is made with it, and owns
/// the install's random `deviceId`.
///
/// A link someone taps wins over the install referrer (it is the more
/// recent intent). Links that arrive while signed in are not stored; they
/// go out on [signedInLinks] (the app offers the claim field instead).
class InviteCapture extends ChangeNotifier {
  InviteCapture({InviteStore? store, InstallReferrer? referrer, InviteLinkSource? links, DateTime Function()? clock, bool Function()? signedIn})
      : _store = store ?? MemoryInviteStore(),
        _referrer = referrer ?? const NoInstallReferrer(),
        _links = links,
        _clock = clock ?? DateTime.now,
        _signedIn = signedIn;

  final InviteStore _store;
  final InstallReferrer _referrer;
  final InviteLinkSource? _links;
  final DateTime Function() _clock;
  bool Function()? _signedIn;
  CapturedInvite? _captured;
  String? _lastUsedCode;
  StreamSubscription<Uri>? _sub;
  Future<void>? _started;
  final _signedInLinks = StreamController<CapturedInvite>.broadcast();

  /// The code waiting for sign-up (null when none).
  CapturedInvite? get captured => _captured;

  /// The code sent with the last sign-in (pre-fills "Have an invite code?"
  /// when the server couldn't use it).
  String? get lastUsedCode => _lastUsedCode;

  /// Invite links opened by someone already signed in.
  Stream<CapturedInvite> get signedInLinks => _signedInLinks.stream;

  /// Tells the capture whether someone is signed in (set by `main.dart`).
  set signedIn(bool Function() f) => _signedIn = f;

  /// Loads the stored code, reads the install referrer once, starts listening.
  Future<void> start() => _started ??= _start();

  Future<void> _start() async {
    try {
      final stored = await _store.readInvite();
      if (stored != null && stored.expiredAt(_clock())) {
        await _store.writeInvite(null);
      } else if (stored != null) {
        _captured = stored;
        notifyListeners();
      }
    } catch (_) {}
    final links = _links;
    if (links != null) {
      _sub = links.links.listen((u) => unawaited(handleLink(u)));
      final first = await links.initial();
      if (first != null) await handleLink(first);
    }
    await _readReferrerOnce();
  }

  Future<void> _readReferrerOnce() async {
    try {
      if (await _store.referrerChecked()) return;
      final raw = await _referrer.read();
      await _store.setReferrerChecked();
      final invite = InviteLinks.parseInstallReferrer(raw, now: _clock());
      // A link tapped since install already says who invited them.
      if (invite != null && _captured == null && !(_signedIn?.call() ?? false)) await _set(invite);
    } catch (_) {}
  }

  /// A deep/app link. True when it was an invite link.
  Future<bool> handleLink(Uri uri) async {
    final invite = InviteLinks.parseLink(uri, now: _clock());
    if (invite == null) return false;
    if (_signedIn?.call() ?? false) {
      if (!_signedInLinks.isClosed) _signedInLinks.add(invite);
      return true;
    }
    await _set(invite);
    return true;
  }

  Future<void> _set(CapturedInvite? invite) async {
    _captured = invite;
    try {
      await _store.writeInvite(invite);
    } catch (_) {}
    notifyListeners();
  }

  /// The install's random id (generated once, kept in the keystore).
  Future<String> deviceId() async {
    try {
      final existing = await _store.readDeviceId();
      if (InviteLinks.validDeviceId(existing)) return existing!;
    } catch (_) {}
    final id = _newId();
    try {
      await _store.writeDeviceId(id);
    } catch (_) {}
    return id;
  }

  static String _newId() {
    final r = Random.secure();
    final b = List<int>.generate(16, (_) => r.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40; // UUID v4
    b[8] = (b[8] & 0x3f) | 0x80;
    final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }

  /// What the account-creating sign-in sends: the code (if any) and the
  /// device id (always). The server ignores them for existing accounts.
  Future<Map<String, String>> signUpFields() async {
    await start();
    final c = _captured;
    final fresh = c != null && !c.expiredAt(_clock()) ? c : null;
    return {...?fresh?.toSignUp(), 'deviceId': await deviceId()};
  }

  /// Signed in: the code has done its job (used for a new account, or not
  /// needed by an existing one).
  Future<void> consumed() async {
    if (_captured == null) return;
    _lastUsedCode = _captured!.code;
    await _set(null);
  }

  /// Forget the captured code without signing in (the person dismissed it).
  Future<void> clear() => _set(null);

  @override
  void dispose() {
    _sub?.cancel();
    _signedInLinks.close();
    super.dispose();
  }
}
