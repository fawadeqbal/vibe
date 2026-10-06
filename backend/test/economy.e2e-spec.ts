import { randomUUID } from 'node:crypto';

import { connect, createTestApp, next, resetState, signUp, staffLogin, TestApp, TestStaff, payByCard } from './helpers';

describe('economy (editable prices and rules)', () => {
  let t: TestApp;
  let owner: TestStaff;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
    owner = await staffLogin(t, 'owner');
    // resetState turns Vibe Hour off through a rules override; these tests start from the code defaults.
    await t.http.post('/v1/admin/economy/rules/reset').set(owner.auth).expect(200);
  });
  afterEach(async () => {
    for (const s of ['rules', 'packs', 'plans', 'gifts']) await t.http.post(`/v1/admin/economy/${s}/reset`).set(owner.auth).expect(200);
  });
  afterAll(() => t.close());

  const economy = async () => (await t.http.get('/v1/admin/economy').set(owner.auth).expect(200)).body;
  const buy = (auth: { Authorization: string }, body: object) => t.http.post('/v1/payments/purchases').set(auth).set('Idempotency-Key', randomUUID()).send(body);

  it('everyone on staff can look; only ops.economy can change; the page gets defaults and field definitions', async () => {
    const viewer = await staffLogin(t, 'viewer');
    const e = (await t.http.get('/v1/admin/economy').set(viewer.auth).expect(200)).body;
    expect(e.economy.welcomeCoins).toBe(30);
    expect(e.defaults.packs).toHaveLength(5);
    expect(e.groups.map((g: { key: string }) => g.key)).toEqual(['matching', 'social', 'rewards', 'gems', 'vip', 'engagement', 'referrals', 'affiliates', 'safety']);
    const engagement = e.groups.find((g: { key: string }) => g.key === 'engagement');
    expect(engagement.fields.find((f: { key: string }) => f.key === 'vibeHourStart')).toMatchObject({ kind: 'clock', min: 0, max: 1439 });
    expect(e.sections.rules).toMatchObject({ custom: false, updatedBy: null });
    await t.http.put('/v1/admin/economy/rules').set(viewer.auth).send({ value: { welcomeCoins: 99 } }).expect(403);
    const finance = await staffLogin(t, 'finance');
    await t.http.put('/v1/admin/economy/rules').set(finance.auth).send({ value: { welcomeCoins: 31 } }).expect(200);
  });

  it('a rule change applies at once: new sign-ups, the public catalog, and a live push to apps', async () => {
    const someone = await signUp(t);
    const s = await connect(t, someone);
    const pushed = next(s, 'catalog:updated');
    const before = await economy();
    const r = await t.http.put('/v1/admin/economy/rules').set(owner.auth).send({ value: { welcomeCoins: 75, checkInRewards: [1, 2, 3, 4, 5, 6, 100] }, base: { welcomeCoins: 30 } }).expect(200);
    expect(r.body.changes).toEqual(['welcomeCoins: 30 → 75', 'checkInRewards: [5,10,15,20,25,30,50] → [1,2,3,4,5,6,100]']);
    expect(r.body.economy.sections.rules).toMatchObject({ custom: true, updatedBy: expect.any(String) });
    expect((await pushed).version).not.toBe(before.version);
    s.disconnect();

    const u = await signUp(t);
    const w = (await t.http.get('/v1/wallet').set(u.auth).expect(200)).body;
    expect(w.coins).toBe(75);
    expect(w.checkIn.rewards).toEqual([1, 2, 3, 4, 5, 6, 100]);
    expect((await t.http.get('/v1/catalog').expect(200)).body.economy.welcomeCoins).toBe(75);

    const audit = await t.prisma.auditLog.findFirst({ where: { action: 'economy.changed' }, orderBy: { createdAt: 'desc' } });
    expect(audit?.summary).toContain('welcomeCoins: 30 → 75');
  });

  it('refuses unsafe values and stale edits', async () => {
    const age = await t.http.put('/v1/admin/economy/rules').set(owner.auth).send({ value: { minAge: 16 } }).expect(400);
    expect(age.body.error.message).toBe('Minimum age: at least 18');
    await t.http.put('/v1/admin/economy/rules').set(owner.auth).send({ value: { giftGemShare: 2 } }).expect(400);
    await t.http.put('/v1/admin/economy/rules').set(owner.auth).send({ value: { madeUp: 1 } }).expect(400);
    await t.http.put('/v1/admin/economy/nope').set(owner.auth).send({ value: {} }).expect(404);

    const e = await economy();
    const dup = await t.http.put('/v1/admin/economy/packs').set(owner.auth).send({ value: [...e.packs, e.packs[0]] }).expect(400);
    expect(dup.body.error.message).toBe('Two items have the id "starter"');

    // Two people edit the same price; the second one is told instead of silently winning.
    await t.http.put('/v1/admin/economy/rules').set(owner.auth).send({ value: { reconnectCost: 25 }, base: { reconnectCost: 20 } }).expect(200);
    const stale = await t.http.put('/v1/admin/economy/rules').set(owner.auth).send({ value: { reconnectCost: 30 }, base: { reconnectCost: 20 } }).expect(409);
    expect(stale.body.error.details.reason).toBe('stale');
    // Editing a different rule from an older page is fine.
    await t.http.put('/v1/admin/economy/rules').set(owner.auth).send({ value: { boostCost: 60 }, base: { boostCost: 50 } }).expect(200);
    const packsStale = await t.http.put('/v1/admin/economy/packs').set(owner.auth).send({ value: e.packs.slice(1), base: e.packs.map((p: object) => ({ ...p, coins: 1 })) }).expect(409);
    expect(packsStale.body.error.code).toBe('CONFLICT');
  });

  it('pack prices: a purchase delivers what was sold even if the pack changes before it is paid', async () => {
    const u = await signUp(t);
    const e = await economy();
    const strip = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'totalCoins'));
    const pending = await buy(u.auth, { productType: 'COIN_PACK', productId: 'starter', method: 'JAZZCASH', phone: '03001234567' }).expect(201);
    expect(pending.body.status).toBe('REQUIRES_ACTION');

    const packs = e.packs.map((p: Record<string, unknown>) => (p.id === 'starter' ? { ...strip(p), coins: 150, usdCents: 149, tag: 'Fresh' } : strip(p)));
    packs.push({ id: 'mega', name: 'Mega', coins: 20000, usdCents: 9999, bonusPercent: 50 });
    const r = await t.http.put('/v1/admin/economy/packs').set(owner.auth).send({ value: packs, base: e.packs.map(strip) }).expect(200);
    expect(r.body.changes).toEqual(['starter coins 100→150, usdCents 99→149, tag undefined→"Fresh"', '+mega']);

    const done = await t.http.post(`/v1/payments/purchases/${pending.body.id}/confirm`).set(u.auth).send({ otp: '4321' }).expect(200);
    expect(done.body.wallet.coins).toBe(30 + 100); // the old pack
    const fresh = await payByCard(t, u.auth, { productType: 'COIN_PACK', productId: 'starter' });
    expect(fresh.body.wallet.coins).toBe(130 + 150);
    const mega = await payByCard(t, u.auth, { productType: 'COIN_PACK', productId: 'mega' });
    expect(mega.body.wallet.coins).toBe(280 + 30000);
    const catalog = (await t.http.get('/v1/catalog').expect(200)).body;
    expect(catalog.packs.find((p: { id: string }) => p.id === 'mega')).toMatchObject({ totalCoins: 30000 });
  });

  it('gifts and gem share; plans; reset goes back to the code defaults', async () => {
    const e = await economy();
    const gifts = [...e.gifts.map(({ gems: _g, ...g }: { gems: number }) => g), { id: 'star', name: 'Star', emoji: '⭐', coins: 200 }];
    await t.http.put('/v1/admin/economy/gifts').set(owner.auth).send({ value: gifts }).expect(200);
    await t.http.put('/v1/admin/economy/rules').set(owner.auth).send({ value: { giftGemShare: 0.6 } }).expect(200);
    const c = (await t.http.get('/v1/catalog').expect(200)).body;
    expect(c.gifts.find((g: { id: string }) => g.id === 'star')).toMatchObject({ coins: 200, gems: 120 });

    const twoFeatured = e.plans.map((p: object) => ({ ...p, highlighted: true }));
    await t.http.put('/v1/admin/economy/plans').set(owner.auth).send({ value: twoFeatured }).expect(400);
    await t.http.put('/v1/admin/economy/plans').set(owner.auth).send({ value: e.plans.map((p: { id: string }) => (p.id === 'vip_month' ? { ...p, trialDays: 7 } : p)) }).expect(200);
    expect((await economy()).plans.find((p: { id: string }) => p.id === 'vip_month').trialDays).toBe(7);

    const reset = await t.http.post('/v1/admin/economy/gifts/reset').set(owner.auth).expect(200);
    expect(reset.body.changes).toEqual(['−star']);
    expect(reset.body.economy.gifts).toHaveLength(6);
    expect(reset.body.economy.sections.gifts.custom).toBe(false);
  });
});
