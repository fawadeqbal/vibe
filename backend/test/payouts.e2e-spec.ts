import { randomUUID } from 'node:crypto';

import { CashoutService } from '../src/modules/wallet/cashout.service';
import { createTestApp, resetState, signUp, staffLogin, TestApp, TestStaff } from './helpers';

describe('payouts (saved accounts, rails, bank batches, KYC)', () => {
  let t: TestApp;
  let owner: TestStaff;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
    owner = await staffLogin(t);
  });
  afterAll(() => t.close());

  const cash = (auth: { Authorization: string }, body: object) => t.http.post('/v1/wallet/cashouts').set(auth).set('Idempotency-Key', randomUUID()).send(body);
  const rich = async () => {
    const u = await signUp(t);
    await t.prisma.wallet.update({ where: { userId: u.id }, data: { gems: 20_000 } });
    return u;
  };

  it('saves wallet numbers and IBANs (validated, sealed, masked)', async () => {
    const u = await signUp(t);
    const bad = await t.http.post('/v1/wallet/payout-accounts').set(u.auth).send({ method: 'JAZZCASH', account: '0300123', holderName: 'Sara' }).expect(400);
    expect(bad.body.error.message).toMatch(/03001234567/);
    const badIban = await t.http.post('/v1/wallet/payout-accounts').set(u.auth).send({ method: 'BANK', account: 'PK36SCBL0000001123456703', holderName: 'Sara', bankName: 'SCB' }).expect(400);
    expect(badIban.body.error.message).toMatch(/IBAN/);
    const jc = await t.http.post('/v1/wallet/payout-accounts').set(u.auth).send({ method: 'JAZZCASH', account: '+92 300 1234567', holderName: 'Sara Khan' }).expect(201);
    expect(jc.body).toMatchObject({ method: 'JAZZCASH', accountMasked: '0300•••567', isDefault: true });
    const bank = await t.http.post('/v1/wallet/payout-accounts').set(u.auth).send({ method: 'BANK', account: 'pk36 scbl 0000 0011 2345 6702', holderName: 'Sara Khan', bankName: 'Standard Chartered', makeDefault: true }).expect(201);
    expect(bank.body).toMatchObject({ accountMasked: 'PK36 •••• 6702', isDefault: true });
    const row = await t.prisma.payoutAccount.findUniqueOrThrow({ where: { id: bank.body.id } });
    expect(row.details).not.toContain('6702'); // sealed at rest
    const list = await t.http.get('/v1/wallet/payout-accounts').set(u.auth).expect(200);
    expect(list.body.accounts.map((a: { isDefault: boolean }) => a.isDefault)).toEqual([true, false]);
    expect(list.body.methods).toEqual(['JAZZCASH', 'EASYPAISA', 'BANK']);
    await t.http.delete(`/v1/wallet/payout-accounts/${jc.body.id}`).set(u.auth).expect(200);
    expect((await t.http.get('/v1/wallet/payout-accounts').set(u.auth)).body.accounts).toHaveLength(1);
  });

  it('cash-out to a saved wallet is paid (dev rail) with a trail', async () => {
    const u = await rich();
    const acc = await t.http.post('/v1/wallet/payout-accounts').set(u.auth).send({ method: 'EASYPAISA', account: '03451234567', holderName: 'Ali' }).expect(201);
    const r = await cash(u.auth, { gems: 5000, payoutAccountId: acc.body.id }).expect(201);
    expect(r.body.cashout).toMatchObject({ method: 'EASYPAISA', amountPkr: 7000, status: 'REQUESTED' });
    await new Promise((res) => setTimeout(res, 150));
    const c = await t.prisma.cashout.findUniqueOrThrow({ where: { id: r.body.cashout.id } });
    expect(c.status).toBe('PAID');
    const trail = await t.http.get(`/v1/admin/cashouts/${c.id}/events`).set(owner.auth).expect(200);
    expect(trail.body.map((e: { type: string }) => e.type)).toEqual(['payout.requested', 'payout.paid']);
  });

  it('bank cash-outs wait for a staff batch: export CSV, mark paid', async () => {
    const u = await rich();
    const acc = await t.http.post('/v1/wallet/payout-accounts').set(u.auth).send({ method: 'BANK', account: 'PK36SCBL0000001123456702', holderName: '=Evil, "Sara"', bankName: 'SCB' }).expect(201);
    const r = await cash(u.auth, { gems: 6000, payoutAccountId: acc.body.id }).expect(201);
    await new Promise((res) => setTimeout(res, 150));
    expect((await t.prisma.cashout.findUniqueOrThrow({ where: { id: r.body.cashout.id } })).providerStatus).toBe('awaiting_bank_batch');
    const waiting = await t.http.get('/v1/admin/payout-batches/waiting').set(owner.auth).expect(200);
    expect(waiting.body).toMatchObject({ count: 1, totalPkr: 8400 });
    const batch = await t.http.post('/v1/admin/payout-batches').set(owner.auth).expect(201);
    expect(batch.body).toMatchObject({ count: 1, status: 'OPEN', totalPkr: 8400 });
    const csv = await t.http.get(`/v1/admin/payout-batches/${batch.body.id}/export`).set(owner.auth).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.text.trim().split('\r\n');
    expect(lines[0]).toBe('Reference,Beneficiary name,IBAN,Bank,Amount PKR,Cash-out id,User id');
    expect(lines[1]).toContain(`"'=Evil, ""Sara""",PK36SCBL0000001123456702,SCB,8400`); // escaped + formula-safe
    await t.http.post(`/v1/admin/payout-batches/${batch.body.id}/paid`).set(owner.auth).send({ ref: 'BULK-77' }).expect(200);
    const c = await t.prisma.cashout.findUniqueOrThrow({ where: { id: r.body.cashout.id } });
    expect(c.status).toBe('PAID');
    expect(c.providerRef).toMatch(/^BULK-77\/V/);
    await t.http.post(`/v1/admin/payout-batches/${batch.body.id}/cancel`).set(owner.auth).expect(409);
  });

  it('cancelling a batch puts its cash-outs back in the queue', async () => {
    const u = await rich();
    await cash(u.auth, { gems: 5000, method: 'BANK', account: 'PK36SCBL0000001123456702', bankName: 'SCB' }).expect(201);
    await new Promise((res) => setTimeout(res, 150));
    const batch = await t.http.post('/v1/admin/payout-batches').set(owner.auth).expect(201);
    await t.http.post(`/v1/admin/payout-batches/${batch.body.id}/cancel`).set(owner.auth).expect(200);
    expect((await t.http.get('/v1/admin/payout-batches/waiting').set(owner.auth)).body.count).toBe(1);
    // Staff can still reject one: gems come back.
    const c = await t.prisma.cashout.findFirstOrThrow({ where: { userId: u.id } });
    await t.app.get(CashoutService).reject(c.id, 'Wrong IBAN');
    expect((await t.http.get('/v1/wallet').set(u.auth)).body.gems).toBe(20_000);
  });

  it('above the monthly limit, unverified people must verify first', async () => {
    await t.http.put('/v1/admin/settings/payouts.kycAboveUsdPerMonth').set(owner.auth).send({ value: 10 }).expect(200);
    const u = await rich();
    const r = await cash(u.auth, { gems: 5000, method: 'JAZZCASH', account: '03001234567' }).expect(403);
    expect(r.body.error).toMatchObject({ code: 'KYC_REQUIRED', details: { limitUsd: 10 } });
    expect((await t.http.get('/v1/wallet').set(u.auth)).body.gems).toBe(20_000);
    await t.prisma.user.update({ where: { id: u.id }, data: { verified: true } });
    await cash(u.auth, { gems: 5000, method: 'JAZZCASH', account: '03001234567' }).expect(201);
    await t.http.put('/v1/admin/settings/payouts.kycAboveUsdPerMonth').set(owner.auth).send({ value: 100 }).expect(200);
  });

  it('admin Integrations page lists every provider with its mode and missing keys', async () => {
    const r = await t.http.get('/v1/admin/integrations').set(owner.auth).expect(200);
    const jc = r.body.items.find((i: { key: string }) => i.key === 'payments.jazzcash');
    expect(jc).toMatchObject({ kind: 'payment', mode: 'dev', missingEnv: ['JAZZCASH_MERCHANT_ID', 'JAZZCASH_PASSWORD', 'JAZZCASH_INTEGRITY_SALT'] });
    expect(jc.endpoints[0].url).toMatch(/\/v1\/webhooks\/jazzcash$/);
    const kinds = new Set(r.body.items.map((i: { kind: string }) => i.kind));
    expect([...kinds]).toEqual(expect.arrayContaining(['payment', 'payout', 'login']));
    const hooks = await t.http.get('/v1/admin/webhooks').set(owner.auth).expect(200);
    expect(hooks.body).toHaveProperty('items');
  });
});
