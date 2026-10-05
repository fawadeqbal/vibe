import { PaymentMethod, ProductType } from '@prisma/client';

import { ProviderError } from '../../../../integrations/core/provider-http';
import { PaymentAdapter, PaymentContext, PaymentFlow, PaymentStep } from '../payment-adapter';
import { playAccountToken } from './account-token';
import { GooglePlayClient, PlaySubscriptionV2 } from './google-play.client';

const ACTIVE_SUB_STATES = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']);

/**
 * Google Play Billing. The app buys with the Play SDK (passing
 * obfuscatedAccountId = playAccountToken(userId)) and sends us the purchase
 * token. We verify it with the Play Developer API, deliver, then consume
 * (coin packs, so they can be bought again) or acknowledge (VIP) — Play
 * refunds anything not acknowledged within 3 days.
 */
export class GooglePlayAdapter implements PaymentAdapter {
  readonly method = PaymentMethod.GOOGLE_PLAY;
  readonly flow: PaymentFlow = 'store';
  readonly provider = 'google-play';

  constructor(private readonly client: GooglePlayClient) {}

  async start(ctx: PaymentContext): Promise<PaymentStep> {
    if (!ctx.input.receipt) return { status: 'failed', reason: 'The Google Play purchase token is missing' };
    return this.verify(ctx, ctx.input.receipt);
  }

  async check(ctx: PaymentContext): Promise<PaymentStep> {
    const token = ctx.purchase.storeRef ?? (ctx.purchase.metadata as { receipt?: string } | null)?.receipt;
    if (!token) return { status: 'failed', reason: 'No purchase token' };
    return this.verify(ctx, token);
  }

  private async verify(ctx: PaymentContext, token: string): Promise<PaymentStep> {
    const owner = playAccountToken(ctx.user.id);
    try {
      if (ctx.productType === ProductType.VIP_PLAN) {
        const sub = await this.client.getSubscription(token);
        return subscriptionStep(sub, ctx.sku, token, owner);
      }
      const p = await this.client.getProduct(ctx.sku, token);
      if (p.obfuscatedExternalAccountId && p.obfuscatedExternalAccountId !== owner) return { status: 'failed', reason: 'This purchase belongs to another account', raw: p };
      if (p.purchaseState === 2) return { status: 'pending', action: 'approve_in_app', providerRef: p.orderId, actionData: { instructions: 'Google Play is waiting for your payment. Coins arrive as soon as it completes.' }, raw: p };
      if (p.purchaseState !== 0) return { status: 'failed', reason: 'The purchase was cancelled', code: String(p.purchaseState), raw: p };
      if (p.consumptionState === 1) return { status: 'failed', reason: 'This purchase was already used', raw: p };
      return { status: 'succeeded', providerRef: p.orderId ?? token, storeRef: token, raw: p };
    } catch (e) {
      if (e instanceof ProviderError && e.kind === 'declined') return { status: 'failed', reason: 'Google Play did not recognise this purchase', code: String(e.status) };
      throw e;
    }
  }

  async finalize(ctx: PaymentContext): Promise<void> {
    const token = ctx.purchase.storeRef;
    if (!token) return;
    if (ctx.productType === ProductType.VIP_PLAN) {
      const sub = await this.client.getSubscription(token);
      if (sub.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') await this.client.acknowledgeSubscription(ctx.sku, token);
      return;
    }
    const p = await this.client.getProduct(ctx.sku, token);
    if (p.consumptionState !== 1) await this.client.consumeProduct(ctx.sku, token);
  }
}

export function subscriptionStep(sub: PlaySubscriptionV2, sku: string, token: string, owner: string): PaymentStep {
  const owned = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId;
  if (owned && owned !== owner) return { status: 'failed', reason: 'This subscription belongs to another account', raw: sub };
  const item = sub.lineItems?.find((l) => l.productId === sku) ?? sub.lineItems?.[0];
  if (!item || item.productId !== sku) return { status: 'failed', reason: 'The subscription is for a different plan', raw: sub };
  if (sub.subscriptionState === 'SUBSCRIPTION_STATE_PENDING') return { status: 'pending', action: 'approve_in_app', providerRef: sub.latestOrderId, raw: sub };
  if (!sub.subscriptionState || !ACTIVE_SUB_STATES.has(sub.subscriptionState)) return { status: 'failed', reason: 'The subscription is not active', code: sub.subscriptionState, raw: sub };
  const end = item.expiryTime ? new Date(item.expiryTime) : undefined;
  if (end && end.getTime() < Date.now()) return { status: 'failed', reason: 'The subscription has expired', raw: sub };
  return { status: 'succeeded', providerRef: sub.latestOrderId ?? token, storeRef: token, periodEnd: end, raw: sub };
}
