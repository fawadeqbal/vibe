import { createTestApp, resetState, staffLogin, TestApp } from './helpers';

/** App vs web: where accounts are made, who uses which client, Android downloads. */
describe('platforms', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => resetState(t));
  afterAll(() => t.close());

  let seq = 0;
  const signUp = async (headers: Record<string, string>) => {
    const email = `plat${++seq}-${Date.now()}@vibe.test`;
    await t.http.post('/v1/auth/otp/request').send({ email }).expect(200);
    const res = await t.http.post('/v1/auth/otp/verify').set(headers).send({ email, code: '1234' }).expect(200);
    return { id: res.body.user.id as string, auth: { Authorization: `Bearer ${res.body.tokens.accessToken}` } };
  };

  it('counts sign-ups and daily use per client, and Android downloads', async () => {
    const app = await signUp({ 'X-Client': 'android/0.1.5' });
    const oldApp = await signUp({ 'User-Agent': 'Dart/3.5 (dart:io)' });
    const web = await signUp({ 'User-Agent': 'Mozilla/5.0 (iPhone) Safari/605', 'X-Client': 'web' });
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: app.id } })).signupClient).toBe('android');
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: oldApp.id } })).signupClient).toBe('android');
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: web.id } })).signupClient).toBe('web');

    await t.http.get('/v1/me').set(app.auth).set('X-Client', 'android/0.1.5').expect(200);
    await t.http.get('/v1/me').set(app.auth).set('X-Client', 'android/0.1.5').expect(200); // once a day
    await t.http.get('/v1/me').set(web.auth).set('X-Client', 'web').expect(200);
    await t.http.get('/v1/me').set(app.auth).set('X-Client', 'web').expect(200); // the same person on the web too
    await new Promise((r) => setTimeout(r, 200));
    expect(await t.prisma.clientActivity.count({ where: { userId: app.id } })).toBe(2);

    // "Download for Android": counted once per person per 10 minutes, then off to the APK.
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Chrome/130';
    const dl = await t.http.get('/v1/site/download/android?b=hero_android').set('User-Agent', ua).expect(302);
    expect(dl.headers.location).toBe('https://github.com/fawadeqbal/vibe/releases/latest/download/vibe.apk');
    await t.http.get('/v1/site/download/android').set('User-Agent', ua).expect(302);
    await t.http.get('/v1/site/download/android').set('User-Agent', 'Googlebot/2.1').expect(302); // bots aren't counted
    expect(await t.prisma.appDownload.count()).toBe(1);
    expect(await t.prisma.appDownload.findFirst()).toMatchObject({ platform: 'android', button: 'hero_android', source: 'direct', device: 'phone' });

    const viewer = await staffLogin(t, 'viewer');
    const r = (await t.http.get('/v1/admin/dashboard/platforms?days=7').set(viewer.auth).expect(200)).body;
    expect(r.signups).toMatchObject({ android: 2, web: 1, ios: 0 });
    expect(r.activeToday).toEqual({ android: 1, ios: 0, web: 2 });
    expect(r.daily).toHaveLength(7);
    expect(r.daily.at(-1)).toMatchObject({ signups: { android: 2, web: 1 }, active: { android: 1, web: 2 } });
    expect(r.downloads).toMatchObject({ inWindow: 1, allTime: 1, github: null, bySource: [{ source: 'direct', downloads: 1 }] });
  });
});
