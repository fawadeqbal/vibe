import { PaymentMethod } from '@prisma/client';

import { AppConfig } from '../../../../config/app-config.service';
import { ProviderError } from '../../../../integrations/core/provider-http';
import { PaymentAdapter, PaymentContext, PaymentFlow, PaymentStep } from '../payment-adapter';
import { localMobile, rupees, txnRef } from '../pk-format';
import { EasypaisaClient, EasypaisaResponse } from './easypaisa.client';

/** Easypaisa statuses (inquiry `transactionStatus`). Adjust here if your merchant docs differ. */
export const EASYPAISA_STATUS = {
  paid: new Set(['PAID', 'SUCCESS', 'COMPLETED']),
  pending: new Set(['PENDING', 'INITIATED', 'IN_PROCESS']),
};

/**
 * Easypaisa mobile account: we start the charge, Easypaisa asks the
 * customer to approve in their app, and the (slow) call returns the result.
 * It runs in the background; the inquiry API settles anything uncertain.
 */
export class EasypaisaAdapter implements PaymentAdapter {
  readonly method = PaymentMethod.EASYPAISA;
  readonly flow: PaymentFlow = 'wallet';
  readonly provider = 'easypaisa';

  constructor(
    private readonly client: EasypaisaClient,
    private readonly config: AppConfig,
  ) {}

  async start(ctx: PaymentContext): Promise<PaymentStep> {
    const mobile = localMobile(ctx.input.phone);
    if (!mobile) return { status: 'failed', reason: 'Enter your Easypaisa number like 03451234567' };
    const orderId = txnRef('E');
    return {
      status: 'pending',
      action: 'approve_in_app',
      providerRef: orderId,
      expiresAt: new Date(Date.now() + this.config.get('PAYMENT_CHECKOUT_TTL_MINUTES') * 60_000),
      actionData: { instructions: `Approve the PKR ${(ctx.amount.minor / 100).toFixed(0)} payment in your Easypaisa app (notification on ${mobile}).` },
      background: async () => {
        try {
          const r = await this.client.chargeMobileAccount({ orderId, amount: rupees(ctx.amount.minor), mobile, email: ctx.user.email });
          if (r.responseCode === '0000') return { status: 'succeeded', providerRef: orderId, code: r.responseCode, raw: r };
          return { status: 'failed', reason: r.responseDesc || 'Easypaisa declined the payment', code: r.responseCode, raw: r };
        } catch (e) {
          if (e instanceof ProviderError && e.kind !== 'declined') return { status: 'pending', action: 'approve_in_app', providerRef: orderId, code: e.kind };
          throw e;
        }
      },
    };
  }

  async check(ctx: PaymentContext): Promise<PaymentStep> {
    const orderId = ctx.purchase.providerRef;
    if (!orderId) return { status: 'failed', reason: 'Payment was never started' };
    return inquiryStep(await this.client.inquire(orderId), orderId);
  }
}

export function inquiryStep(r: EasypaisaResponse, orderId: string): PaymentStep {
  if (r.responseCode !== '0000') return { status: 'pending', action: 'approve_in_app', providerRef: orderId, code: r.responseCode, raw: r };
  const s = String(r.transactionStatus ?? '').toUpperCase();
  if (EASYPAISA_STATUS.paid.has(s)) return { status: 'succeeded', providerRef: orderId, code: s, raw: r };
  if (EASYPAISA_STATUS.pending.has(s) || !s) return { status: 'pending', action: 'approve_in_app', providerRef: orderId, code: s, raw: r };
  return { status: 'failed', reason: `Easypaisa: ${s.toLowerCase()}`, code: s, raw: r };
}
