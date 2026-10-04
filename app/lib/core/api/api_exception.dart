/// An error from the Vibe API, carrying the server's stable `code`
/// (see backend `ErrorCode`). Screens switch on the code, never the text.
class ApiException implements Exception {
  ApiException(this.code, this.message, {this.status = 0, this.details = const {}});

  final String code;
  final String message;
  final int status;
  final Map<String, dynamic> details;

  bool get isInsufficientCoins => code == 'INSUFFICIENT_COINS';
  bool get isUnauthenticated => code == 'UNAUTHENTICATED' || code == 'TOKEN_EXPIRED';
  bool get isNetwork => code == 'NETWORK';

  factory ApiException.network([Object? cause]) => ApiException('NETWORK', "Can't reach Vibe. Check your connection.", details: {'cause': '$cause'});

  factory ApiException.fromBody(int status, Object? body) {
    if (body is Map && body['error'] is Map) {
      final e = body['error'] as Map;
      return ApiException(
        e['code'] as String? ?? 'INTERNAL',
        e['message'] as String? ?? 'Something went wrong',
        status: status,
        details: Map<String, dynamic>.from((e['details'] as Map?) ?? const {}),
      );
    }
    return ApiException('INTERNAL', 'Something went wrong ($status)', status: status);
  }

  @override
  String toString() => 'ApiException($code, $message)';
}
