import { PaymentMethod } from '@prisma/client';

import { randomToken } from '../../../../common/utils/crypto';
import { PaymentAdapter, PaymentContext, PaymentFlow, PaymentStep } from '../payment-adapter';

/** Shared "decline every Nth charge" switch (DEV_PAYMENTS_FAIL_EVERY) so failure paths get exercised. */
export class DevDecliner {
  private count = 0;
  constructor(private readonly every: () => number) {}
  now(): boolean {
    const n = this.every();
    return n > 0 && ++this.count % n === 0;
  }
}

/** Dev Google Play / App Store: any receipt is a successful purchase. */
export class DevStoreAdapter implements PaymentAdapter {
  readonly flow: PaymentFlow = 'store';
  readonly provider = 'dev-store';

  constructor(
    readonly method: PaymentMethod,
    private readonly decliner: DevDecliner,
  ) {}

  async start(ctx: PaymentContext): Promise<PaymentStep> {
    if (this.decliner.now()) return { status: 'failed', reason: 'The store could not complete the purchase. Nothing was charged.' };
    const ref = ctx.input.receipt ?? `DEV-${randomToken(8)}`;
    return { status: 'succeeded', providerRef: ref, storeRef: ref, periodEnd: undefined };
  }
}

/** Dev JazzCash / Easypaisa: asks for an OTP (any 4 digits) like the old wallet flow. */
export class DevWalletAdapter implements PaymentAdapter {
  readonly flow: PaymentFlow = 'wallet';
  readonly provider = 'dev-wallet';

  constructor(
    readonly method: PaymentMethod,
    private readonly decliner: DevDecliner,
  ) {}

  async start(ctx: PaymentContext): Promise<PaymentStep> {
    if (!ctx.input.phone) return { status: 'failed', reason: 'Enter your wallet number' };
    return { status: 'pending', action: 'otp', providerRef: `W-${randomToken(8)}`, actionData: { instructions: 'Dev mode: enter any 4 digits.' } };
  }

  async confirm(ctx: PaymentContext, input: { otp: string }): Promise<PaymentStep> {
    if (!/^\d{4}$/.test(input.otp)) return { status: 'failed', reason: 'The code is 4 digits' };
    if (this.decliner.now()) return { status: 'failed', reason: 'The wallet declined the payment. Check your balance and try again.' };
    return { status: 'succeeded', providerRef: ctx.purchase.providerRef ?? `W-${randomToken(8)}` };
  }
}
