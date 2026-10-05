import 'package:flutter/material.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/pk_validation.dart';
import '../../models/models.dart';
import '../../models/payments.dart';

/// Add a JazzCash / Easypaisa number or a bank IBAN for cash-outs.
/// Checks the same rules as the server before sending; server messages
/// (duplicates, limits) show under the button.
class PayoutAccountForm extends StatefulWidget {
  const PayoutAccountForm({super.key, required this.methods, required this.onSubmit, this.initialHolderName = '', this.firstAccount = false});

  /// Rails the server has switched on.
  final List<PaymentMethod> methods;
  final Future<void> Function(NewPayoutAccount account) onSubmit;
  final String initialHolderName;

  /// The first account becomes the default anyway: hide the checkbox.
  final bool firstAccount;

  @override
  State<PayoutAccountForm> createState() => _PayoutAccountFormState();
}

class _PayoutAccountFormState extends State<PayoutAccountForm> {
  late PaymentMethod _method = widget.methods.isEmpty ? PaymentMethod.jazzCash : widget.methods.first;
  final _account = TextEditingController();
  late final _holder = TextEditingController(text: widget.initialHolderName);
  final _bank = TextEditingController();
  bool _makeDefault = true;
  bool _busy = false;
  Map<String, String> _errors = const {};
  String? _serverError;

  bool get _isBank => _method == PaymentMethod.bank;

  @override
  void dispose() {
    _account.dispose();
    _holder.dispose();
    _bank.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final errors = PkValidation.payoutAccount(method: _method, account: _account.text, holderName: _holder.text, bankName: _isBank ? _bank.text : null);
    setState(() {
      _errors = errors;
      _serverError = null;
    });
    if (errors.isNotEmpty) return;
    setState(() => _busy = true);
    try {
      await widget.onSubmit(NewPayoutAccount(
        method: _method,
        account: PkValidation.normaliseAccount(_method, _account.text),
        holderName: _holder.text.trim(),
        bankName: _isBank ? _bank.text.trim() : null,
        makeDefault: widget.firstAccount || _makeDefault,
      ));
    } on ApiException catch (e) {
      if (mounted) setState(() => _serverError = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    InputDecoration deco(String hint, String field) => InputDecoration(hintText: hint, errorText: _errors[field]);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Add a payout account', style: VT.title(19)),
          const SizedBox(height: 4),
          Text('Where your cash-outs go. Only you see the full number.', style: VT.body(13, color: V.text2)),
          const SizedBox(height: 16),
          Row(
            children: [
              for (final m in widget.methods) ...[
                Expanded(
                  child: Semantics(
                    button: true,
                    selected: _method == m,
                    child: GestureDetector(
                      onTap: () => setState(() {
                        _method = m;
                        _errors = const {};
                      }),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        height: 44,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: _method == m ? V.gem.withValues(alpha: 0.12) : V.surface2,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: _method == m ? V.gem : V.lineSoft, width: _method == m ? 1.5 : 1),
                        ),
                        child: Text(m == PaymentMethod.bank ? 'Bank' : m.label, style: VT.title(13, weight: FontWeight.w600, color: _method == m ? V.gem : V.text2)),
                      ),
                    ),
                  ),
                ),
                if (m != widget.methods.last) const SizedBox(width: 8),
              ],
            ],
          ),
          const SizedBox(height: 14),
          TextField(
            key: const ValueKey('payout-account'),
            controller: _account,
            keyboardType: _isBank ? TextInputType.text : TextInputType.phone,
            textCapitalization: _isBank ? TextCapitalization.characters : TextCapitalization.none,
            decoration: deco(_isBank ? 'IBAN, e.g. PK36SCBL0000001123456702' : '${_method.label} number, 03xx xxxxxxx', 'account'),
          ),
          const SizedBox(height: 10),
          TextField(key: const ValueKey('payout-holder'), controller: _holder, textCapitalization: TextCapitalization.words, decoration: deco('Name on the account', 'holderName')),
          if (_isBank) ...[
            const SizedBox(height: 10),
            TextField(key: const ValueKey('payout-bank'), controller: _bank, textCapitalization: TextCapitalization.words, decoration: deco('Bank name, e.g. Meezan Bank', 'bankName')),
          ],
          if (!widget.firstAccount)
            CheckboxListTile(
              value: _makeDefault,
              onChanged: (v) => setState(() => _makeDefault = v ?? false),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              activeColor: V.gem,
              title: Text('Use for my next cash-outs', style: VT.body(14)),
            ),
          if (_serverError != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_serverError!, style: VT.body(13, color: V.bad))),
          const SizedBox(height: 14),
          GradientButton(label: 'Save account', gradient: V.gemGrad, foreground: V.onGem, glow: V.gem, busy: _busy, onTap: _save),
        ],
      ),
    );
  }
}
