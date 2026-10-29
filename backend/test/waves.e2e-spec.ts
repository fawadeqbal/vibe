import type { Socket } from 'socket.io-client';

import { MailProvider, type MailMessage } from '../src/infra/mail/mail.provider';
import { partnerScore, WAVE_BONUS } from '../src/modules/matching/compatibility';
import type { Ticket } from '../src/modules/matching/matching.types';
import { DevPushSender } from '../src/modules/push/push-sender';
import { PushService } from '../src/modules/push/push.service';
import { connect, createTestApp, emit, next, resetState, signUp, sleep, TestApp, TestUser } from './helpers';

/** "Recently here" and waves: real people only, notified once, matched first. */
describe('waves', () => {
  let t: TestApp;
  const sockets: Socket[] = [];
  const mails: MailMessage[] = [];
  let spy: jest.SpyInstance;
  const pushes = () => (t.app.get(PushService).sender as DevPushSender).sent;

  beforeAll(async () => {
    t = await createTestApp();
    spy = jest.spyOn(t.app.get(MailProvider), 'send').mockImplementation(async (m) => void mails.push(m));
  });
  beforeEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    await sleep(100);
    await resetState(t);
    mails.length = 0;
    pushes().splice(0);
  });
  afterAll(async () => {
    spy.mockRestore();
    sockets.forEach((s) => s.disconnect());
    await sleep(300);
    await t.close();
  });

  const online = async (u: TestUser) => {
    const s = await connect(t, u);
    sockets.push(s);
    return s;
  };
  /** Signed up, set up and seen just now. */
  const person = async (name: string, extra: object = {}) => {
    const u = await signUp(t, { name, ...extra });
    await t.prisma.user.update({ where: { id: u.id }, data: { onboardedAt: new Date(), lastSeenAt: new Date() } });
    return u;
  };
  const recent = async (u: TestUser) => (await t.http.get('/v1/waves/recent').set(u.auth).expect(200)).body as { profile: { id: string; name: string }; iWaved: boolean; wavedAtMe: boolean }[];

  it('lists real, public, unblocked people seen in the last 2 days', async () => {
    const me = await person('Maha');
    const sara = await person('Sara');
    const bot = await person('Bot');
    const priv = await person('Private');
    const old = await person('Old');
    const blocked = await person('Blocked');
    const notSetUp = await signUp(t, { name: 'New' });
    await t.prisma.user.update({ where: { id: bot.id }, data: { isBot: true } });
    await t.prisma.user.update({ where: { id: priv.id }, data: { privateAccount: true } });
    await t.prisma.user.update({ where: { id: old.id }, data: { lastSeenAt: new Date(Date.now() - 3 * 86_400_000) } });
    await t.http.post(`/v1/blocks/${blocked.id}`).set(me.auth).expect((r) => expect([200, 201]).toContain(r.status));
    expect(notSetUp).toBeTruthy();

    expect((await recent(me)).map((p) => p.profile.name)).toEqual(['Sara']);
    expect(sara).toBeTruthy();
  });

  it('a wave reaches them once: in the app, or by e-mail without the app; waving back is mutual', async () => {
    const a = await person('Asad');
    const b = await person('Bina');
    const sb = await online(b);
    const got = next(sb, 'wave:new');
    expect((await t.http.post(`/v1/waves/${b.id}`).set(a.auth).expect(200)).body).toEqual({ mutual: false, sent: true });
    expect(await got).toMatchObject({ from: { id: a.id, name: 'Asad' }, mutual: false });
    // Again within a day: nothing new is sent.
    expect((await t.http.post(`/v1/waves/${b.id}`).set(a.auth).expect(200)).body).toEqual({ mutual: false, sent: false });

    // B sees it at the top of "Recently here" and in received.
    expect((await recent(b))[0]).toMatchObject({ profile: { id: a.id }, wavedAtMe: true, iWaved: false });
    const rec = (await t.http.get('/v1/waves/received').set(b.auth).expect(200)).body;
    expect(rec).toMatchObject({ unseen: 1, items: [{ profile: { id: a.id }, seen: false, wavedBack: false }] });
    await t.http.post('/v1/waves/seen').set(b.auth).expect(200);
    expect((await t.http.get('/v1/waves/received').set(b.auth).expect(200)).body.unseen).toBe(0);

    // A is offline with no app: waving back e-mails them (once a day).
    mails.length = 0;
    expect((await t.http.post(`/v1/waves/${a.id}`).set(b.auth).expect(200)).body).toEqual({ mutual: true, sent: true });
    const aEmail = (await t.prisma.user.findUniqueOrThrow({ where: { id: a.id } })).email;
    expect(mails.map((m) => [m.to, m.subject])).toEqual([[aEmail, 'Bina waved back at you on Vibe 👋']]);
  });

  it('pushes to app users who are away; blocked people and yourself are refused', async () => {
    const a = await person('Ali');
    const b = await person('Badar');
    await t.http.post('/v1/me/push-tokens').set(b.auth).send({ token: 'fcm-token-of-badar-phone-00001', platform: 'android' }).expect(200);
    mails.length = 0;
    await t.http.post(`/v1/waves/${b.id}`).set(a.auth).expect(200);
    await sleep(150);
    expect(pushes().map((p) => p.msg.title)).toEqual(['Ali waved at you 👋']);
    expect(mails).toHaveLength(0);

    await t.http.post(`/v1/waves/${a.id}`).set(a.auth).expect(400);
    await t.http.post(`/v1/blocks/${a.id}`).set(b.auth).expect((r) => expect([200, 201]).toContain(r.status));
    await t.http.post(`/v1/waves/${b.id}`).set(a.auth).expect(404);
  });

  it('when one starts searching, the other hears about it; when both search, they are matched together first', async () => {
    const a = await person('Ayra');
    const b = await person('Babar');
    const c = await person('Chaand');
    // B and C can't meet each other, so both wait in the queue for A.
    await t.http.post(`/v1/blocks/${c.id}`).set(b.auth).expect((r) => expect([200, 201]).toContain(r.status));
    await t.http.post(`/v1/waves/${b.id}`).set(a.auth).expect(200);
    const [sa, sb, sc] = [await online(a), await online(b), await online(c)];

    const told = next(sb, 'wave:looking');
    expect((await emit<{ status: string }>(sa, 'match:join', {})).status).toBe('searching');
    expect(await told).toMatchObject({ from: { id: a.id } });
    await emit(sa, 'match:leave', {});

    // C has waited longest; without the wave, A would meet C.
    await emit(sc, 'match:join', {});
    await sleep(50);
    await emit(sb, 'match:join', {});
    await sleep(50);
    const found = next(sa, 'match:found');
    await emit(sa, 'match:join', {});
    expect((await found).partner.id).toBe(b.id);
  });

  it('scores people who waved above everything else', () => {
    const base: Ticket = { userId: 'me', gender: 'MALE', countryCode: 'PK', verified: false, prefs: { gender: 'ANYONE', countryCode: null, safeMode: false, autoBlur: false }, cost: 0, vip: false, boosted: false, enqueuedAt: 0, exclude: [], interests: [], vibeScore: 0.5 };
    const stranger = { ...base, userId: 's', interests: ['Music', 'Art', 'Tech'] };
    const waver = { ...base, userId: 'w', vibeScore: 0.9, waved: ['me'] };
    const me = { ...base, interests: ['Music', 'Art', 'Tech'] };
    const opts = { oldest: false, nowMs: 1 };
    expect(partnerScore(me, waver, opts)).toBeGreaterThan(partnerScore(me, stranger, opts));
    expect(WAVE_BONUS).toBeGreaterThan(2 * 3 + 3 + 4);
  });
});
