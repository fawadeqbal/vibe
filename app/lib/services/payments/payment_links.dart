import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';

/// Where hosted payment pages (card gateway, JazzCash page) send people back.
/// The app registers the `vibe` scheme (Android intent-filter, iOS URL type).
const kPaymentReturnUrl = 'vibe://payment-return';

/// `vibe://payment-return?purchase=<id>&status=done|cancelled|failed|error`.
@immutable
class PaymentReturn {
  const PaymentReturn({this.purchaseId, this.status = 'done'});
  final String? purchaseId;
  final String status;

  bool get cancelled => status == 'cancelled';
  bool get done => status == 'done';

  /// Null when [uri] isn't a payment return.
  static PaymentReturn? parse(Uri uri) {
    if (uri.scheme != 'vibe') return null;
    // vibe://payment-return?… parses with host "payment-return"; accept a path form too.
    final target = uri.host.isNotEmpty ? uri.host : uri.path.replaceAll('/', '');
    if (target != 'payment-return') return null;
    final id = uri.queryParameters['purchase'];
    return PaymentReturn(purchaseId: id == null || id.isEmpty ? null : id, status: uri.queryParameters['status'] ?? 'done');
  }

  @override
  bool operator ==(Object other) => other is PaymentReturn && other.purchaseId == purchaseId && other.status == status;
  @override
  int get hashCode => Object.hash(purchaseId, status);
}

/// Payment-return deep links as a stream. [AppLinksPaymentLinks] listens to
/// the platform; tests use [ManualPaymentLinks].
abstract class PaymentLinks {
  Stream<PaymentReturn> get returns;
  void dispose();
}

class AppLinksPaymentLinks implements PaymentLinks {
  AppLinksPaymentLinks([AppLinks? links]) {
    try {
      _sub = (links ?? AppLinks()).uriLinkStream.listen((uri) {
        final r = PaymentReturn.parse(uri);
        if (r != null) _out.add(r);
      }, onError: (_) {});
    } catch (_) {
      // No platform implementation (tests, desktop): no deep links.
    }
  }

  final _out = StreamController<PaymentReturn>.broadcast();
  StreamSubscription<Uri>? _sub;

  @override
  Stream<PaymentReturn> get returns => _out.stream;

  @override
  void dispose() {
    _sub?.cancel();
    _out.close();
  }
}

/// Deep links you feed by hand (tests, offline mock).
class ManualPaymentLinks implements PaymentLinks {
  final _out = StreamController<PaymentReturn>.broadcast();

  @override
  Stream<PaymentReturn> get returns => _out.stream;

  /// Test seam: pretend the OS delivered this link.
  void add(PaymentReturn r) => _out.add(r);

  @override
  void dispose() => _out.close();
}
