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

  it('links a new account to its visit, once; the admin report counts it', async () => {
    await beacon({ k: 'view', v: 'visit_cccccccc', u: 'visitor_33333', p: '/', r: 'https://www.google.com/' }, phone, { 'cf-ipcountry': 'AE', 'cf-region': 'Dubai' });
    await beacon({ k: 'click', v: 'visit_cccccccc', u: 'visitor_33333', p: '/', b: 'discover_open', t: '/discover' });
    const u = await signUp(t, { name: 'Sara' });
    expect((await t.http.post('/v1/site/attribution').set(u.auth).send({ visitId: 'visit_cccccccc' }).expect(200)).body).toEqual({ linked: true });
    expect((await t.http.post('/v1/site/attribution').set(u.auth).send({ visitId: 'visit_cccccccc' }).expect(200)).body).toEqual({ linked: false });

    const staff = await staffLogin(t);
    const r = (await t.http.get('/v1/admin/dashboard/marketing?days=7').set(staff.auth).expect(200)).body;
    expect(r.totals).toMatchObject({ visitors: 1, visits: 1, clickedVisits: 1, clicks: 1, signups: 1 });
    expect(r.sources[0]).toMatchObject({ source: 'google', medium: 'search', visitors: 1, signups: 1 });
    expect(r.countries[0]).toMatchObject({ country: 'AE', visitors: 1, regions: [{ name: 'Dubai', visitors: 1 }] });
    expect(r.buttons[0]).toMatchObject({ button: 'discover_open', target: '/discover', clicks: 1, signups: 1 });
    expect(r.live.now).toBe(1);
    expect(r.live.recent[0]).toMatchObject({ did: 'signed_up', source: 'google' });
    expect(r.siteUrl).toMatch(/^https?:\/\//);
  });
});
