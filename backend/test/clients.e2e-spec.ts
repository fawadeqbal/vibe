import { io, Socket } from 'socket.io-client';

import { createTestApp, resetState, signUp, sleep, staffLogin, TestApp, TestUser } from './helpers';

/**
 * "Who is on the app and who is on the website": each live connection says
 * which Vibe it is, each person's last one is remembered, and the admin
 * panel lists, filters and counts by it.
 */
describe('app vs website', () => {
  let t: TestApp;
  const sockets: Socket[] = [];

  /** Connects like the apps do: `client` in the handshake (the website says "web", the phone apps "android/x.y"). */
  const open = async (u: TestUser, client?: string, headers: Record<string, string> = {}) => {
    const s = io(t.url, { auth: { token: u.token, ...(client ? { client } : {}) }, extraHeaders: headers, transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(s);
    await new Promise<void>((ok, fail) => {
      s.once('connect', () => ok());
      s.once('connect_error', fail);
    });
    await sleep(150);
    return s;
  };

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
    await sleep(200);
    await t.close();
  });

  it('admin sees who is on the app, who is on the website, and both', async () => {
    const asad = await signUp(t, { name: 'Asad' });
    const bina = await signUp(t, { name: 'Bina' });
    const chand = await signUp(t, { name: 'Chand' });
    const away = await signUp(t, { name: 'Dua' });
    await open(asad, 'android/0.2.0');
    await open(bina, 'web');
    await open(chand, 'android/0.2.0');
    await open(chand, 'web');
    await sleep(5100); // the admin's live list is cached for 5 s

    const staff = await staffLogin(t);
    const list = async (q: Record<string, string>) => (await t.http.get('/v1/admin/users').query(q).set(staff.auth).expect(200)).body.items as { name: string; onlineOn: string[]; lastClient: string | null }[];
    const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort();

    expect(names(await list({ online: 'app' }))).toEqual(['Asad', 'Chand']);
    expect(names(await list({ online: 'web' }))).toEqual(['Bina', 'Chand']);
    expect(names(await list({ online: 'any' }))).toEqual(['Asad', 'Bina', 'Chand']);
    const all = await list({});
    expect(all.find((u) => u.name === 'Chand')?.onlineOn).toEqual(['android', 'web']);
    expect(all.find((u) => u.name === 'Dua')).toMatchObject({ onlineOn: [] });

    // What they used last, kept after they leave.
    expect(names(await list({ client: 'app' }))).toEqual(['Asad']);
    expect(names(await list({ client: 'android' }))).toEqual(['Asad']);
    expect(names(await list({ client: 'web' })).sort()).toEqual(expect.arrayContaining(['Bina', 'Chand']));
    expect(names(await list({ client: 'ios' }))).toEqual([]);

    const live = (await t.http.get('/v1/admin/live').set(staff.auth).expect(200)).body;
    expect(live.onlineBy).toEqual({ android: 2, ios: 0, web: 2 });

    const detail = (await t.http.get(`/v1/admin/users/${chand.id}`).set(staff.auth).expect(200)).body;
    expect(detail.onlineOn).toEqual(['android', 'web']);
    expect(detail.clients.used.map((c: { client: string }) => c.client).sort()).toEqual(['android', 'web']);
    expect(detail.clients.used[0]).toMatchObject({ days: 1, lastDay: expect.any(String) });
    void away;
  });

  it('the last Vibe used is remembered (and switches when they switch)', async () => {
    const u = await signUp(t, { name: 'Esha' });
    const s = await open(u, 'android/0.2.0');
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).lastClient).toBe('android');
    s.disconnect();
    await open(u, 'web');
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).lastClient).toBe('web');
    // An app request over HTTP counts too (X-Client header).
    await t.http.get('/v1/me').set(u.auth).set('X-Client', 'ios/1.0.0').expect(200);
    await sleep(100);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).lastClient).toBe('ios');
  });

  it('older app builds without `client` are still recognised as the app', async () => {
    const u = await signUp(t, { name: 'Faiz' });
    await open(u, undefined, { 'User-Agent': 'Dart/3.5 (dart:io)' });
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).lastClient).toBe('android');
  });
});
