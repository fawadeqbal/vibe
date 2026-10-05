import '../../models/models.dart';

/// Client-side checks that mirror the server's (`pk-format.ts`,
/// `account-rules.ts`), so people see a mistake before a round trip. The
/// server still validates everything.
class PkValidation {
  PkValidation._();

  /// Any Pakistani mobile format → `03XXXXXXXXX`, or null.
  static String? localMobile(String? raw) {
    if (raw == null) return null;
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    final m = RegExp(r'^(?:0092|92|0)?(3\d{9})$').firstMatch(digits);
    return m == null ? null : '0${m.group(1)}';
  }

  /// ISO 13616 (mod 97) check; Pakistani IBANs are `PKkk BBBB` + 16 digits.
  /// Returns the normalised IBAN (no spaces, upper case) or null.
  static String? iban(String raw) {
    final iban = raw.replaceAll(RegExp(r'\s+'), '').toUpperCase();
    if (!RegExp(r'^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$').hasMatch(iban)) return null;
    if (iban.startsWith('PK') && !RegExp(r'^PK\d{2}[A-Z]{4}\d{16}$').hasMatch(iban)) return null;
    final moved = '${iban.substring(4)}${iban.substring(0, 4)}'.replaceAllMapped(RegExp('[A-Z]'), (m) => '${m.group(0)!.codeUnitAt(0) - 55}');
    var rem = 0;
    for (final ch in moved.split('')) {
      rem = (rem * 10 + int.parse(ch)) % 97;
    }
    return rem == 1 ? iban : null;
  }

  static bool cnicLast6(String raw) => RegExp(r'^\d{6}$').hasMatch(raw.trim());

  static bool cnic(String raw) => RegExp(r'^\d{5}-?\d{7}-?\d$').hasMatch(raw.trim());

  /// Problems with a new payout account, by field ('account', 'holderName',
  /// 'bankName', 'cnic'). Empty = fine to send.
  static Map<String, String> payoutAccount({required PaymentMethod method, required String account, required String holderName, String? bankName, String? cnic}) {
    final errors = <String, String>{};
    if (method == PaymentMethod.bank) {
      if (iban(account) == null) errors['account'] = 'Enter a valid IBAN, e.g. PK36SCBL0000001123456702';
      if ((bankName ?? '').trim().length < 2) errors['bankName'] = 'Enter the bank name';
    } else if (method == PaymentMethod.jazzCash || method == PaymentMethod.easypaisa) {
      if (localMobile(account) == null) errors['account'] = 'Enter the wallet number like 03001234567';
    } else {
      errors['account'] = 'Choose JazzCash, Easypaisa or a bank account';
    }
    final name = holderName.trim();
    if (name.length < 2 || name.length > 80) errors['holderName'] = 'Enter the name on the account';
    if (cnic != null && cnic.trim().isNotEmpty && !PkValidation.cnic(cnic)) errors['cnic'] = 'CNIC looks like 35202-1234567-1';
    return errors;
  }

  /// The account as the server wants it (03… or IBAN), assuming it validated.
  static String normaliseAccount(PaymentMethod method, String account) =>
      method == PaymentMethod.bank ? (iban(account) ?? account.trim()) : (localMobile(account) ?? account.trim());
}
