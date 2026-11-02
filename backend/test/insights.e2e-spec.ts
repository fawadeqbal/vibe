import type { Socket } from 'socket.io-client';

import { connect, createTestApp, emit, resetState, signUp, sleep, staffLogin, TestApp, TestUser } from './helpers';

/** Admin Overview: health, matching, growth by source, money. */
describe('insights', () => {
  let t: TestApp;
  const sockets: Socket[] = [];
  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    await sleep(100);
    await resetState(t);
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await sleep(300);
    await t.close();
  });

  const call = (a: TestUser, b: TestUser, seconds: number, agoMin = 30) => {
    const startedAt = new Date(Date.now() - agoMin * 60_000);
    return t.prisma.match.create({ data: { userAId: a.id, userBId: b.id, startedAt, endedAt: new Date(startedAt.getTime() + seconds * 1000) } });
  };
  const pay = (u: TestUser, cents: number, productId = 'coins_100') =>
    t.prisma.purchase.create({ data: { userId: u.id, productType: 'COIN_PACK', productId, method: 'CARD', usdCents: cents, status: 'SUCCEEDED', idempotencyKey: `${u.id}-${cents}-${Math.random()}`, completedAt: new Date() } });

  it('answers the Overview questions', async () => {
    const [a, b, c] = [await signUp(t, { name: 'Ayesha' }), await signUp(t, { name: 'Bilal' }), await signUp(t, { name: 'Sana' })];
    await t.prisma.user.update({ where: { id: a.id }, data: { signupClient: 'android' } });
    await t.prisma.user.updateMany({ where: { id: { in: [b.id, c.id] } }, data: { signupClient: 'web' } });
    await t.prisma.referral.create({ data: { inviteeId: c.id, inviterId: a.id, code: 'X', source: 'link' } });
    await call(a, b, 120); // a good call
    await call(a, c, 5); // a quick skip
    await pay(a, 499);
    await pay(a, 199, 'coins_50');

    // A search that finds nobody and is given up.
    const s = await connect(t, b);
    sockets.push(s);
    await emit(s, 'match:join', {});
    await sleep(300);
    await emit(s, 'match:leave');
    const search = await t.prisma.matchSearch.findFirstOrThrow({ where: { userId: b.id } });
    expect(search).toMatchObject({ outcome: 'gave_up' });
    expect(search.waitMs).toBeGreaterThanOrEqual(200);

    const viewer = await staffLogin(t, 'owner');
    const get = async (path: string) => (await t.http.get(`/v1/admin/insights/${path}`).set(viewer.auth).expect(200)).body;

    const h = await get('health?days=7');
    expect(h.current).toMatchObject({ goodCalls: 1, signups: 3, goodFirstCall: 2, revenueUsd: 6.98 });
    expect(h.daily).toHaveLength(7);
    expect(h.daily.at(-1)).toMatchObject({ goodCalls: 1, signups: 3, revenueUsd: 6.98 });
    expect(Array.isArray(h.notes)).toBe(true);
    expect(h.attention).toEqual([]);
    expect((await get('health?days=7&client=web')).current).toMatchObject({ signups: 2, goodCalls: 1, revenueUsd: 0 });
    expect((await get('health?days=7&client=app')).current).toMatchObject({ signups: 1, revenueUsd: 6.98 });

    const m = await get('matching?days=7');
    expect(m.searches).toMatchObject({ total: 1, gaveUp: 1, gaveUpRate: 1, matched: 0 });
    expect(m.calls).toMatchObject({ total: 2, quick: 1, good: 1, quickRate: 0.5 });
    expect(m.byHour).toHaveLength(24);
    expect(m.heatmap.reduce((n: number, x: { searches: number }) => n + x.searches, 0)).toBe(1);
    expect(m.collectingSince).toBeTruthy();

    const g = await get('growth?days=7');
    const bySource = Object.fromEntries(g.sources.map((r: { source: string }) => [r.source, r]));
    expect(bySource.invite).toMatchObject({ signups: 1, firstCall: 1, goodFirstCall: 0 });
    expect(bySource.direct).toMatchObject({ signups: 2, firstCall: 2, goodFirstCall: 2, paid: 1 });
    expect(g.total).toMatchObject({ signups: 3, paid: 1 });
    expect(g.cohorts[0]).toMatchObject({ signups: 3, d7: null });

    const money = await get('money?days=30');
    expect(money).toMatchObject({ revenueUsd: 6.98, purchases: 2, payers: 1, repeatPayers: 1, firstTimePayers: 1, arppuUsd: 6.98 });
    expect(money.products[0]).toMatchObject({ productId: 'coins_100', purchases: 1, revenueUsd: 4.99 });
    expect(money.payingShare).toBeCloseTo(1 / 3);

    // Something needs someone: a report.
    await t.prisma.report.create({ data: { reporterId: b.id, reportedId: c.id, reason: 'OTHER' } });
    await t.redis.client.del('admin:insights:health:1:all', 'admin:dashboard:summary');
    const keys = await t.redis.client.keys('admin:*');
    if (keys.length) await t.redis.client.del(...keys);
    const h1 = await get('health?days=1');
    expect(h1.attention.map((x: { key: string }) => x.key)).toContain('reports');
  });
});
