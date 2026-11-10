import { createTestApp, resetState, signUp, TestApp, TestUser, requestFriend } from './helpers';

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
    await expect(requestFriend(t, a, b)).rejects.toMatchObject({ code: 'NEVER_MATCHED' });
  });

  it('friend requests can be sent from a profile to people you have met, and taken back', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    const stranger = await signUp(t);
    const never = await t.http.post(`/v1/friends/${stranger.id}/request`).set(a.auth).expect(403);
    expect(never.body.error.code).toBe('NEVER_MATCHED');

    await met(a, b);
    const sent = await t.http.post(`/v1/friends/${b.id}/request`).set(a.auth).expect(200);
    expect(sent.body.state).toBe('requested');
    expect((await t.http.get('/v1/friends').set(b.auth).expect(200)).body).toEqual([expect.objectContaining({ state: 'incoming', lastSeenAt: null })]);

    await t.http.post(`/v1/friends/${b.id}/cancel`).set(a.auth).expect(200);
    expect(await t.prisma.friendship.count()).toBe(0);
    // Cancelling someone else's request does nothing.
    await requestFriend(t, b, a);
    await t.http.post(`/v1/friends/${b.id}/cancel`).set(a.auth).expect(200);
    expect(await t.prisma.friendship.count()).toBe(1);
    const back = await t.http.post(`/v1/friends/${b.id}/request`).set(a.auth).expect(200);
    expect(back.body).toMatchObject({ state: 'friends', paidCoins: 0 });
  });

  it('request → accept → chat with unread counts → read', async () => {
    const a = await signUp(t, { name: 'Priya' });
    const b = await signUp(t, { name: 'Mert' });
    await met(a, b);
    await requestFriend(t, a, b);
    const incoming = await t.http.get('/v1/friends').set(b.auth).expect(200);
    expect(incoming.body[0]).toMatchObject({ state: 'incoming', profile: { name: 'Priya' } });
    await t.http.post(`/v1/friends/${a.id}/accept`).set(b.auth).expect(200);

    await t.http.post(`/v1/friends/${b.id}/messages`).set(a.auth).send({ text: 'send me your playlist later' }).expect(201);
    const list = await t.http.get('/v1/friends').set(b.auth).expect(200);
    expect(list.body[0]).toMatchObject({ state: 'friends', lastMessage: 'send me your playlist later', unread: 1 });
    expect(list.body[0].last).toEqual({ fromMe: false, kind: 'text', delivered: false, read: false, unsent: false, event: null, seconds: null });
    const mine = await t.http.get('/v1/friends').set(a.auth).expect(200);
    expect(mine.body[0].last).toMatchObject({ fromMe: true, read: false });
    await t.http.post(`/v1/friends/${a.id}/read`).set(b.auth).expect(200);
    expect((await t.http.get('/v1/friends').set(b.auth)).body[0].unread).toBe(0);
    // Read: the sender's list shows it seen.
    expect((await t.http.get('/v1/friends').set(a.auth)).body[0].last).toMatchObject({ fromMe: true, read: true });

    const msgs = await t.http.get(`/v1/friends/${a.id}/messages`).set(b.auth).expect(200);
    expect(msgs.body.items[0]).toMatchObject({ fromMe: false, text: 'send me your playlist later' });

    // A weak connection: the app sends again with the same key; the message goes out once.
    const key = { 'Idempotency-Key': 'retry-1' };
    const first = (await t.http.post(`/v1/friends/${b.id}/messages`).set(a.auth).set(key).send({ text: 'are you there?' }).expect(201)).body;
    const again = (await t.http.post(`/v1/friends/${b.id}/messages`).set(a.auth).set(key).send({ text: 'are you there?' }).expect(201)).body;
    expect(again.id).toBe(first.id);
    const after = await t.http.get(`/v1/friends/${a.id}/messages`).set(b.auth).expect(200);
    expect(after.body.items.filter((m: { text: string }) => m.text === 'are you there?')).toHaveLength(1);
  });

  it('three free requests a day, then they cost coins', async () => {
    const me = await signUp(t);
    const paid: number[] = [];
    for (let i = 0; i < 4; i++) {
      const other = await signUp(t);
      await met(me, other);
      paid.push((await requestFriend(t, me, other)).paidCoins);
    }
    expect(paid).toEqual([0, 0, 0, 10]);
  });

  it('gifts in chat are messages and move coins to gems', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await met(a, b);
    await requestFriend(t, a, b);
    await t.http.post(`/v1/friends/${a.id}/accept`).set(b.auth).expect(200);
    const m = await t.http.post(`/v1/friends/${b.id}/gifts`).set(a.auth).send({ giftId: 'rose' }).expect(201);
    expect(m.body).toMatchObject({ giftId: 'rose', text: 'Sent a Rose' });
    expect((await t.http.get('/v1/wallet').set(b.auth)).body.gems).toBe(3);
  });

  it('blocking removes the friendship and hides the profile', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await met(a, b);
    await requestFriend(t, a, b);
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
