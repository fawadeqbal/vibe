import { createTestApp, resetState, signUp, staffLogin, TestApp } from './helpers';

/** Marketing-site traffic: beacons from the landing page, sign-up attribution, the admin report. */
describe('site traffic', () => {
  let t: TestApp;
  const phone = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetState(t);
    await t.prisma.siteEvent.deleteMany();
    await t.prisma.siteVisit.deleteMany();
  });
  afterAll(async () => {
    await t.close();
  });

  /** Like navigator.sendBeacon: text/plain JSON, no auth. */
  const beacon = (body: object, ua = phone, headers: Record<string, string> = {}) =>
    t.http.post('/v1/site/events').set({ 'content-type': 'text/plain', 'user-agent': ua, ...headers }).send(JSON.stringify(body)).expect(204);

  it('records visits, pages, clicks and time; drops bots and junk', async () => {
    const loc = { 'cf-ipcountry': 'PK', 'cf-region': 'Punjab', 'cf-ipcity': 'Lahore' };
    await beacon({ k: 'view', v: 'visit_aaaaaaaa', u: 'visitor_11111', p: '/omegle-alternative/?utm_source=tiktok&utm_campaign=launch', r: 'https://www.tiktok.com/', l: 'en-PK' }, phone, loc);
    await beacon({ k: 'view', v: 'visit_aaaaaaaa', u: 'visitor_11111', p: '/blog/' });
    await beacon({ k: 'click', v: 'visit_aaaaaaaa', u: 'visitor_11111', p: '/blog/', b: 'hero_start', t: '/match' });
    await beacon([{ k: 'leave', v: 'visit_aaaaaaaa', u: 'visitor_11111', p: '/blog/', s: 95 }]);
    await beacon({ k: 'view', v: 'visit_bbbbbbbb', u: 'visitor_22222', p: '/', r: 'https://www.google.com.pk/' }, 'Mozilla/5.0 (compatible; Googlebot/2.1)');
    await beacon({ k: 'view', v: 'bad id!', u: 'x', p: '/' });
    await t.http.post('/v1/site/events').set({ 'content-type': 'text/plain', 'user-agent': phone }).send('not json').expect(204);

    const v = await t.prisma.siteVisit.findUniqueOrThrow({ where: { id: 'visit_aaaaaaaa' } });
    expect(v).toMatchObject({ source: 'tiktok', medium: 'social', campaign: 'launch', landingPath: '/omegle-alternative/', country: 'PK', region: 'Punjab', city: 'Lahore', device: 'phone', os: 'Android', lang: 'en', pages: 2, clicks: 1, lastButton: 'hero_start', seconds: 95 });
    expect(await t.prisma.siteVisit.count()).toBe(1);
    expect(await t.prisma.siteEvent.count()).toBe(3);
  });

  it('without Cloudflare headers, finds country/region/city from the IP (not stored)', async () => {
    await beacon({ k: 'view', v: 'visit_dddddddd', u: 'visitor_44444', p: '/' }, phone, { 'x-forwarded-for': '111.119.180.1, 172.18.0.2' });
    const v = await t.prisma.siteVisit.findUniqueOrThrow({ where: { id: 'visit_dddddddd' } });
    expect(v).toMatchObject({ country: 'PK', region: 'Punjab', city: 'Lahore' });
    expect(JSON.stringify(v)).not.toContain('111.119');
  });

  it('links a new account to its visit, once; the admin report counts it', async () => {
    await beacon({ k: 'view', v: 'visit_cccccccc', u: 'visitor_33333', p: '/', r: 'https://www.google.com/' }, phone, { 'cf-ipcountry': 'AE', 'cf-region': 'Dubai' });
    await beacon({ k: 'click', v: 'visit_cccccccc', u: 'visitor_33333', p: '/', b: 'discover_open', t: '/discover' });
    const u = await signUp(t, { name: 'Sara' });
    expect((await t.http.post('/v1/site/attribution').set(u.auth).send({ visitId: 'visit_cccccccc' }).expect(200)).body).toEqual({ linked: true });
    expect((await t.http.post('/v1/site/attribution').set(u.auth).send({ visitId: 'visit_cccccccc' }).expect(200)).body).toEqual({ linked: false });

    const staff = await staffLogin(t);
    const r = (await t.http.get('/v1/admin/dashboard/marketing?days=7').set(staff.auth).expect(200)).body;
    expect(r.totals).toMatchObject({ visitors: 1, visits: 1, clickedVisits: 1, clicks: 1, signups: 1 });
    expect(r.sources[0]).toMatchObject({ source: 'google', medium: 'search', visitors: 1, visits: 1, clicked: 1, signups: 1 });
    expect(r.countries[0]).toMatchObject({ country: 'AE', visitors: 1, regions: [{ name: 'Dubai', visitors: 1 }] });
    expect(r.buttons[0]).toMatchObject({ button: 'discover_open', target: '/discover', clicks: 1, signups: 1 });
    expect(r.live.now).toBe(1);
    expect(r.live.recent[0]).toMatchObject({ did: 'signed_up', source: 'google' });
    expect(r.siteUrl).toMatch(/^https?:\/\//);
    expect(r.totals.downloads).toBe(0);
  });

  it('All visits: newest first, a page at a time, filtered by outcome, channel and place', async () => {
    await beacon({ k: 'view', v: 'visit_v1111111', u: 'visitor_a1', p: '/', r: 'https://www.google.com/' }, phone, { 'cf-ipcountry': 'PK', 'cf-region': 'Punjab', 'cf-ipcity': 'Lahore' });
    await beacon({ k: 'view', v: 'visit_v2222222', u: 'visitor_a2', p: '/azar-alternative/', r: 'https://www.tiktok.com/' }, phone, { 'cf-ipcountry': 'AE', 'cf-ipcity': 'Dubai' });
    await beacon({ k: 'click', v: 'visit_v2222222', u: 'visitor_a2', p: '/azar-alternative/', b: 'hero_start', t: '/match' });
    await beacon({ k: 'view', v: 'visit_v3333333', u: 'visitor_a3', p: '/', r: 'https://www.tiktok.com/' }, phone, { 'cf-ipcountry': 'PK', 'cf-ipcity': 'Karachi' });
    await t.prisma.siteVisit.update({ where: { id: 'visit_v3333333' }, data: { lastAt: new Date(Date.now() - 60 * 60_000) } });

    const staff = await staffLogin(t);
    const get = async (q: string) => (await t.http.get(`/v1/admin/dashboard/marketing/visits?${q}`).set(staff.auth).expect(200)).body;
    const all = await get('days=7&pageSize=10');
    expect(all).toMatchObject({ total: 3, page: 1, pageSize: 10, counts: { all: 3, signed_up: 0, clicked: 1, reading: 1, left: 1 } });
    expect(all.items.map((v: { city: string }) => v.city)).toEqual(['Dubai', 'Lahore', 'Karachi']);
    expect(all.items[0]).toMatchObject({ source: 'tiktok', path: '/azar-alternative/', did: 'clicked', device: 'phone' });
    expect(all.sources.sort()).toEqual(['google', 'tiktok']);

    expect((await get('pageSize=10&did=left')).items.map((v: { city: string }) => v.city)).toEqual(['Karachi']);
    expect((await get('pageSize=10&source=tiktok')).total).toBe(2);
    expect((await get('pageSize=10&q=lahore')).total).toBe(1);
    expect((await get('pageSize=10&q=azar')).total).toBe(1);
    const p2 = await get('pageSize=10&page=2');
    expect(p2).toMatchObject({ total: 3, page: 2, items: [] });
    await t.http.get('/v1/admin/dashboard/marketing/visits?pageSize=7').set(staff.auth).expect(400);
  });

  it('one definition: steps count visits (never above 100%), only real calls and real money count', async () => {
    const google = { r: 'https://www.google.com/' };
    // Same browser, two visits: 1 visitor, 2 visits, 2 clicked — the old page showed this as 200%.
    await beacon({ k: 'view', v: 'visit_r1111111', u: 'visitor_r1', p: '/', ...google });
    await beacon({ k: 'click', v: 'visit_r1111111', u: 'visitor_r1', p: '/', b: 'hero_start', t: '/match' });
    await beacon({ k: 'view', v: 'visit_r2222222', u: 'visitor_r1', p: '/random-video-chat/', ...google });
    await beacon({ k: 'click', v: 'visit_r2222222', u: 'visitor_r1', p: '/random-video-chat/', b: 'page_hero', t: '/match' });
    await beacon({ k: 'view', v: 'visit_r3333333', u: 'visitor_r2', p: '/' });
    await beacon({ k: 'leave', v: 'visit_r3333333', u: 'visitor_r2', p: '/', s: 4 });

    const u = await signUp(t, { name: 'Ali' });
    await t.http.post('/v1/site/attribution').set(u.auth).send({ visitId: 'visit_r2222222' }).expect(200);
    const friend = await signUp(t, { name: 'Real' });
    const bot = await t.prisma.user.create({ data: { name: 'Bot', isBot: true, inviteCode: `BOT${Date.now()}` } });
    const at = (sec: number) => new Date(Date.now() + sec * 1000);
    // A long call with a bot doesn't count; a 70 s call with a real person does.
    await t.prisma.match.create({ data: { userAId: u.id, userBId: bot.id, startedAt: at(1), endedAt: at(300) } });
    // Test-gateway money doesn't count; JazzCash does.
    const buy = (method: 'CARD' | 'JAZZCASH', provider: string, key: string) =>
      t.prisma.purchase.create({
        data: { userId: u.id, productType: 'COIN_PACK', productId: 'p1', method, usdCents: 499, status: 'SUCCEEDED', idempotencyKey: key, completedAt: new Date(), events: { create: { provider, type: 'charge.started' } } },
      });
    await buy('CARD', 'card-dev', 'k-test');

    const staff = await staffLogin(t);
    const get = async () => (await t.http.get('/v1/admin/dashboard/marketing?days=7').set(staff.auth).expect(200)).body;
    let r = await get();
    expect(r.totals).toMatchObject({ visitors: 2, visits: 3, engagedVisits: 2, clickedVisits: 2, signups: 1, firstCalls: 0, goodFirstCall: 0, paid: 0 });
    expect(r.totals.clickedVisits).toBeLessThanOrEqual(r.totals.visits);
    const g = r.sources.find((x: { source: string }) => x.source === 'google');
    expect(g).toMatchObject({ visitors: 1, visits: 2, clicked: 2, signups: 1, paid: 0 });
    expect(r.pages.find((x: { path: string }) => x.path === '/random-video-chat/')).toMatchObject({ visits: 1, clicked: 1, signups: 1 });

    await t.prisma.match.create({ data: { userAId: friend.id, userBId: u.id, startedAt: at(400), endedAt: at(470) } });
    await buy('JAZZCASH', 'jazzcash', 'k-real');
    await t.redis.client.del('admin:dash:marketing:7'); // the report is cached 60 s
    r = await get();
    expect(r.totals).toMatchObject({ signups: 1, firstCalls: 1, goodFirstCall: 1, paid: 1 });

    // The views agree with the report.
    const [paid] = await t.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "vw_real_payment" WHERE user_id = ${u.id}`;
    expect(Number(paid.n)).toBe(1);
    const [calls] = await t.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "vw_real_call" WHERE user_id = ${u.id}`;
    expect(Number(calls.n)).toBe(1);
  });
});
