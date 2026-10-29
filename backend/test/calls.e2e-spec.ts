import type { Socket } from 'socket.io-client';

import { CallsService } from '../src/modules/calls/calls.service';
import { EconomyService } from '../src/modules/catalog/economy.service';
import {
  connect,
  createTestApp,
  emit,
  next,
  resetState,
  signUp,
  sleep,
  staffLogin,
  TestApp,
  TestUser,
} from './helpers';

/** Video calls in chat: both must allow, either can turn off, then ring → answer / decline / miss. */
describe('calls in chat', () => {
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

  const online = async (u: TestUser) => {
    const s = await connect(t, u);
    sockets.push(s);
    return s;
  };
  /** Two friends (matched in Discover), each with a photo. */
  const friends = async () => {
    const a = await signUp(t, { name: 'Asad', avatarUrl: 'https://img.test/a.jpg' });
    const b = await signUp(t, { name: 'Bina', avatarUrl: 'https://img.test/b.jpg' });
    await t.prisma.user.updateMany({
      where: { id: { in: [a.id, b.id] } },
      data: { onboardedAt: new Date(), lastSeenAt: new Date() },
    });
    await t.http.post('/v1/discover/swipes').set(a.auth).send({ userId: b.id, kind: 'like' }).expect(200);
    await t.http.post('/v1/discover/swipes').set(b.auth).send({ userId: a.id, kind: 'like' }).expect(200);
    return { a, b };
  };
  const say = (from: TestUser, to: TestUser, text: string) =>
    t.http.post(`/v1/friends/${to.id}/messages`).set(from.auth).send({ text }).expect(201);
  const consent = (from: TestUser, to: TestUser, allow: boolean) =>
    t.http.put(`/v1/friends/${to.id}/calls`).set(from.auth).send({ allow });
  const lines = async (u: TestUser, other: TestUser) =>
    (
      (await t.http.get(`/v1/friends/${other.id}/messages`).set(u.auth).expect(200)).body.items as {
        kind: string;
        meta: { event?: string } | null;
      }[]
    )
      .filter((m) => m.kind === 'system')
      .map((m) => m.meta?.event)
      .reverse();
  const setRules = async (rules: Record<string, number>) => {
    await t.prisma.appSetting.update({
      where: { key: 'economy.rules' },
      data: { value: { vibeHourMinutes: 0, ...rules } },
    });
    await t.app.get(EconomyService).reload();
  };

  it('calls are off in a new chat; asking needs both to have written first; the other says yes and calls are on', async () => {
    const { a, b } = await friends();
    expect((await t.http.get(`/v1/friends/${b.id}/calls`).set(a.auth).expect(200)).body).toMatchObject({
      mine: false,
      theirs: false,
      on: false,
      canAsk: false,
      askBlockedBy: 'messages',
    });
    expect((await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).expect(403)).body.error.code).toBe(
      'CALLS_NOT_ALLOWED',
    );
    expect((await consent(a, b, true).expect(403)).body.error.code).toBe('CALL_NEEDS_MESSAGES');

    await say(a, b, 'hey');
    await say(b, a, 'hi!');
    const sb = await online(b);
    const asked = next(sb, 'call:consent');
    expect((await consent(a, b, true).expect(200)).body).toMatchObject({ mine: true, theirs: false, on: false });
    expect(await asked).toMatchObject({ friendId: a.id, mine: false, theirs: true, asked: true, from: { id: a.id } });

    expect((await consent(b, a, true).expect(200)).body).toMatchObject({ mine: true, theirs: true, on: true });
    expect(await lines(a, b)).toEqual(['matched', 'calls_asked', 'calls_on']);
    // The friends list carries it too.
    const list = (await t.http.get('/v1/friends').set(a.auth).expect(200)).body;
    expect(list[0].calls).toEqual({ mine: true, theirs: true });
  });

  it('"not now" and turning calls off stop calls for both; the other waits before asking again', async () => {
    const { a, b } = await friends();
    await say(a, b, 'hey');
    await say(b, a, 'hi');
    await consent(a, b, true).expect(200);
    // B: not now.
    expect((await consent(b, a, false).expect(200)).body).toMatchObject({ mine: false, theirs: false });
    expect((await consent(a, b, true).expect(429)).body.error.code).toBe('CALL_ASK_TOO_SOON');
    // B can still ask A, and A says yes.
    await consent(b, a, true).expect(200);
    await consent(a, b, true).expect(200);
    // A turns calls off: off for both, B has to wait.
    expect((await consent(a, b, false).expect(200)).body).toMatchObject({ on: false, mine: false, theirs: false });
    expect((await t.http.get(`/v1/friends/${a.id}/calls`).set(b.auth).expect(200)).body).toMatchObject({
      canAsk: false,
      askBlockedBy: 'wait',
    });
    expect((await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).expect(403)).body.error.code).toBe(
      'CALLS_NOT_ALLOWED',
    );
    expect(await lines(a, b)).toEqual([
      'matched',
      'calls_asked',
      'calls_declined',
      'calls_asked',
      'calls_on',
      'calls_off',
    ]);
  });

  const callsOn = async () => {
    const { a, b } = await friends();
    await say(a, b, 'hey');
    await say(b, a, 'hi');
    await consent(a, b, true).expect(200);
    await consent(b, a, true).expect(200);
    return { a, b };
  };

  it('ring → answer starts a friend call; hanging up logs it in the chat', async () => {
    const { a, b } = await callsOn();
    const sa = await online(a);
    const sb = await online(b);
    const incoming = next(sb, 'call:incoming');
    const r = (await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).expect(200)).body;
    expect(r).toMatchObject({ callId: expect.any(String), to: { id: b.id } });
    expect(await incoming).toMatchObject({ callId: r.callId, from: { id: a.id } });
    expect((await t.http.get('/v1/calls/incoming').set(b.auth).expect(200)).body.call).toMatchObject({
      callId: r.callId,
    });
    // Ringing someone who is already ringing: busy.
    const c = await signUp(t, { name: 'Cara' });
    await t.prisma.friendship.create({
      data: {
        userLowId: [b.id, c.id].sort()[0],
        userHighId: [b.id, c.id].sort()[1],
        requesterId: c.id,
        status: 'ACCEPTED',
        callsLowAllowed: true,
        callsHighAllowed: true,
      },
    });
    expect((await t.http.post(`/v1/friends/${b.id}/call`).set(c.auth).expect(409)).body.error.code).toBe('CALL_BUSY');

    const foundA = next(sa, 'match:found');
    const foundB = next(sb, 'match:found');
    await t.http.post(`/v1/calls/${r.callId}/accept`).set(b.auth).expect(200);
    expect(await foundA).toMatchObject({ partner: { id: b.id }, friendCall: true, role: 'caller' });
    expect(await foundB).toMatchObject({ partner: { id: a.id }, friendCall: true, role: 'callee' });
    expect((await t.prisma.match.findFirstOrThrow()).kind).toBe('FRIEND');

    const ended = next(sb, 'match:ended');
    await emit(sa, 'match:end');
    await ended;
    await sleep(200);
    expect(await lines(a, b)).toEqual(['matched', 'calls_asked', 'calls_on', 'call_ended']);

    // Staff see it on the Discover and calls page.
    const staff = await staffLogin(t);
    const r2 = (await t.http.get('/v1/admin/dashboard/discover?days=7').set(staff.auth).expect(200)).body;
    expect(r2.discover).toMatchObject({ likes: 2, matches: 1, swipers: 2 });
    expect(r2.calls).toMatchObject({ asked: 1, allowed: 1, chatsWithCallsOn: 2, calls: 1 });
    expect(r2.recentCalls[0]).toMatchObject({ a: { name: 'Asad' }, b: { name: 'Bina' } });
  });

  it('declines (with a quick reply) and missed calls are logged; declines in a row pause ringing', async () => {
    await setRules({ callDeclinePause: 2 });
    const { a, b } = await callsOn();
    const sa = await online(a);
    const ring = async () =>
      (await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).expect(200)).body.callId as string;

    let id = await ring();
    const declined = next(sa, 'call:ended');
    await t.http.post(`/v1/calls/${id}/decline`).set(b.auth).send({ reply: "Can't talk now" }).expect(200);
    expect(await declined).toMatchObject({ callId: id, reason: 'declined', reply: "Can't talk now" });

    id = await ring();
    await t.http.post(`/v1/calls/${id}/cancel`).set(a.auth).expect(200);
    id = await ring();
    await t.http.post(`/v1/calls/${id}/decline`).set(b.auth).send({}).expect(200);
    expect((await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).expect(429)).body.error.code).toBe('CALL_PAUSED');

    const msgs = (await t.http.get(`/v1/friends/${b.id}/messages`).set(a.auth).expect(200)).body.items as {
      kind: string;
      text: string;
    }[];
    expect(msgs.some((m) => m.kind === 'text' && m.text === "Can't talk now")).toBe(true);
    expect(await lines(a, b)).toEqual([
      'matched',
      'calls_asked',
      'calls_on',
      'call_declined',
      'call_missed',
      'call_declined',
    ]);
  });

  it('an unanswered call rings out as a missed call', async () => {
    await setRules({ callRingSeconds: 10 });
    const { a, b } = await callsOn();
    const sb = await online(b);
    const r = (await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).expect(200)).body;
    // Pretend the ring time is over.
    await t.redis.client.zadd('calls:ringing', Date.now() - 1, r.callId);
    const missed = next(sb, 'call:ended');
    await t.app.get(CallsService).sweep();
    expect(await missed).toMatchObject({ callId: r.callId, reason: 'no_answer', from: { id: a.id } });
    expect((await t.http.post(`/v1/calls/${r.callId}/accept`).set(b.auth).expect(404)).body.error.code).toBe(
      'CALL_NOT_FOUND',
    );
    expect((await lines(b, a)).at(-1)).toBe('call_missed');
  });

  it('blocking turns calls off', async () => {
    const { a, b } = await callsOn();
    await t.http
      .post(`/v1/blocks/${b.id}`)
      .set(a.auth)
      .expect((r) => expect([200, 201]).toContain(r.status));
    await sleep(200);
    const f = await t.prisma.friendship.findFirst();
    expect(f ? [f.callsLowAllowed, f.callsHighAllowed] : [false, false]).toEqual([false, false]);
  });
});
