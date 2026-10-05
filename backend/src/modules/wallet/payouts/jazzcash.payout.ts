import { PaymentMethod } from '@prisma/client';
import { createCipheriv } from 'node:crypto';

import { FetchLike, ProviderError, ProviderHttp } from '../../../integrations/core/provider-http';
import { PayoutAdapter, PayoutInput, PayoutStep } from './payout-adapter';

export interface JazzCashDisburseKeys {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  /** Some API versions encrypt the body (AES-128/256-CBC, base64); empty = plain JSON. */
  aesKey?: string;
}

/**
 * The parts of JazzCash's disbursement API that differ between agreement
 * versions, in one place. JazzCash shares the exact spec with the
 * disbursement agreement — compare these with your copy when keys arrive.
 */
export const JAZZCASH_DISBURSE_API = {
  tokenPath: '/token',
  /** Mobile-wallet to mobile-wallet transfer. */
  transferPath: '/jazzcash/third-party-integration/srv6/api/wso2/mw/mw',
  inquiryPath: '/jazzcash/third-party-integration/srv1/api/wso2/transactionStatus',
  /**
   * Only codes listed as failures return the gems automatically. Any other
   * unknown answer stays "processing" for staff to look at — for money going
   * out, a wrong "failed" could pay someone twice.
   */
  failureCodes: new Set<string>(),
  successCodes: new Set(['G2P-T-0', '0', '000']),
  pendingCodes: new Set(['G2P-T-PENDING', 'PENDING', '121']),
};

/** JazzCash mobile-account disbursement (gems cash-out to a JazzCash wallet). */
export class JazzCashPayoutAdapter implements PayoutAdapter {
  readonly method = PaymentMethod.JAZZCASH;
  readonly provider = 'jazzcash-disburse';
  private readonly http: ProviderHttp;
  private token?: { value: string; expiresAt: number };

  constructor(
    private readonly keys: JazzCashDisburseKeys,
    fetchImpl?: FetchLike,
  ) {
    this.http = new ProviderHttp('jazzcash-disburse', keys.baseUrl.replace(/\/$/, ''), fetchImpl);
  }

  private async bearer(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const r = await this.http.request<{ access_token: string; expires_in?: number }>(JAZZCASH_DISBURSE_API.tokenPath, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${this.keys.clientId}:${this.keys.clientSecret}`).toString('base64')}` },
      body: new URLSearchParams({ grant_type: 'password', username: this.keys.username, password: this.keys.password }),
      retries: 2,
    });
    this.token = { value: r.body.access_token, expiresAt: Date.now() + (r.body.expires_in ?? 3000) * 1000 };
    return this.token.value;
  }

  private body(payload: Record<string, string>): unknown {
    if (!this.keys.aesKey) return payload;
    const key = Buffer.from(this.keys.aesKey, 'utf8');
    const c = createCipheriv(key.length >= 32 ? 'aes-256-cbc' : 'aes-128-cbc', key.subarray(0, key.length >= 32 ? 32 : 16), key.subarray(0, 16));
    return { data: Buffer.concat([c.update(JSON.stringify(payload), 'utf8'), c.final()]).toString('base64') };
  }

  async send(input: PayoutInput): Promise<PayoutStep> {
    const payload = { receiverMSISDN: input.destination.account, amount: (input.amountMinor / 100).toFixed(2), referenceId: input.reference };
    try {
      const r = await this.http.request<Record<string, string>>(JAZZCASH_DISBURSE_API.transferPath, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await this.bearer()}` },
        body: this.body(payload),
        timeoutMs: 60_000,
        acceptAnyStatus: true,
      });
      return this.step(r.body, input.reference);
    } catch (e) {
      // No answer: it may have been paid. Never fail it blindly; check later.
      if (e instanceof ProviderError && e.kind !== 'declined' && e.kind !== 'misconfigured') return { status: 'pending', providerRef: input.reference, code: e.kind };
      throw e;
    }
  }

  async check(input: PayoutInput): Promise<PayoutStep> {
    const r = await this.http.request<Record<string, string>>(JAZZCASH_DISBURSE_API.inquiryPath, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.bearer()}` },
      body: this.body({ referenceId: input.reference }),
      retries: 2,
      acceptAnyStatus: true,
    });
    return this.step(r.body, input.reference);
  }

  private step(b: Record<string, string> | undefined, reference: string): PayoutStep {
    const code = String(b?.responseCode ?? b?.ResponseCode ?? '');
    const ref = b?.transactionID ?? b?.transactionId ?? reference;
    if (JAZZCASH_DISBURSE_API.successCodes.has(code)) return { status: 'paid', providerRef: ref, code, raw: b };
    if (JAZZCASH_DISBURSE_API.failureCodes.has(code)) return { status: 'failed', reason: msg(b) ?? `code ${code}`, code, raw: b };
    if (JAZZCASH_DISBURSE_API.pendingCodes.has(code) || !code) return { status: 'pending', providerRef: ref, code, raw: b };
    return { status: 'pending', providerRef: ref, code: `${code}: ${msg(b) ?? 'unrecognised'}`.slice(0, 60), raw: b };
  }
}

const msg = (b: Record<string, string> | undefined): string | undefined => b?.responseDescription ?? b?.ResponseMessage ?? b?.responseDesc ?? b?.message;
