import { importPKCS8, SignJWT } from 'jose';

import { AppleJwsVerifier } from '../../../../integrations/apple/apple-jws';
import { FetchLike, ProviderError, ProviderHttp } from '../../../../integrations/core/provider-http';

export interface AppStoreKeys {
  issuerId: string;
  keyId: string;
  privateKey: string;
  bundleId: string;
}

/** Decoded JWSTransactionDecodedPayload (the fields we use). */
export interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  revocationReason?: number;
  appAccountToken?: string;
  type?: 'Auto-Renewable Subscription' | 'Non-Consumable' | 'Consumable' | 'Non-Renewing Subscription';
  environment?: 'Production' | 'Sandbox';
  webOrderLineItemId?: string;
}

const HOSTS = { production: 'https://api.storekit.itunes.apple.com', sandbox: 'https://api.storekit-sandbox.itunes.apple.com' };

/** App Store Server API: look up a transaction and verify Apple's signature on it. */
export class AppStoreClient {
  constructor(
    private readonly keys: AppStoreKeys,
    private readonly jws: AppleJwsVerifier,
    private readonly environment: 'auto' | 'production' | 'sandbox',
    private readonly fetchImpl?: FetchLike,
  ) {}

  private async token(): Promise<string> {
    return new SignJWT({ bid: this.keys.bundleId })
      .setProtectedHeader({ alg: 'ES256', kid: this.keys.keyId, typ: 'JWT' })
      .setIssuer(this.keys.issuerId)
      .setIssuedAt()
      .setExpirationTime('5m')
      .setAudience('appstoreconnect-v1')
      .sign(await importPKCS8(this.keys.privateKey, 'ES256'));
  }

  /** Production first; a 404 there means a sandbox (TestFlight / test account) purchase. */
  async getTransaction(transactionId: string): Promise<AppleTransaction> {
    const envs: ('production' | 'sandbox')[] = this.environment === 'auto' ? ['production', 'sandbox'] : [this.environment];
    let last: unknown;
    for (const env of envs) {
      try {
        const http = new ProviderHttp('app-store', HOSTS[env], this.fetchImpl);
        const r = await http.request<{ signedTransactionInfo: string }>(`/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, { headers: { Authorization: `Bearer ${await this.token()}` }, retries: 2 });
        return await this.jws.verify<AppleTransaction>(r.body.signedTransactionInfo);
      } catch (e) {
        last = e;
        if (!(e instanceof ProviderError && e.status === 404)) throw e;
      }
    }
    throw last;
  }
}
