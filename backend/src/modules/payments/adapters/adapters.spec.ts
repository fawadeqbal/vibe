import { ProductType, Purchase } from '@prisma/client';

import { AppConfig } from '../../../config/app-config.service';
import { EasypaisaAdapter, inquiryStep } from './easypaisa/easypaisa.adapter';
import { EasypaisaClient } from './easypaisa/easypaisa.client';
import { JazzCashAdapter } from './jazzcash/jazzcash.adapter';
import { JazzCashClient } from './jazzcash/jazzcash.client';
import { jazzcashHash, jazzcashHashValid } from './jazzcash/jazzcash.hash';
import { PaymentContext } from './payment-adapter';
import { localMobile, pktStamp, txnRef } from './pk-format';
import { appleAccountToken, playAccountToken } from './store/account-token';
import { transactionStep } from './store/app-store.adapter';
import { subscriptionStep } from './store/google-play.adapter';

const config = { get: (k: string) => ({ PAYMENT_CHECKOUT_TTL_MINUTES: 30, PAYMENT_RETURN_URL: 'vibe://payment-return' })[k], url: (p: string) => `https://api.test${p}` } as unknown as AppConfig;

function ctx(over: Partial<PaymentContext['input']> = {}, purchase: Partial<Purchase> = {}): PaymentContext {
  return {
    purchase: { id: 'pur1', userId: 'u1', providerRef: null, metadata: {}, ...purchase } as Purchase,
    sku: 'coins_starter',
    productType: ProductType.COIN_PACK,
    title: 'Starter pack',
    amount: { currency: 'PKR', minor: 27700 },
    user: { id: 'u1', email: 'a@b.c', name: 'A' },
    input: over,
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Pakistan formats', () => {
  it('PKT timestamps, short refs and mobile numbers', () => {
    expect(pktStamp(new Date('2026-10-05T19:30:00Z'))).toBe('20261006003000');
    expect(txnRef('T').length).toBeLessThanOrEqual(20);
    expect(localMobile('+92 300 1234567')).toBe('03001234567');
    expect(localMobile('923001234567')).toBe('03001234567');
    expect(localMobile('03001234567')).toBe('03001234567');
    expect(localMobile('0300123')).toBeNull();
  });
});

