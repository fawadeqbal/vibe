import { createTestApp, resetState, signUp, TestApp, TestUser } from './helpers';

describe('friends, chat, blocks, likes', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
  });
  afterAll(() => t.close());

  const met = (a: TestUser, b: TestUser) => t.prisma.match.create({ data: { userAId: a.id, userBId: b.id, endedAt: new Date() } });

  it('you can only add people you have met', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    const res = await t.http.post(`/v1/friends/${b.id}/request`).set(a.auth).expect(403);
    expect(res.body.error.code).toBe('NEVER_MATCHED');
  });

  it('request → accept → chat with unread counts → read', async () => {
    const a = await signUp(t, { name: 'Priya' });
    const b = await signUp(t, { name: 'Mert' });
    await met(a, b);
    await t.http.post(`/v1/friends/${b.id}/request`).set(a.auth).expect(200);
    const incoming = await t.http.get('/v1/friends').set(b.auth).expect(200);
    expect(incoming.body[0]).toMatchObject({ state: 'incoming', profile: { name: 'Priya' } });
    await t.http.post(`/v1/friends/${a.id}/accept`).set(b.auth).expect(200);

    await t.http.post(`/v1/friends/${b.id}/messages`).set(a.auth).send({ text: 'send me your playlist later' }).expect(201);
    const list = await t.http.get('/v1/friends').set(b.auth).expect(200);
    expect(list.body[0]).toMatchObject({ state: 'friends', lastMessage: 'send me your playlist later', unread: 1 });
    await t.http.post(`/v1/friends/${a.id}/read`).set(b.auth).expect(200);
    expect((await t.http.get('/v1/friends').set(b.auth)).body[0].unread).toBe(0);

    const msgs = await t.http.get(`/v1/friends/${a.id}/messages`).set(b.auth).expect(200);
    expect(msgs.body.items[0]).toMatchObject({ fromMe: false, text: 'send me your playlist later' });
  });

  it('three free requests a day, then they cost coins', async () => {
    const me = await signUp(t);
    const paid: number[] = [];
    for (let i = 0; i < 4; i++) {
      const other = await signUp(t);
      await met(me, other);
      paid.push((await t.http.post(`/v1/friends/${other.id}/request`).set(me.auth).expect(200)).body.paidCoins);
    }
    expect(paid).toEqual([0, 0, 0, 10]);
  });

  it('gifts in chat are messages and move coins to gems', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await met(a, b);
    await t.http.post(`/v1/friends/${b.id}/request`).set(a.auth).expect(200);
    await t.http.post(`/v1/friends/${a.id}/accept`).set(b.auth).expect(200);
    const m = await t.http.post(`/v1/friends/${b.id}/gifts`).set(a.auth).send({ giftId: 'rose' }).expect(201);
    expect(m.body).toMatchObject({ giftId: 'rose', text: 'Sent a Rose' });
    expect((await t.http.get('/v1/wallet').set(b.auth)).body.gems).toBe(3);
  });

  it('blocking removes the friendship and hides the profile', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await met(a, b);
    await t.http.post(`/v1/friends/${b.id}/request`).set(a.auth).expect(200);
    await t.http.post(`/v1/friends/${a.id}/accept`).set(b.auth).expect(200);
    await t.http.post(`/v1/blocks/${b.id}`).set(a.auth).expect(200);
    expect((await t.http.get('/v1/friends').set(a.auth)).body).toHaveLength(0);
    await t.http.get(`/v1/users/${a.id}`).set(b.auth).expect(404);
    await t.http.post(`/v1/friends/${a.id}/messages`).set(b.auth).send({ text: 'hi' }).expect(403);
    const blocks = await t.http.get('/v1/blocks').set(a.auth).expect(200);
    expect(blocks.body[0].id).toBe(b.id);
  });

  it('who liked you: count for everyone, names for VIP', async () => {
    const me = await signUp(t);
    const fan = await signUp(t, { avatarUrl: 'https://i.pravatar.cc/400?img=5' });
    const m = await met(fan, me);
    await t.prisma.matchLike.create({ data: { matchId: m.id, fromId: fan.id, toId: me.id } });
    const free = await t.http.get('/v1/likes/received').set(me.auth).expect(200);
    expect(free.body).toMatchObject({ count: 1, unlocked: false, people: [] });
    expect(free.body.previews).toHaveLength(1);
    await t.prisma.wallet.update({ where: { userId: me.id }, data: { vipUntil: new Date(Date.now() + 86400000) } });
    const vip = await t.http.get('/v1/likes/received').set(me.auth).expect(200);
    expect(vip.body.people[0].id).toBe(fan.id);
  });
});
