import type { Socket } from 'socket.io-client';

import { RealtimeService } from '../src/infra/realtime/realtime.service';
import { MatchingService } from '../src/modules/matching/matching.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { DevPushSender } from '../src/modules/push/push-sender';
import { PushService } from '../src/modules/push/push.service';
import { PresenceNotifier } from '../src/modules/social/presence.notifier';
import { connect, createTestApp, next, requestFriend, resetState, signUp, sleep, TestApp, TestUser } from './helpers';

/**
 * Online / last seen / live presence for friends, and the Notifications
 * page (activity feed) that keeps friend and follow events even when the
 * push is skipped because you're in the app.
 */
describe('presence and notifications page', () => {
  let t: TestApp;
  const sockets: Socket[] = [];
  const open = async (u: TestUser) => {
    const s = await connect(t, u);
    sockets.push(s);
    await sleep(80);
    return s;
  };
  const close = async (s: Socket) => {
    s.disconnect();
    await sleep(150);
  };
  const online = (u: TestUser) => t.app.get(RealtimeService).isOnline(u.id);
  const friends = async (a: TestUser, b: TestUser) => {
    const [low, high] = [a.id, b.id].sort();
    await t.prisma.friendship.create({ data: { userLowId: low, userHighId: high, requesterId: a.id, status: 'ACCEPTED', acceptedAt: new Date() } });
  };
  const met = (a: TestUser, b: TestUser) => t.prisma.match.create({ data: { userAId: a.id, userBId: b.id, endedAt: new Date() } });

  beforeAll(async () => {
    t = await createTestApp();
    t.app.get(PresenceNotifier).graceMs = 300;
  });
  beforeEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    await sleep(100);
    await resetState(t);
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await sleep(400);
    await t.close();
  });

  it('two devices: still online after closing one, offline the moment the last one closes', async () => {
    const a = await signUp(t);
    const phone = await open(a);
    const laptop = await open(a);
    expect(await online(a)).toBe(true);

    await close(phone);
    expect(await online(a)).toBe(true);

    const before = Date.now();
    await close(laptop);
    expect(await online(a)).toBe(false);
    const u = await t.prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(u.lastSeenAt!.getTime()).toBeGreaterThanOrEqual(before - 50);
  });

  it('"last seen" is when they left, not when they opened the app', async () => {
    const a = await signUp(t);
    const s = await open(a);
    // Pretend they opened the app two hours ago and stayed.
    await t.prisma.user.update({ where: { id: a.id }, data: { lastSeenAt: new Date(Date.now() - 2 * 3_600_000) } });
    await close(s);
    const u = await t.prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(Date.now() - u.lastSeenAt!.getTime()).toBeLessThan(5_000);
  });

  it('leaving takes you out of the matching queue straight away', async () => {
    const a = await signUp(t);
    const s = await open(a);
    const queue = (t.app.get(MatchingService) as unknown as { queue: { add?: unknown; remove: (id: string) => Promise<boolean> } }).queue;
    const removed = jest.spyOn(queue, 'remove');
    await close(s);
    expect(removed).toHaveBeenCalledWith(a.id);
  });

  it('friends are told live when you come online and when you leave (after a short grace)', async () => {
    const a = await signUp(t, { name: 'Asad' });
    const b = await signUp(t, { name: 'Bina' });
    await friends(a, b);
    const sb = await open(b);

    const cameOnline = next(sb, 'social:presence');
    const sa = await open(a);
    expect(await cameOnline).toEqual({ userId: a.id, online: true, lastSeenAt: null });

    const wentOffline = next(sb, 'social:presence', 3000);
    await close(sa);
    const off = await wentOffline;
    expect(off).toMatchObject({ userId: a.id, online: false });
    expect(Date.now() - new Date(off.lastSeenAt).getTime()).toBeLessThan(5_000);

    // The friend list and the profile carry it too.
    const list = (await t.http.get('/v1/friends').set(b.auth).expect(200)).body;
    expect(list[0]).toMatchObject({ online: false, lastSeenAt: expect.any(String) });
    const view = (await t.http.get(`/v1/users/${a.id}/view`).set(b.auth).expect(200)).body;
    expect(view).toMatchObject({ tier: 'friends', online: false, lastSeenAt: expect.any(String) });
  });

  it('a quick reconnect (lock screen, tunnel) never shows as offline', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await friends(a, b);
    const sb = await open(b);
    const sa = await open(a);
    const seen: unknown[] = [];
    sb.on('social:presence', (p) => seen.push(p));
    await close(sa);
    await open(a);
    await sleep(500);
    expect(seen).toEqual([]);
  });

  it('strangers and pending requests are not told', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await met(a, b);
    await requestFriend(t, a, b);
    const sb = await open(b);
    const seen: unknown[] = [];
    sb.on('social:presence', (p) => seen.push(p));
    await open(a);
    await sleep(200);
    expect(seen).toEqual([]);
  });

  it('a friend request shows on the Notifications page even while they are in the app', async () => {
    const a = await signUp(t, { name: 'Asad' });
    const b = await signUp(t, { name: 'Bina' });
    await met(a, b);
    const sb = await open(b);
    const live = next(sb, 'activity:new');

    await t.http.post(`/v1/friends/${b.id}/request`).set(a.auth).expect(200);
    const ev = await live;
    expect(ev).toMatchObject({ unread: 1, item: { type: 'friend.request', actor: { id: a.id, name: 'Asad' }, rel: { friend: 'incoming' }, read: false } });

    const page = (await t.http.get('/v1/activity').set(b.auth).expect(200)).body;
    expect(page).toMatchObject({ unread: 1, nextCursor: null, items: [{ type: 'friend.request', title: 'New friend request', data: { route: 'friends', userId: a.id } }] });

    // Accepting changes the button on the same line.
    await t.http.post(`/v1/friends/${a.id}/accept`).set(b.auth).expect(200);
    await t.app.get(NotificationsService).settled();
    const after = (await t.http.get('/v1/activity').set(b.auth).expect(200)).body;
    expect(after.items.find((i: { type: string }) => i.type === 'friend.request').rel).toMatchObject({ friend: 'friends' });
    // …and the requester gets "You're friends now".
    expect((await t.http.get('/v1/activity').set(a.auth).expect(200)).body.items).toEqual([expect.objectContaining({ type: 'friend.accepted', actor: expect.objectContaining({ id: b.id }) })]);
  });

  it('follows: new follower with follow-back state; private account request with accept state', async () => {
    const a = await signUp(t, { name: 'Asad' });
    const b = await signUp(t, { name: 'Bina' });
    await met(a, b);
    await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    await t.app.get(NotificationsService).settled();
    const page = (await t.http.get('/v1/activity').set(b.auth).expect(200)).body;
    expect(page.items[0]).toMatchObject({ type: 'follow.new', rel: { follow: 'none', followsYou: true } });

    await t.prisma.user.update({ where: { id: a.id }, data: { privateAccount: true } });
    await t.http.post(`/v1/follows/${a.id}`).set(b.auth).expect(200);
    await t.app.get(NotificationsService).settled();
    const req = (await t.http.get('/v1/activity').set(a.auth).expect(200)).body.items[0];
    expect(req).toMatchObject({ type: 'follow.request', actor: { id: b.id }, rel: { followRequest: true } });
  });

  it('read: one line, or everything; the badge follows on every device', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    const c = await signUp(t);
    await met(a, c);
    await met(b, c);
    await requestFriend(t, a, c);
    await requestFriend(t, b, c);
    await t.app.get(NotificationsService).settled();
    expect((await t.http.get('/v1/activity/unread').set(c.auth).expect(200)).body).toEqual({ unread: 2 });

    const sc = await open(c);
    const [first] = (await t.http.get('/v1/activity').set(c.auth).expect(200)).body.items;
    const ev = next(sc, 'activity:read');
    expect((await t.http.post('/v1/activity/read').set(c.auth).send({ ids: [first.id] }).expect(200)).body).toEqual({ unread: 1 });
    expect(await ev).toEqual({ unread: 1, ids: [first.id] });
    await t.http.post('/v1/activity/read').set(c.auth).send({}).expect(200);
    expect((await t.http.get('/v1/activity/unread').set(c.auth).expect(200)).body).toEqual({ unread: 0 });
    // Someone else's lines are untouched.
    expect(await t.prisma.activityItem.count({ where: { userId: { not: c.id }, readAt: { not: null } } })).toBe(0);
  });

  it('opening the page clears the bell; each line stays unread until opened', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    const c = await signUp(t);
    await met(a, c);
    await met(b, c);
    await requestFriend(t, a, c);
    await t.app.get(NotificationsService).settled();
    const sc = await open(c);
    const seen = next(sc, 'activity:read');
    expect((await t.http.post('/v1/activity/seen').set(c.auth).expect(200)).body).toEqual({ unread: 0 });
    expect(await seen).toEqual({ unread: 0, ids: [] });
    expect((await t.http.get('/v1/activity').set(c.auth).expect(200)).body.items.map((i: { read: boolean }) => i.read)).toEqual([false]);

    // A new one after that counts again.
    await sleep(5);
    await requestFriend(t, b, c);
    await t.app.get(NotificationsService).settled();
    expect((await t.http.get('/v1/activity/unread').set(c.auth).expect(200)).body).toEqual({ unread: 1 });
    // Answering a request reads its line.
    await t.http.post(`/v1/friends/${a.id}/accept`).set(c.auth).expect((r) => expect(r.status).toBeLessThan(300));
    const items = (await t.http.get('/v1/activity').set(c.auth).expect(200)).body.items as { actor: { id: string }; read: boolean }[];
    expect(items.find((i) => i.actor.id === a.id)?.read).toBe(true);
    expect(items.find((i) => i.actor.id === b.id)?.read).toBe(false);
  });

  it('a push carries its line; opening the chat (any way) reads the chat line', async () => {
    const a = await signUp(t, { name: 'Sara' });
    const c = await signUp(t);
    await friends(a, c);
    const token = 'fcm-token-activity-read-00001';
    await t.http.post('/v1/me/push-tokens').set(c.auth).send({ token, platform: 'android' }).expect(200);
    const sent = () => (t.app.get(PushService).sender as DevPushSender).sent.filter((x) => x.token === token).map((x) => x.msg);
    await t.http.post(`/v1/friends/${c.id}/messages`).set(a.auth).send({ text: 'hi' }).expect(201);
    await t.http.post(`/v1/friends/${c.id}/messages`).set(a.auth).send({ text: 'you there?' }).expect(201);
    await t.app.get(NotificationsService).settled();
    const [line] = (await t.http.get('/v1/activity').set(c.auth).expect(200)).body.items as { id: string; count: number; read: boolean }[];
    expect(line).toMatchObject({ count: 2, read: false });
    // Both pushes point at the same (collapsed) line, so tapping either one reads it.
    expect(sent().map((m) => m.data.activityId)).toEqual([line.id, line.id]);
    expect((await t.http.get('/v1/activity/unread').set(c.auth).expect(200)).body).toEqual({ unread: 1 });

    // Opened the chat from the chat list (no tap on the push or the line).
    const sc = await open(c);
    const ev = next(sc, 'activity:read');
    await t.http.post(`/v1/friends/${a.id}/read`).set(c.auth).expect((r) => expect(r.status).toBeLessThan(300));
    expect(await ev).toEqual({ unread: 0, ids: [line.id] });
    expect((await t.http.get('/v1/activity').set(c.auth).expect(200)).body.items[0]).toMatchObject({ id: line.id, read: true });

    // Left the app; the next message starts a new unread line.
    await close(sc);
    await t.http.post(`/v1/friends/${c.id}/messages`).set(a.auth).send({ text: 'again' }).expect(201);
    await t.app.get(NotificationsService).settled();
    expect((await t.http.get('/v1/activity/unread').set(c.auth).expect(200)).body).toEqual({ unread: 1 });
  });

  it('pages through older notifications', async () => {
    const c = await signUp(t);
    await t.prisma.activityItem.createMany({ data: Array.from({ length: 5 }, (_, i) => ({ userId: c.id, type: 'goal.reached', title: `Goal ${i}`, body: '', createdAt: new Date(Date.now() - i * 1000) })) });
    const p1 = (await t.http.get('/v1/activity').query({ limit: 2 }).set(c.auth).expect(200)).body;
    expect(p1.items.map((i: { title: string }) => i.title)).toEqual(['Goal 0', 'Goal 1']);
    const p2 = (await t.http.get('/v1/activity').query({ limit: 2, cursor: p1.nextCursor }).set(c.auth).expect(200)).body;
    expect(p2.items.map((i: { title: string }) => i.title)).toEqual(['Goal 2', 'Goal 3']);
    expect(p2.items[0]).toMatchObject({ actor: null, rel: null });
  });
});