describe('JazzCash', () => {
  const salt = 'salt123';
  it('secure hash: sorted pp_ fields, empties skipped, salt first, upper-case', () => {
    const fields = { pp_TxnRefNo: 'T1', pp_Amount: '100', pp_Empty: '', other: 'x', ppmpf_1: 'm' };
    const { createHmac } = jest.requireActual('node:crypto');
    const expected = createHmac('sha256', salt).update('salt123&100&T1&m').digest('hex').toUpperCase();
    expect(jazzcashHash(fields, salt)).toBe(expected);
    expect(jazzcashHashValid({ ...fields, pp_SecureHash: expected.toLowerCase() }, salt)).toBe(true);
    expect(jazzcashHashValid({ ...fields, pp_Amount: '1', pp_SecureHash: expected }, salt)).toBe(false);
  });

  const client = (route: (path: string, body: Record<string, string>) => Response) =>
    new JazzCashClient({ env: 'sandbox', merchantId: 'MC1', password: 'pw', salt }, async (input, init) => route(new URL(input).pathname, JSON.parse(String(init?.body ?? '{}'))));

  it('wallet push: signed request, pending at once, background result 000 → succeeded', async () => {
    let sent: Record<string, string> = {};
    const adapter = new JazzCashAdapter(
      client((path, body) => {
        sent = body;
        return json({ pp_ResponseCode: '000', pp_ResponseMessage: 'Thank you', pp_TxnRefNo: body.pp_TxnRefNo });
      }),
      config,
    );
    const step = await adapter.start(ctx({ phone: '+923001234567', cnicLast6: '123456' }));
    expect(step).toMatchObject({ status: 'pending', action: 'approve_in_app' });
    if (step.status !== 'pending' || !step.background) throw new Error('expected background work');
    const done = await step.background();
    expect(done).toMatchObject({ status: 'succeeded', providerRef: step.providerRef });
    expect(sent).toMatchObject({ pp_MobileNumber: '03001234567', pp_CNIC: '123456', pp_Amount: '27700', pp_TxnCurrency: 'PKR', pp_MerchantID: 'MC1' });
    expect(jazzcashHashValid(sent, salt)).toBe(true);
  });

  it('wallet push decline and pending codes', async () => {
    const run = async (code: string) => {
      const a = new JazzCashAdapter(client(() => json({ pp_ResponseCode: code, pp_ResponseMessage: 'msg' })), config);
      const s = await a.start(ctx({ phone: '03001234567', cnicLast6: '123456' }));
      return s.status === 'pending' && s.background ? s.background() : s;
    };
    expect(await run('004')).toMatchObject({ status: 'failed', reason: 'msg' });
    expect(await run('157')).toMatchObject({ status: 'pending' });
  });

  it('without a CNIC: hosted page form, posted back to our webhook', async () => {
    const a = new JazzCashAdapter(client(() => json({})), config);
    const s = await a.start(ctx({}));
    expect(s).toMatchObject({ status: 'pending', action: 'redirect', actionData: { method: 'POST', url: 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/' } });
    if (s.status !== 'pending') throw new Error();
    expect(s.actionData?.fields?.pp_ReturnURL).toBe('https://api.test/v1/webhooks/jazzcash');
    expect(jazzcashHashValid(s.actionData!.fields!, salt)).toBe(true);
  });

  it('inquiry decides: completed → succeeded; still waiting → pending', async () => {
    const a = (r: object) => new JazzCashAdapter(client(() => json(r)), config);
    const p = ctx({}, { providerRef: 'T1' });
    expect(await a({ pp_ResponseCode: '000', pp_PaymentResponseCode: '121', pp_Status: 'Completed' }).check(p)).toMatchObject({ status: 'succeeded' });
    expect(await a({ pp_ResponseCode: '000', pp_PaymentResponseCode: '157' }).check(p)).toMatchObject({ status: 'pending' });
    expect(await a({ pp_ResponseCode: '000', pp_PaymentResponseCode: '004', pp_PaymentResponseMessage: 'Insufficient balance' }).check(p)).toMatchObject({ status: 'failed', reason: 'Insufficient balance' });
    expect(await a({ pp_ResponseCode: '110' }).check(p)).toMatchObject({ status: 'pending' }); // inquiry itself failed: try again later
  });
});

describe('Easypaisa', () => {
  const client = (route: (path: string, body: Record<string, string>, headers: Record<string, string>) => Response) =>
    new EasypaisaClient({ env: 'sandbox', storeId: '123', username: 'u', password: 'p', accountNum: '999' }, async (input, init) =>
      route(new URL(input).pathname, JSON.parse(String(init?.body ?? '{}')), init?.headers as Record<string, string>),
    );

  it('mobile account charge: credentials header, amount in rupees, 0000 → succeeded', async () => {
    let seen: { body?: Record<string, string>; headers?: Record<string, string> } = {};
    const a = new EasypaisaAdapter(
      client((_p, body, headers) => {
        seen = { body, headers };
        return json({ responseCode: '0000', transactionId: 'EP1' });
      }),
      config,
    );
    const s = await a.start(ctx({ phone: '03451234567' }));
    if (s.status !== 'pending' || !s.background) throw new Error('expected background');
    expect(await s.background()).toMatchObject({ status: 'succeeded' });
    expect(seen.body).toMatchObject({ storeId: '123', transactionAmount: '277.00', transactionType: 'MA', mobileAccountNo: '03451234567' });
    expect(seen.headers?.Credentials).toBe(Buffer.from('u:p').toString('base64'));
  });

  it('inquiry statuses', () => {
    expect(inquiryStep({ responseCode: '0000', transactionStatus: 'PAID' }, 'E1')).toMatchObject({ status: 'succeeded' });
    expect(inquiryStep({ responseCode: '0000', transactionStatus: 'PENDING' }, 'E1')).toMatchObject({ status: 'pending' });
    expect(inquiryStep({ responseCode: '0000', transactionStatus: 'FAILED' }, 'E1')).toMatchObject({ status: 'failed' });
  });

  it('IPN links must point at Easypaisa', async () => {
    const c = client(() => json({ order_id: 'E9' }));
    await expect(c.readIpn('https://easypay.easypaisa.com.pk/easypay-service/rest/v1/ipn/1')).resolves.toEqual({ orderId: 'E9' });
    await expect(c.readIpn('https://evil.example/ipn')).rejects.toThrow('not an Easypaisa URL');
  });
});

describe('store verification rules', () => {
  const owner = playAccountToken('u1');
  const future = new Date(Date.now() + 30 * 86400_000).toISOString();

  it('Play subscription: right plan, right owner, active', () => {
    const sub = { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' as const, latestOrderId: 'GPA.1', lineItems: [{ productId: 'vip_vip_month', expiryTime: future }], externalAccountIdentifiers: { obfuscatedExternalAccountId: owner } };
    expect(subscriptionStep(sub, 'vip_vip_month', 'tok', owner)).toMatchObject({ status: 'succeeded', providerRef: 'GPA.1', storeRef: 'tok' });
    expect(subscriptionStep(sub, 'vip_vip_year', 'tok', owner)).toMatchObject({ status: 'failed' });
    expect(subscriptionStep(sub, 'vip_vip_month', 'tok', playAccountToken('u2'))).toMatchObject({ status: 'failed', reason: 'This subscription belongs to another account' });
    expect(subscriptionStep({ ...sub, subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }, 'vip_vip_month', 'tok', owner)).toMatchObject({ status: 'failed' });
  });

  it('App Store transaction: bundle, product, owner, revocation', () => {
    const tx = { transactionId: '2000001', originalTransactionId: '2000000', bundleId: 'com.vibe', productId: 'coins_starter', appAccountToken: appleAccountToken('u1') };
    const expect_ = { bundleId: 'com.vibe', sku: 'coins_starter', owner: appleAccountToken('u1') };
    expect(transactionStep(tx, expect_)).toMatchObject({ status: 'succeeded', providerRef: '2000001', storeRef: '2000000' });
    expect(transactionStep({ ...tx, bundleId: 'com.other' }, expect_)).toMatchObject({ status: 'failed' });
    expect(transactionStep({ ...tx, revocationDate: Date.now() }, expect_)).toMatchObject({ status: 'failed', reason: 'Apple refunded this purchase' });
    expect(transactionStep({ ...tx, appAccountToken: appleAccountToken('u2') }, expect_)).toMatchObject({ status: 'failed' });
    expect(appleAccountToken('u1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

