import { randomUUID } from 'node:crypto';

import { createTestApp, resetState, signUp, TestApp, payByCard } from './helpers';

describe('wallet, payments and VIP', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
  });
  afterAll(() => t.close());

  const buy = (auth: { Authorization: string }, body: object, key = randomUUID()) => t.http.post('/v1/payments/purchases').set(auth).set('Idempotency-Key', key).send(body);

  it('daily check-in pays once a day, even under concurrent taps', async () => {
    const u = await signUp(t);
    const results = await Promise.all(Array.from({ length: 5 }, () => t.http.post('/v1/wallet/check-in').set(u.auth)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'ALREADY_CLAIMED')).toBe(true);
    const w = await t.http.get('/v1/wallet').set(u.auth).expect(200);
    expect(w.body.coins).toBe(30 + 5);
    expect(w.body.checkIn.checkedInToday).toBe(true);
  });

  it('an Idempotency-Key replays the first response', async () => {
    const u = await signUp(t);
    const key = randomUUID();
    const a = await t.http.post('/v1/wallet/rewards/ad').set(u.auth).set('Idempotency-Key', key).send({ adToken: 'ad-1' }).expect(200);
    const b = await t.http.post('/v1/wallet/rewards/ad').set(u.auth).set('Idempotency-Key', key).send({ adToken: 'ad-1' }).expect(200);
    expect(b.body).toEqual(a.body);
    expect((await t.http.get('/v1/wallet').set(u.auth)).body.coins).toBe(40);
    // The same ad token cannot pay twice either.
    const again = await t.http.post('/v1/wallet/rewards/ad').set(u.auth).send({ adToken: 'ad-1' }).expect(400);
    expect(again.body.error.code).toBe('AD_NOT_VERIFIED');
  });

  it('spending more than you have is refused with 402', async () => {
    const u = await signUp(t);
    const res = await t.http.post('/v1/wallet/boost').set(u.auth).expect(402);
    expect(res.body.error).toMatchObject({ code: 'INSUFFICIENT_COINS', details: { needed: 50, have: 30 } });
  });

  it('profile bonus needs a complete profile (the inviter is paid by referrals v2, not here)', async () => {
    const inviter = await signUp(t);
    const me = await t.http.get('/v1/me').set(inviter.auth);
    const u = await signUp(t, {}, me.body.inviteCode);
    const early = await t.http.post('/v1/wallet/rewards/profile').set(u.auth).expect(400);
    expect(early.body.error.code).toBe('PROFILE_INCOMPLETE');
    await t.http.patch('/v1/me').set(u.auth).send({ bio: 'hi', interests: ['Music', 'Travel', 'Coffee'], avatarUrl: 'https://i.pravatar.cc/400?img=3' }).expect(200);
    await t.http.post('/v1/wallet/rewards/profile').set(u.auth).expect(200);
    expect((await t.http.get('/v1/wallet').set(u.auth)).body.coins).toBe(80);
    await new Promise((r) => setTimeout(r, 300));
    expect((await t.http.get('/v1/wallet').set(inviter.auth)).body.coins).toBe(30);
  });

  it('store purchases credit once, even when retried', async () => {
    const u = await signUp(t);
    const key = randomUUID();
    const body = { productType: 'COIN_PACK', productId: 'pro', method: 'GOOGLE_PLAY', receipt: 'gp-token-1' };
    const first = await buy(u.auth, body, key).expect(201);
    expect(first.body.status).toBe('SUCCEEDED');
    expect(first.body.wallet.coins).toBe(30 + 3300);
    const retry = await buy(u.auth, body, key).expect(201);
    expect(retry.body.id).toBe(first.body.id);
    expect((await t.http.get('/v1/wallet').set(u.auth)).body.coins).toBe(3330);

    // The same store receipt can't be redeemed by another account.
    const other = await signUp(t);
    const stolen = await buy(other.auth, body).expect(409);
    expect(stolen.body.error.code).toBe('PAYMENT_DECLINED');
  });

  it('wallet payments need an OTP before coins arrive', async () => {
    const u = await signUp(t);
    const p = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'JAZZCASH', phone: '03001234567' }).expect(201);
    expect(p.body).toMatchObject({ status: 'REQUIRES_ACTION', nextAction: 'otp' });
    expect((await t.http.get('/v1/wallet').set(u.auth)).body.coins).toBe(30);
    const done = await t.http.post(`/v1/payments/purchases/${p.body.id}/confirm`).set(u.auth).send({ otp: '4321' }).expect(200);
    expect(done.body.status).toBe('SUCCEEDED');
    expect(done.body.wallet.coins).toBe(130);
  });

  it('VIP: trial, bonus coins, free filters, cancel keeps it until period end', async () => {
    const u = await signUp(t);
    const p = await payByCard(t, u.auth, { productType: 'VIP_PLAN', productId: 'vip_month' });
    expect(p.body.wallet.vip.active).toBe(true);
    expect(p.body.wallet.coins).toBe(230);
    const days = (new Date(p.body.wallet.vip.until).getTime() - Date.now()) / 86400000;
    expect(Math.round(days)).toBe(33); // 30 days + 3-day trial
    const cancelled = await t.http.post('/v1/vip/cancel').set(u.auth).expect(200);
    expect(cancelled.body).toMatchObject({ active: true, renews: false, status: 'CANCELED' });
  });

  it('cash-out needs the minimum and moves gems out of the wallet', async () => {
    const u = await signUp(t);
    const low = await t.http.post('/v1/wallet/cashouts').set(u.auth).set('Idempotency-Key', randomUUID()).send({ method: 'JAZZCASH', account: '03001234567' }).expect(400);
    expect(low.body.error.code).toBe('CASHOUT_BELOW_MINIMUM');
    await t.prisma.wallet.update({ where: { userId: u.id }, data: { gems: 6000 } });
    const ok = await t.http.post('/v1/wallet/cashouts').set(u.auth).set('Idempotency-Key', randomUUID()).send({ gems: 5000, method: 'EASYPAISA', account: '03001234567' }).expect(201);
    expect(ok.body.cashout).toMatchObject({ gems: 5000, usdCents: 2500, accountMasked: '0300•••567' });
    expect(ok.body.wallet.gems).toBe(1000);
    await new Promise((r) => setTimeout(r, 200));
    const list = await t.http.get('/v1/wallet/cashouts').set(u.auth).expect(200);
    expect(list.body[0].status).toBe('PAID');
  });

  it('the ledger explains every balance', async () => {
    const u = await signUp(t);
    await t.http.post('/v1/wallet/check-in').set(u.auth).expect(200);
    const tx = await t.http.get('/v1/wallet/transactions?limit=10').set(u.auth).expect(200);
    expect(tx.body.items.map((i: { title: string }) => i.title)).toEqual(['Daily check-in · day 1', 'Welcome bonus']);
    const sum = tx.body.items.reduce((a: number, i: { coins: number }) => a + i.coins, 0);
    expect(sum).toBe((await t.http.get('/v1/wallet').set(u.auth)).body.coins);
  });
});
