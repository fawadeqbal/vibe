import { randomUUID } from 'node:crypto';

import { jazzcashHash } from '../src/modules/payments/adapters/jazzcash/jazzcash.hash';
import type { TestApp } from './helpers';

/**
 * JazzCash and Easypaisa in LIVE mode, against fake provider servers
 * (global fetch is intercepted for their hosts). Proves the real adapters,
 * callbacks, inquiry and background flows work end to end.
 */
const LIVE_ENV: Record<string, string> = {
  PAYMENTS_PROVIDER: 'live',
  JAZZCASH_MERCHANT_ID: 'MC100',
  JAZZCASH_PASSWORD: 'jc-pass',
  JAZZCASH_INTEGRITY_SALT: 'jc-salt',
  EASYPAISA_STORE_ID: '777',
  EASYPAISA_USERNAME: 'ep-user',
  EASYPAISA_PASSWORD: 'ep-pass',
  EASYPAISA_ACCOUNT_NUM: '654321',
};

type Fake = (url: URL, body: Record<string, string>) => Promise<unknown> | unknown;

describe('payments (live JazzCash + Easypaisa against fake servers)', () => {
  let t: TestApp;
  const saved: Record<string, string | undefined> = {};
  const realFetch = global.fetch;
  let fakes: Record<string, Fake> = {};
  let helpers: typeof import('./helpers');
  const signUp = (app: TestApp) => helpers.signUp(app);

  beforeAll(async () => {
    for (const [k, v] of Object.entries(LIVE_ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const fake = Object.entries(fakes).find(([path]) => url.pathname.endsWith(path))?.[1];
      if (!url.hostname.includes('jazzcash') && !url.hostname.includes('easypa')) return realFetch(input, init);
      if (!fake) return new Response('not faked', { status: 500 });
      const body = await fake(url, init?.body ? JSON.parse(String(init.body)) : {});
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    // Config is read when AppModule is first imported, so import it only now that the env is set.
    helpers = await import('./helpers');
    t = await helpers.createTestApp();
    await helpers.resetState(t);
  });
  afterAll(async () => {
    await t.close();
    global.fetch = realFetch;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const buy = (auth: { Authorization: string }, body: object) => t.http.post('/v1/payments/purchases').set(auth).set('Idempotency-Key', randomUUID()).send(body);
  const waitFor = async (auth: { Authorization: string }, id: string, status: string) => {
    for (let i = 0; i < 40; i++) {
      const r = await t.http.get(`/v1/payments/purchases/${id}`).set(auth);
      if (r.body.status === status) return r;
      await new Promise((res) => setTimeout(res, 50));
    }
    throw new Error(`purchase ${id} never became ${status}`);
  };

  it('only methods with keys are offered', async () => {
    const u = await signUp(t);
    const r = await t.http.get('/v1/payments/methods').set(u.auth).expect(200);
    expect(r.body.methods.map((m: { method: string; mode: string }) => `${m.method}:${m.mode}`).sort()).toEqual(['EASYPAISA:live', 'JAZZCASH:live']);
    const off = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'GOOGLE_PLAY', receipt: 'x' }).expect(503);
    expect(off.body.error.message).toMatch(/isn't available/);
  });

  it('JazzCash wallet push: pending at once, coins once the customer approves', async () => {
    let request: Record<string, string> = {};
    fakes = {
      '/DoMWalletTransaction': async (_u, body) => {
        request = body;
        await new Promise((r) => setTimeout(r, 150)); // the customer taps "approve"
        return { pp_ResponseCode: '000', pp_ResponseMessage: 'Thank you for Using JazzCash', pp_TxnRefNo: body.pp_TxnRefNo };
      },
    };
    const u = await signUp(t);
    const p = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'JAZZCASH', phone: '03001234567', cnicLast6: '345678' }).expect(201);
    expect(p.body).toMatchObject({ status: 'REQUIRES_ACTION', action: { type: 'approve_in_app' }, amount: { currency: 'PKR', value: 277 } });
    const done = await waitFor(u.auth, p.body.id, 'SUCCEEDED');
    expect(done.body.wallet.coins).toBe(130);
    expect(request).toMatchObject({ pp_MerchantID: 'MC100', pp_Amount: '27700', pp_MobileNumber: '03001234567', pp_CNIC: '345678' });
    expect(request.pp_SecureHash).toBe(jazzcashHash(request, 'jc-salt'));
  });

  it('JazzCash hosted page: signed callback → inquiry → coins, and back to the app', async () => {
    fakes = { '/Inquire': () => ({ pp_ResponseCode: '000', pp_PaymentResponseCode: '121', pp_Status: 'Completed' }) };
    const u = await signUp(t);
    const p = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'JAZZCASH' }).expect(201);
    expect(p.body.action).toMatchObject({ type: 'redirect', method: 'POST' });
    const ref = p.body.action.fields.pp_TxnRefNo as string;
    const forged = { pp_TxnRefNo: ref, pp_ResponseCode: '000', pp_SecureHash: 'NOPE' };
    const bad = await t.http.post('/v1/webhooks/jazzcash').type('form').send(forged).expect(303);
    expect(bad.headers.location).toContain('status=error');
    const fields = { pp_TxnRefNo: ref, pp_ResponseCode: '000', pp_ResponseMessage: 'Success', pp_Amount: '27700' };
    const res = await t.http.post('/v1/webhooks/jazzcash').type('form').send({ ...fields, pp_SecureHash: jazzcashHash(fields, 'jc-salt') }).expect(303);
    expect(res.headers.location).toBe(`vibe://payment-return?purchase=${p.body.id}&status=done`);
    const done = await t.http.get(`/v1/payments/purchases/${p.body.id}`).set(u.auth).expect(200);
    expect(done.body.status).toBe('SUCCEEDED');
    // The IPN for the same result is acknowledged with a signed answer and changes nothing.
    const ipn = await t.http.post('/v1/webhooks/jazzcash').send({ ...fields, pp_SecureHash: jazzcashHash(fields, 'jc-salt') }).expect(201);
    expect(ipn.body.pp_ResponseCode).toBe('000');
    expect((await t.http.get('/v1/wallet').set(u.auth)).body.coins).toBe(130);
  });

  it('Easypaisa: an unclear outcome stays pending until the IPN + inquiry settle it', async () => {
    fakes = {
      '/initiate-ma-transaction': () => {
        throw Object.assign(new Error('socket hang up'), { name: 'TimeoutError' });
      },
      '/inquire-transaction': () => ({ responseCode: '0000', transactionStatus: 'PAID', transactionId: 'EP99' }),
    };
    const u = await signUp(t);
    const p = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'EASYPAISA', phone: '03451234567' }).expect(201);
    expect(p.body.status).toBe('REQUIRES_ACTION');
    await new Promise((r) => setTimeout(r, 100));
    expect((await t.http.get(`/v1/payments/purchases/${p.body.id}`).set(u.auth)).body.status).toBe('REQUIRES_ACTION');
    const order = (await t.prisma.purchase.findUniqueOrThrow({ where: { id: p.body.id } })).providerRef!;
    await t.http.post('/v1/webhooks/easypaisa').send({ orderRefNumber: order }).expect(200);
    const done = await t.http.get(`/v1/payments/purchases/${p.body.id}`).set(u.auth).expect(200);
    expect(done.body.status).toBe('SUCCEEDED');
  });
});
