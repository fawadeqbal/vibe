import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io-client';

import { Clock } from '../src/common/utils/clock';
import { EconomyService } from '../src/modules/catalog/economy.service';
import { AffiliatesService } from '../src/modules/referrals/affiliates.service';
import { ReferralsService } from '../src/modules/referrals/referrals.service';
import { connect, createTestApp, next, payByCard, resetState, signUp, sleep, staffLogin, TestApp, TestStaff, TestUser } from './helpers';

const DAY = 86_400_000;
const PHOTO = 'https://i.pravatar.cc/400?img=8';

describe('creator partners (affiliates)', () => {
  let t: TestApp;
  const sockets: Socket[] = [];
  const clock = () => t.app.get(Clock);
  let seq = 0;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    await sleep(50);
    clock().set(null);
    await resetState(t);
    // Quick activation so the tests focus on money.
    await setRules({ referralRequireVerified: 0, referralActivationCalls: 0, referralHoldHours: 0 });
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    clock().set(null);
    await sleep(200);
    await t.close();
  });

  async function setRules(patch: Record<string, number>) {
    await t.prisma.appSetting.upsert({ where: { key: 'economy.rules' }, create: { key: 'economy.rules', value: { vibeHourMinutes: 0, ...patch } }, update: { value: { vibeHourMinutes: 0, ...patch } } });
    await t.app.get(EconomyService).reload();
  }

  async function join(extra: Record<string, unknown>, name = 'Hina Ali'): Promise<TestUser> {
    const email = `aff${++seq}-${Date.now()}@vibe.test`;
    await t.http.post('/v1/auth/otp/request').send({ email }).expect(200);
    const res = await t.http.post('/v1/auth/otp/verify').send({ email, code: '1234', ...extra }).expect(200);
    const u: TestUser = { id: res.body.user.id, token: res.body.tokens.accessToken, refresh: res.body.tokens.refreshToken, auth: { Authorization: `Bearer ${res.body.tokens.accessToken}` } };
    await t.http.patch('/v1/me').set(u.auth).send({ name, age: 23, gender: 'female', countryCode: 'PK' }).expect(200);
    return u;
  }

  const buy = (auth: { Authorization: string }, body: object) => t.http.post('/v1/payments/purchases').set(auth).set('Idempotency-Key', randomUUID()).send(body);
  const coins = async (u: TestUser) => (await t.http.get('/v1/wallet').set(u.auth).expect(200)).body.coins as number;
  const mine = async (u: TestUser) => (await t.http.get('/v1/affiliate').set(u.auth).expect(200)).body;
  const commissions = (affiliateId: string) => t.prisma.affiliateCommission.findMany({ where: { affiliateId }, orderBy: { createdAt: 'asc' } });
  const channels = [{ platform: 'tiktok', url: 'https://www.tiktok.com/@alivlogs', followers: 25000 }];

  /** A verified creator who applied with `code`, approved by finance with the given terms. */
  async function partner(code = 'ALIVLOGS', terms: Record<string, unknown> = {}): Promise<{ user: TestUser; id: string; staff: TestStaff }> {
    const user = await signUp(t, { name: 'Ali Raza', avatarUrl: PHOTO });
    await t.prisma.user.update({ where: { id: user.id }, data: { verified: true } });
    await t.http.post('/v1/affiliate/apply').set(user.auth).send({ displayName: 'Ali Vlogs', code, channels, note: 'I make vlogs' }).expect(201);
    const a = await t.prisma.affiliate.findUniqueOrThrow({ where: { userId: user.id } });
    const staff = await staffLogin(t, 'finance');
    await t.http.post(`/v1/admin/affiliates/${a.id}/approve`).set(staff.auth).send(terms).expect(200);
    return { user, id: a.id, staff };
  }

  it('apply: verified users only, once, with a free code; staff approve; link and status', async () => {
    const ali = await signUp(t, { name: 'Ali Raza', avatarUrl: PHOTO });
    const body = { displayName: 'Ali Vlogs', code: 'ali_vlogs', channels, note: 'Hi!' };
    expect((await t.http.post('/v1/affiliate/apply').set(ali.auth).send(body).expect(403)).body.error.code).toBe('VERIFICATION_REQUIRED');
    await t.prisma.user.update({ where: { id: ali.id }, data: { verified: true } });
    expect(await mine(ali)).toEqual({ status: 'none' });

    const someone = await signUp(t);
    const theirCode = (await t.http.get('/v1/me').set(someone.auth)).body.inviteCode;
    expect((await t.http.get(`/v1/affiliate/code-available?code=${theirCode}`).set(ali.auth).expect(200)).body).toEqual({ code: theirCode, available: false, reason: 'taken' });
    expect((await t.http.get('/v1/affiliate/code-available?code=vibe').set(ali.auth).expect(200)).body).toMatchObject({ available: false, reason: 'reserved' });
    expect((await t.http.get('/v1/affiliate/code-available?code=a-b').set(ali.auth).expect(200)).body).toMatchObject({ available: false, reason: 'invalid' });
    expect((await t.http.get('/v1/affiliate/code-available?code=ali_vlogs').set(ali.auth).expect(200)).body).toEqual({ code: 'ALI_VLOGS', available: true, reason: null });
    expect((await t.http.post('/v1/affiliate/apply').set(ali.auth).send({ ...body, code: theirCode }).expect(409)).body.error.code).toBe('AFFILIATE_CODE_TAKEN');
    await t.http.post('/v1/affiliate/apply').set(ali.auth).send({ ...body, channels: [] }).expect(400);
    await t.http.post('/v1/affiliate/apply').set(ali.auth).send({ ...body, channels: [{ platform: 'tiktok', url: 'not a url', followers: 1 }] }).expect(400);

    const applied = await t.http.post('/v1/affiliate/apply').set(ali.auth).send(body).expect(201);
    expect(applied.body).toMatchObject({ status: 'PENDING', affiliate: { code: 'ALI_VLOGS', displayName: 'Ali Vlogs', revSharePercent: 20, cpaUsdCents: 10, commissionMonths: 6, holdDays: 14, minPayoutUsdCents: 1000 } });
    expect((await t.http.post('/v1/affiliate/apply').set(ali.auth).send(body).expect(409)).body.error.code).toBe('AFFILIATE_EXISTS');
    // A pending code does not work yet.
    expect((await t.http.get('/v1/referrals/preview/ALI_VLOGS').expect(200)).body.valid).toBe(false);

    const a = await t.prisma.affiliate.findUniqueOrThrow({ where: { userId: ali.id } });
    const support = await staffLogin(t, 'support');
    const finance = await staffLogin(t, 'finance');
    expect((await t.http.get('/v1/admin/affiliates?status=PENDING').set(support.auth).expect(200)).body.items).toHaveLength(1);
    await t.http.post(`/v1/admin/affiliates/${a.id}/approve`).set(support.auth).send({}).expect(403);
    const s = await connect(t, ali);
    sockets.push(s);
    const told = next(s, 'affiliate:updated');
    const approved = await t.http.post(`/v1/admin/affiliates/${a.id}/approve`).set(finance.auth).send({ code: 'ALI', revSharePercent: 30 }).expect(200);
    expect(approved.body).toMatchObject({ status: 'ACTIVE', code: 'ALI', revSharePercent: 30, cpaUsdCents: 10, customTerms: true, link: 'https://vibe.fawadiqbal.dev/i/ALI' });
    expect(await told).toEqual({ status: 'ACTIVE', event: 'approved' });
    expect(await mine(ali)).toMatchObject({ status: 'ACTIVE', affiliate: { code: 'ALI', link: 'https://vibe.fawadiqbal.dev/i/ALI', revSharePercent: 30 }, balance: { pendingUsdCents: 0, availableUsdCents: 0, paidUsdCents: 0 }, openPayout: null });
    expect((await t.http.get('/v1/referrals').set(ali.auth).expect(200)).body.affiliate).toEqual({ code: 'ALI', link: 'https://vibe.fawadiqbal.dev/i/ALI' });
    await t.http.post(`/v1/admin/affiliates/${a.id}/approve`).set(finance.auth).send({}).expect(409);
    const audit = await t.prisma.auditLog.findFirst({ where: { action: 'affiliate.approved' } });
    expect(audit).toMatchObject({ targetType: 'affiliate', targetId: a.id });

    // Reject (another applicant) shows the reason.
    const omar = await signUp(t, { name: 'Omar' });
    await t.prisma.user.update({ where: { id: omar.id }, data: { verified: true } });
    await t.http.post('/v1/affiliate/apply').set(omar.auth).send({ ...body, code: 'OMAR' }).expect(201);
    const o = await t.prisma.affiliate.findUniqueOrThrow({ where: { userId: omar.id } });
    await t.http.post(`/v1/admin/affiliates/${o.id}/reject`).set(finance.auth).send({ reason: 'Audience too small' }).expect(200);
    expect(await mine(omar)).toMatchObject({ status: 'REJECTED', affiliate: { decisionReason: 'Audience too small' } });
  });

  it('referred sign-up → CPA → rev-share (store fee) → refund reversal → available → payout → paid / rejected', async () => {
    const { user: ali, id: affId, staff } = await partner('ALI', { revSharePercent: 30 });
    // Landing page visit with a channel.
    const preview = await t.http.get('/v1/referrals/preview/ali?s=youtube').expect(200);
    expect(preview.body).toEqual({ valid: true, kind: 'affiliate', name: 'Ali Vlogs', avatarUrl: PHOTO, inviteeCoins: 50 });

    const hina = await join({ inviteCode: 'ali', inviteSource: 'youtube', inviteVia: 'web', deviceId: 'hina-browser-0001' });
    const me = (await t.http.get('/v1/me').set(hina.auth).expect(200)).body;
    expect(me.invitedBy).toEqual({ name: 'Ali Vlogs', status: 'QUALIFIED' }); // activation rules are 0 here
    const ref = await t.prisma.referral.findUniqueOrThrow({ where: { inviteeId: hina.id } });
    expect(ref).toMatchObject({ affiliateId: affId, inviterId: null, channel: 'youtube', source: 'web', status: 'QUALIFIED' });
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: hina.id } })).invitedById).toBeNull();

    let rows = await commissions(affId);
    expect(rows).toEqual([expect.objectContaining({ kind: 'CPA', usdCents: 10, status: 'PENDING', key: `cpa:${ref.id}` })]);
    expect(rows[0].availableAt.getTime() - rows[0].createdAt.getTime()).toBeGreaterThan(13.9 * DAY);

    // Reward: the new user gets coins, the partner does not.
    expect(await t.app.get(ReferralsService).rewardDue()).toBe(1);
    expect(await coins(hina)).toBe(80);
    expect(await coins(ali)).toBe(30);

    // Purchases: Play (15% store fee first) and card (no fee).
    const gp = await buy(hina.auth, { productType: 'COIN_PACK', productId: 'pro', method: 'GOOGLE_PLAY', receipt: 'gp-aff-1' }).expect(201);
    expect(gp.body.status).toBe('SUCCEEDED');
    const card = await payByCard(t, hina.auth, { productType: 'COIN_PACK', productId: 'value' });
    expect(card.body.status).toBe('SUCCEEDED');
    await sleep(100);
    rows = await commissions(affId);
    const rev = rows.filter((r) => r.kind === 'REVSHARE');
    expect(rev.map((r) => [r.purchaseId, r.baseUsdCents, r.usdCents, r.status])).toEqual([
      [gp.body.id, 2124, 637, 'PENDING'],
      [card.body.id, 999, 299, 'PENDING'],
    ]);

    // Refund before payout → reversed.
    const fin = await staffLogin(t, 'finance');
    await t.http.post(`/v1/admin/purchases/${card.body.id}/refund`).set(fin.auth).send({ reason: 'Chargeback' }).expect(200);
    await sleep(100);
    expect((await t.prisma.affiliateCommission.findUniqueOrThrow({ where: { key: `rev:${card.body.id}` } })).status).toBe('REVERSED');
    expect((await mine(ali)).balance).toEqual({ pendingUsdCents: 647, availableUsdCents: 0, requestedUsdCents: 0, paidUsdCents: 0 });

    // Stats and the commission list (first names only).
    const stats = (await t.http.get('/v1/affiliate/stats?days=7').set(ali.auth).expect(200)).body;
    expect(stats.totals).toEqual({ clicks: 1, signups: 1, qualified: 1, payingUsers: 1, revenueUsdCents: 2499, earnedUsdCents: 647 });
    expect(stats.daily).toHaveLength(7);
    expect(stats.byChannel).toEqual([{ channel: 'youtube', clicks: 1, signups: 1, qualified: 1, earnedUsdCents: 647 }]);
    await t.http.get('/v1/affiliate/stats?days=5').set(ali.auth).expect(400);
    const list = (await t.http.get('/v1/affiliate/commissions?limit=2').set(ali.auth).expect(200)).body;
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toMatchObject({ user: { name: 'Hina' } });
    expect(list.nextCursor).toBeTruthy();

    // Payout: needs available money ≥ minimum, a saved account.
    const acct = await t.http.post('/v1/wallet/payout-accounts').set(ali.auth).send({ method: 'JAZZCASH', account: '03001234567', holderName: 'Ali Raza' }).expect(201);
    expect((await t.http.post('/v1/affiliate/payouts').set(ali.auth).send({ payoutAccountId: acct.body.id }).expect(400)).body.error).toMatchObject({ code: 'AFFILIATE_BELOW_MINIMUM', details: { minimumUsdCents: 1000, availableUsdCents: 0 } });
    clock().set(new Date(Date.now() + 15 * DAY));
    expect(await t.app.get(AffiliatesService).releaseDue()).toBe(2);
    await setRules({ referralRequireVerified: 0, referralActivationCalls: 0, referralHoldHours: 0, affiliateMinPayoutUsdCents: 500 });
    const payout = await t.http.post('/v1/affiliate/payouts').set(ali.auth).send({ payoutAccountId: acct.body.id }).expect(201);
    const rate = (await t.prisma.appSetting.findUnique({ where: { key: 'payments.usdToPkr' } }))?.value ?? 280;
    expect(payout.body).toMatchObject({ usdCents: 647, amountPkr: Math.floor(6.47 * Number(rate)), method: 'JAZZCASH', accountMasked: '0300•••567', status: 'REQUESTED' });
    expect((await t.http.post('/v1/affiliate/payouts').set(ali.auth).send({ payoutAccountId: acct.body.id }).expect(409)).body.error.code).toBe('AFFILIATE_PAYOUT_OPEN');
    expect(await mine(ali)).toMatchObject({ balance: { availableUsdCents: 0, requestedUsdCents: 647 }, openPayout: { id: payout.body.id } });

    // Staff: queue, full account (audited), reject → available again.
    const queue = (await t.http.get('/v1/admin/affiliate-payouts?status=REQUESTED').set(staff.auth).expect(200)).body;
    expect(queue.items).toEqual([expect.objectContaining({ id: payout.body.id, affiliate: expect.objectContaining({ code: 'ALI' }) })]);
    expect((await t.http.get(`/v1/admin/affiliate-payouts/${payout.body.id}/destination`).set(staff.auth).expect(200)).body).toMatchObject({ method: 'JAZZCASH', account: '03001234567', holderName: 'Ali Raza' });
    const viewer = await staffLogin(t, 'viewer');
    await t.http.get(`/v1/admin/affiliate-payouts/${payout.body.id}/destination`).set(viewer.auth).expect(403);
    await t.http.post(`/v1/admin/affiliate-payouts/${payout.body.id}/paid`).set(viewer.auth).send({ reference: 'x' }).expect(403);
    await t.http.post(`/v1/admin/affiliate-payouts/${payout.body.id}/reject`).set(staff.auth).send({ reason: 'Wrong account name' }).expect(200);
    expect((await mine(ali)).balance).toMatchObject({ availableUsdCents: 647, requestedUsdCents: 0 });

    // Request again, mark paid.
    const p2 = await t.http.post('/v1/affiliate/payouts').set(ali.auth).send({ payoutAccountId: acct.body.id }).expect(201);
    const s = await connect(t, ali);
    sockets.push(s);
    const told = next(s, 'affiliate:updated');
    const paid = await t.http.post(`/v1/admin/affiliate-payouts/${p2.body.id}/paid`).set(staff.auth).send({ reference: 'JC-778899' }).expect(200);
    expect(paid.body).toMatchObject({ status: 'PAID', reference: 'JC-778899' });
    expect(await told).toMatchObject({ event: 'payout_paid', payout: { id: p2.body.id, status: 'PAID' } });
    await t.http.post(`/v1/admin/affiliate-payouts/${p2.body.id}/paid`).set(staff.auth).send({ reference: 'again' }).expect(409);
    expect((await mine(ali)).balance).toEqual({ pendingUsdCents: 0, availableUsdCents: 0, requestedUsdCents: 0, paidUsdCents: 647 });
    expect((await t.http.get('/v1/affiliate/payouts').set(ali.auth).expect(200)).body.map((p: { status: string }) => p.status)).toEqual(['PAID', 'REJECTED']);

    // Refund after it was paid out → a negative adjustment against future earnings.
    await t.http.post(`/v1/admin/purchases/${gp.body.id}/refund`).set(fin.auth).send({ reason: 'Play refund' }).expect(200);
    await sleep(100);
    const undo = await t.prisma.affiliateCommission.findMany({ where: { affiliateId: affId, usdCents: { lt: 0 } } });
    expect(undo).toEqual([expect.objectContaining({ usdCents: -637, status: 'AVAILABLE', kind: 'REVSHARE' })]);
    expect((await mine(ali)).balance).toMatchObject({ availableUsdCents: -637, paidUsdCents: 647 });

    // Admin detail.
    const detail = (await t.http.get(`/v1/admin/affiliates/${affId}`).set(viewer.auth).expect(200)).body;
    expect(detail).toMatchObject({ code: 'ALI', status: 'ACTIVE', user: { id: ali.id }, defaults: { revSharePercent: 20, cpaUsdCents: 10 }, balance: { availableUsdCents: -637 } });
    expect(detail.referred).toEqual([expect.objectContaining({ invitee: expect.objectContaining({ id: hina.id }), channel: 'youtube' })]);
    expect(detail.commissions.length).toBe(4);
    expect(detail.payouts).toHaveLength(2);
    expect(Array.isArray(detail.flags)).toBe(true);
    const adminStats = (await t.http.get(`/v1/admin/affiliates/${affId}/stats?days=90`).set(viewer.auth).expect(200)).body;
    expect(adminStats).toMatchObject({ days: 90, totals: { signups: 1, qualified: 1 } });
    expect(adminStats.daily).toHaveLength(90);
  });

  it('commission window, suspension holds, reactivation, claims and self-referral', async () => {
    const { user: ali, id: affId, staff } = await partner('ALI');
    const hina = await join({ inviteCode: 'ALI' });
    // Purchases after the window earn nothing.
    clock().set(new Date(Date.now() + 200 * DAY));
    await buy(hina.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'GOOGLE_PLAY', receipt: 'gp-late-1' }).expect(201);
    await sleep(100);
    expect((await commissions(affId)).filter((c) => c.kind === 'REVSHARE')).toHaveLength(0);
    clock().set(null);

    // Suspended: new commissions are held, payouts stop.
    await t.http.post(`/v1/admin/affiliates/${affId}/suspend`).set(staff.auth).send({ reason: 'Checking traffic' }).expect(200);
    expect((await t.http.get('/v1/referrals/preview/ALI').expect(200)).body.valid).toBe(true); // links keep working
    const zara = await join({ inviteCode: 'ALI' });
    await buy(zara.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'JAZZCASH' });
    const held = await t.prisma.affiliateCommission.findMany({ where: { affiliateId: affId, referral: { inviteeId: zara.id } } });
    expect(held.map((c) => [c.kind, c.status])).toEqual([['CPA', 'HELD']]);
    const acct = await t.http.post('/v1/wallet/payout-accounts').set(ali.auth).send({ method: 'JAZZCASH', account: '03001234567', holderName: 'Ali Raza' }).expect(201);
    expect((await t.http.post('/v1/affiliate/payouts').set(ali.auth).send({ payoutAccountId: acct.body.id }).expect(403)).body.error.code).toBe('AFFILIATE_NOT_ACTIVE');
    expect(await mine(ali)).toMatchObject({ status: 'SUSPENDED', affiliate: { decisionReason: 'Checking traffic' } });

    await t.http.post(`/v1/admin/affiliates/${affId}/reactivate`).set(staff.auth).expect(200);
    expect((await t.prisma.affiliateCommission.findMany({ where: { affiliateId: affId, status: 'HELD' } })).length).toBe(0);

    // Edit terms back to defaults (null) and the staff note.
    const edited = await t.http.patch(`/v1/admin/affiliates/${affId}`).set(staff.auth).send({ revSharePercent: 40, cpaUsdCents: null, staffNote: 'Big on TikTok' }).expect(200);
    expect(edited.body).toMatchObject({ revSharePercent: 40, cpaUsdCents: 10, staffNote: 'Big on TikTok' });
    await t.http.patch(`/v1/admin/affiliates/${affId}`).set(staff.auth).send({ revSharePercent: 90 }).expect(400);

    // Late claim of a partner code; the partner can't claim their own.
    const late = await signUp(t, { name: 'Late Comer' });
    const claim = await t.http.post('/v1/referrals/claim').set(late.auth).send({ code: 'ali' }).expect(200);
    expect(claim.body).toMatchObject({ kind: 'affiliate', inviter: { name: 'Ali Vlogs' } });
    expect((await t.prisma.referral.findUniqueOrThrow({ where: { inviteeId: late.id } })).affiliateId).toBe(affId);
    const fresh = await signUp(t, { name: 'Fresh' });
    await t.prisma.affiliate.update({ where: { id: affId }, data: { userId: fresh.id } }).catch(() => undefined);
    expect((await t.http.post('/v1/referrals/claim').set(fresh.auth).send({ code: 'ALI' }).expect(403)).body.error.code).toBe('INVITE_SELF');

    // Admin referral rejection takes a partner's commissions back.
    const zRef = await t.prisma.referral.findUniqueOrThrow({ where: { inviteeId: zara.id } });
    const owner = await staffLogin(t, 'owner');
    await t.http.post(`/v1/admin/referrals/${zRef.id}/reject`).set(owner.auth).send({ reason: 'Fake' }).expect(200);
    expect((await t.prisma.affiliateCommission.findMany({ where: { referralId: zRef.id } })).every((c) => c.status === 'REVERSED')).toBe(true);
    expect((await t.http.get(`/v1/admin/referrals?kind=affiliate&affiliateId=${affId}`).set(owner.auth).expect(200)).body.items.length).toBe(3);
  });
});
