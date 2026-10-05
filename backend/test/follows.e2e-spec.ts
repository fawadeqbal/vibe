import { DevPushSender } from '../src/modules/push/push-sender';
import { PushService } from '../src/modules/push/push.service';
import { connect, createTestApp, next, resetState, signUp, sleep, staffLogin, TestApp, TestUser } from './helpers';

describe('follows and profiles', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
  });
  afterAll(() => t.close());

  const met = (a: TestUser, b: TestUser) => t.prisma.match.create({ data: { userAId: a.id, userBId: b.id, endedAt: new Date() } });
  const counts = (u: TestUser) => t.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { followersCount: true, followingCount: true, giftsReceivedCount: true } });
  const befriend = async (a: TestUser, b: TestUser) => {
    await t.http.post(`/v1/friends/${b.id}/request`).set(a.auth).expect(200);
    await t.http.post(`/v1/friends/${a.id}/accept`).set(b.auth).expect(200);
  };
  const waitFor = async (check: () => Promise<boolean>, ms = 3000) => {
    const end = Date.now() + ms;
    while (!(await check())) {
      if (Date.now() > end) throw new Error('timed out');
      await sleep(25);
    }
  };

  it('gifts received are counted', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await met(a, b);
    await befriend(a, b);
    await t.http.post(`/v1/friends/${b.id}/gifts`).set(a.auth).send({ giftId: 'rose' }).expect(201);
    expect((await counts(b)).giftsReceivedCount).toBe(1);
    expect((await counts(a)).giftsReceivedCount).toBe(0);
  });

  it('you can only follow people you have met, and not yourself', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    const res = await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(403);
    expect(res.body.error.code).toBe('NEVER_MATCHED');
    await t.http.post(`/v1/follows/${a.id}`).set(a.auth).expect(403);
  });

  it('follow → counters, lists, follow back, unfollow; following never opens chat', async () => {
    const a = await signUp(t, { name: 'Priya' });
    const b = await signUp(t, { name: 'Mert' });
    await met(a, b);
    expect((await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200)).body).toEqual({ state: 'following' });
    expect((await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200)).body).toEqual({ state: 'following' });
    expect(await counts(a)).toMatchObject({ followingCount: 1, followersCount: 0 });
    expect(await counts(b)).toMatchObject({ followingCount: 0, followersCount: 1 });

    const followers = await t.http.get('/v1/me/followers').set(b.auth).expect(200);
    expect(followers.body).toMatchObject({ items: [{ profile: { id: a.id, name: 'Priya' }, followsBack: false }], nextCursor: null });
    await t.http.post(`/v1/follows/${a.id}`).set(b.auth).expect(200);
    expect((await t.http.get('/v1/me/followers').set(b.auth)).body.items[0].followsBack).toBe(true);
    expect((await t.http.get('/v1/me/following').set(a.auth)).body.items[0]).toMatchObject({ profile: { id: b.id }, followsBack: true });

    await t.http.delete(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    expect(await counts(a)).toMatchObject({ followingCount: 0, followersCount: 1 });
    expect(await counts(b)).toMatchObject({ followingCount: 1, followersCount: 0 });

    const chat = await t.http.post(`/v1/friends/${a.id}/messages`).set(b.auth).send({ text: 'hi' }).expect(403);
    expect(chat.body.error.code).toBe('NOT_FRIENDS');
  });

  it('private accounts approve requests; you can remove a follower', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    const c = await signUp(t);
    await met(a, b);
    await met(c, b);
    await t.prisma.user.update({ where: { id: b.id }, data: { privateAccount: true } });
    expect((await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200)).body).toEqual({ state: 'requested' });
    await t.http.post(`/v1/follows/${b.id}`).set(c.auth).expect(200);
    expect(await counts(b)).toMatchObject({ followersCount: 0 });
    expect(await counts(a)).toMatchObject({ followingCount: 0 });

    const reqs = await t.http.get('/v1/me/follow-requests').set(b.auth).expect(200);
    expect(reqs.body.items.map((x: { profile: { id: string } }) => x.profile.id).sort()).toEqual([a.id, c.id].sort());
    await t.http.post(`/v1/me/follow-requests/${a.id}/accept`).set(b.auth).expect(200);
    await t.http.post(`/v1/me/follow-requests/${c.id}/decline`).set(b.auth).expect(200);
    await t.http.post(`/v1/me/follow-requests/${c.id}/accept`).set(b.auth).expect(404);
    expect(await counts(b)).toMatchObject({ followersCount: 1 });
    expect(await counts(a)).toMatchObject({ followingCount: 1 });
    expect((await t.http.get('/v1/me/follow-requests').set(b.auth)).body.items).toHaveLength(0);

    await t.http.delete(`/v1/me/followers/${a.id}`).set(b.auth).expect(200);
    expect(await counts(b)).toMatchObject({ followersCount: 0 });
    expect(await counts(a)).toMatchObject({ followingCount: 0 });
  });

  it('a cancelled request leaves no trace', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await met(a, b);
    await t.prisma.user.update({ where: { id: b.id }, data: { privateAccount: true } });
    await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    await t.http.delete(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    expect(await t.prisma.follow.count({ where: { followerId: a.id } })).toBe(0);
    expect(await counts(a)).toMatchObject({ followingCount: 0 });
  });

  it('the other person hears about it live', async () => {
    const a = await signUp(t, { name: 'Ali' });
    const b = await signUp(t);
    await met(a, b);
    const s = await connect(t, b);
    try {
      const got = next(s, 'social:follow-new');
      await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200);
      expect((await got).from).toMatchObject({ id: a.id, name: 'Ali' });
    } finally {
      s.disconnect();
    }
  });

  it('settings: private account and hidden stats; going public accepts waiting requests', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await met(a, b);
    const on = await t.http.patch('/v1/me').set(b.auth).send({ privateAccount: true, hideStats: true }).expect(200);
    expect(on.body).toMatchObject({ privateAccount: true, hideStats: true, followers: 0, following: 0 });
    expect((await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200)).body.state).toBe('requested');

    const s = await connect(t, a);
    try {
      const accepted = next(s, 'social:follow-accepted');
      const off = await t.http.patch('/v1/me').set(b.auth).send({ privateAccount: false }).expect(200);
      expect(off.body).toMatchObject({ privateAccount: false, hideStats: true, followers: 1 });
      expect((await accepted).by).toMatchObject({ id: b.id });
    } finally {
      s.disconnect();
    }
    expect((await t.http.get('/v1/me').set(a.auth)).body).toMatchObject({ following: 1 });
  });

  it('blocking removes follows both ways and fixes the counts', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await met(a, b);
    await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    await t.http.post(`/v1/follows/${a.id}`).set(b.auth).expect(200);
    await t.http.post(`/v1/blocks/${a.id}`).set(b.auth).expect(200);
    await waitFor(async () => (await t.prisma.follow.count({ where: { OR: [{ followerId: a.id }, { followerId: b.id }] } })) === 0);
    expect(await counts(a)).toMatchObject({ followersCount: 0, followingCount: 0 });
    expect(await counts(b)).toMatchObject({ followersCount: 0, followingCount: 0 });
    expect((await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(403)).body.error.code).toBe('BLOCKED');
  });

  it('a daily cap stops spam-following', async () => {
    const owner = await staffLogin(t);
    await t.http.put('/v1/admin/economy/rules').set(owner.auth).send({ value: { maxFollowsPerDay: 2 } }).expect(200);
    try {
      const me = await signUp(t);
      const statuses: number[] = [];
      for (let i = 0; i < 3; i++) {
        const other = await signUp(t);
        await met(me, other);
        const r = await t.http.post(`/v1/follows/${other.id}`).set(me.auth);
        statuses.push(r.status);
        if (r.status === 429) expect(r.body.error).toMatchObject({ code: 'FOLLOW_LIMIT', details: { max: 2 } });
      }
      expect(statuses).toEqual([200, 200, 429]);
    } finally {
      await t.http.put('/v1/admin/economy/rules').set(owner.auth).send({ value: { maxFollowsPerDay: 200 } }).expect(200);
    }
  });

  it('the profile opens up: matched → following → friends; strangers and blocked get 404', async () => {
    const a = await signUp(t);
    const b = await signUp(t, { name: 'Sana', bio: 'coffee first' });
    const stranger = await signUp(t);
    await met(a, b);
    await t.http.get(`/v1/users/${b.id}/view`).set(stranger.auth).expect(404);

    const matched = (await t.http.get(`/v1/users/${b.id}/view`).set(a.auth).expect(200)).body;
    expect(matched).toMatchObject({ tier: 'matched', profile: { name: 'Sana', bio: 'coffee first' }, rel: { follow: 'none', followsYou: false, friend: 'none' } });
    expect(matched.counts).toBeUndefined();
    expect(matched.stats).toBeUndefined();

    await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    expect((await t.http.get(`/v1/users/${b.id}/view`).set(a.auth)).body).toMatchObject({ tier: 'following', counts: { followers: 1, following: 0 }, stats: { matches: 0, likes: 0, gifts: 0 } });
    expect((await t.http.get(`/v1/users/${a.id}/view`).set(b.auth)).body.rel).toMatchObject({ followsYou: true });

    await t.http.patch('/v1/me').set(b.auth).send({ hideStats: true }).expect(200);
    expect((await t.http.get(`/v1/users/${b.id}/view`).set(a.auth)).body.stats).toBe('hidden');
    expect((await t.http.get(`/v1/users/${b.id}/view`).set(b.auth)).body).toMatchObject({ tier: 'self', stats: { gifts: 0 } });

    await befriend(a, b);
    expect((await t.http.get(`/v1/users/${b.id}/view`).set(a.auth)).body).toMatchObject({ tier: 'friends', online: false, rel: { friend: 'friends' } });

    await t.http.post(`/v1/blocks/${a.id}`).set(b.auth).expect(200);
    await t.http.get(`/v1/users/${b.id}/view`).set(a.auth).expect(404);
  });

  it('offline people get one follow push per person per day', async () => {
    const a = await signUp(t, { name: 'Priya' });
    const b = await signUp(t);
    await met(a, b);
    const token = 'fcm-token-follow-test-000001';
    await t.http.post('/v1/me/push-tokens').set(b.auth).send({ token, platform: 'android' }).expect(200);
    const sent = () => (t.app.get(PushService).sender as DevPushSender).sent.filter((x) => x.token === token).map((x) => x.msg);
    await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    await t.http.delete(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200);
    await sleep(250);
    expect(sent()).toEqual([expect.objectContaining({ title: 'New follower', body: 'Priya started following you', category: 'social', data: { route: 'profile', userId: a.id } })]);
  });
});
