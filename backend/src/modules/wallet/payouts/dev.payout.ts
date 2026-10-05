import { Logger } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';

import { randomToken } from '../../../common/utils/crypto';
import { PayoutAdapter, PayoutInput, PayoutStep } from './payout-adapter';

/** Dev wallet payouts: succeed at once (DEV_PAYMENTS_FAIL_EVERY is not applied to payouts). */
export class DevPayoutAdapter implements PayoutAdapter {
  readonly provider = 'dev-payout';
  private readonly logger = new Logger(DevPayoutAdapter.name);

  constructor(readonly method: PaymentMethod) {}

  async send(input: PayoutInput): Promise<PayoutStep> {
    this.logger.log(`[dev payout] PKR ${input.amountMinor / 100} via ${this.method} to ${input.destination.account.slice(-4)}`);
    return { status: 'paid', providerRef: `PO-${randomToken(6).toUpperCase()}` };
  }
}

/**
 * Bank payouts are sent by staff: cash-outs wait in "awaiting bank batch",
 * staff export a batch (CSV for the bank's bulk-transfer upload), pay it in
 * the bank portal, then mark the batch paid. Same in dev and live. To
 * automate later, replace this with an adapter for your bank's API (IBFT/RAAST).
 */
export class BankBatchPayoutAdapter implements PayoutAdapter {
  readonly method = PaymentMethod.BANK;
  readonly provider = 'bank-batch';

  async send(): Promise<PayoutStep> {
    return { status: 'manual', note: 'awaiting_bank_batch' };
  }
}
