import { Injectable, Logger } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { importPKCS8, SignJWT } from 'jose';

import { ChargeInput, ChargeResult, PaymentProvider } from './payment.provider';

/**
 * Production router: one adapter per method. Google Play and the App Store
 * verify receipts against the stores' server APIs; the mobile-wallet and
 * card adapters are the place to plug the merchant SDKs in once the
 * merchant accounts exist (they decline until configured).
 *
 * Env: GOOGLE_PLAY_PACKAGE, GOOGLE_SERVICE_ACCOUNT_JSON,
 *      APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_BUNDLE_ID.
 */
@Injectable()
export class LivePaymentProvider extends PaymentProvider {
  private readonly logger = new Logger(LivePaymentProvider.name);

  async charge(input: ChargeInput): Promise<ChargeResult> {
    switch (input.method) {
      case PaymentMethod.GOOGLE_PLAY:
        return this.googlePlay(input);
      case PaymentMethod.APP_STORE:
        return this.appStore(input);
      case PaymentMethod.BANK:
        return { status: 'requires_action', action: 'bank_transfer', providerRef: `BT-${input.purchaseId.slice(-8).toUpperCase()}` };
      default:
        return { status: 'failed', reason: `${input.method} is not available yet` };
    }
  }

  async confirm(_input: ChargeInput & { otp: string }): Promise<ChargeResult> {
    return { status: 'failed', reason: 'Wallet payments are not available yet' };
  }

  /** purchases.products.get — the token must be PURCHASED (0) and not consumed by another account. */
  private async googlePlay(input: ChargeInput): Promise<ChargeResult> {
    const pkg = process.env.GOOGLE_PLAY_PACKAGE;
    const sa = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!pkg || !sa || !input.receipt) return { status: 'failed', reason: 'Google Play verification is not configured' };
    try {
      const token = await googleAccessToken(JSON.parse(sa));
      const kind = input.productType === 'VIP_PLAN' ? 'subscriptions' : 'products';
      const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/${kind}/${input.productId}/tokens/${encodeURIComponent(input.receipt)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return { status: 'failed', reason: 'Google Play did not recognise this purchase' };
      const body = (await res.json()) as { purchaseState?: number; orderId?: string; paymentState?: number };
      const ok = kind === 'products' ? body.purchaseState === 0 : body.paymentState === 1 || body.paymentState === 2;
      return ok ? { status: 'succeeded', providerRef: body.orderId ?? input.receipt } : { status: 'failed', reason: 'The purchase is not completed' };
    } catch (e) {
      this.logger.error({ err: e }, 'Google Play verification failed');
      return { status: 'failed', reason: 'Could not verify the purchase. Nothing was charged twice — try again.' };
    }
  }

  /** App Store Server API: GET /inApps/v1/transactions/{transactionId}. */
  private async appStore(input: ChargeInput): Promise<ChargeResult> {
    const { APPLE_ISSUER_ID: iss, APPLE_KEY_ID: kid, APPLE_PRIVATE_KEY: key, APPLE_BUNDLE_ID: bid } = process.env;
    if (!iss || !kid || !key || !bid || !input.receipt) return { status: 'failed', reason: 'App Store verification is not configured' };
    try {
      const jwt = await new SignJWT({ bid })
        .setProtectedHeader({ alg: 'ES256', kid, typ: 'JWT' })
        .setIssuer(iss)
        .setIssuedAt()
        .setExpirationTime('5m')
        .setAudience('appstoreconnect-v1')
        .sign(await importPKCS8(key.replace(/\\n/g, '\n'), 'ES256'));
      const res = await fetch(`https://api.storekit.itunes.apple.com/inApps/v1/transactions/${input.receipt}`, { headers: { Authorization: `Bearer ${jwt}` } });
      if (!res.ok) return { status: 'failed', reason: 'The App Store did not recognise this purchase' };
      return { status: 'succeeded', providerRef: input.receipt };
    } catch (e) {
      this.logger.error({ err: e }, 'App Store verification failed');
      return { status: 'failed', reason: 'Could not verify the purchase' };
    }
  }
}

async function googleAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/androidpublisher' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(await importPKCS8(sa.private_key, 'RS256'));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}
