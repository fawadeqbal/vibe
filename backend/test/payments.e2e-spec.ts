import { randomUUID } from 'node:crypto';

import { AppleJwsVerifier } from '../src/integrations/apple/apple-jws';
import { AppConfig } from '../src/config/app-config.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { StoreSubscriptionsService } from '../src/modules/payments/store-subscriptions.service';
import { signLikeApple, trustTestChain } from './support/apple-test-signing';
import { createTestApp, payByCard, resetState, signUp, staffLogin, TestApp, TestStaff } from './helpers';

describe('payments (dev adapters, webhooks, store subscriptions)', () => {
  let t: TestApp;
  let owner: TestStaff;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
    owner = await staffLogin(t);
    // Trust the test chain instead of Apple's root for the App Store notification tests.
    trustTestChain(t.app.get(AppleJwsVerifier));
  });
  afterAll(() => t.close());

  const setSetting = (key: string, value: unknown) => t.http.put(`/v1/admin/settings/${key}`).set(owner.auth).send({ value }).expect(200);
  const buy = (auth: { Authorization: string }, body: object, key: string = randomUUID()) => t.http.post('/v1/payments/purchases').set(auth).set('Idempotency-Key', key).send(body);

  it('lists methods; store builds only get their store billing', async () => {
    const u = await signUp(t);
    const all = await t.http.get('/v1/payments/methods').set(u.auth).expect(200);
    expect(all.body.methods.map((m: { method: string }) => m.method).sort()).toEqual(['APP_STORE', 'BANK', 'CARD', 'EASYPAISA', 'GOOGLE_PLAY', 'JAZZCASH']);
    expect(all.body.methods.every((m: { mode: string }) => m.mode === 'dev')).toBe(true);
    expect(all.body.usdToPkr).toBe(280);
    expect(all.body.store.playAccountId).toMatch(/^[0-9a-f]{64}$/);
    expect(all.body.store.skus.coinPacks[0].sku).toMatch(/^coins_/);
    const play = await t.http.get('/v1/payments/methods').set(u.auth).set('X-App-Store', 'play').expect(200);
    expect(play.body.methods.map((m: { method: string }) => m.method)).toEqual(['GOOGLE_PLAY']);
    await setSetting('payments.localMethodsInStoreApps', true);
    const allowed = await t.http.get('/v1/payments/methods').set(u.auth).set('X-App-Store', 'play').expect(200);
    expect(allowed.body.methods.length).toBe(5);
  });

  it('local methods charge PKR at the configured rate; card decline fails cleanly', async () => {
    const u = await signUp(t);
    const p = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'JAZZCASH', phone: '03001234567' }).expect(201);
    expect(p.body.amount).toEqual({ currency: 'PKR', value: 277 }); // $0.99 × 280, whole rupees
    expect(p.body.action).toMatchObject({ type: 'otp' });
    const declined = await payByCard(t, u.auth, { productType: 'COIN_PACK', productId: 'starter' }, 'decline');
    expect(declined.body.status).toBe('FAILED');
    expect(declined.body.failureReason).toMatch(/declined/);
    const trail = await t.prisma.paymentEvent.findMany({ where: { purchaseId: declined.body.id }, orderBy: { createdAt: 'asc' } });
    expect(trail.map((e) => e.type)).toEqual(expect.arrayContaining(['charge.started', 'charge.pending', 'status.checked', 'charge.failed']));
  });

  it('card webhooks are deduplicated: one payment, one credit', async () => {
    const u = await signUp(t);
    const paid = await payByCard(t, u.auth, { productType: 'COIN_PACK', productId: 'starter' });
    expect(paid.body.status).toBe('SUCCEEDED');
    expect(paid.body.wallet.coins).toBe(130);
    const ev = await t.prisma.webhookEvent.findFirstOrThrow({ where: { provider: 'card', subjectId: paid.body.id } });
    expect(ev.status).toBe('PROCESSED');
    // Replay the same event: inbox says duplicate, no second credit.
    const again = await t.app.get(PaymentsService).refreshByRef('CARD', (await t.prisma.purchase.findUniqueOrThrow({ where: { id: paid.body.id } })).providerRef!);
    expect(again?.status).toBe('SUCCEEDED');
    expect((await t.http.get('/v1/wallet').set(u.auth)).body.coins).toBe(130);
  });

  it('bank transfer: details + reference, staff mark paid; unpaid ones expire', async () => {
    await setSetting('payments.bankAccountTitle', 'Vibe Ltd');
    await setSetting('payments.bankIban', 'PK36SCBL0000001123456702');
    await setSetting('payments.bankName', 'SCB');
    const u = await signUp(t);
    const p = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'BANK' }).expect(201);
    expect(p.body.action).toMatchObject({ type: 'bank_transfer', bank: { accountTitle: 'Vibe Ltd', iban: 'PK36SCBL0000001123456702', amount: 'PKR 277' } });
    await t.http.post(`/v1/payments/purchases/${p.body.id}/bank-reference`).set(u.auth).send({ reference: 'FT123' }).expect(200);
    await t.http.post(`/v1/admin/purchases/${p.body.id}/mark-paid`).set(owner.auth).send({ ref: 'stmt-1' }).expect((r) => expect(r.status).toBeLessThan(300));
    const done = await t.http.get(`/v1/payments/purchases/${p.body.id}`).set(u.auth).expect(200);
    expect(done.body.status).toBe('SUCCEEDED');
    expect(done.body.receipt).toBe(p.body.receipt); // keeps the VB- reference

    const late = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'BANK' }).expect(201);
    await t.prisma.purchase.update({ where: { id: late.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await t.app.get(PaymentsService).reconcile();
    expect((await t.http.get(`/v1/payments/purchases/${late.body.id}`).set(u.auth)).body.status).toBe('EXPIRED');
  });

  it('cancel closes a pending wallet payment', async () => {
    const u = await signUp(t);
    const p = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'EASYPAISA', phone: '03451234567' }).expect(201);
    const c = await t.http.post(`/v1/payments/purchases/${p.body.id}/cancel`).set(u.auth).expect(200);
    expect(c.body.status).toBe('EXPIRED');
    await t.http.post(`/v1/payments/purchases/${p.body.id}/confirm`).set(u.auth).send({ otp: '1234' }).expect(200).expect((r) => expect(r.body.status).toBe('EXPIRED'));
  });

  it('Google Play voided purchase (RTDN) claws coins back, once', async () => {
    const u = await signUp(t);
    const p = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'GOOGLE_PLAY', receipt: 'GPA.void-1' }).expect(201);
    expect(p.body.wallet.coins).toBe(130);
    const msg = (data: object, id: string) => ({ message: { data: Buffer.from(JSON.stringify(data)).toString('base64'), messageId: id }, subscription: 'projects/x/subscriptions/y' });
    const voided = { packageName: '', voidedPurchaseNotification: { purchaseToken: 'GPA.void-1', orderId: 'GPA.void-1', productType: 2 } };
    await t.http.post('/v1/webhooks/google-play').send(msg(voided, 'm-1')).expect(200);
    await t.http.post('/v1/webhooks/google-play').send(msg(voided, 'm-1')).expect(200);
    expect((await t.http.get('/v1/wallet').set(u.auth)).body.coins).toBe(30);
    expect((await t.prisma.purchase.findUniqueOrThrow({ where: { id: p.body.id } })).status).toBe('REFUNDED');
    expect(await t.prisma.webhookEvent.count({ where: { provider: 'google-play' } })).toBe(1);
  });

  it('store subscriptions: renewal extends VIP and is recorded once; cancel, expiry, refund', async () => {
    const u = await signUp(t);
    const p = await buy(u.auth, { productType: 'VIP_PLAN', productId: 'vip_month', method: 'APP_STORE', receipt: '1000001' }).expect(201);
    const sub = await t.prisma.subscription.findFirstOrThrow({ where: { userId: u.id } });
    expect(sub.storeRef).toBe('1000001');
    expect(p.body.wallet.vip.active).toBe(true);
    const subs = t.app.get(StoreSubscriptionsService);
    const end = new Date(sub.currentPeriodEnd.getTime() + 30 * 86400_000);
    const renewal = { method: 'APP_STORE' as const, storeRef: '1000001', sku: 'vip_vip_month', state: 'active' as const, autoRenew: true, periodEnd: end, latestChargeRef: '1000002' };
    expect(await subs.sync(renewal)).toMatchObject({ status: 'processed', note: 'renewed' });
    expect(await subs.sync(renewal)).toMatchObject({ status: 'ignored' });
    expect(await t.prisma.purchase.count({ where: { userId: u.id, providerRef: '1000002' } })).toBe(1);
    const vip = await t.http.get('/v1/vip').set(u.auth).expect(200);
    expect(new Date(vip.body.until).getTime()).toBe(end.getTime());
    expect(vip.body.manageUrl).toBe('https://apps.apple.com/account/subscriptions');
    // Store subscriptions are cancelled in the store, not here.
    const nope = await t.http.post('/v1/vip/cancel').set(u.auth).expect(409);
    expect(nope.body.error.details.manageUrl).toBeDefined();
    expect(await subs.sync({ ...renewal, state: 'canceled', autoRenew: false })).toMatchObject({ status: 'processed' });
    expect((await t.http.get('/v1/vip').set(u.auth)).body).toMatchObject({ active: true, renews: false });
    expect(await subs.sync({ ...renewal, state: 'expired', autoRenew: false })).toMatchObject({ status: 'processed', note: 'expired' });
    expect((await t.http.get('/v1/vip').set(u.auth)).body.active).toBe(false);
    const refund = await subs.refundCharge('APP_STORE', '1000002', undefined, 'Refunded by Apple');
    expect(refund).toMatchObject({ status: 'processed', note: 'refunded' });
  });

  it('App Store Server Notification v2: signature checked, REFUND handled', async () => {
    const u = await signUp(t);
    const p = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'APP_STORE', receipt: '3000001' }).expect(201);
    const tx = await signLikeApple({ transactionId: '3000001', originalTransactionId: '3000001', bundleId: 'com.vibe', productId: 'coins_starter' });
    const payload = await signLikeApple({ notificationType: 'REFUND', notificationUUID: randomUUID(), data: { bundleId: 'com.vibe', environment: 'Sandbox', signedTransactionInfo: tx } });
    await t.http.post('/v1/webhooks/app-store').send({ signedPayload: payload }).expect(200);
    expect((await t.prisma.purchase.findUniqueOrThrow({ where: { id: p.body.id } })).status).toBe('REFUNDED');
    // A forged payload (wrong signature) is refused.
    const [h, b] = payload.split('.');
    await t.http.post('/v1/webhooks/app-store').send({ signedPayload: `${h}.${b}.AAAA` }).expect(401);
  });

  it('generic signed webhook still marks purchases paid', async () => {
    const u = await signUp(t);
    const p = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'EASYPAISA', phone: '03451234567' }).expect(201);
    const body = JSON.stringify({ purchaseId: p.body.id, providerRef: 'ext-1', status: 'succeeded' });
    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', t.app.get(AppConfig).get('PAYMENT_WEBHOOK_SECRET')).update(body).digest('hex');
    await t.http.post('/v1/webhooks/payments').set('Content-Type', 'application/json').set('X-Vibe-Signature', sig).send(body).expect(200);
    expect((await t.http.get(`/v1/payments/purchases/${p.body.id}`).set(u.auth)).body.status).toBe('SUCCEEDED');
    await t.http.post('/v1/webhooks/payments').set('Content-Type', 'application/json').set('X-Vibe-Signature', 'bad').send(body).expect(401);
  });

  it('a store receipt that failed can be resent with the same key and is verified again', async () => {
    const u = await signUp(t);
    const key = 'receipt-key-1';
    const p = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'GOOGLE_PLAY', receipt: 'GPA.retry-1' }, key).expect(201);
    // Simulate an earlier transient failure.
    await t.prisma.purchase.update({ where: { id: p.body.id }, data: { status: 'FAILED', failureReason: 'Could not reach the payment provider' } });
    await t.prisma.ledgerEntry.deleteMany({ where: { idempotencyKey: `purchase:${p.body.id}` } });
    await t.prisma.wallet.update({ where: { userId: u.id }, data: { coins: 30 } });
    const again = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'GOOGLE_PLAY', receipt: 'GPA.retry-1' }, key).expect(201);
    expect(again.body).toMatchObject({ id: p.body.id, status: 'SUCCEEDED' });
    expect(again.body.wallet.coins).toBe(130);
    // A successful one is not re-run.
    const third = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'GOOGLE_PLAY', receipt: 'GPA.retry-1' }, key).expect(201);
    expect(third.body.wallet.coins).toBe(130);
  });
});
