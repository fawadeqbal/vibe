import type { Socket } from 'socket.io-client';

import { Clock } from '../src/common/utils/clock';
import { MomentsService } from '../src/modules/moments/moments.service';
import { connect, createTestApp, next, requestFriend, resetState, signUp, sleep, TestApp, TestUser } from './helpers';

// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('moments', () => {
  let t: TestApp;
  const sockets: Socket[] = [];
  const clock = () => t.app.get(Clock);

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    await sleep(100);
    clock().set(null);
    await resetState(t);
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    clock().set(null);
    await sleep(300);
    await t.close();
  });

  const post = (u: TestUser, caption = '') => t.http.post('/v1/moments').set(u.auth).attach('photo', PNG, { filename: 'm.png', contentType: 'image/png' }).field('caption', caption);
  const feed = async (u: TestUser) => (await t.http.get('/v1/moments/feed').set(u.auth).expect(200)).body;
  const met = (a: TestUser, b: TestUser) => t.prisma.match.create({ data: { userAId: a.id, userBId: b.id } });

  /** author; a follower; a friend; someone who met them but doesn't follow. */
  async function cast() {
    const author = await signUp(t, { name: 'Ayesha' });
    const follower = await signUp(t, { name: 'Bilal' });
    const friend = await signUp(t, { name: 'Sana' });
    const stranger = await signUp(t, { name: 'Omar' });
    for (const u of [follower, friend, stranger]) await met(author, u);
    await t.http.post(`/v1/follows/${author.id}`).set(follower.auth).expect(200);
    await requestFriend(t, author, friend);
    await t.http.post(`/v1/friends/${author.id}/accept`).set(friend.auth).expect(200);
    return { author, follower, friend, stranger };
  }

  it('post → followers and friends see it (live event), strangers do not; views count once', async () => {
    const { author, follower, friend, stranger } = await cast();
    const sf = await connect(t, follower);
    sockets.push(sf);
    const live = next(sf, 'moments:new');
    const created = await post(author, '  sunset 🌅  ').expect(201);
    expect(created.body).toMatchObject({ caption: 'sunset 🌅', seen: true, viewsCount: 0, mediaUrl: expect.stringContaining('/media/moments/') });
    expect(new Date(created.body.expiresAt).getTime() - new Date(created.body.createdAt).getTime()).toBe(24 * 3600_000);
    expect(await live).toEqual({ authorId: author.id });

    const mine = await feed(author);
    expect(mine.mine).toHaveLength(1);
    expect(mine.people).toEqual([]);
    for (const u of [follower, friend]) {
      const f = await feed(u);
      expect(f.people).toHaveLength(1);
      expect(f.people[0]).toMatchObject({ author: { id: author.id, level: 1 }, allSeen: false, moments: [{ id: created.body.id, seen: false }] });
      expect(f.people[0].moments[0].viewsCount).toBeUndefined();
    }
    expect((await feed(stranger)).people).toEqual([]);

    const id = created.body.id;
    await t.http.post(`/v1/moments/${id}/view`).set(follower.auth).expect(200);
    await t.http.post(`/v1/moments/${id}/view`).set(follower.auth).expect(200);
    await t.http.post(`/v1/moments/${id}/view`).set(friend.auth).expect(200);
    expect((await t.http.post(`/v1/moments/${id}/view`).set(stranger.auth).expect(404)).body.error.code).toBe('MOMENT_NOT_FOUND');
    expect((await feed(follower)).people[0]).toMatchObject({ allSeen: true, moments: [{ seen: true }] });
    expect((await feed(author)).mine[0].viewsCount).toBe(2);

    const viewers = (await t.http.get(`/v1/moments/${id}/viewers`).set(author.auth).expect(200)).body;
    expect(viewers.map((v: { profile: { id: string } }) => v.profile.id).sort()).toEqual([follower.id, friend.id].sort());
    expect(viewers[0].at).toEqual(expect.any(String));
    await t.http.get(`/v1/moments/${id}/viewers`).set(follower.auth).expect(404);
  });

  it('unseen authors first, then the newest; pending follows and blocks hide moments', async () => {
    const viewer = await signUp(t, { name: 'Viewer' });
    const [x, y, z] = [await signUp(t, { name: 'Xena' }), await signUp(t, { name: 'Yusuf' }), await signUp(t, { name: 'Zara' })];
    for (const u of [x, y, z]) await met(viewer, u);
    await t.http.patch('/v1/me').set(z.auth).send({ privateAccount: true }).expect(200);
    for (const u of [x, y, z]) await t.http.post(`/v1/follows/${u.id}`).set(viewer.auth).expect(200);
    const mx = (await post(x).expect(201)).body;
    await sleep(10);
    await post(y).expect(201);
    await post(z).expect(201); // private, request still pending: not visible
    expect((await feed(viewer)).people.map((p: { author: { id: string } }) => p.author.id)).toEqual([y.id, x.id]);
    await t.http.post(`/v1/moments/${mx.id}/view`).set(viewer.auth).expect(200);
    await sleep(10);
    await post(x).expect(201); // x has something new again
    await t.http.post(`/v1/moments/${(await feed(viewer)).people.find((p: { author: { id: string } }) => p.author.id === y.id).moments[0].id}/view`).set(viewer.auth).expect(200);
    const order = (await feed(viewer)).people;
    expect(order.map((p: { author: { id: string }; allSeen: boolean }) => [p.author.id, p.allSeen])).toEqual([
      [x.id, false],
      [y.id, true],
    ]);
    expect(order[0].moments.map((m: { seen: boolean }) => m.seen)).toEqual([true, false]); // story order: oldest first

    await t.http.post(`/v1/blocks/${viewer.id}`).set(y.auth).expect(200);
    expect((await feed(viewer)).people.map((p: { author: { id: string } }) => p.author.id)).toEqual([x.id]);
  });

  it('delete, report, the 10-moment limit, bans and bad uploads', async () => {
    const { author, follower } = await cast();
    const first = (await post(author).expect(201)).body;
    for (let i = 1; i < 10; i++) await post(author).expect(201);
    expect((await post(author).expect(429)).body.error.code).toBe('MOMENT_LIMIT');

    await t.http.delete(`/v1/moments/${first.id}`).set(follower.auth).expect(404);
    await t.http.delete(`/v1/moments/${first.id}`).set(author.auth).expect(200);
    expect((await feed(author)).mine).toHaveLength(9);
    expect((await feed(follower)).people[0].moments).toHaveLength(9);
    await post(author).expect(201); // room again

    const target = (await feed(follower)).people[0].moments[0].id;
    const r = await t.http.post(`/v1/moments/${target}/report`).set(follower.auth).send({ reason: 'SPAM', note: 'ads' }).expect(200);
    expect(r.body).toMatchObject({ blocked: true });
    const report = await t.prisma.report.findFirstOrThrow({ where: { reporterId: follower.id } });
    expect(report).toMatchObject({ reportedId: author.id, reason: 'SPAM', note: `Moment ${target}: ads` });
    expect((await feed(follower)).people).toEqual([]);

    await t.http.post('/v1/moments').set(follower.auth).expect(400);
    await t.http.post('/v1/moments').set(follower.auth).attach('photo', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' }).expect(415);
    await t.prisma.user.update({ where: { id: follower.id }, data: { bannedUntil: new Date(Date.now() + 3600_000) } });
    expect((await post(follower).expect(403)).body.error.code).toBe('ACCOUNT_BANNED');
  });

  it('expire after 24 hours; the cleanup job removes them', async () => {
    const { author, follower } = await cast();
    const m = (await post(author).expect(201)).body;
    await t.http.post(`/v1/moments/${m.id}/view`).set(follower.auth).expect(200);
    clock().set(new Date(Date.now() + 24 * 3600_000 + 1000));
    expect((await feed(follower)).people).toEqual([]);
    expect((await feed(author)).mine).toEqual([]);
    await t.http.post(`/v1/moments/${m.id}/view`).set(follower.auth).expect(404);
    expect(await t.app.get(MomentsService).cleanup()).toBe(1);
    expect(await t.prisma.moment.count()).toBe(0);
    expect(await t.prisma.momentView.count()).toBe(0);
  });
});
