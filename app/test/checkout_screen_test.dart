import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibe_app/core/mock/mock_backend.dart';
import 'package:vibe_app/core/mock/mock_data.dart';
import 'package:vibe_app/core/theme/vibe_theme.dart';
import 'package:vibe_app/models/models.dart';
import 'package:vibe_app/models/payments.dart';
import 'package:vibe_app/providers/wallet_provider.dart';
import 'package:vibe_app/screens/store/checkout_screen.dart';
import 'package:vibe_app/services/app_services.dart';
import 'package:vibe_app/services/payments/checkout_controller.dart';

import 'fakes.dart';

void main() {
  late FakeCheckout backend;
  late CheckoutController controller;
  late WalletProvider wallet;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    backend = FakeCheckout();
    wallet = WalletProvider(MockBackend(fast: true));
    await wallet.load();
    controller = CheckoutController(backend: backend, kind: ProductKind.coinPack, productId: 'starter', usd: 4.99, android: true, pollEvery: const Duration(minutes: 5));
  });

  // The screen doesn't own an injected controller: stop its timers here.
  tearDown(() => controller.dispose());

  Future<void> pumpCheckout(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.6;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MultiProvider(
      providers: [
        Provider<AppServices>.value(value: AppServices.none()),
        ChangeNotifierProvider<WalletProvider>.value(value: wallet),
      ],
      child: MaterialApp(theme: V.theme(), home: CheckoutScreen(pack: MockData.packs.first, controller: controller)),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('JazzCash: number + CNIC → "approve in your app" → I\'ve approved → coins added', (tester) async {
    await pumpCheckout(tester);
    expect(find.text('PAY WITH'), findsOneWidget);
    expect(find.text('JazzCash'), findsOneWidget);
    expect(find.text('Bank transfer'), findsOneWidget);

    await tester.tap(find.text('JazzCash'));
    await tester.pumpAndSettle();
    expect(find.text('Last 6 digits of your CNIC'), findsOneWidget);
    expect(find.text('Rs 1,397'), findsWidgets, reason: 'local methods show PKR');

    await tester.enterText(find.byKey(const ValueKey('phone')), '0300 1234567');
    await tester.enterText(find.byKey(const ValueKey('cnic')), '123456');
    await tester.tap(find.text('Pay Rs 1,397'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Approve in your JazzCash app'), findsOneWidget);
    expect(find.textContaining('Approve the PKR 1400 payment request'), findsOneWidget);
    expect(find.text('Checking automatically'), findsOneWidget);
    expect(find.text('Cancel payment'), findsOneWidget);

    await tester.tap(find.text("I've approved"));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(backend.calls, contains('check'));
    expect(find.text('Coins added'), findsOneWidget);
    expect(find.text('R-1'), findsOneWidget);
    controller.setVisible(false);
  });

  testWidgets('a live payment:updated push finishes the pending screen', (tester) async {
    await pumpCheckout(tester);
    await tester.tap(find.text('Easypaisa'));
    await tester.pumpAndSettle();
    expect(find.text('Last 6 digits of your CNIC'), findsNothing, reason: 'Easypaisa only needs the number');
    await tester.enterText(find.byKey(const ValueKey('phone')), '03451234567');
    await tester.tap(find.text('Pay Rs 1,397'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Approve in your Easypaisa app'), findsOneWidget);

    backend.push(view('p1', PurchaseState.failed, reason: 'You did not approve the payment in time.'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Payment did not go through'), findsOneWidget);
    expect(find.text('You did not approve the payment in time.'), findsOneWidget);
    expect(find.text('Choose another method'), findsOneWidget);
    controller.setVisible(false);
  });

  testWidgets('cancel on the pending screen expires the payment', (tester) async {
    await pumpCheckout(tester);
    await tester.tap(find.text('Easypaisa'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('phone')), '03451234567');
    await tester.tap(find.text('Pay Rs 1,397'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Cancel payment'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(backend.calls.last, 'cancel');
    expect(find.text('Payment not completed'), findsOneWidget);
    controller.setVisible(false);
  });

  testWidgets('bank transfer shows copyable details', (tester) async {
    backend.onCreate = (r) => view('p1', PurchaseState.requiresAction,
        method: PaymentMethod.bank,
        action: const PaymentAction(type: PaymentActionType.bankTransfer, bank: BankDetails(bankName: 'Meezan Bank', accountTitle: 'Vibe Pvt Ltd', iban: 'PK36SCBL0000001123456702', reference: 'VB9X2K', amount: 'PKR 1397.00')));
    await pumpCheckout(tester);
    await tester.tap(find.text('Bank transfer'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('PK36SCBL0000001123456702'), findsOneWidget);
    expect(find.text('VB9X2K'), findsOneWidget);
    expect(find.byTooltip('Copy IBAN'), findsOneWidget);
    expect(find.textContaining("We'll notify you"), findsOneWidget);
    controller.setVisible(false);
  });
}
