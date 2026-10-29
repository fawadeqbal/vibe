import type { Socket } from 'socket.io-client';

import { ModerationService } from '../src/modules/moderation/moderation.service';
import { connect, createTestApp, emit, next, resetState, signUp, sleep, staffLogin, TestApp } from './helpers';

/** "Your account is paused": the countdown details and "this is a mistake" appeals. */
describe('ban appeals', () => {
  let t: TestApp;
  const sockets: Socket[] = [];
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
    await sleep(300);
    await t.close();
  });

  it('a paused person sees until when, can appeal once, and a moderator can lift it', async () => {
    const u = await signUp(t, { name: 'Sana' });
    // Not paused: nothing to appeal.
    await t.http.post('/v1/me/appeal').set(u.auth).send({ message: 'I did nothing wrong at all' }).expect(400);
    const until = await t.app.get(ModerationService).ban(u.id, 24, 'test');
    await sleep(600);

    const me = await t.http.get('/v1/me').set(u.auth).expect(200);
    expect(me.body.bannedUntil).toBe(until.toISOString());
    const s = await connect(t, u);
    sockets.push(s);
    await expect(emit(s, 'match:join', {})).rejects.toMatchObject({ code: 'ACCOUNT_BANNED', details: { until: until.toISOString() } });

    expect((await t.http.get('/v1/me/appeal').set(u.auth).expect(200)).body.appeal).toBeNull();
    await t.http.post('/v1/me/appeal').set(u.auth).send({ message: 'short' }).expect(400);
    const made = await t.http.post('/v1/me/appeal').set(u.auth).send({ message: 'Someone reported me by mistake, I was just saying hi.' }).expect(201);
    expect(made.body.appeal).toMatchObject({ status: 'OPEN', bannedUntil: until.toISOString() });
    await t.http.post('/v1/me/appeal').set(u.auth).send({ message: 'Me again, still a mistake please' }).expect(409);
    expect((await t.http.get('/v1/me/appeal').set(u.auth).expect(200)).body.appeal.status).toBe('OPEN');

    // Viewers see the list; only moderators can answer.
    const viewer = await staffLogin(t, 'viewer');
    const list = await t.http.get('/v1/admin/appeals').set(viewer.auth).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ user: { id: u.id, name: 'Sana' }, message: expect.stringContaining('by mistake') });
    expect((await t.http.get('/v1/admin/appeals/stats').set(viewer.auth).expect(200)).body.open).toBe(1);
    const id = list.body.items[0].id;
    await t.http.post(`/v1/admin/appeals/${id}/resolve`).set(viewer.auth).send({ action: 'accept' }).expect(403);

    const owner = await staffLogin(t, 'owner');
    const told = next(s, 'account:appeal');
    await t.http.post(`/v1/admin/appeals/${id}/resolve`).set(owner.auth).send({ action: 'accept', note: 'Sorry about that!' }).expect(200);
    expect(await told).toEqual({ status: 'ACCEPTED', note: 'Sorry about that!' });
    expect((await t.http.get('/v1/me').set(u.auth).expect(200)).body.bannedUntil).toBeNull();
    await t.http.post(`/v1/admin/appeals/${id}/resolve`).set(owner.auth).send({ action: 'reject' }).expect(409);
    expect((await t.http.get('/v1/admin/appeals').set(owner.auth).expect(200)).body.items).toHaveLength(0);
    expect((await t.http.get('/v1/admin/appeals?status=ACCEPTED').set(owner.auth).expect(200)).body.items).toHaveLength(1);
  });

  it('a rejected appeal keeps the pause', async () => {
    const u = await signUp(t);
    await t.app.get(ModerationService).ban(u.id, 24, 'test');
    await t.http.post('/v1/me/appeal').set(u.auth).send({ message: 'Please look again at my reports' }).expect(201);
    const owner = await staffLogin(t, 'owner');
    const [a] = (await t.http.get('/v1/admin/appeals').set(owner.auth).expect(200)).body.items;
    await t.http.post(`/v1/admin/appeals/${a.id}/resolve`).set(owner.auth).send({ action: 'reject' }).expect(200);
    expect((await t.http.get('/v1/me').set(u.auth).expect(200)).body.bannedUntil).not.toBeNull();
    expect((await t.http.get('/v1/me/appeal').set(u.auth).expect(200)).body.appeal.status).toBe('REJECTED');
  });
});
