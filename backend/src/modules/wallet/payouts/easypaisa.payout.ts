import { PaymentMethod } from '@prisma/client';

import { FetchLike, ProviderError, ProviderHttp } from '../../../integrations/core/provider-http';
import { PayoutAdapter, PayoutInput, PayoutStep } from './payout-adapter';

export interface EasypaisaDisburseKeys {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** The merchant (sender) Easypaisa account. */
  account: string;
}

/**
 * The parts of Easypaisa's disbursement API that vary by agreement, in one
 * place. Easypaisa shares the spec with the corporate disbursement account —
 * compare with your copy when keys arrive.
 */
export const EASYPAISA_DISBURSE_API = {
  transferPath: '/ma-to-ma-transfer',
  inquiryPath: '/transaction-inquiry',
  /**
   * Only codes listed as failures return the gems automatically. Any other
   * unknown answer stays "processing" for staff to look at — for money going
   * out, a wrong "failed" could pay someone twice.
   */
  failureCodes: new Set<string>(),
  successCodes: new Set(['0000']),
  pendingCodes: new Set(['0001P', 'PENDING']),
};

/** Easypaisa mobile-account disbursement (gems cash-out to an Easypaisa wallet). */
export class EasypaisaPayoutAdapter implements PayoutAdapter {
  readonly method = PaymentMethod.EASYPAISA;
  readonly provider = 'easypaisa-disburse';
  private readonly http: ProviderHttp;

  constructor(
    private readonly keys: EasypaisaDisburseKeys,
    fetchImpl?: FetchLike,
  ) {
    this.http = new ProviderHttp('easypaisa-disburse', keys.baseUrl.replace(/\/$/, ''), fetchImpl);
  }

  private get headers() {
    return { 'X-IBM-Client-Id': this.keys.clientId, 'X-IBM-Client-Secret': this.keys.clientSecret, 'X-Channel': 'vibe' };
  }

  async send(input: PayoutInput): Promise<PayoutStep> {
    try {
      const r = await this.http.request<Record<string, string>>(EASYPAISA_DISBURSE_API.transferPath, {
        method: 'POST',
        headers: this.headers,
        body: { senderAccount: this.keys.account, receiverMsisdn: input.destination.account, amount: (input.amountMinor / 100).toFixed(2), transactionReference: input.reference, receiverName: input.destination.holderName },
        timeoutMs: 60_000,
        acceptAnyStatus: true,
      });
      return this.step(r.body, input.reference);
    } catch (e) {
      if (e instanceof ProviderError && e.kind !== 'declined' && e.kind !== 'misconfigured') return { status: 'pending', providerRef: input.reference, code: e.kind };
      throw e;
    }
  }

  async check(input: PayoutInput): Promise<PayoutStep> {
    const r = await this.http.request<Record<string, string>>(EASYPAISA_DISBURSE_API.inquiryPath, { method: 'POST', headers: this.headers, body: { transactionReference: input.reference }, retries: 2, acceptAnyStatus: true });
    return this.step(r.body, input.reference);
  }

  private step(b: Record<string, string> | undefined, reference: string): PayoutStep {
    const code = String(b?.ResponseCode ?? b?.responseCode ?? '');
    const ref = b?.TransactionId ?? b?.transactionId ?? reference;
    if (EASYPAISA_DISBURSE_API.successCodes.has(code)) return { status: 'paid', providerRef: ref, code, raw: b };
    if (EASYPAISA_DISBURSE_API.failureCodes.has(code)) return { status: 'failed', reason: msg(b) ?? `code ${code}`, code, raw: b };
    if (EASYPAISA_DISBURSE_API.pendingCodes.has(code) || !code) return { status: 'pending', providerRef: ref, code, raw: b };
    return { status: 'pending', providerRef: ref, code: `${code}: ${msg(b) ?? 'unrecognised'}`.slice(0, 60), raw: b };
  }
}

const msg = (b: Record<string, string> | undefined): string | undefined => b?.responseDescription ?? b?.ResponseMessage ?? b?.responseDesc ?? b?.message;
