import { PaymentMethod } from '@prisma/client';

import { friendlyCode } from '../../../common/utils/crypto';
import { MS } from '../../../common/utils/clock';
import { SettingsService } from '../../settings/settings.service';
import { PaymentAdapter, PaymentContext, PaymentFlow, PaymentStep } from './payment-adapter';

/**
 * Bank transfer: the person sends money to our account with a reference;
 * staff see it in the bank statement and press "Mark paid" in the admin
 * panel. Same in dev and live — no provider involved.
 */
export class BankTransferAdapter implements PaymentAdapter {
  readonly method = PaymentMethod.BANK;
  readonly flow: PaymentFlow = 'manual';
  readonly provider = 'bank';

  constructor(private readonly settings: SettingsService) {}

  async configured(): Promise<boolean> {
    const s = await this.settings.all();
    return !!(s['payments.bankAccountTitle'] && s['payments.bankIban']);
  }

  async start(ctx: PaymentContext): Promise<PaymentStep> {
    const s = await this.settings.all();
    const reference = `VB-${friendlyCode(6)}`;
    const amount = `PKR ${(ctx.amount.minor / 100).toLocaleString('en-US')}`;
    const bank = {
      bankName: s['payments.bankName'] || 'Bank',
      accountTitle: s['payments.bankAccountTitle'] || 'Vibe',
      iban: s['payments.bankIban'] || 'PK00VIBE0000000000000000',
      reference,
      amount,
    };
    return {
      status: 'pending',
      action: 'bank_transfer',
      providerRef: reference,
      expiresAt: new Date(Date.now() + s['payments.bankTransferDays'] * MS.day),
      actionData: { bank, instructions: `Send ${amount} to ${bank.accountTitle} (${bank.bankName}), IBAN ${bank.iban}. Write ${reference} in the transfer note. Coins arrive once we see the payment (usually within a working day).` },
    };
  }
}
