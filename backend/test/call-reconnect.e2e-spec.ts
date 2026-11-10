import { io, type Socket } from 'socket.io-client';

import { SettingsService } from '../src/modules/settings/settings.service';
import { connect, createTestApp, emit, next, resetState, signUp, sleep, TestApp, TestUser } from './helpers';

/** A dropped connection (weak mobile data, switching networks) doesn't end the call at once. */
describe('calls survive a dropped connection', () => {
  let t: TestApp;
  const sockets: Socket[] = [];
  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    await sleep(100);
    await resetState(t);
    await t.prisma.appSetting.update({ where: { key: 'matching.reconnectGraceSeconds' }, data: { value: 3 } });
    t.app.get(SettingsService).invalidate();
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

  /** Connects with a listener already on, so an event sent right at connect isn't missed. */
  function reconnectAndWait(u: TestUser, event: string) {
    const s = io(t.url, { auth: { token: u.token }, transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(s);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test payloads are loosely typed
    const got = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), 5000);
      s.once(event, (p: unknown) => (clearTimeout(timer), resolve(p)));
    });
    return { s, got };
  }

  async function pair() {
    const a = await signUp(t, { name: 'Ayesha', gender: 'female' });
    const b = await signUp(t, { name: 'Bilal', gender: 'male' });
    const sa = await online(a);
    const sb = await online(b);
    const found = next(sb, 'match:found');
    await emit(sa, 'match:join', {});
    await emit(sb, 'match:join', {});
    const f = await found;
    return { a, b, sa, sb, matchId: f.matchId as string };
  }

  it('waits for them, tells the partner, and carries on when they are back', async () => {
    const { a, sa, sb, matchId } = await pair();
    let ended = false;
    sb.on('match:ended', () => (ended = true));
    const lost = next(sb, 'match:partner-connection');
    sa.disconnect();
    expect(await lost).toEqual({ matchId, state: 'lost', graceSeconds: 3 });
    await sleep(1000);
    expect(ended).toBe(false);

    const back = next(sb, 'match:partner-connection');
    const { s: s2, got: resumed } = reconnectAndWait(a, 'match:resumed');
    expect(await resumed).toEqual({ matchId });
    // The app says it's still in the call; then the partner hears they're back.
    expect(await emit(s2, 'match:resume', { matchId })).toEqual({ resumed: true });
    expect(await back).toEqual({ matchId, state: 'back' });

    // Past the grace period: still on, and signals still reach the partner.
    await sleep(3500);
    expect(ended).toBe(false);
    const sig = next(sb, 'rtc:signal');
    await emit(s2, 'rtc:signal', { type: 'ice', data: { candidate: 'x' } });
    expect((await sig).matchId).toBe(matchId);
  });

  it('ends the call when they do not come back, and tells them once they are online again', async () => {
    const { a, sa, sb, matchId } = await pair();
    const endedB = next(sb, 'match:ended', 8000);
    sa.disconnect();
    const e = await endedB;
    expect(e).toMatchObject({ matchId, reason: 'partner_left' });

    // A missed match:ended while offline; it arrives when they reconnect.
    const { got } = reconnectAndWait(a, 'match:ended');
    expect(await got).toMatchObject({ matchId, reason: 'disconnected', byMe: true });
  });

  it('ends the call when the app comes back without it (restarted, or an old version)', async () => {
    const { a, sa, sb, matchId } = await pair();
    const lost = next(sb, 'match:partner-connection');
    sa.disconnect();
    await lost;
    const { got } = reconnectAndWait(a, 'match:resumed');
    await got;
    // No match:resume: about 10 s later the call ends.
    expect(await next(sb, 'match:ended', 15_000)).toMatchObject({ matchId, reason: 'partner_left' });
  }, 25_000);
});
