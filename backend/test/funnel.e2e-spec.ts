import { MS } from '../src/common/utils/clock';
import { connect, createTestApp, resetState, signUp, staffLogin, TestApp } from './helpers';

/** The admin new-user funnel and the active-day record behind "came back next day". */
describe('admin funnel', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
  });
  afterAll(() => t.close());

  it('opening the app records the business day once', async () => {
    const u = await signUp(t);
    for (let i = 0; i < 2; i++) {
      const s = await connect(t, u);
      await new Promise((r) => setTimeout(r, 150));
      s.disconnect();
    }
    await new Promise((r) => setTimeout(r, 150));
    expect(await t.prisma.userActiveDay.count({ where: { userId: u.id } })).toBe(1);
  });

  it('counts each step against sign-ups and only judges "next day" once it is over', async () => {
    await resetState(t);
    const now = Date.now();
    const threeDaysAgo = new Date(now - 3 * MS.day);
    const [a, b, c] = [await signUp(t, { name: 'Asad' }), await signUp(t, { name: 'Bina' }), await signUp(t, { name: 'Chand' })];
    // a and b signed up three days ago; c today.
    await t.prisma.user.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { createdAt: threeDaysAgo } });
    await t.prisma.user.updateMany({ where: { id: { in: [a.id, b.id, c.id] } }, data: { onboardedAt: new Date() } });
    await t.prisma.user.update({ where: { id: c.id }, data: { onboardedAt: null } });
    // a and b met 20 minutes after signing up; the call lasted 5 s (a quick skip).
    const startedAt = new Date(threeDaysAgo.getTime() + 20 * MS.minute);
    await t.prisma.match.create({ data: { userAId: a.id, userBId: b.id, startedAt, endedAt: new Date(startedAt.getTime() + 5000) } });
    // a came back the next business day and paid.
    const signupDay = (await t.prisma.$queryRaw<{ d: Date }[]>`SELECT ("createdAt" + interval '300 minutes')::date AS d FROM "User" WHERE id = ${a.id}`)[0].d;
    await t.prisma.userActiveDay.create({ data: { userId: a.id, day: new Date(signupDay.getTime() + MS.day) } });
    await t.prisma.purchase.create({
      data: { userId: a.id, productType: 'COIN_PACK', productId: 'p1', method: 'CARD', usdCents: 199, status: 'SUCCEEDED', idempotencyKey: 'funnel-test-1', completedAt: new Date() },
    });

    const owner = await staffLogin(t, 'owner');
    const res = await t.http.get('/v1/admin/dashboard/funnel').query({ days: 7 }).set(owner.auth).expect(200);
    const step = (key: string) => res.body.steps.find((s: { key: string }) => s.key === key);
    expect(step('signedUp')).toMatchObject({ count: 3, eligible: 3, rate: 1 });
    expect(step('setUp')).toMatchObject({ count: 2, eligible: 3 });
    expect(step('firstCall')).toMatchObject({ count: 2, eligible: 3 });
    // c signed up today, so only a and b can be judged; a came back.
    expect(step('cameBack')).toMatchObject({ count: 1, eligible: 2, rate: 0.5 });
    expect(step('paid')).toMatchObject({ count: 1, eligible: 3 });
    expect(res.body.extras).toMatchObject({ medianMinutesToFirstCall: 20, firstCallWithinHour: 2, firstCallQuickSkip: 2 });
    expect(res.body.cohorts).toHaveLength(7);
    expect(res.body.cohorts[6]).toMatchObject({ signups: 1, cameBack: null });
    // 100% → 67% set up is the largest fall between neighbouring steps.
    expect(res.body.biggestDrop).toBe('setUp');
  });
});
