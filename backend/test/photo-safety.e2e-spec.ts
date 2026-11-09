import sharp from 'sharp';

import { AppConfig } from '../src/config/app-config.service';
import { StorageProvider } from '../src/infra/storage/storage.provider';
import { ImageSafetyService } from '../src/modules/safety/image-safety.service';
import { createTestApp, resetState, signUp, sleep, staffLogin, TestApp, TestUser } from './helpers';

/**
 * The photo filter end to end: chat photos, Moments and profile photos go
 * through re-encoding and the nudity check; blocked ones never reach the
 * other person or public storage; three strikes pause the account; staff
 * see the flags. vibe-face is stubbed: the next score is `nextScore`.
 */
describe('photo safety', () => {
  let t: TestApp;
  let nextScore: number | 'down' = 0;
  let checks = 0;
  let JPG: Buffer;

  const photo = () =>
    sharp({ create: { width: 640, height: 480, channels: 3, background: '#a0785a' } })
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '24/1 51/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '67/1 0/1 0/1' } })
      .toBuffer();

  beforeAll(async () => {
    JPG = await photo();
    t = await createTestApp();
    const config = t.app.get(AppConfig);
    const real = config.get.bind(config);
    jest.spyOn(config, 'get').mockImplementation(((k: string) => (k === 'NSFW_FILTER' ? 'on' : real(k as never))) as typeof config.get);
    t.app.get(ImageSafetyService).http = (async () => {
      checks++;
      if (nextScore === 'down') throw new Error('connect ECONNREFUSED');
      return new Response(JSON.stringify({ nsfw: nextScore }), { headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
  });
  beforeEach(async () => {
    nextScore = 0;
    checks = 0;
    await resetState(t);
  });
  afterAll(async () => {
    await sleep(200);
    await t.close();
  });

  const friends = async () => {
    const a = await signUp(t, { name: 'Asad' });
    const b = await signUp(t, { name: 'Bina' });
    const [low, high] = [a.id, b.id].sort();
    await t.prisma.friendship.create({ data: { userLowId: low, userHighId: high, requesterId: a.id, status: 'ACCEPTED' } });
    return { a, b };
  };
  const sendPhoto = (from: TestUser, to: TestUser, bytes = JPG, type = 'image/jpeg') =>
    t.http.post(`/v1/friends/${to.id}/messages/media`).set(from.auth).field('kind', 'photo').attach('file', bytes, { filename: 'p.jpg', contentType: type });

  it('a normal chat photo is sent as a clean JPEG with no location in it', async () => {
    const { a, b } = await friends();
    const r = (await (sendPhoto(a, b)).expect(201)).body;
    expect(checks).toBe(1);
    expect(r).toMatchObject({ kind: 'photo', meta: { w: 640, h: 480 } });
    expect(r.meta.key).toMatch(/\.jpg$/);
    const stored = await t.app.get(StorageProvider).read(r.meta.key);
    expect((await sharp(stored!).metadata()).exif).toBeUndefined();
    expect(await t.prisma.mediaFlag.count()).toBe(0);
  });

  it('a file pretending to be a photo is refused before any check', async () => {
    const { a, b } = await friends();
    await (sendPhoto(a, b, Buffer.from('#!/bin/sh\nrm -rf /'), 'image/jpeg')).expect(415);
    expect(checks).toBe(0);
  });

  it('nudity is blocked: nothing reaches the friend, a private copy and a flag are kept', async () => {
    const { a, b } = await friends();
    nextScore = 0.97;
    const res = await (sendPhoto(a, b)).expect(422);
    expect(res.body.error.code).toBe('CONTENT_BLOCKED');

    expect(await t.prisma.message.count()).toBe(0);
    const [flag] = await t.prisma.mediaFlag.findMany();
    expect(flag).toMatchObject({ userId: a.id, place: 'chat', action: 'blocked', score: 0.97 });
    expect(flag.key).toMatch(new RegExp(`^flags/${a.id}/`));
    const storage = t.app.get(StorageProvider);
    expect(await storage.read(flag.key!, { private: true })).not.toBeNull();
    expect(await storage.read(flag.key!)).toBeNull(); // not in public storage
  });

  it('three blocked photos pause the account', async () => {
    const { a, b } = await friends();
    nextScore = 0.99;
    for (let i = 0; i < 3; i++) await (sendPhoto(a, b)).expect(422);
    await sleep(100); // the strike listener runs after the response
    const u = await t.prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(u.bannedUntil!.getTime()).toBeGreaterThan(Date.now());
    nextScore = 0;
    const paused = await t.http.post('/v1/moments').set(a.auth).attach('photo', JPG, { filename: 'm.jpg', contentType: 'image/jpeg' });
    expect(paused.status).toBe(403);
  });

  it('borderline photos go through and wait for a moderator', async () => {
    const { a, b } = await friends();
    nextScore = 0.7;
    const r = (await (sendPhoto(a, b)).expect(201)).body;
    const [flag] = await t.prisma.mediaFlag.findMany();
    expect(flag).toMatchObject({ action: 'review', key: r.meta.key, reviewedAt: null });

    const staff = await staffLogin(t);
    const list = (await t.http.get('/v1/admin/photo-flags').query({ status: 'open' }).set(staff.auth).expect(200)).body;
    expect(list.open).toBe(1);
    expect(list.items[0]).toMatchObject({ id: flag.id, action: 'review', user: { id: a.id, name: 'Asad' }, hasImage: true });
    const img = await t.http.get(`/v1/admin/photo-flags/${flag.id}/image`).set(staff.auth).buffer(true).expect(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.headers['cache-control']).toBe('no-store');
    await t.http.post(`/v1/admin/photo-flags/${flag.id}/reviewed`).set(staff.auth).expect(200);
    expect((await t.http.get('/v1/admin/photo-flags').query({ status: 'open' }).set(staff.auth).expect(200)).body.open).toBe(0);
    expect(await t.prisma.auditLog.count({ where: { action: 'photo_flag.viewed' } })).toBe(1);
    expect((await t.http.get(`/v1/admin/users/${a.id}`).set(staff.auth).expect(200)).body.counts.photoFlags).toBe(1);
  });

  it('when the check is down, photos wait instead of going out unchecked', async () => {
    const { a, b } = await friends();
    nextScore = 'down';
    const res = await (sendPhoto(a, b)).expect(503);
    expect(res.body.error.code).toBe('SAFETY_CHECK_UNAVAILABLE');
    expect(await t.prisma.message.count()).toBe(0);
  });

  it('Moments and profile photos are checked too', async () => {
    const u = await signUp(t, { name: 'Sana' });
    nextScore = 0.95;
    await t.http.post('/v1/moments').set(u.auth).attach('photo', JPG, { filename: 'm.jpg', contentType: 'image/jpeg' }).expect(422);
    await t.http.post('/v1/me/avatar').set(u.auth).attach('file', JPG, { filename: 'me.jpg', contentType: 'image/jpeg' }).expect(422);
    expect(await t.prisma.moment.count()).toBe(0);
    expect((await t.prisma.mediaFlag.findMany({ orderBy: { createdAt: 'asc' } })).map((f) => f.place)).toEqual(['moment', 'avatar']);

    nextScore = 0.01;
    const me = (await t.http.post('/v1/me/avatar').set(u.auth).attach('file', JPG, { filename: 'me.jpg', contentType: 'image/jpeg' }).expect(201)).body;
    expect(me.avatarUrl).toMatch(new RegExp(`avatars/${u.id}/.+\\.jpg$`));
  });

  it('a profile photo cannot be set to an outside URL that skipped the checks', async () => {
    const u = await signUp(t, { name: 'Omar' });
    await t.http.patch('/v1/me').set(u.auth).send({ avatarUrl: 'https://evil.example/nude.jpg' }).expect(400);
    const me = (await t.http.post('/v1/me/avatar').set(u.auth).attach('file', JPG, { filename: 'me.jpg', contentType: 'image/jpeg' }).expect(201)).body;
    // Sending your own (already uploaded) photo back, as the apps do when saving the profile, is fine.
    await t.http.patch('/v1/me').set(u.auth).send({ avatarUrl: me.avatarUrl, bio: 'hi' }).expect(200);
  });
});
