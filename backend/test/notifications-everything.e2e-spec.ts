import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { connect, createTestApp, resetState, signUp, sleep, TestApp, TestUser } from './helpers';

/**
 * The Notifications page is every notification in one place: everything a
 * phone was pushed (chat lines collapse to one per chat), team messages and
 * account news (once each), friend/follow events always; never the live ring.
 */
describe('notifications page = every notification', () => {
  let t: TestApp;
  const notify = () => t.app.get(NotificationsService);
  const page = async (u: TestUser) => (await t.http.get('/v1/activity').set(u.auth).expect(200)).body as { unread: number; items: { type: string; title: string; body: string; count: number; actor: { id: string } | null; data: Record<string, string> }[] };
  const withPhone = async (u: TestUser, n: number) => t.http.post('/v1/me/push-tokens').set(u.auth).send({ token: `fcm-token-${u.id}-${n}-000000000000`, platform: 'android', appVersion: '1.0.0' }).expect(200);
  const friends = async (a: TestUser, b: TestUser) => {
    const [low, high] = [a.id, b.id].sort();
    await t.prisma.friendship.create({ data: { userLowId: low, userHighId: high, requesterId: a.id, status: 'ACCEPTED', acceptedAt: new Date() } });
  };
  const say = (from: TestUser, to: TestUser, text: string) => t.http.post(`/v1/friends/${to.id}/messages`).set(from.auth).send({ text }).expect(201);

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetState(t);
  });
  afterAll(async () => {
    await sleep(200);
    await t.close();
  });

  it('chat messages pushed to the phone land on the page, one line per chat with a count', async () => {
    const a = await signUp(t, { name: 'Asad' });
    const b = await signUp(t, { name: 'Bina' });
    await friends(a, b);
    await withPhone(b, 1);

    await say(a, b, 'hi!');
    await say(a, b, 'are you free tonight?');
    await say(a, b, 'call me');
    await notify().settled();
    let p = await page(b);
    const chat = p.items.filter((i) => i.type === 'chat.message');
    expect(chat).toHaveLength(1);
    expect(chat[0]).toMatchObject({ count: 3, body: 'call me', actor: { id: a.id }, data: { route: 'chat', friendId: a.id } });
    expect(p.unread).toBe(1);

    // Once read, the next message starts a fresh line.
    await t.http.post('/v1/activity/read').set(b.auth).send({}).expect(200);
    await say(a, b, 'still there?');
    await notify().settled();
    p = await page(b);
    expect(p.items.filter((i) => i.type === 'chat.message').map((i) => i.count)).toEqual([1, 3]);
  });

  it('nothing pushed (they were in the app, or have no phone) = no chat line', async () => {
    const a = await signUp(t, { name: 'Asad' });
    const b = await signUp(t, { name: 'Bina' });
    await friends(a, b);
    await say(a, b, 'no phone registered');
    await notify().settled();
    expect((await page(b)).items.filter((i) => i.type === 'chat.message')).toEqual([]);

    await withPhone(b, 2);
    const s = await connect(t, b); // in the app: the push is skipped
    await sleep(100);
    await say(a, b, 'you are online');
    await notify().settled();
    expect((await page(b)).items.filter((i) => i.type === 'chat.message')).toEqual([]);
    s.disconnect();
  });

  it('messages from the Vibe team and account news show once each', async () => {
    const u = await signUp(t, { name: 'Chand' });
    await notify().notify(u.id, 'team.message', { title: 'Eid Mubarak from Vibe', body: 'Double coins all weekend.' });
    await notify().notify(u.id, 'account.paused', { until: new Date(Date.now() + 86_400_000).toISOString() });
    await notify().settled();
    const p = await page(u);
    expect(p.items.map((i) => i.type).sort()).toEqual(['account.paused', 'team.message']);
    expect(p.items.find((i) => i.type === 'team.message')).toMatchObject({ title: 'Eid Mubarak from Vibe', data: { route: 'inbox' }, actor: null });
    // account.paused also wrote to Messages from Vibe; that copy did not add a second line.
    expect(await t.prisma.userMessage.count({ where: { userId: u.id } })).toBeGreaterThanOrEqual(1);
  });

  it('calls never ring as a notification; a missed call lands there, only for the person called', async () => {
    const a = await signUp(t, { name: 'Asad' });
    const b = await signUp(t, { name: 'Bina' });
    await withPhone(b, 3);
    const snap = (state: string, reason: string | null) => ({ callId: 'c1', state, reason, media: 'video', from: { id: a.id, name: 'Asad' }, to: { id: b.id, name: 'Bina' } });
    await notify().notify(b.id, 'call.missed', snap('ringing', null));
    await notify().notify(b.id, 'call.missed', snap('ended', 'declined'));
    await notify().notify(a.id, 'call.missed', snap('ended', 'no_answer'));
    await notify().notify(b.id, 'call.missed', snap('ended', 'no_answer'));
    await notify().settled();
    expect((await page(b)).items.map((i) => i.type)).toEqual(['call.missed']);
    expect((await page(a)).items).toEqual([]);
  });
});
