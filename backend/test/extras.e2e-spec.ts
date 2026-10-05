import { DevPushSender } from '../src/modules/push/push-sender';
import { PushService } from '../src/modules/push/push.service';
import { ManualVerificationProvider } from '../src/modules/users/verification/verification.provider';
import { VerificationService } from '../src/modules/users/verification/verification.service';
import { createTestApp, resetState, signUp, staffLogin, TestApp, TestStaff, TestUser } from './helpers';

/** Push notifications, selfie verification review, rewarded-ad tokens, private storage. */
describe('push, KYC, ads, storage', () => {
  let t: TestApp;
  let owner: TestStaff;
  beforeAll(async () => {
    t = await createTestApp();
    await resetState(t);
    owner = await staffLogin(t);
  });
  afterAll(() => t.close());

  const sent = () => (t.app.get(PushService).sender as DevPushSender).sent;
  const friends = async (a: TestUser, b: TestUser) => {
    await t.prisma.match.create({ data: { userAId: a.id, userBId: b.id, endedAt: new Date() } });
    await t.http.post(`/v1/friends/${b.id}/request`).set(a.auth).expect(200);
    await t.http.post(`/v1/friends/${a.id}/accept`).set(b.auth).expect(200);
  };
  const settle = () => new Promise((r) => setTimeout(r, 150));

  it('offline friends get a push for requests and messages; tokens follow the signed-in user', async () => {
    const a = await signUp(t, { name: 'Priya' });
    const b = await signUp(t, { name: 'Mert' });
    await t.http.post('/v1/me/push-tokens').set(b.auth).send({ token: 'fcm-token-of-mert-phone-0001', platform: 'android', appVersion: '1.0.0' }).expect(200);
    sent().length = 0;
    await friends(a, b);
    await t.http.post(`/v1/friends/${b.id}/messages`).set(a.auth).send({ text: 'hello there' }).expect(201);
    await settle();
    const toMert = sent().filter((s) => s.token === 'fcm-token-of-mert-phone-0001');
    expect(toMert.map((s) => s.msg.title)).toEqual(['New friend request', 'Priya']);
    expect(toMert[1].msg).toMatchObject({ body: 'hello there', category: 'messages', data: { route: 'chat', friendId: a.id } });
    // Same phone, someone else signs in: the token moves.
    await t.http.post('/v1/me/push-tokens').set(a.auth).send({ token: 'fcm-token-of-mert-phone-0001', platform: 'android' }).expect(200);
    expect((await t.prisma.pushToken.findUniqueOrThrow({ where: { token: 'fcm-token-of-mert-phone-0001' } })).userId).toBe(a.id);
    await t.http.delete('/v1/me/push-tokens/fcm-token-of-mert-phone-0001').set(a.auth).expect(200);
    expect(await t.prisma.pushToken.count()).toBe(0);
  });

  it('dev KYC approves with a photo; manual review keeps the selfie privately until staff decide', async () => {
    const quick = await signUp(t, { avatarUrl: 'https://i.pravatar.cc/400?img=1' });
    const ok = await t.http.post('/v1/me/verification').set(quick.auth).attach('selfie', Buffer.from('jpeg-bytes'), 'selfie.jpg').expect(200);
    expect(ok.body).toMatchObject({ verified: true, verification: { status: 'APPROVED' } });

    const svc = t.app.get(VerificationService);
    const original = svc.provider;
    (svc as { provider: unknown }).provider = new ManualVerificationProvider();
    try {
      const u = await signUp(t, { avatarUrl: 'https://i.pravatar.cc/400?img=2' });
      const r = await t.http.post('/v1/me/verification').set(u.auth).attach('selfie', Buffer.from('selfie-1'), 'selfie.jpg').expect(200);
      expect(r.body).toMatchObject({ verified: false, verification: { status: 'PENDING' } });
      expect((await t.http.get('/v1/me/verification').set(u.auth)).body.status).toBe('PENDING');
      const queue = await t.http.get('/v1/admin/verifications').set(owner.auth).expect(200);
      const item = queue.body.find((q: { user: { id: string } }) => q.user.id === u.id);
      expect(item).toMatchObject({ provider: 'manual', hasSelfie: true });
      const img = await t.http.get(`/v1/admin/verifications/${item.id}/selfie`).set(owner.auth).buffer(true).expect(200);
      expect(Buffer.from(img.body).toString()).toBe('selfie-1');
      // Private files are never served from /media.
      const req = await t.prisma.verificationRequest.findUniqueOrThrow({ where: { id: item.id } });
      await t.http.get(`/media/${req.selfieKey}`).expect(404);
      await t.http.post(`/v1/admin/verifications/${item.id}/approve`).set(owner.auth).expect(200);
      expect((await t.http.get('/v1/me').set(u.auth)).body.verified).toBe(true);
      await t.http.get(`/v1/admin/verifications/${item.id}/selfie`).set(owner.auth).expect(404); // deleted after review
    } finally {
      (svc as { provider: unknown }).provider = original;
    }
  });

  it('dev rewarded ads: each token pays once', async () => {
    const u = await signUp(t);
    await t.http.post('/v1/wallet/rewards/ad').set(u.auth).set('Idempotency-Key', 'ad-1').send({ adToken: 'nonce-1' }).expect(200);
    const again = await t.http.post('/v1/wallet/rewards/ad').set(u.auth).set('Idempotency-Key', 'ad-2').send({ adToken: 'nonce-1' }).expect(400);
    expect(again.body.error.code).toBe('AD_NOT_VERIFIED');
  });
});
