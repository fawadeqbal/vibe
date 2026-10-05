import { FetchLike, ProviderHttp } from '../../../../integrations/core/provider-http';
import { pktStamp } from '../pk-format';
import { jazzcashHash, jazzcashHashValid } from './jazzcash.hash';

export interface JazzCashKeys {
  env: 'sandbox' | 'production';
  merchantId: string;
  password: string;
  salt: string;
}

const HOSTS = { sandbox: 'https://sandbox.jazzcash.com.pk', production: 'https://payments.jazzcash.com.pk' };

export type JazzCashResponse = Record<string, string | undefined> & { pp_ResponseCode?: string; pp_ResponseMessage?: string };

/**
 * JazzCash merchant API (v2.0 mobile-wallet, payment inquiry, hosted page).
 * Field names and codes follow JazzCash's merchant integration guide;
 * response codes are mapped in jazzcash.adapter.ts.
 */
export class JazzCashClient {
  private readonly http: ProviderHttp;

  constructor(
    private readonly keys: JazzCashKeys,
    fetchImpl?: FetchLike,
  ) {
    this.http = new ProviderHttp('jazzcash', HOSTS[keys.env], fetchImpl);
  }

  get host(): string {
    return HOSTS[this.keys.env];
  }

  private base(txnRef: string, amountMinor: number, description: string, expiresAt: Date): Record<string, string> {
    return {
      pp_Language: 'EN',
      pp_MerchantID: this.keys.merchantId,
      pp_SubMerchantID: '',
      pp_Password: this.keys.password,
      pp_BankID: '',
      pp_ProductID: '',
      pp_TxnRefNo: txnRef,
      pp_Amount: String(amountMinor),
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: pktStamp(new Date()),
      pp_BillReference: txnRef,
      pp_Description: description.slice(0, 100),
      pp_TxnExpiryDateTime: pktStamp(expiresAt),
      ppmpf_1: '',
      ppmpf_2: '',
      ppmpf_3: '',
      ppmpf_4: '',
      ppmpf_5: '',
    };
  }

  sign(fields: Record<string, string>): Record<string, string> {
    return { ...fields, pp_SecureHash: jazzcashHash(fields, this.keys.salt) };
  }

  verify(fields: Record<string, unknown>): boolean {
    return jazzcashHashValid(fields, this.keys.salt);
  }

  /**
   * Mobile-wallet charge: JazzCash sends the customer an approval prompt and
   * answers when they approve/decline or it times out (~60 s), so the call is
   * slow and never retried (a retry could charge twice).
   */
  async mwallet(input: { txnRef: string; amountMinor: number; description: string; mobile: string; cnicLast6: string; expiresAt: Date }): Promise<JazzCashResponse> {
    const body = this.sign({ ...this.base(input.txnRef, input.amountMinor, input.description, input.expiresAt), pp_MobileNumber: input.mobile, pp_CNIC: input.cnicLast6 });
    const r = await this.http.request<JazzCashResponse>('/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction', { method: 'POST', body, timeoutMs: 100_000, acceptAnyStatus: true });
    return typeof r.body === 'object' ? r.body : { pp_ResponseCode: 'HTTP', pp_ResponseMessage: String(r.body).slice(0, 200) };
  }

  /** Where a transaction stands (safe to repeat). */
  async inquire(txnRef: string): Promise<JazzCashResponse> {
    const body = this.sign({ pp_TxnRefNo: txnRef, pp_MerchantID: this.keys.merchantId, pp_Password: this.keys.password });
    const r = await this.http.request<JazzCashResponse>('/ApplicationAPI/API/PaymentInquiry/Inquire', { method: 'POST', body, retries: 2, acceptAnyStatus: true });
    return typeof r.body === 'object' ? r.body : { pp_ResponseCode: 'HTTP', pp_ResponseMessage: String(r.body).slice(0, 200) };
  }

  /** Hosted payment page (wallet, card or voucher): the app posts these fields to `url`. */
  hostedForm(input: { txnRef: string; amountMinor: number; description: string; returnUrl: string; expiresAt: Date }): { url: string; fields: Record<string, string> } {
    const fields = this.sign({ ...this.base(input.txnRef, input.amountMinor, input.description, input.expiresAt), pp_Version: '1.1', pp_TxnType: '', pp_ReturnURL: input.returnUrl });
    return { url: `${this.host}/CustomerPortal/transactionmanagement/merchantform/`, fields };
  }
}
