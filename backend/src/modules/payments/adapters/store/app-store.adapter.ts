import { PaymentMethod } from '@prisma/client';

import { ProviderError } from '../../../../integrations/core/provider-http';
import { AppleJwsError } from '../../../../integrations/apple/apple-jws';
import { PaymentAdapter, PaymentContext, PaymentFlow, PaymentStep } from '../payment-adapter';
import { appleAccountToken } from './account-token';
import { AppleTransaction, AppStoreClient } from './app-store.client';

/**
 * App Store In-App Purchase. The app buys with StoreKit (appAccountToken =
 * appleAccountToken(userId)) and sends the transaction id; we fetch the
 * signed transaction from the App Store Server API, verify Apple's
 * signature chain, and check bundle, product, owner and revocation.
 */
export class AppStoreAdapter implements PaymentAdapter {
  readonly method = PaymentMethod.APP_STORE;
  readonly flow: PaymentFlow = 'store';
  readonly provider = 'app-store';

  constructor(
    private readonly client: AppStoreClient,
    private readonly bundleId: string,
  ) {}

  async start(ctx: PaymentContext): Promise<PaymentStep> {
    if (!ctx.input.receipt) return { status: 'failed', reason: 'The App Store transaction id is missing' };
    return this.verify(ctx, ctx.input.receipt);
  }

  async check(ctx: PaymentContext): Promise<PaymentStep> {
    const id = (ctx.purchase.metadata as { receipt?: string } | null)?.receipt ?? ctx.purchase.providerRef;
    return id ? this.verify(ctx, id) : { status: 'failed', reason: 'No transaction id' };
  }

  private async verify(ctx: PaymentContext, transactionId: string): Promise<PaymentStep> {
    let tx: AppleTransaction;
    try {
      tx = await this.client.getTransaction(transactionId);
    } catch (e) {
      if (e instanceof ProviderError && e.kind === 'declined') return { status: 'failed', reason: 'The App Store did not recognise this purchase', code: String(e.status) };
      if (e instanceof AppleJwsError) return { status: 'failed', reason: 'The App Store response could not be verified', code: 'jws' };
      throw e;
    }
    return transactionStep(tx, { bundleId: this.bundleId, sku: ctx.sku, owner: appleAccountToken(ctx.user.id) });
  }
}

export function transactionStep(tx: AppleTransaction, expect: { bundleId: string; sku: string; owner: string }): PaymentStep {
  if (tx.bundleId !== expect.bundleId) return { status: 'failed', reason: 'The purchase is for another app', raw: tx };
  if (tx.productId !== expect.sku) return { status: 'failed', reason: 'The purchase is for a different product', raw: tx };
  if (tx.appAccountToken && tx.appAccountToken.toLowerCase() !== expect.owner) return { status: 'failed', reason: 'This purchase belongs to another account', raw: tx };
  if (tx.revocationDate) return { status: 'failed', reason: 'Apple refunded this purchase', raw: tx };
  if (tx.expiresDate && tx.expiresDate < Date.now()) return { status: 'failed', reason: 'The subscription has expired', raw: tx };
  return { status: 'succeeded', providerRef: tx.transactionId, storeRef: tx.originalTransactionId, periodEnd: tx.expiresDate ? new Date(tx.expiresDate) : undefined, raw: tx };
}
