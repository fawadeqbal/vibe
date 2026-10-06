import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Socket } from 'socket.io-client';

import { Clock } from '../src/common/utils/clock';
import { EconomyService } from '../src/modules/catalog/economy.service';
import { MATCH_ENDED, MatchEndedEvent } from '../src/modules/matching/matching.service';
import { DevPushSender } from '../src/modules/push/push-sender';
import { PushService } from '../src/modules/push/push.service';
import { ReferralsService } from '../src/modules/referrals/referrals.service';
import { connect, createTestApp, next, resetState, signUp, sleep, staffLogin, TestApp, TestUser } from './helpers';

const HOUR = 3_600_000;
const PHOTO = 'https://i.pravatar.cc/400?img=5';

describe('referrals v2', () => {
  let t: TestApp;
  const sockets: Socket[] = [];
  const clock = () => t.app.get(Clock);
  const svc = () => t.app.get(ReferralsService);
  let seq = 0;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    await sleep(50);
    clock().set(null);
    await resetState(t);
    (t.app.get(PushService).sender as DevPushSender).sent.splice(0);
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    clock().set(null);
    await sleep(200);
    await t.close();
  });

  async function setRules(patch: Record<string, number>) {
    await t.prisma.appSetting.upsert({ where: { key: 'economy.rules' }, create: { key: 'economy.rules', value: { vibeHourMinutes: 0, ...patch } }, update: { value: { vibeHourMinutes: 0, ...patch } } });
    await t.app.get(EconomyService).reload();
  }

  /** OTP sign-up that sends invite attribution, then a ready profile. */
  async function join(extra: Record<string, unknown>, name = 'Sara Khan'): Promise<TestUser> {
    const email = `ref${++seq}-${Date.now()}@vibe.test`;
    await t.http.post('/v1/auth/otp/request').send({ email }).expect(200);
    const res = await t.http.post('/v1/auth/otp/verify').send({ email, code: '1234', ...extra }).expect(200);
    const u: TestUser = { id: res.body.user.id, token: res.body.tokens.accessToken, refresh: res.body.tokens.refreshToken, auth: { Authorization: `Bearer ${res.body.tokens.accessToken}` } };
    await t.http.patch('/v1/me').set(u.auth).send({ name, age: 23, gender: 'female', countryCode: 'PK' }).expect(200);
    return u;
  }

  const me = async (u: TestUser) => (await t.http.get('/v1/me').set(u.auth).expect(200)).body;
  const coins = async (u: TestUser) => (await t.http.get('/v1/wallet').set(u.auth).expect(200)).body.coins as number;
  const overview = async (u: TestUser) => (await t.http.get('/v1/referrals').set(u.auth).expect(200)).body;
  const referralOf = (inviteeId: string) => t.prisma.referral.findUniqueOrThrow({ where: { inviteeId } });

  /** Selfie verification (dev provider approves when there is a photo). */
  async function verify(u: TestUser) {
    await t.http.patch('/v1/me').set(u.auth).send({ avatarUrl: PHOTO }).expect(200);
    await t.http.post('/v1/me/verification').set(u.auth).attach('selfie', Buffer.from('selfie'), 'selfie.jpg').expect(200);
    await sleep(50);
  }

  /** `n` good calls, counted the way MatchingService does before MATCH_ENDED. */
  async function calls(u: TestUser, n: number, partner: TestUser) {
    for (let i = 0; i < n; i++) {
      await t.prisma.user.updateMany({ where: { id: { in: [u.id, partner.id] } }, data: { goodCallsCount: { increment: 1 } } });
      await t.app.get(EventEmitter2).emitAsync(MATCH_ENDED, { matchId: `m${i}`, a: u.id, b: partner.id, durationSeconds: 75, reason: 'skipped', byUserId: u.id, mutualLike: false } satisfies MatchEndedEvent);
    }
    await sleep(50);
  }

  it('signs up with a code (OTP): pending referral, invitedBy on /me, inviter told and pushed', async () => {
    const ali = await signUp(t, { name: 'Ali Raza' });
    const s = await connect(t, ali);
    sockets.push(s);
    const code = (await me(ali)).inviteCode as string;
    const sara = await join({ inviteCode: code.toLowerCase(), inviteSource: 'WhatsApp', inviteVia: 'install', deviceId: 'install-sara-0001' });
    // "Sara joined" goes out once she finishes profile setup (OTP sign-ups have no name before).
    const joined = next(s, 'referral:updated');
    await t.http.post('/v1/me/onboarding/complete').set(sara.auth).expect(200);
    const ev = await joined;
    expect(ev).toMatchObject({ event: 'joined', referral: { status: 'PENDING', profile: { id: sara.id, name: 'Sara Khan' }, steps: { verified: false, verifyNeeded: true, calls: 0, callsNeeded: 3 } } });

    expect(await me(sara)).toMatchObject({ invitedBy: { name: 'Ali', status: 'PENDING' }, referralClaimable: false });
    expect(await me(ali)).toMatchObject({ invitedBy: null, referralClaimable: true });
    const r = await referralOf(sara.id);
    expect(r).toMatchObject({ inviterId: ali.id, affiliateId: null, code, source: 'install', channel: 'whatsapp', status: 'PENDING' });
    expect(r.deviceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.deviceHash).not.toContain('install-sara');
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: sara.id } })).invitedById).toBe(ali.id);

    const o = await overview(ali);
    expect(o).toMatchObject({ code, link: `https://vibe.fawadiqbal.dev/i/${code}`, rewards: { inviterCoins: 100, inviteeCoins: 50, activationCalls: 3, requireVerified: true }, stats: { joined: 1, pending: 1, rewarded: 0, rejected: 0, coinsEarned: 0 } });
    expect(o.milestones).toEqual([
      { count: 3, reward: { kind: 'vip', amount: 7 }, reached: false },
      { count: 10, reward: { kind: 'vip', amount: 30 }, reached: false },
      { count: 25, reward: { kind: 'coins', amount: 1000 }, reached: false },
    ]);
    expect(o.next).toEqual({ count: 3, remaining: 3 });
    expect(o.people).toHaveLength(1);

    // Offline inviter → push (category social).
    s.disconnect();
    await sleep(150);
    await t.http.post('/v1/me/push-tokens').set(ali.auth).send({ token: 'fcm-ref-ali-000000000001', platform: 'android' }).expect(200);
    const second = await join({ inviteCode: code });
    await t.http.post('/v1/me/onboarding/complete').set(second.auth).expect(200);
    await t.http.post('/v1/me/onboarding/complete').set(second.auth).expect(200); // once only
    await sleep(200);
    const pushes = (t.app.get(PushService).sender as DevPushSender).sent.filter((x) => x.token === 'fcm-ref-ali-000000000001').map((x) => x.msg);
    expect(pushes).toEqual([expect.objectContaining({ title: 'Sara joined Vibe with your invite 🎉', body: 'When they verify and have 3 calls, you both get coins.', category: 'social', data: expect.objectContaining({ route: 'invite' }) })]);
  });

  it('social sign-up carries the code, source and device; bad codes are ignored, bad fields refused', async () => {
    const ali = await signUp(t, { name: 'Ali' });
    const code = (await me(ali)).inviteCode;
    const res = await t.http.post('/v1/auth/social').send({ provider: 'google', idToken: 'dev:g-ref-1:Zara', inviteCode: code, inviteSource: 'tiktok', inviteVia: 'web', deviceId: 'web-uuid-12345678' }).expect(200);
    expect(res.body.isNew).toBe(true);
    expect(res.body.user.invitedBy).toEqual({ name: 'Ali', status: 'PENDING' });
    expect(await referralOf(res.body.user.id)).toMatchObject({ source: 'web', channel: 'tiktok', status: 'PENDING' });
    // Signing in again changes nothing.
    await t.http.post('/v1/auth/social').send({ provider: 'google', idToken: 'dev:g-ref-1:Zara', inviteCode: 'OTHER1' }).expect(200);
    expect(await t.prisma.referral.count()).toBe(1);

    const unknown = await t.http.post('/v1/auth/social').send({ provider: 'google', idToken: 'dev:g-ref-2:Omar', inviteCode: 'NOSUCH1' }).expect(200);
    expect(unknown.body.user).toMatchObject({ invitedBy: null, referralClaimable: true });
    await t.http.post('/v1/auth/social').send({ provider: 'google', idToken: 'dev:g-ref-3:X', inviteSource: 'not valid!' }).expect(400);
    await t.http.post('/v1/auth/social').send({ provider: 'google', idToken: 'dev:g-ref-3:X', deviceId: 'short' }).expect(400);
    await t.http.post('/v1/auth/social').send({ provider: 'google', idToken: 'dev:g-ref-3:X', inviteVia: 'carrier-pigeon' }).expect(400);
  });

  it('claim: within 48 h, once, not your own, not someone you invited', async () => {
    const ali = await signUp(t, { name: 'Ali' });
    const aliCode = (await me(ali)).inviteCode;
    const sara = await signUp(t, { name: 'Sara' });
    const saraCode = (await me(sara)).inviteCode;

    expect((await t.http.post('/v1/referrals/claim').set(sara.auth).send({ code: 'ZZZZZZZ' }).expect(404)).body.error.code).toBe('INVITE_CODE_INVALID');
    expect((await t.http.post('/v1/referrals/claim').set(sara.auth).send({ code: saraCode }).expect(403)).body.error.code).toBe('INVITE_SELF');
    await t.http.post('/v1/referrals/claim').set(sara.auth).send({ code: 'a b' }).expect(400);

    const ok = await t.http.post('/v1/referrals/claim').set(sara.auth).send({ code: aliCode.toLowerCase() }).expect(200);
    expect(ok.body).toMatchObject({ status: 'PENDING', inviter: { name: 'Ali' }, kind: 'user', inviteeCoins: 50 });
    expect(await referralOf(sara.id)).toMatchObject({ source: 'code', inviterId: ali.id });
    expect(await me(sara)).toMatchObject({ invitedBy: { name: 'Ali' }, referralClaimable: false });
    expect((await t.http.post('/v1/referrals/claim').set(sara.auth).send({ code: aliCode }).expect(409)).body.error.code).toBe('INVITE_ALREADY_USED');
    // Ali can't now claim Sara's code (loop).
    expect((await t.http.post('/v1/referrals/claim').set(ali.auth).send({ code: saraCode }).expect(403)).body.error.code).toBe('INVITE_SELF');

    const late = await signUp(t, { name: 'Late' });
    clock().set(new Date(Date.now() + 49 * HOUR));
    expect(await me(late)).toMatchObject({ referralClaimable: false });
    expect((await t.http.post('/v1/referrals/claim').set(late.auth).send({ code: aliCode }).expect(409)).body.error.code).toBe('INVITE_TOO_LATE');
  });

  it('activation → hold → both get coins once; ledger titles; inviter notified', async () => {
    const ali = await signUp(t, { name: 'Ali Raza' });
    const partner = await signUp(t, { name: 'Bob' });
    const sara = await join({ inviteCode: (await me(ali)).inviteCode }, 'Sara Khan');
    expect(await coins(sara)).toBe(30);

    await calls(sara, 3, partner);
    expect((await referralOf(sara.id)).status).toBe('PENDING'); // not verified yet
    const s = await connect(t, ali);
    sockets.push(s);
    const qualified = next(s, 'referral:updated');
    await verify(sara);
    expect(await qualified).toMatchObject({ event: 'qualified', referral: { status: 'QUALIFIED', steps: { verified: true, calls: 3 } } });
    const r = await referralOf(sara.id);
    expect(r.status).toBe('QUALIFIED');

    expect(await svc().rewardDue()).toBe(0); // still in the 24 h hold
    clock().set(new Date(r.qualifiedAt!.getTime() + 25 * HOUR));
    const rewarded = next(s, 'referral:updated');
    expect(await svc().rewardDue()).toBe(1);
    expect(await rewarded).toMatchObject({ event: 'rewarded', coins: 100, referral: { status: 'REWARDED', coins: 100 } });
    expect(await svc().rewardDue()).toBe(0);
    expect(await coins(ali)).toBe(130);
    expect(await coins(sara)).toBe(80);
    const titles = await t.prisma.ledgerEntry.findMany({ where: { idempotencyKey: { startsWith: 'referral:' } }, orderBy: { userId: 'asc' } });
    expect(titles.map((l) => l.title).sort()).toEqual(['Invited Sara', 'Welcome bonus from Ali']);
    expect(await referralOf(sara.id)).toMatchObject({ status: 'REWARDED', inviterCoins: 100, inviteeCoins: 50 });
    expect((await overview(ali)).stats).toMatchObject({ joined: 1, pending: 0, rewarded: 1, coinsEarned: 100 });
    expect(await me(sara)).toMatchObject({ invitedBy: { status: 'REWARDED' } });
  });

  it('a banned invitee waits; a deleted one is rejected; no verification needed when the rule is off', async () => {
    await setRules({ referralRequireVerified: 0, referralActivationCalls: 1, referralHoldHours: 0 });
    const ali = await signUp(t, { name: 'Ali' });
    const partner = await signUp(t);
    const code = (await me(ali)).inviteCode;
    const a = await join({ inviteCode: code });
    const b = await join({ inviteCode: code });
    await calls(a, 1, partner);
    await calls(b, 1, partner);
    expect((await referralOf(a.id)).status).toBe('QUALIFIED');
    await t.prisma.user.update({ where: { id: a.id }, data: { bannedUntil: new Date(Date.now() + 2 * HOUR) } });
    await t.http.delete('/v1/me').set(b.auth).expect(200);
    expect(await svc().rewardDue()).toBe(0);
    expect((await referralOf(a.id)).status).toBe('QUALIFIED');
    expect(await referralOf(b.id)).toMatchObject({ status: 'REJECTED', rejectReason: 'invitee_deleted' });
    clock().set(new Date(Date.now() + 3 * HOUR));
    expect(await svc().rewardDue()).toBe(1);
  });

  it('daily cap: extra rewards wait for the next business day', async () => {
    await setRules({ referralRequireVerified: 0, referralActivationCalls: 0, referralHoldHours: 0, maxReferralRewardsPerDay: 2 });
    const ali = await signUp(t, { name: 'Ali' });
    const code = (await me(ali)).inviteCode;
    for (let i = 0; i < 3; i++) await join({ inviteCode: code }); // activation 0 calls: qualify at once
    expect(await t.prisma.referral.count({ where: { status: 'QUALIFIED' } })).toBe(3);
    expect(await svc().rewardDue()).toBe(2);
    expect(await svc().rewardDue()).toBe(0);
    expect(await coins(ali)).toBe(230);
    clock().set(new Date(Date.now() + 24 * HOUR));
    expect(await svc().rewardDue()).toBe(1);
    expect(await coins(ali)).toBe(330);
  });

  it('milestones: VIP days and coins once each; Ambassador badge', async () => {
    await setRules({ referralRequireVerified: 0, referralActivationCalls: 0, referralHoldHours: 0, referralMilestone1: 1, referralMilestone1VipDays: 7, referralMilestone2: 2, referralMilestone2VipDays: 30, referralMilestone3: 3, referralMilestone3Coins: 1000 });
    const ali = await signUp(t, { name: 'Ali' });
    const s = await connect(t, ali);
    sockets.push(s);
    const code = (await me(ali)).inviteCode;
    await join({ inviteCode: code });
    const m1 = next(s, 'referral:milestone');
    await svc().rewardDue();
    expect(await m1).toEqual({ index: 1, count: 1, reward: { kind: 'vip', amount: 7 } });
    const w1 = (await t.http.get('/v1/wallet').set(ali.auth).expect(200)).body;
    expect(w1.vip.active).toBe(true);
    const until1 = new Date(w1.vip.until).getTime();
    expect(until1).toBeGreaterThan(Date.now() + 6.9 * 24 * HOUR);

    await join({ inviteCode: code });
    await svc().rewardDue();
    const until2 = new Date((await t.http.get('/v1/wallet').set(ali.auth).expect(200)).body.vip.until).getTime();
    expect(Math.round((until2 - until1) / (24 * HOUR))).toBe(30); // extends the existing VIP
    await join({ inviteCode: code });
    await svc().rewardDue();
    expect(await coins(ali)).toBe(30 + 3 * 100 + 1000);
    await join({ inviteCode: code });
    await svc().rewardDue();
    expect(await coins(ali)).toBe(30 + 4 * 100 + 1000); // milestones never repeat
    expect(await t.prisma.ledgerEntry.count({ where: { userId: ali.id, idempotencyKey: { startsWith: 'referral-milestone-' } } })).toBe(3);
    const o = await overview(ali);
    expect(o.milestones.every((m: { reached: boolean }) => m.reached)).toBe(true);
    expect(o.next).toBeNull();

    await t.prisma.user.update({ where: { id: ali.id }, data: { referralsRewarded: 10 } });
    const badges = (await t.http.get('/v1/me/progress').set(ali.auth).expect(200)).body.badges as { id: string; earned: boolean }[];
    expect(badges).toHaveLength(11);
    expect(badges.find((b) => b.id === 'ambassador')).toMatchObject({ earned: true, target: 10, emoji: '🎖️' });
  });

  it('same device: the inviter’s own phone, or a third referred sign-up from one device → rejected', async () => {
    await setRules({ referralRequireVerified: 0, referralActivationCalls: 0, referralHoldHours: 0 });
    const email = `dev-owner-${Date.now()}@vibe.test`;
    await t.http.post('/v1/auth/otp/request').send({ email }).expect(200);
    const owner = await t.http.post('/v1/auth/otp/verify').send({ email, code: '1234', deviceId: 'phone-of-ali-0001' }).expect(200);
    const ali: TestUser = { id: owner.body.user.id, token: owner.body.tokens.accessToken, refresh: '', auth: { Authorization: `Bearer ${owner.body.tokens.accessToken}` } };
    const code = owner.body.user.inviteCode;

    const alt = await join({ inviteCode: code, deviceId: 'phone-of-ali-0001' });
    expect(await referralOf(alt.id)).toMatchObject({ status: 'REJECTED', rejectReason: 'same_device' });

    const bob = await signUp(t, { name: 'Bob' });
    const bobCode = (await me(bob)).inviteCode;
    const x1 = await join({ inviteCode: bobCode, deviceId: 'shared-device-777' });
    const x2 = await join({ inviteCode: code, deviceId: 'shared-device-777' });
    const x3 = await join({ inviteCode: bobCode, deviceId: 'shared-device-777' });
    expect((await referralOf(x1.id)).status).toBe('QUALIFIED');
    expect((await referralOf(x2.id)).status).toBe('QUALIFIED');
    expect(await referralOf(x3.id)).toMatchObject({ status: 'REJECTED', rejectReason: 'same_device' });
    await svc().rewardDue();
    expect(await coins(ali)).toBe(30 + 100);
    expect((await overview(ali)).stats).toMatchObject({ joined: 2, rejected: 1, rewarded: 1 });
  });

  it('preview is public, shows a first name and photo only, and counts a click once per IP per hour', async () => {
    const ali = await signUp(t, { name: 'Ali Raza Khan', avatarUrl: PHOTO });
    const code = (await me(ali)).inviteCode;
    const p = await t.http.get(`/v1/referrals/preview/${code.toLowerCase()}?s=TikTok`).expect(200);
    expect(p.body).toEqual({ valid: true, kind: 'user', name: 'Ali', avatarUrl: PHOTO, inviteeCoins: 50 });
    await t.http.get(`/v1/referrals/preview/${code}?s=tiktok`).expect(200);
    await t.http.get(`/v1/referrals/preview/${code}`).expect(200);
    const clicks = await t.prisma.referralClick.findMany({ where: { code }, orderBy: { channel: 'asc' } });
    expect(clicks.map((c) => [c.channel, c.clicks])).toEqual([
      ['direct', 1],
      ['tiktok', 1],
    ]);
    clock().set(new Date(Date.now() + HOUR + 1000));
    await t.http.get(`/v1/referrals/preview/${code}?s=tiktok`).expect(200);
    expect((await t.prisma.referralClick.findMany({ where: { code, channel: 'tiktok' } })).reduce((s, c) => s + c.clicks, 0)).toBe(2);

    expect((await t.http.get('/v1/referrals/preview/NOPE123').expect(200)).body).toEqual({ valid: false, kind: null, name: null, avatarUrl: null, inviteeCoins: 50 });
    expect((await t.http.get('/v1/referrals/preview/bad%20code').expect(200)).body.valid).toBe(false);
    expect(await t.prisma.referralClick.count({ where: { code: 'NOPE123' } })).toBe(0);
    await t.http.get('/v1/referrals').expect(401);
  });

  it('admin: list and filter, approve anyway (re-checked at once), reject; permissions', async () => {
    await setRules({ referralRequireVerified: 0, referralActivationCalls: 0, referralHoldHours: 0 });
    const ali = await signUp(t, { name: 'Ali' });
    const code = (await me(ali)).inviteCode;
    const email = `adm-${Date.now()}@vibe.test`;
    await t.http.post('/v1/auth/otp/request').send({ email }).expect(200);
    const res = await t.http.post('/v1/auth/otp/verify').send({ email, code: '1234', deviceId: 'admin-dev-0001' }).expect(200);
    await t.prisma.user.update({ where: { id: ali.id }, data: { signupDeviceHash: (await t.prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } })).signupDeviceHash } });
    const twin = await join({ inviteCode: code, deviceId: 'admin-dev-0001' });
    const ok = await join({ inviteCode: code });

    const owner = await staffLogin(t, 'owner');
    const support = await staffLogin(t, 'support');
    const list = await t.http.get('/v1/admin/referrals?status=REJECTED').set(owner.auth).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ code, kind: 'user', status: 'REJECTED', rejectReason: 'same_device', invitee: { id: twin.id }, inviter: { id: ali.id } });
    expect((await t.http.get(`/v1/admin/referrals?q=${code}`).set(support.auth).expect(200)).body.items).toHaveLength(2);
    await t.http.post(`/v1/admin/referrals/${list.body.items[0].id}/approve`).set(support.auth).expect(403);

    const approved = await t.http.post(`/v1/admin/referrals/${list.body.items[0].id}/approve`).set(owner.auth).expect(200);
    expect(approved.body).toMatchObject({ status: 'QUALIFIED', rejectReason: null });
    await t.http.post(`/v1/admin/referrals/${list.body.items[0].id}/approve`).set(owner.auth).expect(409);

    const okRef = await referralOf(ok.id);
    const rejected = await t.http.post(`/v1/admin/referrals/${okRef.id}/reject`).set(owner.auth).send({ reason: 'Fake account' }).expect(200);
    expect(rejected.body).toMatchObject({ status: 'REJECTED', rejectReason: 'staff: Fake account' });
    await svc().rewardDue();
    expect(await coins(ali)).toBe(130); // only the approved one paid
    expect(await coins(ok)).toBe(30);

    const audit = await t.prisma.auditLog.findMany({ where: { action: { startsWith: 'referral.' } } });
    expect(audit.map((a) => a.action).sort()).toEqual(['referral.approved', 'referral.rejected']);

    const user = await t.http.get(`/v1/admin/users/${ali.id}/referrals`).set(support.auth).expect(200);
    expect(user.body).toMatchObject({ invitedBy: null, affiliate: null, invited: { counts: { REWARDED: 1, REJECTED: 1 } } });
    expect(user.body.invited.items).toHaveLength(2);
    const dash = await t.http.get('/v1/admin/dashboard/summary').set(owner.auth).expect(200);
    expect(dash.body.growth).toMatchObject({ referredSignups7d: 2 });
  });
});
