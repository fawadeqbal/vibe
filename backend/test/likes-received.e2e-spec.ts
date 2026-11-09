import { createTestApp, resetState, signUp, TestApp } from './helpers';

/** GET /me/likes: who liked you on a call (the Likes number), newest first, paged. */
describe('likes received', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
  });
  afterAll(() => t.close());

  it('lists everyone who liked you, newest first, across pages, and only yours', async () => {
    const me = await signUp(t, { name: 'Sana' });
    const fans = [];
    for (let i = 0; i < 5; i++) fans.push(await signUp(t, { name: `Fan ${i}` }));
    const base = Date.now() - 60 * 60_000;
    for (const [i, f] of fans.entries()) {
      const m = await t.prisma.match.create({ data: { userAId: f.id, userBId: me.id, endedAt: new Date() } });
      await t.prisma.matchLike.create({ data: { matchId: m.id, fromId: f.id, toId: me.id, createdAt: new Date(base + i * 60_000) } });
      // A like you gave doesn't count here.
      await t.prisma.matchLike.create({ data: { matchId: m.id, fromId: me.id, toId: f.id } });
    }

    const first = (await t.http.get('/v1/me/likes').query({ limit: 2 }).set(me.auth).expect(200)).body;
    expect(first.items.map((x: { profile: { name: string } }) => x.profile.name)).toEqual(['Fan 4', 'Fan 3']);
    expect(first.items[0].likedAt).toEqual(expect.any(String));
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = (await t.http.get('/v1/me/likes').query({ limit: 2, cursor: first.nextCursor }).set(me.auth).expect(200)).body;
    expect(second.items.map((x: { profile: { name: string } }) => x.profile.name)).toEqual(['Fan 2', 'Fan 1']);
    const third = (await t.http.get('/v1/me/likes').query({ limit: 2, cursor: second.nextCursor }).set(me.auth).expect(200)).body;
    expect(third.items.map((x: { profile: { name: string } }) => x.profile.name)).toEqual(['Fan 0']);
    expect(third.nextCursor).toBeNull();

    // Someone else's list has only the like Sana gave them.
    const fan = (await t.http.get('/v1/me/likes').set(fans[0].auth).expect(200)).body;
    expect(fan.items.map((x: { profile: { name: string } }) => x.profile.name)).toEqual(['Sana']);
  });
});
