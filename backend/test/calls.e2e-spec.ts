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
    expect(list[0].calls).toEqual({ mine: true, theirs: true, mineVideo: true, theirsVideo: true });
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

  type Snap = { callId: string; state: string; reason: string | null; version: number; reached: boolean; answeredBy: string | null; reply: string | null; from: { id: string }; to: { id: string }; media: string };
  /** The next call:state on this socket that matches. */
  const stateOn = (s: Socket, ok: (c: Snap) => boolean, timeoutMs = 5000) =>
    new Promise<Snap>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for call:state')), timeoutMs);
      const on = (c: Snap) => {
        if (!ok(c)) return;
        clearTimeout(timer);
        s.off('call:state', on);
        resolve(c);
      };
      s.on('call:state', on);
    });
  /** Moves a call's clock (the record is JSON in Redis). */
  const patchCall = async (id: string, patch: Record<string, unknown>) => {
    const raw = await t.redis.client.get(`call:${id}`);
    await t.redis.client.set(`call:${id}`, JSON.stringify({ ...JSON.parse(raw!), ...patch }), 'KEEPTTL');
  };
  const sweep = () => t.app.get(CallsService).sweep();

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
    const incoming = stateOn(sb, (c) => c.state === 'ringing');
    const r = (await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).expect(200)).body;
    expect(r).toMatchObject({ callId: expect.any(String), state: 'ringing', to: { id: b.id }, from: { id: a.id }, reached: false, version: 1 });
    expect(await incoming).toMatchObject({ callId: r.callId, from: { id: a.id } });
    expect((await t.http.get('/v1/calls/current').set(b.auth).expect(200)).body.call).toMatchObject({ callId: r.callId, state: 'ringing' });
    // Ringing someone who is already ringing: it ends at once as busy (a missed-call line, no ring).
    const c = await signUp(t, { name: 'Cara' });
    await t.prisma.friendship.create({
      data: {
        userLowId: [b.id, c.id].sort()[0],
        userHighId: [b.id, c.id].sort()[1],
        requesterId: c.id,
        status: 'ACCEPTED',
        callsLowAllowed: true,
        callsHighAllowed: true,
        callsLowVideo: true,
        callsHighVideo: true,
      },
    });
    expect((await t.http.post(`/v1/friends/${b.id}/call`).set(c.auth).expect(200)).body).toMatchObject({ state: 'ended', reason: 'busy' });
    // And Asad can't start a second call himself.
    expect((await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).expect(409)).body.error.code).toBe('CALL_BUSY');

    const foundA = next(sa, 'match:found');
    const foundB = next(sb, 'match:found');
    const connecting = stateOn(sa, (c) => c.state === 'connecting');
    const answered = (await t.http.post(`/v1/calls/${r.callId}/accept`).set(b.auth).send({ deviceId: 'phone-1' }).expect(200)).body;
    expect(answered).toMatchObject({ state: 'connecting', answeredBy: 'phone-1' });
    expect(await connecting).toMatchObject({ answeredBy: 'phone-1' });
    expect(await foundA).toMatchObject({ partner: { id: b.id }, friendCall: true, role: 'caller' });
    expect(await foundB).toMatchObject({ partner: { id: a.id }, friendCall: true, role: 'callee' });
    expect((await t.prisma.match.findFirstOrThrow()).kind).toBe('FRIEND');
    // Too late on another device: 409.
    expect((await t.http.post(`/v1/calls/${r.callId}/accept`).set(b.auth).send({ deviceId: 'laptop' }).expect(409)).body.error.code).toBe('CALL_NOT_FOUND');

    // Both media up: live.
    expect((await t.http.post(`/v1/calls/${r.callId}/up`).set(a.auth).expect(200)).body).toMatchObject({ state: 'connecting' });
    const live = stateOn(sb, (c) => c.state === 'live');
    expect((await t.http.post(`/v1/calls/${r.callId}/up`).set(b.auth).expect(200)).body).toMatchObject({ state: 'live' });
    expect(await live).toMatchObject({ callId: r.callId });

    const hungUp = stateOn(sb, (c) => c.state === 'ended');
    const ended = next(sb, 'match:ended');
    await emit(sa, 'match:end');
    await ended;
    expect(await hungUp).toMatchObject({ reason: 'hung_up' });
    expect((await t.http.get('/v1/calls/current').set(a.auth).expect(200)).body.call).toBeNull();
    expect((await t.http.get(`/v1/calls/${r.callId}`).set(b.auth).expect(200)).body).toMatchObject({ state: 'ended', reason: 'hung_up' });
    await t.http.get(`/v1/calls/${r.callId}`).set(c.auth).expect(404);
    await sleep(200);
    expect(await lines(a, b)).toEqual(['matched', 'calls_asked', 'calls_on', 'call_ended']);

    // Staff see it on the Discover and calls page.
    const staff = await staffLogin(t);
    const r2 = (await t.http.get('/v1/admin/dashboard/discover?days=7').set(staff.auth).expect(200)).body;
    expect(r2.discover).toMatchObject({ likes: 2, matches: 1, swipers: 2 });
    expect(r2.calls).toMatchObject({ asked: 1, allowed: 1, chatsWithCallsOn: 2, calls: 1 });
    expect(r2.recentCalls[0]).toMatchObject({ a: { name: 'Asad' }, b: { name: 'Bina' } });
  });

  it('rings only in the app: not there → unavailable at once; there → Calling… then Ringing… once their app shows it; leaving the app → gone', async () => {
    const { a, b } = await callsOn();
    const sa = await online(a);
    // Bina isn't in the app: it ends at once, she gets a missed call.
    const r0 = (await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).expect(200)).body;
    expect(r0).toMatchObject({ state: 'ended', reason: 'unavailable' });
    expect((await lines(b, a)).at(-1)).toBe('call_missed');

    // In the app: it rings; her app shows it → reached ("Ringing…"), once.
    const sb = await online(b);
    const r = (await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).expect(200)).body;
    expect(r).toMatchObject({ state: 'ringing', reached: false });
    const reached = stateOn(sa, (c) => c.reached);
    await t.http.post(`/v1/calls/${r.callId}/ringing`).set(b.auth).expect(200);
    expect(await reached).toMatchObject({ callId: r.callId, state: 'ringing', version: 2 });
    expect((await t.http.post(`/v1/calls/${r.callId}/ringing`).set(b.auth).expect(200)).body.version).toBe(2);
    // Only the person being called can say so.
    await t.http.post(`/v1/calls/${r.callId}/ringing`).set(a.auth).expect(404);

    // She leaves the app while it rings: after a short grace, gone.
    await emit(sb, 'presence:active', { active: false });
    await sweep();
    await patchCall(r.callId, { awayAt: Date.now() - 6000 });
    const gone = stateOn(sa, (c) => c.state === 'ended');
    await sweep();
    expect(await gone).toMatchObject({ reason: 'gone' });
    expect((await lines(b, a)).at(-1)).toBe('call_missed');
  });

  it('connecting never hangs: no media for 15 s → failed, and the call is ended for both', async () => {
    const { a, b } = await callsOn();
    const sa = await online(a);
    await online(b);
    const r = (await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).expect(200)).body;
    const found = next(sa, 'match:found');
    await t.http.post(`/v1/calls/${r.callId}/accept`).set(b.auth).expect(200);
    await found;
    await patchCall(r.callId, { connectingAt: Date.now() - 16_000 });
    const failed = stateOn(sa, (c) => c.state === 'ended');
    const ended = next(sa, 'match:ended');
    await sweep();
    expect(await failed).toMatchObject({ reason: 'failed' });
    await ended;
  });

  it('voice or video: the lower level wins; voice calls start audio-only and can turn on video when both say yes', async () => {
    const { a, b } = await friends();
    await say(a, b, 'hey');
    await say(b, a, 'hi');
    // A asks for voice and video, B allows voice only.
    await t.http.put(`/v1/friends/${b.id}/calls`).set(a.auth).send({ allow: true, video: true }).expect(200);
    const st = (await t.http.put(`/v1/friends/${a.id}/calls`).set(b.auth).send({ allow: true, video: false }).expect(200)).body;
    expect(st).toMatchObject({ on: true, video: false, mineVideo: false, theirsVideo: true });
    expect((await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).send({ media: 'video' }).expect(403)).body.error.code).toBe('CALLS_NOT_ALLOWED');

    // A voice call starts audio-only; video can't be turned on while B only allows voice.
    const sa = await online(a);
    const sb = await online(b);
    const incoming = stateOn(sb, (c) => c.state === 'ringing');
    const r = (await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).send({ media: 'voice' }).expect(200)).body;
    expect(await incoming).toMatchObject({ media: 'voice' });
    const foundA = next(sa, 'match:found');
    await t.http.post(`/v1/calls/${r.callId}/accept`).set(b.auth).expect(200);
    const found = await foundA;
    expect(found).toMatchObject({ friendCall: true, audioOnly: true });
    expect((await t.http.post(`/v1/calls/live/${found.matchId}/video`).set(a.auth).send({ action: 'ask' }).expect(403)).body.error.code).toBe('CALLS_NOT_ALLOWED');

    // B raises to video (they both allow it now): ask → yes turns video on for both.
    await t.http.put(`/v1/friends/${a.id}/calls`).set(b.auth).send({ allow: true, video: true }).expect(200);
    const asked = next(sb, 'call:video');
    await t.http.post(`/v1/calls/live/${found.matchId}/video`).set(a.auth).send({ action: 'ask' }).expect(200);
    expect(await asked).toMatchObject({ state: 'asked', from: a.id });
    const onA = next(sa, 'call:video');
    expect((await t.http.post(`/v1/calls/live/${found.matchId}/video`).set(b.auth).send({ action: 'yes' }).expect(200)).body).toEqual({ state: 'on' });
    expect(await onA).toMatchObject({ state: 'on' });

    const ended = next(sb, 'match:ended');
    await emit(sa, 'match:end');
    await ended;
    await sleep(200);
    const msgs = (await t.http.get(`/v1/friends/${b.id}/messages`).set(a.auth).expect(200)).body.items as { text: string; meta: { event?: string; video?: boolean } | null }[];
    expect(msgs.find((m) => m.meta?.event === 'call_ended')).toMatchObject({ meta: { video: true } });
    expect(msgs.map((m) => m.text)).toEqual(expect.arrayContaining(['Asad asked to allow voice and video calls', 'You both allowed voice calls', 'You both allowed voice and video calls']));

    // Lowering to voice is instant for both.
    const low = (await t.http.put(`/v1/friends/${b.id}/calls`).set(a.auth).send({ allow: true, video: false }).expect(200)).body;
    expect(low).toMatchObject({ on: true, video: false });
  });

  it('a video call can be picked up as voice only, switched to voice by either side, and "Blur me" reaches the other', async () => {
    const { a, b } = await callsOn();
    const sa = await online(a);
    const sb = await online(b);
    // Voice only: a video call starts audio-only for both.
    let r = (await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).send({ media: 'video' }).expect(200)).body;
    let foundA = next(sa, 'match:found');
    await t.http.post(`/v1/calls/${r.callId}/accept`).set(b.auth).send({ media: 'voice' }).expect(200);
    expect(await foundA).toMatchObject({ friendCall: true, audioOnly: true });
    let ended = next(sb, 'match:ended');
    await emit(sa, 'match:end');
    await ended;

    // A video call; B switches it to voice only: both are told, no ask.
    r = (await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).send({ media: 'video' }).expect(200)).body;
    foundA = next(sa, 'match:found');
    const foundB = next(sb, 'match:found');
    await t.http.post(`/v1/calls/${r.callId}/accept`).set(b.auth).expect(200);
    const found = await foundA;
    await foundB;
    expect(found).toMatchObject({ friendCall: true, audioOnly: false });

    const blur = next(sb, 'match:media');
    await emit(sa, 'match:media', { camOn: true, micOn: true, blur: true });
    expect(await blur).toMatchObject({ camOn: true, micOn: true, blur: true });

    const offA = next(sa, 'call:video');
    expect((await t.http.post(`/v1/calls/live/${found.matchId}/video`).set(b.auth).send({ action: 'off' }).expect(200)).body).toEqual({ state: 'off' });
    expect(await offA).toMatchObject({ state: 'off', from: b.id });
    ended = next(sb, 'match:ended');
    await emit(sa, 'match:end');
    await ended;
  });

  it('declines (with a quick reply) and missed calls are logged; declines in a row pause ringing', async () => {
    await setRules({ callDeclinePause: 2 });
    const { a, b } = await callsOn();
    const sa = await online(a);
    const sb = await online(b);
    const ring = async () =>
      (await t.http.post(`/v1/friends/${b.id}/call`).set(a.auth).expect(200)).body.callId as string;

    let id = await ring();
    const declined = stateOn(sa, (c) => c.state === 'ended');
    expect((await t.http.post(`/v1/calls/${id}/decline`).set(b.auth).send({ reply: "Can't talk now" }).expect(200)).body).toMatchObject({ state: 'ended', reason: 'declined' });
    expect(await declined).toMatchObject({ callId: id, reason: 'declined', reply: "Can't talk now" });
    // Too late to pick up: 409.
    await t.http.post(`/v1/calls/${id}/accept`).set(b.auth).expect(409);

    id = await ring();
    const hungUp = stateOn(sb, (c) => c.state === 'ended');
    expect((await t.http.post(`/v1/calls/${id}/cancel`).set(a.auth).expect(200)).body).toMatchObject({ reason: 'cancelled' });
    expect(await hungUp).toMatchObject({ reason: 'cancelled' });
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
    await patchCall(r.callId, { expiresAt: Date.now() - 1 });
    const missed = stateOn(sb, (c) => c.state === 'ended');
    await sweep();
    expect(await missed).toMatchObject({ callId: r.callId, reason: 'no_answer', from: { id: a.id } });
    expect((await t.http.post(`/v1/calls/${r.callId}/accept`).set(b.auth).expect(409)).body.error.code).toBe(
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
