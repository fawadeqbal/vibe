import { PaymentMethod } from '@prisma/client';

import { AppConfig } from '../../../../config/app-config.service';
import { PaymentAdapter, PaymentContext, PaymentFlow, PaymentStep } from '../payment-adapter';
import { CardGateway } from './card-gateway';

/** Card payments through whichever CardGateway is configured (hosted checkout + webhook + status checks). */
export class CardAdapter implements PaymentAdapter {
  readonly method = PaymentMethod.CARD;
  readonly flow: PaymentFlow = 'redirect';
  readonly provider: string;

  constructor(
    readonly gateway: CardGateway,
    private readonly config: AppConfig,
    /** Blocked card-issuer countries (admin → Settings → Region). */
    private readonly blocked: () => Promise<ReadonlySet<string>> = async () => new Set(),
  ) {
    this.provider = `card-${gateway.name}`;
  }

  async start(ctx: PaymentContext): Promise<PaymentStep> {
    const back = (status: string) => withQuery(ctx.input.returnUrl ?? this.config.get('PAYMENT_RETURN_URL'), { purchase: ctx.purchase.id, status });
    const session = await this.gateway.createCheckout({
      purchaseId: ctx.purchase.id,
      amountMinor: ctx.amount.minor,
      currency: ctx.amount.currency,
      description: `Vibe — ${ctx.title}`,
      customer: ctx.user,
      returnUrl: back('done'),
      cancelUrl: back('cancelled'),
      webhookUrl: this.config.url(`/v1/webhooks/card/${this.gateway.name}`),
      blockedCardCountries: [...(await this.blocked())].sort(),
    });
    return {
      status: 'pending',
      action: 'redirect',
      providerRef: session.sessionRef,
      expiresAt: session.expiresAt,
      actionData: { url: session.redirectUrl, method: session.fields ? 'POST' : 'GET', fields: session.fields, instructions: 'Finish paying on the secure card page.' },
    };
  }

  async check(ctx: PaymentContext): Promise<PaymentStep> {
    const ref = ctx.purchase.providerRef;
    if (!ref) return { status: 'failed', reason: 'Checkout was never started' };
    const s = await this.gateway.getStatus(ref);
    if (s.status === 'paid') {
      // A card issued in a blocked country got through the gateway: don't deliver, and flag the charge for a refund.
      const cc = s.cardCountry?.toUpperCase();
      if (cc && (await this.blocked()).has(cc)) {
        return { status: 'failed', reason: "Cards issued in this country can't be used on Vibe. The charge will be refunded.", code: 'CARD_REGION', raw: { refundNeeded: true, providerRef: s.providerRef, cardCountry: cc } };
      }
      return { status: 'succeeded', providerRef: s.providerRef };
    }
    if (s.status === 'pending') return { status: 'pending', action: 'redirect', providerRef: ref };
    return { status: 'failed', reason: s.reason, code: s.status };
  }
}

export function withQuery(url: string, q: Record<string, string>): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${new URLSearchParams(q).toString()}`;
}
