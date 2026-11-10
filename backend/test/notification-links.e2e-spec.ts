import { CashoutStatus } from '@prisma/client';

import { PrismaService } from '../src/infra/prisma/prisma.service';
import { link, webPath } from '../src/modules/notifications/catalog';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { ModerationService } from '../src/modules/moderation/moderation.service';
import { FriendsService } from '../src/modules/social/friends.service';
import { MessagesService } from '../src/modules/social/messages.service';
import { createTestApp, requestFriend, resetState, signUp, sleep, TestApp } from './helpers';

/** Every notification opens the thing it is about, and those pages have what they need. */
describe('notification links and the pages they open', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetState(t);
  });
  afterAll(async () => {
    await sleep(300);
    await t.close();
  });

  it('builds links with the page, its ids and a fallback for older apps', () => {
    expect(link('payment', { purchaseId: 'p1' }, 'wallet')).toEqual({
      route: 'wallet',
      open: 'payment',
      purchaseId: 'p1',
    });
    expect(link('chat', { friendId: 'u1', messageId: undefined })).toEqual({
      route: 'chat',
      open: 'chat',
      friendId: 'u1',
    });
    const paths: [Record<string, string>, string][] = [
      [link('chat', { friendId: 'u1', messageId: 'm1' }), '/chats/u1?m=m1'],
      [link('calls', { userId: 'u1', friendId: 'u1' }, 'chat'), '/u/u1/calls'],
      [link('profile', { userId: 'u2' }, 'friends'), '/u/u2'],
      [link('liked-you', {}, 'discover'), '/discover/liked-you'],
      [link('follow-requests', { userId: 'u3' }), '/me/follows?tab=requests'],
      [link('payment', { purchaseId: 'p1' }, 'wallet'), '/wallet/payments/p1'],
      [link('cashout', { cashoutId: 'c1' }, 'wallet'), '/wallet/cashouts/c1'],
      [link('goals', {}, 'wallet'), '/wallet#goals'],
      [link('account', {}, 'inbox'), '/me/status'],
      [link('verification', {}, 'profile', { userId: 'me' }), '/me/verification'],
      [link('team', { messageId: 'n1' }, 'inbox'), '/news/n1'],
      [link('recap', {}, 'inbox'), '/me/recap'],
      // Old rows on the Notifications page (no `open`) still go where they used to.
      [{ route: 'inbox' }, '/chats/inbox'],
      [{ route: 'friends', userId: 'u4' }, '/u/u4'],
      [{}, '/match'],
    ];
    for (const [data, path] of paths) expect(webPath(data)).toBe(path);
  });

  it('a missed call opens your calls with them; the history says who rang and for how long', async () => {
    const a = await signUp(t, { name: 'Ayesha' });
    const b = await signUp(t, { name: 'Bilal' });
    await t.app.get(PrismaService).match.create({ data: { userAId: a.id, userBId: b.id, endedAt: new Date() } });
    await requestFriend(t, a, b);
    await t.http.post(`/v1/friends/${a.id}/accept`).set(b.auth).expect(200);
    const f = await t.app
      .get(PrismaService)
      .friendship.findUniqueOrThrow({ where: t.app.get(FriendsService).pairWhere(a.id, b.id) });
    const msgs = t.app.get(MessagesService);
    await msgs.system(f.id, b.id, a.id, 'Missed video call', { event: 'call_missed', video: true });
    await sleep(5);
    await msgs.system(f.id, a.id, b.id, 'Video call · 14 min', { event: 'call_ended', seconds: 840, video: true });
    await sleep(5);
    await msgs.system(f.id, a.id, b.id, 'Voice call declined', { event: 'call_declined', video: false });
    await msgs.system(f.id, a.id, b.id, 'You both allowed voice calls', { event: 'calls_on', video: false });

    const h = await t.http.get(`/v1/friends/${b.id}/calls/history`).set(a.auth).expect(200);
    expect(h.body.calls).toEqual([
      expect.objectContaining({ kind: 'declined', video: false, outgoing: false, seconds: null }),
      expect.objectContaining({ kind: 'ended', video: true, outgoing: null, seconds: 840 }),
      expect.objectContaining({ kind: 'missed', video: true, outgoing: false }),
    ]);
    expect(h.body.friendSince).toEqual(expect.any(String));
    const theirs = await t.http.get(`/v1/friends/${a.id}/calls/history`).set(b.auth).expect(200);
    expect(theirs.body.calls.map((c: { outgoing: boolean | null }) => c.outgoing)).toEqual([true, null, true]);

    const stranger = await signUp(t, { name: 'Zara' });
    await t.http.get(`/v1/friends/${stranger.id}/calls/history`).set(a.auth).expect(404);
  });

  it('a cash-out opens on its own, and only for its owner', async () => {
    const a = await signUp(t, { name: 'Ayesha' });
    const b = await signUp(t, { name: 'Bilal' });
    const c = await t.app
      .get(PrismaService)
      .cashout.create({
        data: {
          userId: a.id,
          gems: 9000,
          usdCents: 1600,
          amountPkr: 4500,
          method: 'EASYPAISA',
          accountMasked: '••1234',
          status: CashoutStatus.PAID,
        },
      });
    const got = await t.http.get(`/v1/wallet/cashouts/${c.id}`).set(a.auth).expect(200);
    expect(got.body).toMatchObject({ id: c.id, gems: 9000, amountPkr: 4500, status: 'PAID', accountMasked: '••1234' });
    await t.http.get(`/v1/wallet/cashouts/${c.id}`).set(b.auth).expect(404);
  });

  it('account notes and the pause are on Account status, newest first', async () => {
    const u = await signUp(t, { name: 'Sana' });
    const notifications = t.app.get(NotificationsService);
    await notifications.notify(u.id, 'account.warning', {
      message: 'One of your Moments was removed because it showed nudity.',
    });
    await notifications.settled();
    await sleep(5);
    const until = await t.app.get(ModerationService).ban(u.id, 24, 'test');
    await sleep(400);
    await notifications.settled();

    const s = await t.http.get('/v1/me/status').set(u.auth).expect(200);
    expect(s.body.pausedUntil).toBe(until.toISOString());
    expect(s.body.appeal).toBeNull();
    expect(s.body.notes.map((n: { type: string }) => n.type)).toEqual(['account.paused', 'account.warning']);
    expect(s.body.notes[1]).toMatchObject({
      title: 'A note from the Vibe team',
      body: expect.stringContaining('Moments was removed'),
    });

    // The Notifications page line opens Account status.
    const page = await t.http.get('/v1/activity').set(u.auth).expect(200);
    expect(page.body.items.find((i: { type: string }) => i.type === 'account.warning').data).toMatchObject({
      open: 'account',
    });
  });

  it('a Vibe team message opens by its id or by the campaign it came from', async () => {
    const u = await signUp(t, { name: 'Sana' });
    const other = await signUp(t, { name: 'Omar' });
    const prisma = t.app.get(PrismaService);
    const m = await prisma.userMessage.create({
      data: {
        userId: u.id,
        title: 'Vibe Hour, every night at 9',
        body: 'Free filters for an hour.',
        buttonLabel: '',
        buttonUrl: '',
      },
    });
    expect((await t.http.get(`/v1/inbox/${m.id}`).set(u.auth).expect(200)).body).toMatchObject({
      id: m.id,
      title: 'Vibe Hour, every night at 9',
      read: false,
    });
    await t.http.get(`/v1/inbox/${m.id}`).set(other.auth).expect(404);
  });
});
