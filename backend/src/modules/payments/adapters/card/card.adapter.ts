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
    if (s.status === 'paid') return { status: 'succeeded', providerRef: s.providerRef };
    if (s.status === 'pending') return { status: 'pending', action: 'redirect', providerRef: ref };
    return { status: 'failed', reason: s.reason, code: s.status };
  }
}

export function withQuery(url: string, q: Record<string, string>): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${new URLSearchParams(q).toString()}`;
}
