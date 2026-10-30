import type { Socket } from 'socket.io-client';

import { EconomyService } from '../src/modules/catalog/economy.service';
import { DevPushSender } from '../src/modules/push/push-sender';
import { PushService } from '../src/modules/push/push.service';
import { connect, createTestApp, next, resetState, signUp, sleep, TestApp, TestUser } from './helpers';

/** Discover: the swipe deck, matches, limits, Super Likes, Undo, "liked you". */
describe('discover', () => {
  let t: TestApp;
  const sockets: Socket[] = [];
  const pushes = () => (t.app.get(PushService).sender as DevPushSender).sent;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    await sleep(100);
    await resetState(t);
    pushes().splice(0);
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await sleep(300);
    await t.close();
  });

  const online = async (u: TestUser) => {
    const s = await connect(t, u);
    sockets.push(s);
    return s;
  };
  /** Set up, with a photo, seen just now. */
  const person = async (
    name: string,
    extra: Partial<{ gender: 'male' | 'female'; age: number; countryCode: string; interests: string[] }> = {},
  ) => {
    const u = await signUp(t, { name, avatarUrl: `https://img.test/${name}.jpg`, ...extra });
    await t.prisma.user.update({ where: { id: u.id }, data: { onboardedAt: new Date(), lastSeenAt: new Date() } });
    return u;
  };
  const deck = async (u: TestUser, q = '') =>
    (await t.http.get(`/v1/discover/deck${q}`).set(u.auth).expect(200)).body.items as {
      profile: { id: string; name: string };
      superLikedMe: boolean;
      sharedInterests: string[];
    }[];
  const swipe = (u: TestUser, userId: string, kind: 'like' | 'super' | 'pass') =>
    t.http.post('/v1/discover/swipes').set(u.auth).send({ userId, kind });
  const setRules = async (rules: Record<string, number>) => {
    await t.prisma.appSetting.update({
      where: { key: 'economy.rules' },
      data: { value: { vibeHourMinutes: 0, ...rules } },
    });
    await t.app.get(EconomyService).reload();
  };
  const coins = async (u: TestUser) => (await t.prisma.wallet.findUniqueOrThrow({ where: { userId: u.id } })).coins;
  const giveCoins = (u: TestUser, n: number) => t.prisma.wallet.update({ where: { userId: u.id }, data: { coins: n } });
  const makeVip = (u: TestUser) =>
    t.prisma.wallet.update({ where: { userId: u.id }, data: { vipUntil: new Date(Date.now() + 86_400_000) } });

  it('shows real, active people with a photo — not bots, hidden, private, blocked, inactive or friends', async () => {
    const me = await person('Maha', { interests: ['Music', 'Travel'] });
    await person('Sara', { interests: ['Music'] });
    const bot = await person('Bot');
    const hidden = await person('Hidden');
    const priv = await person('Private');
    const old = await person('Old');
    const blocked = await person('Blocked');
    const noPhoto = await signUp(t, { name: 'NoPhoto' });
    await t.prisma.user.update({
      where: { id: noPhoto.id },
      data: { onboardedAt: new Date(), lastSeenAt: new Date() },
    });
    await t.prisma.user.update({ where: { id: bot.id }, data: { isBot: true } });
    await t.prisma.user.update({ where: { id: priv.id }, data: { privateAccount: true } });
    await t.prisma.user.update({ where: { id: old.id }, data: { lastSeenAt: new Date(Date.now() - 30 * 86_400_000) } });
    await t.http.put('/v1/discover/visibility').set(hidden.auth).send({ visible: false }).expect(200);
    await t.http
      .post(`/v1/blocks/${blocked.id}`)
      .set(me.auth)
      .expect((r) => expect([200, 201]).toContain(r.status));

    const items = await deck(me);
    expect(items.map((c) => c.profile.name)).toEqual(['Sara']);
    expect(items[0].sharedInterests).toEqual(['Music']);
  });

  it('age is free; gender, country, online and verified need VIP, Vibe Hour or a filter pass', async () => {
    await setRules({});
    const me = await person('Maha', { countryCode: 'PK' });
    await person('Ali', { gender: 'male', age: 30, countryCode: 'PK' });
    await person('Zara', { gender: 'female', age: 22, countryCode: 'AE' });
    const hina = await person('Hina', { gender: 'female', age: 35, countryCode: 'PK' });
    await t.prisma.user.update({ where: { id: hina.id }, data: { verified: true } });
    expect((await deck(me, '?maxAge=30')).map((c) => c.profile.name).sort()).toEqual(['Ali', 'Zara']);

    const locked = await t.http.get('/v1/discover/deck?gender=women').set(me.auth).expect(402);
    expect(locked.body.error.code).toBe('FILTERS_LOCKED');
    const before = (await t.http.get('/v1/discover/status').set(me.auth).expect(200)).body.filters;
    expect(before).toMatchObject({ unlocked: false, passCost: 25, passHours: 24 });

    await giveCoins(me, 100);
    const after = (await t.http.post('/v1/discover/filter-pass').set(me.auth).expect(200)).body.filters;
    expect(after).toMatchObject({ unlocked: true, reason: 'pass' });
    expect(await coins(me)).toBe(75);
    // Already open: nothing more is charged.
    await t.http.post('/v1/discover/filter-pass').set(me.auth).expect(200);
    expect(await coins(me)).toBe(75);

    expect((await deck(me, '?gender=women')).map((c) => c.profile.name).sort()).toEqual(['Hina', 'Zara']);
    expect((await deck(me, '?gender=women&maxAge=30')).map((c) => c.profile.name)).toEqual(['Zara']);
    expect((await deck(me, '?countryCode=PK')).map((c) => c.profile.name).sort()).toEqual(['Ali', 'Hina']);
    expect((await deck(me, '?verifiedOnly=true')).map((c) => c.profile.name)).toEqual(['Hina']);
    expect(await deck(me, '?onlineOnly=true')).toEqual([]);

    const vip = await person('Vip');
    await makeVip(vip);
    expect((await t.http.get('/v1/discover/status').set(vip.auth).expect(200)).body.filters).toMatchObject({ unlocked: true, reason: 'vip' });
    expect((await deck(vip, '?countryCode=AE')).map((c) => c.profile.name)).toEqual(['Zara']);

    await setRules({ discoverPremiumFilters: 0 });
    const free = await person('Free');
    expect((await deck(free, '?gender=men')).map((c) => c.profile.name)).toEqual(['Ali']);
  });

  it('two likes make a match: friends, a chat line, both told; swiped people leave the deck', async () => {
    const a = await person('Asad');
    const b = await person('Bina');
    const sb = await online(b);
    const liked = next(sb, 'discover:liked');
    expect((await swipe(a, b.id, 'like').expect(200)).body).toMatchObject({ matched: false, coinsSpent: 0 });
    expect(await liked).toMatchObject({ superLike: false, from: null, unseen: 1 });
    expect(await deck(a)).toEqual([]);

    // B sees a pending like (blurred: not VIP).
    expect((await t.http.get('/v1/discover/liked-you').set(b.auth).expect(200)).body).toMatchObject({
      count: 1,
      unseen: 1,
      unlocked: false,
      people: [],
      previews: ['https://img.test/Asad.jpg'],
    });

    const sa = await online(a);
    const matchA = next(sa, 'discover:match');
    const matchB = next(sb, 'discover:match');
    const res = (await swipe(b, a.id, 'like').expect(200)).body;
    expect(res).toMatchObject({ matched: true, friend: { profile: { id: a.id }, state: 'friends' } });
    expect(await matchA).toMatchObject({ friend: { profile: { id: b.id }, state: 'friends' } });
    expect(await matchB).toMatchObject({ friend: { profile: { id: a.id } } });

    // The chat opens with a line from Vibe, and messages work.
    const msgs = (await t.http.get(`/v1/friends/${a.id}/messages`).set(b.auth).expect(200)).body.items;
    expect(msgs).toEqual([
      expect.objectContaining({
        kind: 'system',
        text: 'You matched in Discover',
        meta: { event: 'matched', via: 'discover' },
      }),
    ]);
    await t.http.post(`/v1/friends/${a.id}/messages`).set(b.auth).send({ text: 'hi!' }).expect(201);
    // A match is no longer a pending like.
    expect((await t.http.get('/v1/discover/liked-you').set(b.auth).expect(200)).body.count).toBe(0);
  });

  it('a pass hides someone for a while; the last pass can be undone for coins (free for VIP)', async () => {
    const me = await person('Maha');
    const sara = await person('Sara');
    await swipe(me, sara.id, 'pass').expect(200);
    expect(await deck(me)).toEqual([]);

    await giveCoins(me, 3);
    expect((await t.http.post('/v1/discover/undo').set(me.auth).expect(402)).body.error.code).toBe(
      'INSUFFICIENT_COINS',
    );
    await giveCoins(me, 20);
    const undo = (await t.http.post('/v1/discover/undo').set(me.auth).expect(200)).body;
    expect(undo).toMatchObject({ card: { profile: { id: sara.id } }, coinsSpent: 5 });
    expect(await coins(me)).toBe(15);
    expect((await deck(me)).map((c) => c.profile.id)).toEqual([sara.id]);
    expect((await t.http.post('/v1/discover/undo').set(me.auth).expect(409)).body.error.code).toBe('NOTHING_TO_UNDO');

    await makeVip(me);
    await swipe(me, sara.id, 'pass').expect(200);
    expect((await t.http.post('/v1/discover/undo').set(me.auth).expect(200)).body.coinsSpent).toBe(0);
  });

  it('free likes run out; more likes cost coins; VIP likes without limit', async () => {
    await setRules({ discoverFreeLikesPerDay: 2, discoverLikePackSize: 1, discoverLikePackCost: 7 });
    const me = await person('Maha');
    const others = await Promise.all(['Ann', 'Ben', 'Cal', 'Dan'].map((n) => person(n)));
    await swipe(me, others[0].id, 'like').expect(200);
    expect((await swipe(me, others[1].id, 'like').expect(200)).body.status.likesLeft).toBe(0);
    const out = (await swipe(me, others[2].id, 'like').expect(429)).body.error;
    expect(out).toMatchObject({ code: 'OUT_OF_LIKES', details: { packSize: 1, packCost: 7 } });

    await giveCoins(me, 10);
    expect((await t.http.post('/v1/discover/likes/buy').set(me.auth).expect(200)).body.likesLeft).toBe(1);
    expect(await coins(me)).toBe(3);
    await swipe(me, others[2].id, 'like').expect(200);

    await makeVip(me);
    expect((await swipe(me, others[3].id, 'like').expect(200)).body.status.likesLeft).toBeNull();
  });

  it('a Super Like costs coins (VIP gets one free a day), tells them who, and puts you first in their deck', async () => {
    const me = await person('Maha');
    const sara = await person('Sara');
    await person('Other');
    const ss = await online(sara);
    await giveCoins(me, 15);
    const told = next(ss, 'discover:liked');
    expect((await swipe(me, sara.id, 'super').expect(200)).body.coinsSpent).toBe(10);
    expect(await told).toMatchObject({ superLike: true, from: { id: me.id, name: 'Maha' } });
    expect(await coins(me)).toBe(5);
    const top = (await deck(sara))[0];
    expect(top).toMatchObject({ profile: { id: me.id }, superLikedMe: true });

    const vip = await person('Vip');
    await makeVip(vip);
    await giveCoins(vip, 0);
    expect((await swipe(vip, sara.id, 'super').expect(200)).body.coinsSpent).toBe(0);
    const third = await person('Third');
    expect((await swipe(vip, third.id, 'super').expect(402)).body.error.code).toBe('INSUFFICIENT_COINS');
  });

  it('VIP sees who liked them; a Super Like push names the person, plain likes push once a day', async () => {
    const me = await person('Maha');
    await t.http
      .post('/v1/me/push-tokens')
      .set(me.auth)
      .send({ token: 'fcm-token-of-maha-phone-000001', platform: 'android' })
      .expect(200);
    const a = await person('Asad');
    const b = await person('Bilal');
    await giveCoins(b, 50);
    await swipe(a, me.id, 'like').expect(200);
    await swipe(b, me.id, 'super').expect(200);
    await makeVip(me);
    const r = (await t.http.get('/v1/discover/liked-you').set(me.auth).expect(200)).body;
    expect(r).toMatchObject({ count: 2, unlocked: true });
    expect(
      r.people.map((p: { profile: { name: string }; superLikedMe: boolean }) => [p.profile.name, p.superLikedMe]),
    ).toEqual([
      ['Bilal', true],
      ['Asad', false],
    ]);
    await t.http.post('/v1/discover/liked-you/seen').set(me.auth).expect(200);
    expect((await t.http.get('/v1/discover/status').set(me.auth).expect(200)).body.likedYou).toEqual({
      count: 2,
      unseen: 0,
    });

    await sleep(100);
    const titles = pushes().map((p) => p.msg.title);
    expect(titles).toEqual(expect.arrayContaining(['Someone liked you 💜', 'Bilal Super Liked you ⭐']));
  });

  it('welcome back: after 2+ days away, the likes and new people since then', async () => {
    const me = await person('Mina');
    const welcome = async () => (await t.http.get('/v1/discover/welcome').set(me.auth).expect(200)).body;
    expect(await welcome()).toMatchObject({ show: false }); // first visit
    expect(await welcome()).toMatchObject({ show: false, awayDays: 0 });

    const longAgo = new Date(Date.now() - 3 * 86_400_000);
    await t.prisma.user.update({ where: { id: me.id }, data: { discoverSeenAt: longAgo } });
    expect(await welcome()).toMatchObject({ show: false, awayDays: 3, likesSince: 0, newPeople: 0 }); // nothing happened

    await t.prisma.user.update({ where: { id: me.id }, data: { discoverSeenAt: longAgo } });
    const fan = await person('Fahad', { gender: 'male' });
    await person('Zara');
    await swipe(fan, me.id, 'like').expect(200);
    expect(await welcome()).toEqual({ show: true, awayDays: 3, likesSince: 1, newPeople: 2 });
    expect(await welcome()).toMatchObject({ show: false }); // seen now
  });

  it('"tell me when new people join": once a day, never about yourself', async () => {
    const { DiscoverReturnService } = await import('../src/modules/discover/discover-return.service');
    const back = t.app.get(DiscoverReturnService);
    const me = await person('Hira');
    expect((await t.http.get('/v1/discover/notify-new').set(me.auth).expect(200)).body.on).toBe(false);
    expect((await t.http.put('/v1/discover/notify-new').set(me.auth).send({ on: true }).expect(200)).body.on).toBe(true);
    const s = await online(me);
    await t.redis.client.set('discover:new-scan-at', String(Date.now() - 60_000));
    expect(await back.scan()).toEqual([]); // only herself is new

    await t.redis.client.set('discover:new-scan-at', String(Date.now() - 1_000));
    await person('Omar', { gender: 'male' });
    await person('Asad', { gender: 'male' });
    const ping = next(s, 'discover:new-people');
    expect(await back.scan(new Date(Date.now() + 1_000))).toEqual([me.id]);
    expect(await ping).toEqual({ count: 2 });

    await person('Noor');
    expect(await back.scan(new Date(Date.now() + 1_000))).toEqual([]); // already told today
    await t.http.put('/v1/discover/notify-new').set(me.auth).send({ on: false }).expect(200);
    expect((await t.http.get('/v1/discover/notify-new').set(me.auth).expect(200)).body.on).toBe(false);
  });

  it('can be switched off from the admin rules', async () => {
    await setRules({ discoverEnabled: 0 });
    const me = await person('Maha');
    expect((await t.http.get('/v1/discover/deck').set(me.auth).expect(503)).body.error.code).toBe('DISCOVER_OFF');
    expect((await t.http.get('/v1/discover/status').set(me.auth).expect(200)).body.enabled).toBe(false);
  });
});
