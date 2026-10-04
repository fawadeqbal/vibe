import { Injectable, Logger } from '@nestjs/common';
import type { Cashout } from '@prisma/client';

import { randomToken } from '../../../common/utils/crypto';

export interface PayoutResult {
  ok: boolean;
  providerRef?: string;
  failureReason?: string;
}

/** Sends money out (JazzCash / Easypaisa disbursement, bank transfer). */
export abstract class PayoutProvider {
  abstract send(cashout: Cashout, account: string): Promise<PayoutResult>;
}

/** Dev: every payout succeeds immediately. */
@Injectable()
export class DevPayoutProvider extends PayoutProvider {
  private readonly logger = new Logger(DevPayoutProvider.name);

  async send(cashout: Cashout, _account: string): Promise<PayoutResult> {
    this.logger.log(`[dev payout] ${cashout.usdCents / 100} USD via ${cashout.method} (${cashout.accountMasked})`);
    return { ok: true, providerRef: `PO-${randomToken(6).toUpperCase()}` };
  }
}
