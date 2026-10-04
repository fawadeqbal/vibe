import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';

import { randomToken } from '../../../common/utils/crypto';
import { AppConfig } from '../../../config/app-config.service';
import { ChargeInput, ChargeResult, PaymentProvider } from './payment.provider';

/**
 * Development gateway that behaves like the real ones: stores succeed with a
 * receipt, wallets ask for an OTP (any 4 digits), cards need a token, bank
 * transfers wait for confirmation. Optionally declines every Nth charge.
 */
@Injectable()
export class DevPaymentProvider extends PaymentProvider {
  private count = 0;

  constructor(private readonly config: AppConfig) {
    super();
  }

  private declineNow(): boolean {
    const every = this.config.get('DEV_PAYMENTS_FAIL_EVERY');
    return every > 0 && ++this.count % every === 0;
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    switch (input.method) {
      case PaymentMethod.GOOGLE_PLAY:
      case PaymentMethod.APP_STORE:
        if (this.declineNow()) return { status: 'failed', reason: 'The store could not complete the purchase. Nothing was charged.' };
        return { status: 'succeeded', providerRef: input.receipt ?? `DEV-${randomToken(8)}` };
      case PaymentMethod.JAZZCASH:
      case PaymentMethod.EASYPAISA:
        if (!input.phone) return { status: 'failed', reason: 'Enter your wallet number' };
        return { status: 'requires_action', action: 'otp', providerRef: `W-${randomToken(8)}` };
      case PaymentMethod.CARD:
        if (!input.cardToken) return { status: 'failed', reason: 'Card details are missing' };
        if (this.declineNow()) return { status: 'failed', reason: 'Your bank declined the card. Try another card.' };
        return { status: 'succeeded', providerRef: `CH-${randomToken(8)}` };
      case PaymentMethod.BANK:
        return { status: 'requires_action', action: 'bank_transfer', providerRef: `BT-${randomToken(6).toUpperCase()}`, instructions: 'Transfer to Vibe Ltd, IBAN PK00VIBE0000000000000000, using the reference shown.' };
    }
  }

  async confirm(input: ChargeInput & { otp: string; providerRef?: string }): Promise<ChargeResult> {
    if (!/^\d{4}$/.test(input.otp)) return { status: 'failed', reason: 'The code is 4 digits' };
    if (this.declineNow()) return { status: 'failed', reason: 'The wallet declined the payment. Check your balance and try again.' };
    return { status: 'succeeded', providerRef: input.providerRef ?? `W-${randomToken(8)}` };
  }
}
