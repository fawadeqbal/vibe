import { MonetagProvider } from '../src/modules/wallet/ads/monetag.provider';
import { createTestApp, resetState, signUp, staffLogin, TestApp, TestStaff } from './helpers';

/** Store videos: admin picks the network, the client gets a token, Monetag's postback confirms, the claim pays. */
describe('rewarded videos via Monetag', () => {
  let t: TestApp;
  let owner: TestStaff;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
    owner = await staffLogin(t);
  });
  afterAll(() => t.close());

  const set = (key: string, value: unknown) => t.http.put(`/v1/admin/settings/${key}`).set(owner.auth).send({ value });

  it('the admin panel offers the networks as choices and checks the zone', async () => {
    const list = await t.http.get('/v1/admin/settings').set(owner.auth).expect(200);
    const rows = (Array.isArray(list.body) ? list.body : list.body.items) as { key: string; type: string; options?: string[] }[];
    expect(rows.find((s) => s.key === 'ads.web')).toMatchObject({ type: 'select', options: ['off', 'monetag'] });
    expect(rows.find((s) => s.key === 'ads.app')).toMatchObject({ type: 'select', options: ['off', 'monetag', 'admob'] });
    await set('ads.web', 'admob').expect(400);
    await set('ads.monetagZoneId', 'abc').expect(400);
  });

  it('off by default on the web; on once the admin picks Monetag and a zone', async () => {
    const u = await signUp(t);
    expect((await t.http.get('/v1/wallet/rewards/ad/setup').query({ platform: 'web' }).set(u.auth).expect(200)).body).toEqual({ provider: 'off' });
    await t.http.post('/v1/wallet/rewards/ad/start').set(u.auth).send({ platform: 'web' }).expect(403);

    await set('ads.web', 'monetag').expect(200);
    await set('ads.monetagZoneId', '9876543').expect(200);
    const setup = await t.http.get('/v1/wallet/rewards/ad/setup').query({ platform: 'web' }).set(u.auth).expect(200);
    expect(setup.body).toMatchObject({ provider: 'monetag', config: { zoneId: '9876543', sdkUrl: 'https://libtl.com/sdk.js' } });
    expect(setup.body.config.frameUrl).toMatch(/\/ad-frame$/);
    await t.http.get('/v1/wallet/rewards/ad/setup').query({ platform: 'tv' }).set(u.auth).expect(400);
    // The website's /ad-frame (used by the app) reads the zone from the public config, not its URL.
    expect((await t.http.get('/v1/config').expect(200)).body.monetag).toEqual({ zoneId: '9876543', sdkUrl: 'https://libtl.com/sdk.js' });
  });

  it('postback with the secret confirms the view; the claim pays coins', async () => {
    const u = await signUp(t);
    const { token, provider } = (await t.http.post('/v1/wallet/rewards/ad/start').set(u.auth).send({ platform: 'web' }).expect(200)).body;
    expect(provider).toBe('monetag');
    const secret = t.app.get(MonetagProvider).secret;
    const pb = (q: Record<string, string>) => t.http.get('/v1/webhooks/monetag/postback').query({ secret, ymid: token, event: 'impression', value: 'valued', zone: '9876543', ...q });

    expect((await pb({ secret: 'wrong' }).expect(200)).body).toEqual({ ok: false, result: 'bad_secret' });
    expect((await pb({}).expect(200)).body).toEqual({ ok: true, result: 'paid' });

    const before = (await t.http.get('/v1/wallet').set(u.auth)).body.coins;
    const claim = await t.http.post('/v1/wallet/rewards/ad').set(u.auth).send({ adToken: token }).expect(200);
    expect(claim.body.reward).toBe(10);
    expect(claim.body.wallet.coins).toBe(before + 10);
    const again = await t.http.post('/v1/wallet/rewards/ad').set(u.auth).send({ adToken: token }).expect(400);
    expect(again.body.error.code).toBe('AD_NOT_VERIFIED');
  });

  it('no token once the daily videos are used up', async () => {
    const u = await signUp(t);
    await t.prisma.wallet.update({ where: { userId: u.id }, data: { adsDay: new Date(), adsWatchedToday: 10 } });
    const r = await t.http.post('/v1/wallet/rewards/ad/start').set(u.auth).send({ platform: 'web' }).expect(409);
    expect(r.body.error.code).toBe('DAILY_LIMIT_REACHED');
  });

  it('the Integrations page shows the postback URL to paste in Monetag', async () => {
    const r = await t.http.get('/v1/admin/integrations').set(owner.auth).expect(200);
    const all = (Array.isArray(r.body) ? r.body : r.body.items) as { key: string; mode: string; endpoints?: { url: string }[] }[];
    const m = all.find((i) => i.key === 'ads.monetag')!;
    expect(m.mode).toBe('live');
    expect(m.endpoints![0].url).toContain('/v1/webhooks/monetag/postback?secret=');
    expect(m.endpoints![0].url).toContain('ymid={ymid}');
  });
});
