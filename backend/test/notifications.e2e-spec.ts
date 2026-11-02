import { SwipeKind, VerificationStatus } from '@prisma/client';

import { MailProvider, type MailMessage } from '../src/infra/mail/mail.provider';
import { ServerEvent } from '../src/infra/realtime/realtime.events';
import { RealtimeService } from '../src/infra/realtime/realtime.service';
import { EngagementNotifier } from '../src/modules/engagement/engagement-notifier.service';
import { CATALOG } from '../src/modules/notifications/catalog';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { DevPushSender } from '../src/modules/push/push-sender';
import { PushService } from '../src/modules/push/push.service';
import { createTestApp, resetState, signUp, sleep, staffLogin, TestApp, TestUser } from './helpers';

/** One notification center: push, in-app inbox and e-mail, with staff and personal switches. */
describe('notifications', () => {
  let t: TestApp;
  const mails: MailMessage[] = [];
  let spy: jest.SpyInstance;
  const pushes = () => (t.app.get(PushService).sender as DevPushSender).sent;
  const center = () => t.app.get(NotificationsService);
  const withPhone = async (u: TestUser, token = `fcm-${u.id}-phone-token-000`) => {
    await t.http.post('/v1/me/push-tokens').set(u.auth).send({ token, platform: 'android' }).expect(200);
    return token;
  };
  const inbox = async (u: TestUser) => (await t.http.get('/v1/inbox').set(u.auth).expect(200)).body.items as { title: string; body: string; buttonUrl: string | null }[];
  const emailOf = async (u: TestUser) => (await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).email!;

  beforeAll(async () => {
    t = await createTestApp();
    spy = jest.spyOn(t.app.get(MailProvider), 'send').mockImplementation(async (m) => void mails.push(m));
  });
  beforeEach(async () => {
    await resetState(t);
    pushes().splice(0);
    mails.length = 0;
  });
  afterAll(async () => {
    spy.mockRestore();
    await t.close();
  });

  it('every type has a unique key and a known group', () => {
    const keys = CATALOG.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(['chat.message', 'chat.reaction', 'account.warning', 'account.paused', 'account.verification', 'reminder.likesWaiting']));
  });

  it('a warning goes to the phone, the inbox and e-mail — even with e-mail updates off', async () => {
    const u = await signUp(t, { name: 'Sara' });
    const token = await withPhone(u);
    await t.prisma.user.update({ where: { id: u.id }, data: { marketingEmails: false } });
    mails.length = 0;

    const r = await center().notify(u.id, 'account.warning', { message: 'Please keep calls friendly.' });
    expect(r).toEqual({ push: 1, inApp: true, email: true });
    expect(pushes().find((p) => p.token === token)?.msg).toMatchObject({ title: 'A note from the Vibe team', body: 'Please keep calls friendly.', category: 'inbox', urgent: true, data: { route: 'inbox' } });
    expect((await inbox(u))[0]).toMatchObject({ title: 'A note from the Vibe team', body: 'Please keep calls friendly.' });
    expect(mails.map((m) => m.to)).toEqual([await emailOf(u)]);
    expect(mails[0].subject).toBe('A note from the Vibe team');
    expect(mails[0].headers?.['List-Unsubscribe']).toBeUndefined();
    // The inbox message it made does not push a second time.
    await sleep(150);
    expect(pushes()).toHaveLength(1);
  });

  it('Me → Notifications: turn a group off per channel; account alerts stay on', async () => {
    const a = await signUp(t, { name: 'Ali' });
    const b = await signUp(t, { name: 'Bina' });
    await withPhone(b);
    const before = (await t.http.get('/v1/me/notifications').set(b.auth).expect(200)).body;
    expect(before.groups.find((g: { key: string }) => g.key === 'friends')).toMatchObject({ push: true, inApp: true, email: true, locked: false });

    await t.http.put('/v1/me/notifications').set(b.auth).send({ group: 'friends', channel: 'push', on: false }).expect(200);
    const locked = (await t.http.put('/v1/me/notifications').set(b.auth).send({ group: 'account', channel: 'push', on: false }).expect(200)).body;
    expect(locked.groups.find((g: { key: string }) => g.key === 'friends').push).toBe(false);
    expect(locked.groups.find((g: { key: string }) => g.key === 'account')).toMatchObject({ push: true, locked: true });
    await t.http.put('/v1/me/notifications').set(b.auth).send({ group: 'nope', channel: 'push', on: false }).expect(400);

    t.app.get(RealtimeService).toUser(b.id, ServerEvent.FriendRequest, { from: { id: a.id, name: 'Ali' } });
    await sleep(200);
    expect(pushes()).toHaveLength(0);
    expect((await center().notify(b.id, 'account.warning', { message: 'x' })).push).toBe(1);

    await t.http.put('/v1/me/notifications').set(b.auth).send({ group: 'friends', channel: 'push', on: true }).expect(200);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: b.id } })).notifyPrefs).toBeNull();
  });

  it('events notify by themselves; not while the app is open', async () => {
    const a = await signUp(t, { name: 'Ali Khan' });
    const b = await signUp(t, { name: 'Bina' });
    const token = await withPhone(b);
    t.app.get(RealtimeService).toUser(b.id, ServerEvent.FriendRequest, { from: { id: a.id, name: 'Ali Khan' } });
    await sleep(200);
    expect(pushes().map((p) => p.msg.title)).toEqual(['New friend request']);
    expect(pushes()[0]).toMatchObject({ token, msg: { body: 'Ali Khan wants to be friends', category: 'social' } });

    pushes().splice(0);
    jest.spyOn(t.app.get(RealtimeService), 'isOnline').mockResolvedValueOnce(true);
    t.app.get(RealtimeService).toUser(b.id, ServerEvent.FollowAccepted, { by: { id: a.id, name: 'Ali' } });
    await sleep(200);
    expect(pushes()).toHaveLength(0);
  });

  it('admin: every type with its channels; turning one off stops it; counts what went out', async () => {
    const owner = await staffLogin(t, 'owner');
    const u = await signUp(t);
    await withPhone(u);
    await center().notify(u.id, 'account.warning', { message: 'one' });

    const view = (await t.http.get('/v1/admin/config/notifications').set(owner.auth).expect(200)).body;
    expect(view.types).toHaveLength(CATALOG.length);
    expect(view.types.find((x: { key: string }) => x.key === 'account.warning')).toMatchObject({ group: 'account', auto: true, channels: { push: true, inApp: true, email: true }, sentLast7Days: { push: 1, inApp: 1, email: 1 } });

    const after = (await t.http.put('/v1/admin/config/notifications/account.warning').set(owner.auth).send({ email: false, inApp: false }).expect(200)).body;
    expect(after.types.find((x: { key: string }) => x.key === 'account.warning').channels).toEqual({ push: true, inApp: false, email: false });
    mails.length = 0;
    expect(await center().notify(u.id, 'account.warning', { message: 'two' })).toEqual({ push: 1, inApp: false, email: false });
    expect(mails).toHaveLength(0);

    // Back to the default = no override saved.
    await t.http.put('/v1/admin/config/notifications/account.warning').set(owner.auth).send({ email: true, inApp: true }).expect(200);
    expect((await t.prisma.appSetting.findUniqueOrThrow({ where: { key: 'notifications.types' } })).value).toEqual({});
    await t.http.put('/v1/admin/config/notifications/nope').set(owner.auth).send({ push: false }).expect(404);
    const support = await staffLogin(t, 'support');
    await t.http.get('/v1/admin/config/notifications').set(support.auth).expect(403);
  });

  it('reminder e-mails only reach people without the app, once a day, with e-mail updates on', async () => {
    const web = await signUp(t);
    const app = await signUp(t);
    await withPhone(app);
    mails.length = 0;

    expect(await center().notify(app.id, 'reminder.winback', { minutes: 30 })).toEqual({ push: 1, inApp: false, email: false });
    expect(await center().notify(web.id, 'reminder.winback', { minutes: 30 })).toEqual({ push: 0, inApp: false, email: true });
    expect(mails[0]).toMatchObject({ to: await emailOf(web), subject: 'We miss you 👋' });
    expect(mails[0].html).toContain('/wallet');
    expect(mails[0].headers?.['List-Unsubscribe']).toBeTruthy();
    expect((await center().notify(web.id, 'reminder.winback', { minutes: 30 })).email).toBe(false);

    await t.prisma.user.update({ where: { id: web.id }, data: { marketingEmails: false } });
    expect((await center().notify(web.id, 'reminder.likesWaiting', { count: 2 })).email).toBe(false);
  });

  it('chat reactions notify the sender once', async () => {
    const a = await signUp(t);
    const b = await signUp(t, { name: 'Bina Ali' });
    await withPhone(a);
    const msg = { id: 'm1', friendId: b.id, fromMe: true, text: 'see you tonight', unsent: false, reactions: { mine: null, theirs: '❤️' } };
    expect((await center().notify(a.id, 'chat.reaction', msg)).push).toBe(1);
    expect((await center().notify(a.id, 'chat.reaction', msg)).push).toBe(0);
    expect(pushes()[0].msg).toMatchObject({ title: 'Bina', body: 'Reacted ❤️ to "see you tonight"', category: 'messages' });
  });

  it('selfie review: the person hears the result', async () => {
    const owner = await staffLogin(t, 'owner');
    const u = await signUp(t);
    await withPhone(u);
    const req = await t.prisma.verificationRequest.create({ data: { userId: u.id, status: VerificationStatus.PENDING, provider: 'manual' } });
    await t.http.post(`/v1/admin/verifications/${req.id}/reject`).set(owner.auth).send({ reason: 'The photo was too dark.' }).expect(200);
    await sleep(200);
    expect(pushes()[0].msg).toMatchObject({ title: "We couldn't verify your selfie", body: 'The photo was too dark. You can try again with a new selfie.' });
    expect((await inbox(u))[0].title).toBe("We couldn't verify your selfie");
  });

  it('likes waiting: a reminder for unseen likes, at most every 3 days', async () => {
    const me = await signUp(t);
    const fans = await Promise.all(['Fan1', 'Fan2'].map((name) => signUp(t, { name, avatarUrl: `https://img.test/${name}.jpg` })));
    await t.prisma.user.updateMany({ where: { id: { in: fans.map((f) => f.id) } }, data: { onboardedAt: new Date(), lastSeenAt: new Date() } });
    await withPhone(me);
    await t.prisma.discoverSwipe.createMany({ data: fans.map((f) => ({ fromId: f.id, toId: me.id, kind: SwipeKind.LIKE })) });
    const job = t.app.get(EngagementNotifier);
    expect(await job.likesWaiting()).toBe(1);
    expect(pushes()[0].msg).toMatchObject({ title: '2 people like you 💜', category: 'engagement', data: { route: 'discover' } });
    expect(await job.likesWaiting()).toBe(0);
  });
});
