import { createHmac, randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io-client';

import { connect, createTestApp, emit, next, resetState, signUp, sleep, TestApp, TestUser } from './helpers';

describe('matching over sockets', () => {
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
    await sleep(300); // let disconnect cleanup finish before Redis closes
    await t.close();
  });

  const online = async (u: TestUser) => {
    const s = await connect(t, u);
    sockets.push(s);
    return s;
  };

  async function pair(opts: { aProfile?: object; bProfile?: object } = {}) {
    const a = await signUp(t, { name: 'Ayesha', gender: 'female', interests: ['Music', 'Travel', 'Art'], ...opts.aProfile });
    const b = await signUp(t, { name: 'Bilal', gender: 'male', interests: ['Music', 'Cricket', 'Travel'], ...opts.bProfile });
    const sa = await online(a);
    const sb = await online(b);
    const foundA = next(sa, 'match:found');
    const foundB = next(sb, 'match:found');
    await emit(sa, 'match:join', {});
    const joinB = await emit<{ status: string }>(sb, 'match:join', {});
    expect(joinB.status).toBe('matched');
    return { a, b, sa, sb, fa: await foundA, fb: await foundB };
  }

  it('pairs two people, one caller and one callee, with shared interests', async () => {
    const { fa, fb, a, b } = await pair();
    expect(fa.partner.id).toBe(b.id);
    expect(fb.partner.id).toBe(a.id);
    expect(new Set([fa.role, fb.role])).toEqual(new Set(['caller', 'callee']));
    expect(fa.sharedInterests.sort()).toEqual(['Music', 'Travel']);
    expect(fa.matchId).toBe(fb.matchId);
  });

  it('relays chat, likes and WebRTC signals to the partner only', async () => {
    const { sa, sb } = await pair();
    const chat = next(sb, 'match:chat');
    await emit(sa, 'match:chat', { text: 'hey! where are you from?' });
    expect((await chat).text).toBe('hey! where are you from?');

    const liked = next(sb, 'match:liked');
    await emit(sa, 'match:like');
    await liked;

    const sig = next(sb, 'rtc:signal');
    await emit(sa, 'rtc:signal', { type: 'offer', data: { sdp: 'v=0…' } });
    expect(await sig).toMatchObject({ type: 'offer', data: { sdp: 'v=0…' } });
  });

  it('gifts move coins to gems between the two wallets', async () => {
    const { a, b, sa, sb } = await pair();
    await expect(emit(sa, 'match:gift', { giftId: 'fireworks' })).rejects.toMatchObject({ code: 'INSUFFICIENT_COINS' });
    const got = next(sb, 'match:gift');
    await emit(sa, 'match:gift', { giftId: 'heart', idempotencyKey: randomUUID() });
    expect((await got).gift).toMatchObject({ id: 'heart', gems: 10 });
    expect((await t.http.get('/v1/wallet').set(a.auth)).body.coins).toBe(10);
    expect((await t.http.get('/v1/wallet').set(b.auth)).body.gems).toBe(10);
  });

  it('next ends the call for both and tells the partner they left', async () => {
    const { sa, sb } = await pair();
    const endedA = next(sa, 'match:ended');
    const endedB = next(sb, 'match:ended');
    const r = await emit<{ status: string }>(sa, 'match:next', {});
    expect(r.status).toBe('searching');
    expect(await endedA).toMatchObject({ reason: 'skipped', byMe: true });
    expect(await endedB).toMatchObject({ reason: 'partner_left', byMe: false });
    // The last partner is not served again straight away.
    await emit(sb, 'match:join', {});
    await sleep(300);
    const status = await t.redis.client.zcard('mq:queue');
    expect(status).toBe(2);
  });

  it('paid filters are charged when the match happens, and only for compatible people', async () => {
    const a = await signUp(t, { gender: 'female' });
    const man = await signUp(t, { gender: 'male' });
    const woman = await signUp(t, { gender: 'female' });
    const sa = await online(a);
    const sw = await online(woman);
    const sm = await online(man);
    await emit(sa, 'match:join', { gender: 'MEN' });
    await emit(sw, 'match:join', {});
    await sleep(300);
    expect((await t.http.get('/v1/wallet').set(a.auth)).body.coins).toBe(30); // nobody suitable yet: no charge
    const found = next(sa, 'match:found');
    await emit(sm, 'match:join', {});
    expect((await found).partner.id).toBe(man.id);
    await sleep(100);
    expect((await t.http.get('/v1/wallet').set(a.auth)).body.coins).toBe(20);
  });

  it('a filter you cannot afford is refused up front', async () => {
    const u = await signUp(t);
    await t.prisma.wallet.update({ where: { userId: u.id }, data: { coins: 5 } });
    const s = await online(u);
    await expect(emit(s, 'match:join', { gender: 'WOMEN' })).rejects.toMatchObject({ code: 'INSUFFICIENT_COINS' });
  });

  it('reconnect calls the last partner again for 20 coins', async () => {
    const { a, b, sa, sb } = await pair();
    await emit(sa, 'match:end');
    await sleep(100);
    const again = next(sb, 'match:found');
    await emit(sa, 'match:reconnect');
    expect((await again).partner.id).toBe(a.id);
    expect((await t.http.get('/v1/wallet').set(a.auth)).body.coins).toBe(10);
    expect((await again).reconnect).toBe(true);
    void b;
  });

  it('disconnecting ends the call for the partner', async () => {
    const { sa, sb } = await pair();
    const ended = next(sb, 'match:ended');
    sa.disconnect();
    expect(await ended).toMatchObject({ reason: 'partner_left' });
  });

  it('report ends the call, blocks, and three reports pause the account', async () => {
    const offender = await signUp(t, { gender: 'male', name: 'Spammy' });
    const so = await online(offender);
    for (let i = 0; i < 3; i++) {
      const victim = await signUp(t, { gender: 'female' });
      const sv = await online(victim);
      const found = next(sv, 'match:found');
      await emit(sv, 'match:join', {});
      if (i === 0) await emit(so, 'match:join', {});
      else await emit(so, 'match:join', {}).catch(() => undefined);
      await found;
      const ended = next(so, 'match:ended');
      await emit(sv, 'match:report', { reason: 'SPAM' });
      await ended;
    }
    const me = await t.http.get('/v1/me').set(offender.auth).expect(200);
    expect(me.body.bannedUntil).not.toBeNull();
    const fresh = await signUp(t);
    void fresh;
    const s2 = await connect(t, offender).catch(() => null);
    if (s2) {
      sockets.push(s2);
      await expect(emit(s2, 'match:join', {})).rejects.toMatchObject({ code: 'ACCOUNT_BANNED' });
    }
  });

  it('blocked people never meet', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await t.prisma.block.create({ data: { blockerId: a.id, blockedId: b.id } });
    const sa = await online(a);
    const sb = await online(b);
    await emit(sa, 'match:join', {});
    const r = await emit<{ status: string }>(sb, 'match:join', {});
    expect(r.status).toBe('searching');
  });

  it('a friend request in a call reaches the partner; asking back makes friends', async () => {
    const { a, b, sa, sb } = await pair();
    const req = next(sb, 'match:friend-request');
    expect(await emit(sa, 'match:friend')).toMatchObject({ state: 'requested', paidCoins: 0 });
    await req;
    expect(await emit(sb, 'match:friend')).toMatchObject({ state: 'friends' });
    const list = await t.http.get('/v1/friends').set(a.auth).expect(200);
    expect(list.body[0]).toMatchObject({ state: 'friends', profile: { id: b.id } });
  });

  it('serves ICE servers and the online count', async () => {
    const u = await signUp(t);
    const ice = await t.http.get('/v1/rtc/ice-servers').set(u.auth).expect(200);
    expect(ice.body.iceServers[0].urls[0]).toMatch(/^stun:/);
    // TURN: a login coturn accepts (username = expiry:userId, password = HMAC-SHA1 of it with TURN_SECRET), valid for a day.
    const turn = ice.body.iceServers[1];
    expect(turn.urls).toEqual(['turn:turn.test:3478?transport=udp', 'turns:turn.test:5349?transport=tcp']);
    const [expiry, userId] = turn.username.split(':');
    expect(userId).toBe(u.id);
    expect(Number(expiry) - Date.now() / 1000).toBeGreaterThan(86400 - 60);
    expect(turn.credential).toBe(createHmac('sha1', process.env.TURN_SECRET!).update(turn.username).digest('base64'));
    expect(ice.body.ttlSeconds).toBe(86400);
    await online(u);
    const count = await t.http.get('/v1/match/online').expect(200);
    expect(count.body.online).toBeGreaterThanOrEqual(1);
  });
});
