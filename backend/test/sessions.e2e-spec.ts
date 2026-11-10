import { io, type Socket } from 'socket.io-client';

import { createTestApp, next, resetState, sleep, staffLogin, TestApp } from './helpers';

/** Settings → Devices: where you're signed in, and signing devices out (also from admin). */
describe('signed-in devices', () => {
  let t: TestApp;
  let seq = 0;
  const sockets: Socket[] = [];
  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => resetState(t));
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await t.close();
  });

  /** One sign-in from a given app or browser. */
  const signIn = async (email: string, headers: Record<string, string>) => {
    await t.redis.client.del(`otp:resend:${email}`, `otp:hourly:${email}`);
    await t.http.post('/v1/auth/otp/request').send({ email }).expect(200);
    const r = await t.http.post('/v1/auth/otp/verify').set(headers).send({ email, code: '1234' }).expect(200);
    return { id: r.body.user.id as string, access: r.body.tokens.accessToken as string, refresh: r.body.tokens.refreshToken as string, auth: { Authorization: `Bearer ${r.body.tokens.accessToken}` } };
  };
  const phone = { 'X-Client': 'android/1.4.0', 'X-Device': encodeURIComponent('Samsung SM-A515F · Android 13'), 'User-Agent': 'Dart/3.5 (dart:io)' };
  const laptop = { 'X-Client': 'web', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };
  const connect = (access: string) =>
    new Promise<Socket>((resolve, reject) => {
      const s = io(t.url, { auth: { token: access }, transports: ['websocket'], forceNew: true, reconnection: false });
      sockets.push(s);
      s.once('connect', () => resolve(s));
      s.once('connect_error', reject);
    });

  it('lists each device once (this one first), and signing one out ends it at once', async () => {
    const email = `devices${++seq}-${Date.now()}@vibe.test`;
    const p = await signIn(email, phone);
    await t.http.patch('/v1/me').set(p.auth).send({ name: 'Dev Ice', age: 24, gender: 'female', countryCode: 'PK' }).expect(200);
    const w = await signIn(email, laptop);
    // The phone refreshes a few times: still one device.
    let pRefresh = p.refresh;
    for (let i = 0; i < 2; i++) {
      const r = await t.http.post('/v1/auth/refresh').set(phone).send({ refreshToken: pRefresh }).expect(200);
      pRefresh = r.body.tokens?.refreshToken ?? r.body.refreshToken;
    }
    const fromWeb = (await t.http.get('/v1/me/sessions').set(w.auth).expect(200)).body as { id: string; client: string; device: string; current: boolean }[];
    expect(fromWeb).toHaveLength(2);
    expect(fromWeb[0]).toMatchObject({ client: 'web', device: 'Chrome on Windows', current: true });
    expect(fromWeb[1]).toMatchObject({ client: 'android', device: 'Samsung SM-A515F · Android 13', current: false });
    expect(fromWeb[0]).not.toHaveProperty('ip');

    // The web signs the phone out: its live connection hears it, its token stops working now, and so does its refresh.
    const s = await connect(p.access);
    const ended = next(s, 'session:ended');
    await t.http.delete(`/v1/me/sessions/${fromWeb[1].id}`).set(w.auth).expect(200);
    expect(await ended).toMatchObject({ reason: 'signed_out_elsewhere' });
    const me = await t.http.get('/v1/me').set(p.auth).expect(401);
    expect(me.body.error.code).toBe('SESSION_ENDED');
    const again = await t.http.post('/v1/auth/refresh').set(phone).send({ refreshToken: pRefresh }).expect(401);
    expect(again.body.error.code).toBe('SESSION_ENDED');
    await expect(connect(p.access)).rejects.toThrow('SESSION_ENDED');
    // The web is untouched; the list now has just it.
    expect((await t.http.get('/v1/me/sessions').set(w.auth).expect(200)).body).toHaveLength(1);
    // Someone else's (or a gone) device: not found.
    await t.http.delete(`/v1/me/sessions/${fromWeb[1].id}`).set(w.auth).expect(404);
  });

  it('sign out of every other device keeps this one', async () => {
    const email = `devices${++seq}-${Date.now()}@vibe.test`;
    const a = await signIn(email, laptop);
    await t.http.patch('/v1/me').set(a.auth).send({ name: 'Dev Ice', age: 24, gender: 'female', countryCode: 'PK' }).expect(200);
    const b = await signIn(email, phone);
    const c = await signIn(email, phone);
    expect((await t.http.post('/v1/me/sessions/sign-out-others').set(a.auth).expect(200)).body).toEqual({ ended: 2 });
    await t.http.get('/v1/me').set(a.auth).expect(200);
    await t.http.get('/v1/me').set(b.auth).expect(401);
    await t.http.get('/v1/me').set(c.auth).expect(401);
    const left = (await t.http.get('/v1/me/sessions').set(a.auth).expect(200)).body;
    expect(left).toEqual([expect.objectContaining({ current: true, client: 'web' })]);
  });

  it('admin sees a person’s devices with IP and can sign them out', async () => {
    const email = `devices${++seq}-${Date.now()}@vibe.test`;
    const p = await signIn(email, phone);
    await t.http.patch('/v1/me').set(p.auth).send({ name: 'Dev Ice', age: 24, gender: 'female', countryCode: 'PK' }).expect(200);
    const owner = await staffLogin(t, 'owner');
    const list = (await t.http.get(`/v1/admin/users/${p.id}/sessions`).set(owner.auth).expect(200)).body;
    expect(list).toEqual([expect.objectContaining({ client: 'android', device: 'Samsung SM-A515F · Android 13', current: false, ip: expect.any(String), userAgent: 'Dart/3.5 (dart:io)' })]);
    await t.http.delete(`/v1/admin/users/${p.id}/sessions/${list[0].id}`).set(owner.auth).send({ reason: 'lost phone' }).expect(200);
    await t.http.get('/v1/me').set(p.auth).expect(401);
    const audit = await t.prisma.auditLog.findFirst({ where: { action: 'user.session_ended', targetId: p.id } });
    expect(audit).not.toBeNull();
    await sleep(10);
    const support = await staffLogin(t, 'support');
    await t.http.post(`/v1/admin/users/${p.id}/sessions/sign-out-all`).set(support.auth).send({ reason: 'x' }).expect((r) => expect([400, 403]).toContain(r.status));
  });
});
