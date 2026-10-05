import { GoogleAuth } from '../../../../integrations/google/google-auth';
import { FetchLike, ProviderHttp } from '../../../../integrations/core/provider-http';
import { ServiceAccountKey } from '../../../../integrations/core/secrets';

const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export interface PlayProductPurchase {
  /** 0 purchased, 1 canceled, 2 pending (e.g. cash payment at a store). */
  purchaseState?: number;
  /** 0 yet to be consumed, 1 consumed. */
  consumptionState?: number;
  /** 0 yet to be acknowledged, 1 acknowledged. */
  acknowledgementState?: number;
  orderId?: string;
  obfuscatedExternalAccountId?: string;
  /** 0 test (license testers), 1 promo, 2 rewarded; absent = real purchase. */
  purchaseType?: number;
}

export interface PlaySubscriptionV2 {
  subscriptionState?:
    | 'SUBSCRIPTION_STATE_PENDING'
    | 'SUBSCRIPTION_STATE_ACTIVE'
    | 'SUBSCRIPTION_STATE_PAUSED'
    | 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
    | 'SUBSCRIPTION_STATE_ON_HOLD'
    | 'SUBSCRIPTION_STATE_CANCELED'
    | 'SUBSCRIPTION_STATE_EXPIRED'
    | 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED';
  lineItems?: { productId: string; expiryTime?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean } }[];
  acknowledgementState?: 'ACKNOWLEDGEMENT_STATE_PENDING' | 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  testPurchase?: unknown;
}

/** Google Play Developer API (androidpublisher v3) calls used for billing. */
export class GooglePlayClient {
  private readonly http: ProviderHttp;

  constructor(
    private readonly packageName: string,
    private readonly account: ServiceAccountKey,
    private readonly auth: GoogleAuth,
    fetchImpl?: FetchLike,
  ) {
    this.http = new ProviderHttp('google-play', `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}`, fetchImpl);
  }

  private async headers() {
    return { Authorization: `Bearer ${await this.auth.accessToken(this.account, [SCOPE])}` };
  }

  async getProduct(sku: string, token: string): Promise<PlayProductPurchase> {
    const r = await this.http.request<PlayProductPurchase>(`/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}`, { headers: await this.headers(), retries: 2 });
    return r.body;
  }

  async consumeProduct(sku: string, token: string): Promise<void> {
    await this.http.request(`/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}:consume`, { method: 'POST', headers: await this.headers(), body: {} });
  }

  async acknowledgeProduct(sku: string, token: string): Promise<void> {
    await this.http.request(`/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}:acknowledge`, { method: 'POST', headers: await this.headers(), body: {} });
  }

  async getSubscription(token: string): Promise<PlaySubscriptionV2> {
    const r = await this.http.request<PlaySubscriptionV2>(`/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`, { headers: await this.headers(), retries: 2 });
    return r.body;
  }

  async acknowledgeSubscription(sku: string, token: string): Promise<void> {
    await this.http.request(`/purchases/subscriptions/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}:acknowledge`, { method: 'POST', headers: await this.headers(), body: {} });
  }
}
