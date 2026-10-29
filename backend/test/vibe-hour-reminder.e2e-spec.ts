import type { Socket } from 'socket.io-client';

import { Clock, MS } from '../src/common/utils/clock';
import { MailProvider, type MailMessage } from '../src/infra/mail/mail.provider';
import { EconomyService } from '../src/modules/catalog/economy.service';
import { clockLabel, EngagementNotifier } from '../src/modules/engagement/engagement-notifier.service';
import { DevPushSender } from '../src/modules/push/push-sender';
import { PushService } from '../src/modules/push/push.service';
import { connect, createTestApp, resetState, signUp, sleep, TestApp } from './helpers';

/** "Remind me" before Vibe Hour: push with the app, e-mail without it. */
describe('Vibe Hour reminder', () => {
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
    t.app.get(Clock).set(null);
    await resetState(t);
    mails.length = 0;
    pushes().splice(0);
  });
  afterAll(async () => {
    spy.mockRestore();
    sockets.forEach((s) => s.disconnect());
    t.app.get(Clock).set(null);
    await sleep(300);
    await t.close();
  });

  /** Vibe Hour starts `inMinutes` from now. */
  async function vibeHourIn(inMinutes: number) {
    const start = (t.app.get(Clock).minuteOfDay() + inMinutes + 1440) % 1440;
    await t.prisma.appSetting.upsert({ where: { key: 'economy.rules' }, create: { key: 'economy.rules', value: { vibeHourMinutes: 60, vibeHourStart: start } }, update: { value: { vibeHourMinutes: 60, vibeHourStart: start } } });
    await t.app.get(EconomyService).reload();
  }

  it('is off by default and toggled with PUT', async () => {
    const u = await signUp(t);
    expect((await t.http.get('/v1/engagement').set(u.auth).expect(200)).body.vibeHourReminder).toBe(false);
    expect((await t.http.put('/v1/engagement/vibe-hour/reminder').set(u.auth).send({ on: true }).expect(200)).body).toEqual({ vibeHourReminder: true });
    expect((await t.http.get('/v1/engagement').set(u.auth).expect(200)).body.vibeHourReminder).toBe(true);
    await t.http.put('/v1/engagement/vibe-hour/reminder').set(u.auth).send({ on: 'yes' }).expect(400);
  });

  it('15 minutes before: a push to app users, an e-mail to web users, nothing to the rest; once', async () => {
    await vibeHourIn(10);
    const now = new Date();
    const appUser = await signUp(t, { name: 'Asma' });
    const webUser = await signUp(t, { name: 'Wali' });
    const notAsked = await signUp(t, { name: 'Nadia' });
    const inApp = await signUp(t, { name: 'Imran' });
    const longGone = await signUp(t, { name: 'Gul' });
    const noEmails = await signUp(t, { name: 'Erum' });
    await t.http.post('/v1/me/push-tokens').set(appUser.auth).send({ token: 'fcm-token-of-asma-phone-0000001', platform: 'android' }).expect(200);
    for (const u of [appUser, webUser, inApp, longGone, noEmails]) await t.http.put('/v1/engagement/vibe-hour/reminder').set(u.auth).send({ on: true }).expect(200);
    await t.prisma.user.updateMany({ data: { lastSeenAt: now } });
    await t.prisma.user.update({ where: { id: longGone.id }, data: { lastSeenAt: new Date(now.getTime() - 8 * MS.day) } });
    await t.prisma.user.update({ where: { id: noEmails.id }, data: { marketingEmails: false } });
    sockets.push(await connect(t, inApp));
    mails.length = 0; // sign-in codes from signing up

    await t.app.get(EngagementNotifier).vibeHourEdges();
    await sleep(100);
    expect(pushes().map((p) => [p.token, p.msg.title])).toEqual([['fcm-token-of-asma-phone-0000001', expect.stringMatching(/^Vibe Hour starts at \d{1,2}:\d{2} [AP]M 🔥$/)]]);
    const webUserEmail = (await t.prisma.user.findUniqueOrThrow({ where: { id: webUser.id } })).email;
    expect(mails.map((m) => m.to)).toEqual([webUserEmail]);
    expect(mails[0].subject).toMatch(/^Vibe Hour starts at .+ 🔥$/);
    expect(mails[0].html).toContain('https://app.vibe.fawadiqbal.dev/match');
    expect(mails[0].headers?.['List-Unsubscribe']).toBeTruthy();
    expect(notAsked).toBeTruthy();

    // Once per evening.
    await t.app.get(EngagementNotifier).vibeHourEdges();
    expect(mails).toHaveLength(1);
  });

  it('waits until 15 minutes before', async () => {
    await vibeHourIn(40);
    const u = await signUp(t);
    await t.http.put('/v1/engagement/vibe-hour/reminder').set(u.auth).send({ on: true }).expect(200);
    await t.prisma.user.update({ where: { id: u.id }, data: { lastSeenAt: new Date() } });
    mails.length = 0;
    await t.app.get(EngagementNotifier).vibeHourEdges();
    expect(mails).toHaveLength(0);
  });

  it('labels times in business time', () => {
    // 16:00 UTC is 9:00 PM in Pakistan (+300).
    expect(clockLabel(new Date('2026-10-29T16:00:00Z'), 300)).toBe('9:00 PM');
    expect(clockLabel(new Date('2026-10-29T19:30:00Z'), 300)).toBe('12:30 AM');
    expect(clockLabel(new Date('2026-10-29T07:05:00Z'), 300)).toBe('12:05 PM');
  });
});
