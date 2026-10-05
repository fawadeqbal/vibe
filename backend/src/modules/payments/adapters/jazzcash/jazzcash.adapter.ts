import { PaymentMethod } from '@prisma/client';

import { AppConfig } from '../../../../config/app-config.service';
import { ProviderError } from '../../../../integrations/core/provider-http';
import { PaymentAdapter, PaymentContext, PaymentFlow, PaymentStep } from '../payment-adapter';
import { localMobile, txnRef } from '../pk-format';
import { JazzCashClient, JazzCashResponse } from './jazzcash.client';

/**
 * JazzCash response codes we act on. Everything not listed is a decline.
 * Check against the code table in your JazzCash merchant documentation
 * when going live — this is the one place to adjust.
 */
export const JAZZCASH_CODES = {
  success: new Set(['000', '121']),
  /** Waiting for the customer / financials (poll with inquiry). */
  pending: new Set(['124', '157', '210']),
};

/**
 * JazzCash.
 * - With a wallet number + last 6 CNIC digits: mobile-wallet API v2 — the
 *   customer approves the push on their phone; the slow call runs in the
 *   background while the app shows "approve in JazzCash".
 * - Without them: the hosted JazzCash page (wallet, card or voucher), which
 *   posts back to /v1/webhooks/jazzcash.
 * Either way the final word comes from the inquiry API (callbacks are only
 * a nudge to check).
 */
export class JazzCashAdapter implements PaymentAdapter {
  readonly method = PaymentMethod.JAZZCASH;
  readonly flow: PaymentFlow = 'wallet';
  readonly provider = 'jazzcash';

  constructor(
    private readonly client: JazzCashClient,
    private readonly config: AppConfig,
  ) {}

  async start(ctx: PaymentContext): Promise<PaymentStep> {
    const ref = txnRef('T');
    const expiresAt = new Date(Date.now() + this.config.get('PAYMENT_CHECKOUT_TTL_MINUTES') * 60_000);
    const description = `Vibe ${ctx.title}`;
    const mobile = localMobile(ctx.input.phone);
    if (mobile && ctx.input.cnicLast6) {
      return {
        status: 'pending',
        action: 'approve_in_app',
        providerRef: ref,
        expiresAt,
        actionData: { instructions: `Approve the PKR ${(ctx.amount.minor / 100).toFixed(0)} payment request in your JazzCash app (or the prompt on ${mobile}).` },
        background: async () => {
          try {
            return this.step(await this.client.mwallet({ txnRef: ref, amountMinor: ctx.amount.minor, description, mobile, cnicLast6: ctx.input.cnicLast6!, expiresAt }), ref);
          } catch (e) {
            // Timeout/network: the charge may have happened. Stay pending; inquiry decides.
            if (e instanceof ProviderError && e.kind !== 'declined') return { status: 'pending', action: 'approve_in_app', providerRef: ref, code: e.kind };
            throw e;
          }
        },
      };
    }
    if (ctx.input.phone && !mobile) return { status: 'failed', reason: 'Enter your JazzCash number like 03001234567' };
    const form = this.client.hostedForm({ txnRef: ref, amountMinor: ctx.amount.minor, description, returnUrl: this.config.url('/v1/webhooks/jazzcash'), expiresAt });
    return { status: 'pending', action: 'redirect', providerRef: ref, expiresAt, actionData: { url: form.url, method: 'POST', fields: form.fields, instructions: 'Finish paying on the JazzCash page.' } };
  }

  async check(ctx: PaymentContext): Promise<PaymentStep> {
    const ref = ctx.purchase.providerRef;
    if (!ref) return { status: 'failed', reason: 'Payment was never started' };
    const r = await this.client.inquire(ref);
    // The inquiry call itself succeeded when pp_ResponseCode is 000; the payment's own result is in pp_PaymentResponseCode / pp_Status.
    if (r.pp_ResponseCode !== '000') return { status: 'pending', action: 'approve_in_app', providerRef: ref, code: r.pp_ResponseCode, raw: r };
    const code = r.pp_PaymentResponseCode ?? r.pp_ResponseCode;
    if (/^complet/i.test(r.pp_Status ?? '') || JAZZCASH_CODES.success.has(code ?? '')) return { status: 'succeeded', providerRef: ref, code, raw: r };
    return this.step({ ...r, pp_ResponseCode: code, pp_ResponseMessage: r.pp_PaymentResponseMessage ?? r.pp_ResponseMessage }, ref);
  }

  private step(r: JazzCashResponse, ref: string): PaymentStep {
    const code = r.pp_ResponseCode ?? '';
    if (JAZZCASH_CODES.success.has(code)) return { status: 'succeeded', providerRef: ref, code, raw: r };
    if (JAZZCASH_CODES.pending.has(code)) return { status: 'pending', action: 'approve_in_app', providerRef: ref, code, raw: r };
    return { status: 'failed', reason: r.pp_ResponseMessage || 'JazzCash declined the payment', code, raw: r };
  }
}
