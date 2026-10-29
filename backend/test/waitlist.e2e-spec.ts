import type { Socket } from 'socket.io-client';

import { DevPushSender } from '../src/modules/push/push-sender';
import { PushService } from '../src/modules/push/push.service';
import { connect, createTestApp, emit, next, resetState, signUp, sleep, TestApp } from './helpers';

/** "Tell me when someone's looking": one-shot, in-app when connected, push when not. */
describe('match waitlist', () => {
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
  const sent = () => (t.app.get(PushService).sender as DevPushSender).sent;

  it('tells a connected waiter in-app, once, when someone starts searching alone', async () => {
    const waiter = await signUp(t, { name: 'Waqas' });
    const searcher = await signUp(t, { name: 'Sara' });
    expect((await t.http.get('/v1/match/notify-me').set(waiter.auth).expect(200)).body.until).toBeNull();
    const set = await t.http.post('/v1/match/notify-me').set(waiter.auth).expect(200);
    expect(new Date(set.body.until).getTime()).toBeGreaterThan(Date.now() + 2 * 3600_000);

    const sw = await connect(t, waiter);
    const ss = await connect(t, searcher);
    sockets.push(sw, ss);
    const told = next(sw, 'match:someone-looking');
    expect((await emit<{ status: string }>(ss, 'match:join', {})).status).toBe('searching');
    await told;

    // One-shot: the request is used up, and a second searcher doesn't ping again.
    expect((await t.http.get('/v1/match/notify-me').set(waiter.auth).expect(200)).body.until).toBeNull();
    let again = false;
    sw.once('match:someone-looking', () => (again = true));
    await emit(ss, 'match:leave', {});
    await emit(ss, 'match:join', {});
    await sleep(200);
    expect(again).toBe(false);
  });

  it('pushes to a waiter who is not connected, and joining the queue cancels your own request', async () => {
    const waiter = await signUp(t, { name: 'Hina' });
    const searcher = await signUp(t, { name: 'Umar' });
    await t.http.post('/v1/me/push-tokens').set(waiter.auth).send({ token: 'fcm-token-of-hina-phone-00001', platform: 'android' }).expect(200);
    await t.http.post('/v1/match/notify-me').set(waiter.auth).expect(200);
    await t.http.post('/v1/match/notify-me').set(searcher.auth).expect(200);
    sent().length = 0;

    const ss = await connect(t, searcher);
    sockets.push(ss);
    await emit(ss, 'match:join', {});
    await sleep(200);
    const toHina = sent().filter((s) => s.token === 'fcm-token-of-hina-phone-00001');
    expect(toHina).toHaveLength(1);
    expect(toHina[0].msg).toMatchObject({ category: 'social', data: { route: 'match' } });
    // The searcher's own request went away when they started searching.
    expect((await t.http.get('/v1/match/notify-me').set(searcher.auth).expect(200)).body.until).toBeNull();
  });

  it('can be cancelled', async () => {
    const u = await signUp(t);
    await t.http.post('/v1/match/notify-me').set(u.auth).expect(200);
    await t.http.delete('/v1/match/notify-me').set(u.auth).expect(200);
    expect((await t.http.get('/v1/match/notify-me').set(u.auth).expect(200)).body.until).toBeNull();
  });
});
