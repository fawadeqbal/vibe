import { FetchLike, ProviderHttp } from '../../../../integrations/core/provider-http';

export interface EasypaisaKeys {
  env: 'sandbox' | 'production';
  storeId: string;
  username: string;
  password: string;
  /** Merchant's Easypaisa account number (needed by the inquiry API). */
  accountNum: string;
}

const HOSTS = { sandbox: 'https://easypaystg.easypaisa.com.pk', production: 'https://easypay.easypaisa.com.pk' };

export interface EasypaisaResponse {
  responseCode?: string;
  responseDesc?: string;
  orderId?: string;
  transactionId?: string;
  transactionStatus?: string;
  [k: string]: unknown;
}

/** Easypaisa (Easypay) REST API v4: mobile-account charge and transaction inquiry. */
export class EasypaisaClient {
  private readonly http: ProviderHttp;

  constructor(
    private readonly keys: EasypaisaKeys,
    fetchImpl?: FetchLike,
  ) {
    this.http = new ProviderHttp('easypaisa', `${HOSTS[keys.env]}/easypay-service/rest/v4`, fetchImpl);
  }

  /** Easypaisa hosts, for checking where IPN links point. */
  static isEasypaisaHost(host: string): boolean {
    return host === 'easypaisa.com.pk' || host.endsWith('.easypaisa.com.pk');
  }

  private get headers() {
    return { Credentials: Buffer.from(`${this.keys.username}:${this.keys.password}`).toString('base64') };
  }

  /** Customer approves on their phone during this call (slow; never retried). */
  async chargeMobileAccount(input: { orderId: string; amount: string; mobile: string; email?: string | null }): Promise<EasypaisaResponse> {
    const r = await this.http.request<EasypaisaResponse>('/initiate-ma-transaction', {
      method: 'POST',
      headers: this.headers,
      body: { orderId: input.orderId, storeId: this.keys.storeId, transactionAmount: input.amount, transactionType: 'MA', mobileAccountNo: input.mobile, emailAddress: input.email ?? '' },
      timeoutMs: 100_000,
      acceptAnyStatus: true,
    });
    return typeof r.body === 'object' ? r.body : { responseCode: 'HTTP', responseDesc: String(r.body).slice(0, 200) };
  }

  async inquire(orderId: string): Promise<EasypaisaResponse> {
    const r = await this.http.request<EasypaisaResponse>('/inquire-transaction', {
      method: 'POST',
      headers: this.headers,
      body: { orderId, storeId: this.keys.storeId, accountNum: this.keys.accountNum },
      retries: 2,
      acceptAnyStatus: true,
    });
    return typeof r.body === 'object' ? r.body : { responseCode: 'HTTP', responseDesc: String(r.body).slice(0, 200) };
  }

  /** IPN: Easypaisa calls us with ?url=<their IPN detail link>; read the order id from it. */
  async readIpn(url: string): Promise<{ orderId?: string }> {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !EasypaisaClient.isEasypaisaHost(u.hostname)) throw new Error('IPN link is not an Easypaisa URL');
    const r = await this.http.request<Record<string, unknown>>(u.toString(), { headers: this.headers, retries: 2 });
    const b = r.body ?? {};
    return { orderId: (b.order_id ?? b.orderRefNumber ?? b.orderId) as string | undefined };
  }
}
