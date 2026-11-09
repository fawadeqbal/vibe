import sharp from 'sharp';

import { AppConfig } from '../src/config/app-config.service';
import { StorageProvider } from '../src/infra/storage/storage.provider';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { ImageSafetyService } from '../src/modules/safety/image-safety.service';
import { isPublicHttps, PhotoSweeperService } from '../src/modules/safety/photo-sweeper.service';
import { createTestApp, resetState, signUp, sleep, staffLogin, TestApp, TestUser } from './helpers';

/**
 * Every photo people can see has been checked: profile photos and Moments
 * from before the filter (or set some other way) are checked in the
 * background and taken down if they show nudity; verification selfies are
 * checked before staff see them. vibe-face is stubbed: each check takes the
 * next score from `scores` (0 when empty), or fails while `down`.
 */
describe('photo sweeper and selfies', () => {
  let t: TestApp;
  let scores: number[] = [];
  let down = false;
  let checks = 0;
  let JPG: Buffer;
  const sweeper = () => t.app.get(PhotoSweeperService);
  const storage = () => t.app.get(StorageProvider);

  beforeAll(async () => {
    JPG = await sharp({ create: { width: 320, height: 320, channels: 3, background: '#b08060' } }).jpeg().toBuffer();
    t = await createTestApp();
    const config = t.app.get(AppConfig);
    const real = config.get.bind(config);
    jest.spyOn(config, 'get').mockImplementation(((k: string) => (k === 'NSFW_FILTER' ? 'on' : real(k as never))) as typeof config.get);
    t.app.get(ImageSafetyService).http = (async () => {
      checks++;
      if (down) throw new Error('connect ECONNREFUSED');
      return new Response(JSON.stringify({ nsfw: scores.shift() ?? 0 }), { headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
  });
  beforeEach(async () => {
    scores = [];
    down = false;
    checks = 0;
    await resetState(t);
  });
  afterAll(async () => {
    await sleep(200);
    await t.close();
  });

  /** A profile photo already up from before the filter: in storage, never checked. */
  const oldAvatar = async (u: TestUser, verified = false) => {
    const key = `avatars/${u.id}/old-${Math.random().toString(36).slice(2)}.jpg`;
    const url = await storage().put(key, JPG, 'image/jpeg');
    await t.prisma.user.update({ where: { id: u.id }, data: { avatarUrl: url, avatarCheckedUrl: null, verified, verifiedAt: verified ? new Date() : null } });
    return { key, url };
  };
  const oldMoment = async (u: TestUser) => {
    const key = `moments/${u.id}/old-${Math.random().toString(36).slice(2)}.jpg`;
    const url = await storage().put(key, JPG, 'image/jpeg');
    return t.prisma.moment.create({ data: { userId: u.id, mediaKey: key, mediaUrl: url, expiresAt: new Date(Date.now() + 3_600_000) } });
  };

  it('an old nude profile photo is taken down, kept as private evidence, and the person is told', async () => {
    const u = await signUp(t, { name: 'Asad' });
    const { key, url } = await oldAvatar(u, true);
    scores = [0.97];

    expect(await sweeper().sweep()).toEqual({ checked: 1, removed: 1, flagged: 0, paused: false });
    const after = await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after).toMatchObject({ avatarUrl: '', verified: false, verifiedAt: null });
    expect(await storage().read(key)).toBeNull(); // gone from public storage
    const [flag] = await t.prisma.mediaFlag.findMany();
    expect(flag).toMatchObject({ userId: u.id, place: 'avatar', action: 'blocked', score: 0.97 });
    expect(await storage().read(flag.key!, { private: true })).not.toBeNull();
    // Not a strike: the photo was up before the rule.
    await sleep(100);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).bannedUntil).toBeNull();
    await t.app.get(NotificationsService).settled();
    expect((await t.http.get('/v1/activity').set(u.auth).expect(200)).body.items[0]).toMatchObject({ type: 'account.warning', body: expect.stringContaining('profile photo was removed') });
    void url;
  });

  it('clean photos are marked checked once; borderline ones stay up and wait for a moderator', async () => {
    const clean = await signUp(t, { name: 'Bina' });
    const border = await signUp(t, { name: 'Chand' });
    const a = await oldAvatar(clean);
    const b = await oldAvatar(border);
    scores = [0.02, 0.7].reverse(); // order: most recently active first; give both a decision either way
    const r = await sweeper().sweep();
    expect(r).toMatchObject({ checked: 2, removed: 0, flagged: 1 });
    const flagged = await t.prisma.mediaFlag.findFirstOrThrow();
    expect(flagged).toMatchObject({ action: 'review', place: 'avatar' });
    for (const [u, p] of [
      [clean, a],
      [border, b],
    ] as const) {
      expect(await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({ avatarUrl: p.url, avatarCheckedUrl: p.url });
    }
    // Nothing left to do.
    expect(await sweeper().sweep()).toMatchObject({ checked: 0 });
    expect(checks).toBe(2);
  });

  it('a changed profile photo is checked again; one uploaded through the app is already checked', async () => {
    const u = await signUp(t, { name: 'Dua' });
    await oldAvatar(u);
    await sweeper().sweep();
    await oldAvatar(u); // swapped some other way
    expect((await sweeper().sweep()).checked).toBe(1);

    const me = (await t.http.post('/v1/me/avatar').set(u.auth).attach('file', JPG, { filename: 'me.jpg', contentType: 'image/jpeg' }).expect(201)).body;
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).avatarCheckedUrl).toBe(me.avatarUrl);
    expect((await sweeper().sweep()).checked).toBe(0);
  });

  it('old Moments: nude ones are deleted, the rest marked checked', async () => {
    const u = await signUp(t, { name: 'Esha' });
    await t.prisma.user.update({ where: { id: u.id }, data: { avatarCheckedUrl: '' } }); // no photo to check
    const bad = await oldMoment(u);
    await sleep(5);
    const good = await oldMoment(u);
    scores = [0.01, 0.99]; // newest first
    expect(await sweeper().sweep()).toMatchObject({ checked: 2, removed: 1 });
    expect((await t.prisma.moment.findUniqueOrThrow({ where: { id: bad.id } })).deletedAt).not.toBeNull();
    expect(await storage().read(bad.mediaKey)).toBeNull();
    expect(await t.prisma.moment.findUniqueOrThrow({ where: { id: good.id } })).toMatchObject({ deletedAt: null, checkedAt: expect.any(Date) });
  });

  it('when the check is down nothing is marked; it picks up again next run', async () => {
    const u = await signUp(t, { name: 'Faiz' });
    await oldAvatar(u);
    down = true;
    expect(await sweeper().sweep()).toMatchObject({ checked: 0, paused: true });
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).avatarCheckedUrl).toBeNull();
    down = false;
    expect((await sweeper().sweep()).checked).toBe(1);
  });

  it('admin sees how many older photos are still waiting', async () => {
    const u = await signUp(t, { name: 'Gul' });
    await oldAvatar(u);
    await oldMoment(u);
    const staff = await staffLogin(t);
    expect((await t.http.get('/v1/admin/photo-flags').set(staff.auth).expect(200)).body.backlog).toEqual({ avatars: 1, moments: 1 });
    await sweeper().sweep();
    expect((await t.http.get('/v1/admin/photo-flags').set(staff.auth).expect(200)).body.backlog).toEqual({ avatars: 0, moments: 0 });
  });

  it('a nude verification selfie is refused before staff can see it (and counts as a strike)', async () => {
    const u = await signUp(t, { name: 'Hira' });
    // Verification needs a profile photo first.
    await t.http.post('/v1/me/avatar').set(u.auth).attach('file', JPG, { filename: 'me.jpg', contentType: 'image/jpeg' }).expect(201);
    scores = [0.95];
    const r = await t.http.post('/v1/me/verification').set(u.auth).attach('selfie', JPG, 'selfie.jpg').expect(422);
    expect(r.body.error.code).toBe('CONTENT_BLOCKED');
    expect(await t.prisma.verificationRequest.count()).toBe(0);
    expect(await t.prisma.mediaFlag.findFirst()).toMatchObject({ place: 'selfie', action: 'blocked' });

    scores = [0.01];
    await t.http.post('/v1/me/verification').set(u.auth).attach('selfie', JPG, 'selfie.jpg').expect(200);
  });

  it('outside photo links: only public HTTPS hosts are ever fetched', () => {
    expect(isPublicHttps('https://lh3.googleusercontent.com/a/photo.jpg')).toBe(true);
    for (const bad of ['http://example.com/a.jpg', 'https://localhost/a.jpg', 'https://10.0.0.5/a.jpg', 'https://[::1]/a.jpg', 'https://vibe-storage/a.jpg', 'https://x.internal/a', 'https://user:pw@example.com/a', 'https://example.com:8443/a', 'file:///etc/passwd', 'not a url']) {
      expect(isPublicHttps(bad)).toBe(false);
    }
  });
});
