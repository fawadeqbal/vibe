import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vibe_app/core/api/api_exception.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/models/payments.dart';
import 'package:vibe_app/screens/store/payout_account_form.dart';

void main() {
  final submitted = <NewPayoutAccount>[];
  Object? failWith;

  Future<void> pumpForm(WidgetTester tester, {bool first = false}) async {
    submitted.clear();
    failWith = null;
    await tester.pumpWidget(MaterialApp(
      theme: V.theme(),
      home: Scaffold(
        body: SingleChildScrollView(
          child: PayoutAccountForm(
            methods: const [PaymentMethod.jazzCash, PaymentMethod.easypaisa, PaymentMethod.bank],
            initialHolderName: 'Sara Khan',
            firstAccount: first,
            onSubmit: (a) async {
              if (failWith != null) throw failWith!;
              submitted.add(a);
            },
          ),
        ),
      ),
    ));
  }

  testWidgets('a bad wallet number is caught before sending', (tester) async {
    await pumpForm(tester);
    await tester.enterText(find.byKey(const ValueKey('payout-account')), '12345');
    await tester.tap(find.text('Save account'));
    await tester.pump();
    expect(find.text('Enter the wallet number like 03001234567'), findsOneWidget);
    expect(submitted, isEmpty);
  });

  testWidgets('a wallet number is normalised and sent', (tester) async {
    await pumpForm(tester);
    await tester.tap(find.text('Easypaisa'));
    await tester.pump();
    await tester.enterText(find.byKey(const ValueKey('payout-account')), '+92 345 1234567');
    await tester.tap(find.text('Save account'));
    await tester.pump();
    expect(submitted.single.method, PaymentMethod.easypaisa);
    expect(submitted.single.account, '03451234567');
    expect(submitted.single.holderName, 'Sara Khan');
    expect(submitted.single.makeDefault, isTrue);
  });

  testWidgets('banks need a valid IBAN and the bank name', (tester) async {
    await pumpForm(tester, first: true);
    expect(find.byType(CheckboxListTile), findsNothing, reason: 'the first account is the default anyway');
    await tester.tap(find.text('Bank'));
    await tester.pump();
    expect(find.byKey(const ValueKey('payout-bank')), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('payout-account')), 'PK36SCBL0000001123456703');
    await tester.tap(find.text('Save account'));
    await tester.pump();
    expect(find.textContaining('Enter a valid IBAN'), findsOneWidget);
    expect(find.text('Enter the bank name'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('payout-account')), 'pk36 scbl 0000 0011 2345 6702');
    await tester.enterText(find.byKey(const ValueKey('payout-bank')), 'Standard Chartered');
    await tester.tap(find.text('Save account'));
    await tester.pump();
    expect(submitted.single.account, 'PK36SCBL0000001123456702');
    expect(submitted.single.bankName, 'Standard Chartered');
  });

  testWidgets('server refusals show under the button', (tester) async {
    await pumpForm(tester);
    failWith = ApiException('CONFLICT', 'You can save up to 5 payout accounts. Remove one first.', status: 409);
    await tester.enterText(find.byKey(const ValueKey('payout-account')), '03001234567');
    await tester.tap(find.text('Save account'));
    await tester.pump();
    await tester.pump();
    expect(find.text('You can save up to 5 payout accounts. Remove one first.'), findsOneWidget);
  });
}
