import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io-client';

import { Clock } from '../src/common/utils/clock';
import { EconomyService } from '../src/modules/catalog/economy.service';
import { EngagementNotifier } from '../src/modules/engagement/engagement-notifier.service';
import { boardKey, ProgressService } from '../src/modules/engagement/progress.service';
import { RecapService } from '../src/modules/engagement/recap.service';
import { DevPushSender } from '../src/modules/push/push-sender';
import { PushService } from '../src/modules/push/push.service';
import { connect, createTestApp, emit, next, requestFriend, resetState, signUp, sleep, TestApp, TestUser } from './helpers';

const DAY = 86_400_000;
/** 13:00 Pakistan time on day `n` after 1 Oct 2026 (a Thursday). */
const day = (n: number) => new Date(Date.UTC(2026, 9, 1, 8) + n * DAY);

describe('engagement', () => {
  let t: TestApp;
  const sockets: Socket[] = [];
  const clock = () => t.app.get(Clock);
  const sent = () => (t.app.get(PushService).sender as DevPushSender).sent;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    await sleep(100);
    clock().set(null);
    await resetState(t);
    sent().splice(0);
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    clock().set(null);
    await sleep(300);
    await t.close();
  });

  const online = async (u: TestUser) => {
    const s = await connect(t, u);
    sockets.push(s);
    return s;
  };

  /** Changes rules the way the admin panel does (Vibe Hour stays off unless set). */
  async function setRules(patch: Record<string, number>) {
    await t.prisma.appSetting.upsert({ where: { key: 'economy.rules' }, create: { key: 'economy.rules', value: { vibeHourMinutes: 0, ...patch } }, update: { value: { vibeHourMinutes: 0, ...patch } } });
    await t.app.get(EconomyService).reload();
  }

  async function makeFriends(a: TestUser, b: TestUser) {
    await t.prisma.match.create({ data: { userAId: a.id, userBId: b.id } });
    await requestFriend(t, a, b);
    await t.http.post(`/v1/friends/${a.id}/accept`).set(b.auth).expect(200);
  }

  const say = (from: TestUser, to: TestUser, text = 'hey') => t.http.post(`/v1/friends/${to.id}/messages`).set(from.auth).send({ text }).expect(201);
  const streakOf = async (me: TestUser, friend: TestUser) => ((await t.http.get('/v1/friends').set(me.auth).expect(200)).body as { profile: { id: string }; streak: Record<string, unknown> }[]).find((f) => f.profile.id === friend.id)!.streak;
  const coins = async (u: TestUser) => (await t.http.get('/v1/wallet').set(u.auth).expect(200)).body.coins as number;
  const addToken = async (u: TestUser) => {
    const token = `fcm-${randomUUID()}`;
    await t.http.post('/v1/me/push-tokens').set(u.auth).send({ token, platform: 'android' }).expect(200);
    return token;
  };
  const pushesTo = (token: string) => sent().filter((x) => x.token === token).map((x) => x.msg);

  async function pair(opts: { aProfile?: object; bProfile?: object; a?: TestUser; b?: TestUser } = {}) {
    const a = opts.a ?? (await signUp(t, { name: 'Ayesha', gender: 'female', interests: ['Music', 'Travel', 'Art'], ...opts.aProfile }));
    const b = opts.b ?? (await signUp(t, { name: 'Bilal', gender: 'male', interests: ['Music', 'Cricket', 'Travel'], ...opts.bProfile }));
    const sa = await online(a);
    const sb = await online(b);
    const foundA = next(sa, 'match:found');
    const foundB = next(sb, 'match:found');
    await emit(sa, 'match:join', {});
    await emit(sb, 'match:join', {});
    return { a, b, sa, sb, fa: await foundA, fb: await foundB };
  }

  // ── friend streaks ─────────────────────────────────────────────────────

  describe('friend streaks', () => {
    it('a day counts once both message; it grows daily, pays every 7th day and gives XP', async () => {
      const a = await signUp(t, { name: 'Ayesha' });
      const b = await signUp(t, { name: 'Bilal' });
      await makeFriends(a, b);
      clock().set(day(0));
      const sa = await online(a);

      await say(a, b);
      expect(await streakOf(a, b)).toMatchObject({ count: 0, today: false, mineToday: true, theirsToday: false });
      const ev = next(sa, 'social:streak');
      await say(b, a);
      expect(await ev).toMatchObject({ friendId: b.id, streak: { count: 1, today: true, mineToday: true, theirsToday: true } });
      expect(await streakOf(b, a)).toMatchObject({ count: 1, best: 1, today: true, atRisk: false, restorable: false, lostCount: 0, restoreCost: 30 });

      for (let d = 1; d < 7; d++) {
        clock().set(day(d));
        await say(a, b);
        await say(b, a);
      }
      expect(await streakOf(a, b)).toMatchObject({ count: 7, best: 7, today: true });
      expect(await coins(a)).toBe(40);
      expect(await coins(b)).toBe(40);
      const entry = await t.prisma.ledgerEntry.findFirst({ where: { userId: a.id, title: { startsWith: 'Streak' } } });
      expect(entry).toMatchObject({ coins: 10, title: 'Streak · 7 days with Bilal' });

      const progress = (await t.http.get('/v1/me/progress').set(a.auth).expect(200)).body;
      expect(progress.xp).toBe(14); // 2 XP per counted day
      expect(progress.badges.find((x: { id: string }) => x.id === 'streak_7')).toMatchObject({ earned: true, progress: 7, target: 7 });

      // The next day it is at risk until both talk.
      clock().set(day(7));
      expect(await streakOf(a, b)).toMatchObject({ count: 7, today: false, atRisk: true });
      expect((await t.http.get('/v1/engagement').set(a.auth).expect(200)).body.streaksAtRisk).toBe(1);
    });

    it('a streak that broke yesterday can be restored for coins (VIP free), and only then', async () => {
      const a = await signUp(t, { name: 'Ayesha' });
      const b = await signUp(t, { name: 'Bilal' });
      await makeFriends(a, b);
      for (let d = 0; d < 3; d++) {
        clock().set(day(d));
        await say(a, b);
        await say(b, a);
      }
      // Missed day 3; on day 4 it is gone but restorable.
      clock().set(day(4));
      expect(await streakOf(a, b)).toMatchObject({ count: 0, restorable: true, lostCount: 3, restoreCost: 30 });
      await t.prisma.wallet.update({ where: { userId: b.id }, data: { vipUntil: new Date(Date.now() + 30 * DAY) } });
      expect(await streakOf(b, a)).toMatchObject({ restorable: true, restoreCost: 0 });

      const r = await t.http.post(`/v1/friends/${b.id}/streak/restore`).set(a.auth).expect(200);
      expect(r.body).toMatchObject({ paidCoins: 30, streak: { count: 3, atRisk: true, restorable: false } });
      expect(await coins(a)).toBe(0);
      expect((await t.http.post(`/v1/friends/${b.id}/streak/restore`).set(a.auth).expect(409)).body.error.code).toBe('STREAK_NOT_RESTORABLE');

      await say(a, b);
      await say(b, a);
      expect(await streakOf(a, b)).toMatchObject({ count: 4, today: true });

      // Too late: two days missed.
      clock().set(day(7));
      expect(await streakOf(a, b)).toMatchObject({ count: 0, restorable: false });
      expect((await t.http.post(`/v1/friends/${a.id}/streak/restore`).set(b.auth).expect(409)).body.error.code).toBe('STREAK_NOT_RESTORABLE');
    });

    it('the 20:00 reminder goes once to each friend who has not talked today', async () => {
      const a = await signUp(t, { name: 'Ayesha' });
      const b = await signUp(t, { name: 'Bilal' });
      await makeFriends(a, b);
      const [ta, tb] = [await addToken(a), await addToken(b)];
      const today = clock().dayIndex();
      const [low, high] = a.id < b.id ? [a, b] : [b, a];
      await t.prisma.friendship.updateMany({ data: { streakCount: 12, streakBest: 12, streakDay: today - 1, streakLowDay: today, streakHighDay: today - 1 } });
      const notifier = t.app.get(EngagementNotifier);
      expect(await notifier.streakRisk()).toBe(1);
      expect(pushesTo(high === a ? ta : tb)).toEqual([expect.objectContaining({ body: `Your 12-day streak with ${low.id === a.id ? 'Ayesha' : 'Bilal'} ends at midnight`, category: 'engagement', data: { route: 'chat', friendId: low.id } })]);
      expect(pushesTo(low === a ? ta : tb)).toEqual([]); // already active today
      expect(await notifier.streakRisk()).toBe(0); // once per pair per day
    });

    it('the minute tick runs each daily job once, from its time of day on', async () => {
      const a = await signUp(t, { name: 'Ayesha' });
      const b = await signUp(t, { name: 'Bilal' });
      await makeFriends(a, b);
      const ta = await addToken(a);
      const today = clock().dayIndex();
      await t.prisma.friendship.updateMany({ data: { streakCount: 5, streakBest: 5, streakDay: today - 1 } });
      const notifier = t.app.get(EngagementNotifier);
      clock().set(new Date(clock().dayStart(today).getTime() + 19 * 3600_000 + 59 * 60_000)); // 19:59
      await notifier.tick();
      expect(pushesTo(ta)).toEqual([]);
      clock().set(new Date(clock().dayStart(today).getTime() + 20 * 3600_000 + 30 * 60_000)); // 20:30
      await notifier.tick();
      await notifier.tick();
      expect(pushesTo(ta)).toEqual([expect.objectContaining({ body: 'Your 5-day streak with Bilal ends at midnight' })]);
    });
  });

  // ── calls ──────────────────────────────────────────────────────────────

  describe('calls', () => {
    it('a call of a minute or more: XP, good-call counter, vibe score, and it keeps a friend streak', async () => {
      const a = await signUp(t, { name: 'Ayesha', gender: 'female' });
      const b = await signUp(t, { name: 'Bilal', gender: 'male' });
      await makeFriends(a, b);
      const { sa, sb, fa } = await pair({ a, b });
      expect(fa.partner.level).toBe(1);
      clock().set(new Date(Date.now() + 61_000));
      const endedA = next(sa, 'match:ended');
      const endedB = next(sb, 'match:ended');
      await emit(sa, 'match:end');
      expect(await endedA).toMatchObject({ reason: 'stopped', mutualLike: false, reconnectCost: 20, freeReconnectUntil: null });
      expect((await endedB).durationSeconds).toBeGreaterThanOrEqual(60);
      const ua = await t.prisma.user.findUniqueOrThrow({ where: { id: a.id } });
      expect(ua).toMatchObject({ goodCallsCount: 1, xp: 12 }); // 10 for the call + 2 for the streak day
      expect(ua.vibeScore).toBeCloseTo(0.55);
      expect(await streakOf(a, b)).toMatchObject({ count: 1, today: true });
    });

    it('a quick skip lowers the skipped person’s vibe score', async () => {
      const { a, b, sa } = await pair();
      await emit(sa, 'match:next', {});
      await sleep(100);
      const [ua, ub] = await Promise.all([t.prisma.user.findUniqueOrThrow({ where: { id: a.id } }), t.prisma.user.findUniqueOrThrow({ where: { id: b.id } })]);
      expect(ub.vibeScore).toBeCloseTo(0.48); // 0.5 + 0.1·(0.3 − 0.5)
      expect(ua.vibeScore).toBeCloseTo(0.5); // a short call you left yourself says nothing
      expect(ua.goodCallsCount).toBe(0);
    });

    it('mutual like: "It\'s a vibe!" for both, XP for likes, then a free reconnect', async () => {
      const { a, b, sa, sb } = await pair();
      expect(await emit(sa, 'match:like')).toEqual({ mutual: false });
      const mutualA = next(sa, 'match:mutual');
      const mutualB = next(sb, 'match:mutual');
      expect(await emit(sb, 'match:like')).toEqual({ mutual: true });
      const [ma, mb] = await Promise.all([mutualA, mutualB]);
      expect(ma.matchId).toBe(mb.matchId);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: a.id } })).xp).toBe(5);

      const ended = next(sb, 'match:ended');
      await emit(sa, 'match:end');
      const e = await ended;
      expect(e.mutualLike).toBe(true);
      expect(new Date(e.freeReconnectUntil).getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
      await sleep(100);
      const again = next(sa, 'match:found');
      expect(await emit(sb, 'match:reconnect')).toEqual({ reconnected: true, paidCoins: 0 });
      expect((await again).reconnect).toBe(true);
      expect(await coins(b)).toBe(30);
    });

    it('a dropped call can be reconnected for free within the window; afterwards it costs coins', async () => {
      const { a, b, sa, sb } = await pair();
      const ended = next(sb, 'match:ended');
      sa.disconnect();
      const e = await ended;
      expect(e.freeReconnectUntil).not.toBeNull();
      const sa2 = await online(a);
      void sa2;
      await sleep(100);
      expect(await emit(sb, 'match:reconnect')).toMatchObject({ paidCoins: 0 });
      expect(await coins(b)).toBe(30);

      // Hang up normally and reconnect after the window: the usual price.
      await emit(sb, 'match:end');
      await sleep(100);
      expect(await emit(sb, 'match:reconnect')).toMatchObject({ paidCoins: 20 });
      expect(await coins(b)).toBe(10);
    });

    it('the free window ends after freeReconnectMinutes', async () => {
      const { a, sa, sb } = await pair();
      const ended = next(sb, 'match:ended');
      sa.disconnect();
      await ended;
      await online(a);
      await sleep(100);
      clock().set(new Date(Date.now() + 11 * 60_000));
      expect(await emit(sb, 'match:reconnect')).toMatchObject({ paidCoins: 20 });
    });
  });

  // ── icebreaker games ───────────────────────────────────────────────────

  describe('icebreaker games', () => {
    it('start, answer, reveal, next, close — relayed to both', async () => {
      const { sa, sb, fa } = await pair();
      await expect(emit(sa, 'match:game', { action: 'start' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      await expect(emit(sa, 'match:game', { action: 'answer', choice: 0 })).rejects.toMatchObject({ code: 'CONFLICT' });

      const gameB = next(sb, 'match:game');
      const gameA = next(sa, 'match:game');
      const started = await emit<{ round: number; prompt: { text: string; options: string[] }; by: string }>(sa, 'match:game', { action: 'start', game: 'wyr' });
      expect(started).toMatchObject({ matchId: fa.matchId, game: 'wyr', round: 1, by: 'me' });
      expect(started.prompt.options).toHaveLength(2);
      expect(await gameB).toMatchObject({ round: 1, by: 'partner', prompt: started.prompt });
      expect((await gameA).by).toBe('me');

      await expect(emit(sb, 'match:game', { action: 'next' })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
      await expect(emit(sb, 'match:game', { action: 'answer' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

      const toB = next(sb, 'match:game-answer');
      expect(await emit(sa, 'match:game', { action: 'answer', choice: 0, round: 1 })).toEqual({ matchId: fa.matchId, round: 1, mine: 0, theirs: null, revealed: false, partnerAnswered: false });
      expect(await toB).toEqual({ matchId: fa.matchId, round: 1, mine: null, theirs: null, revealed: false, partnerAnswered: true });
      const toA = next(sa, 'match:game-answer');
      expect(await emit(sb, 'match:game', { action: 'answer', choice: 1 })).toMatchObject({ mine: 1, theirs: 0, revealed: true });
      expect(await toA).toMatchObject({ mine: 0, theirs: 1, revealed: true, partnerAnswered: true });
      await expect(emit(sb, 'match:game', { action: 'answer', choice: 1, round: 7 })).rejects.toMatchObject({ code: 'CONFLICT' });

      await sleep(2100);
      const second = await emit<{ round: number; prompt: { text: string; options: string[] } }>(sb, 'match:game', { action: 'next' });
      expect(second.round).toBe(2);
      expect(second.prompt.options).not.toEqual(started.prompt.options);

      const closedA = next(sa, 'match:game-closed');
      const closedB = next(sb, 'match:game-closed');
      await emit(sa, 'match:game', { action: 'close' });
      expect(await closedA).toEqual({ matchId: fa.matchId });
      await closedB;
      await expect(emit(sa, 'match:game', { action: 'answer', choice: 0 })).rejects.toMatchObject({ code: 'CONFLICT' });

      // Questions have no options: answering just marks it answered.
      await sleep(2100);
      const q = await emit<{ prompt: { options?: string[] } }>(sa, 'match:game', { action: 'start', game: 'questions' });
      expect(q.prompt.options).toBeUndefined();
      await emit(sa, 'match:game', { action: 'answer' });
      expect(await emit(sb, 'match:game', { action: 'answer' })).toMatchObject({ mine: null, theirs: null, revealed: true });

      // The match ending clears the game.
      await emit(sa, 'match:end');
      await sleep(100);
      expect(await t.redis.client.keys(`mgame:${fa.matchId}*`)).toEqual([]);
      await expect(emit(sa, 'match:game', { action: 'start', game: 'wyr' })).rejects.toMatchObject({ code: 'NOT_IN_MATCH' });
    });
  });

  // ── Vibe Hour ──────────────────────────────────────────────────────────

  describe('Vibe Hour', () => {
    it('is reported by GET /engagement and off when its length is 0', async () => {
      const u = await signUp(t);
      const body = (await t.http.get('/v1/engagement').set(u.auth).expect(200)).body;
      expect(body).toEqual({ vibeHour: { active: false, startsAt: null, endsAt: null }, progress: { level: 1, xp: 0, levelXp: 0, nextLevelXp: 50 }, streaksAtRisk: 0 });
      await setRules({ vibeHourMinutes: 60, vibeHourStart: (clock().minuteOfDay() + 120) % 1440 });
      const later = (await t.http.get('/v1/engagement').set(u.auth).expect(200)).body.vibeHour;
      expect(later.active).toBe(false);
      expect(new Date(later.startsAt).getTime() - Date.now()).toBeGreaterThan(110 * 60_000);
      const cat = (await t.http.get('/v1/catalog').expect(200)).body.economy;
      expect(cat).toMatchObject({ vibeHourMinutes: 60, streakRestoreCost: 30, streakWeeklyCoins: 10, freeReconnectMinutes: 10, xpPerGoodCall: 10, maxEngagementPushesPerDay: 3 });
    });

    it('while live: free filters, double XP, bonus gems, one broadcast at start and a push to recent offline people', async () => {
      await setRules({ vibeHourMinutes: 60, vibeHourStart: (clock().minuteOfDay() + 1440 - 5) % 1440, vibeHourGemBonusPercent: 50 });
      const away = await signUp(t, { name: 'Away' });
      await t.prisma.user.update({ where: { id: away.id }, data: { lastSeenAt: new Date() } });
      const awayToken = await addToken(away);

      const a = await signUp(t, { name: 'Ayesha', gender: 'female' });
      const b = await signUp(t, { name: 'Bilal', gender: 'male' });
      const sa = await online(a);
      const sb = await online(b);
      const live = (await t.http.get('/v1/engagement').set(a.auth).expect(200)).body.vibeHour;
      expect(live.active).toBe(true);

      const broadcast = next(sb, 'engagement:vibe-hour');
      await t.app.get(EngagementNotifier).vibeHourEdges();
      expect(await broadcast).toMatchObject({ active: true, endsAt: live.endsAt });
      let again = false;
      sb.once('engagement:vibe-hour', () => (again = true));
      await t.app.get(EngagementNotifier).vibeHourEdges();
      await sleep(100);
      expect(again).toBe(false);
      expect(pushesTo(awayToken)).toEqual([expect.objectContaining({ title: 'Vibe Hour is live 🔥', category: 'engagement' })]);

      // Paid filter costs nothing now.
      expect(await emit(sa, 'match:join', { gender: 'MEN' })).toMatchObject({ cost: 0 });
      const found = next(sb, 'match:found');
      await emit(sb, 'match:join', {});
      await found;
      await sleep(100);
      expect(await coins(a)).toBe(30);

      const gift = next(sb, 'match:gift');
      await emit(sa, 'match:gift', { giftId: 'heart' }); // 20 coins → 10 gems + 50% house bonus
      expect((await gift).bonusGems).toBe(5);
      const wb = (await t.http.get('/v1/wallet').set(b.auth).expect(200)).body;
      expect(wb.gems).toBe(15);
      expect(await t.prisma.ledgerEntry.findFirst({ where: { userId: b.id, title: 'Vibe Hour bonus · Heart' } })).toMatchObject({ gems: 5 });
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: b.id } })).xp).toBe(10); // 5 XP × 2
    });
  });

  // ── progress, leaderboards ─────────────────────────────────────────────

  describe('levels, badges and leaderboards', () => {
    it('progress, level-up event, badges on profiles and the level chip', async () => {
      const a = await signUp(t, { name: 'Ayesha' });
      const b = await signUp(t, { name: 'Bilal' });
      await t.prisma.match.create({ data: { userAId: a.id, userBId: b.id } });
      const sa = await online(a);
      await t.http.post('/v1/wallet/check-in').set(a.auth).expect(200);
      expect((await t.http.get('/v1/me/progress').set(a.auth).expect(200)).body).toMatchObject({ level: 1, xp: 5, levelXp: 0, nextLevelXp: 50, weekXp: 5 });

      const up = next(sa, 'progress:level-up');
      await t.app.get(ProgressService).award(a.id, 50, 'like');
      expect(await up).toEqual({ level: 2 });
      const p = (await t.http.get('/v1/me/progress').set(a.auth).expect(200)).body;
      expect(p).toMatchObject({ level: 2, xp: 55, levelXp: 50, nextLevelXp: 150, weekXp: 55 });
      expect(p.badges).toHaveLength(10);
      expect(p.badges[0]).toEqual({ id: 'verified', name: 'Verified', emoji: '✔️', earned: false, progress: 0, target: 1 });

      await t.prisma.user.update({ where: { id: a.id }, data: { verified: true, matchesCount: 12 } });
      const view = (await t.http.get(`/v1/users/${a.id}/view`).set(b.auth).expect(200)).body;
      expect(view).toMatchObject({ tier: 'matched', level: 2, badges: ['verified', 'first_vibes'], profile: { level: 2 } });
      expect((await t.http.get('/v1/me').set(a.auth).expect(200)).body).toMatchObject({ level: 2, xp: 55 });
    });

    it('weekly boards skip bots, banned and deleted people and rank you', async () => {
      const [a, b, c] = [await signUp(t, { name: 'Aa' }), await signUp(t, { name: 'Bb' }), await signUp(t, { name: 'Cc' })];
      const bot = await t.prisma.user.create({ data: { name: 'Bot', isBot: true, inviteCode: 'BOTX1' } });
      const progress = t.app.get(ProgressService);
      await progress.award(a.id, 120, 'like');
      await progress.award(b.id, 60, 'like');
      await progress.award(c.id, 300, 'like');
      await progress.award(bot.id, 500, 'like');
      await t.prisma.user.update({ where: { id: c.id }, data: { bannedUntil: new Date(Date.now() + DAY) } });

      const lb = (await t.http.get('/v1/leaderboards?board=xp').set(b.auth).expect(200)).body;
      expect(lb.board).toBe('xp');
      expect(lb.top.map((r: { rank: number; profile: { id: string }; score: number }) => [r.rank, r.profile.id, r.score])).toEqual([
        [1, a.id, 120],
        [2, b.id, 60],
      ]);
      expect(lb.me).toEqual({ rank: 2, score: 60 });
      expect(new Date(lb.weekStart).getTime()).toBe(clock().weekStart(clock().weekIndex()).getTime());
      expect(new Date(lb.weekEnd).getTime() - new Date(lb.weekStart).getTime()).toBe(7 * DAY);
      expect(new Date(lb.weekStart).getUTCDay()).toBe(0); // Monday 00:00 PKT = Sunday 19:00 UTC
      expect(await t.redis.client.ttl(boardKey('xp', clock().weekIndex()))).toBeGreaterThan(20 * 86_400);

      // Gems board: gems received from gifts this week.
      await t.prisma.match.create({ data: { userAId: a.id, userBId: b.id } });
      await requestFriend(t, a, b);
      await t.http.post(`/v1/friends/${a.id}/accept`).set(b.auth).expect(200);
      await t.http.post(`/v1/friends/${b.id}/gifts`).set(a.auth).send({ giftId: 'heart' }).expect(201);
      const gems = (await t.http.get('/v1/leaderboards?board=gems').set(a.auth).expect(200)).body;
      expect(gems.top).toEqual([expect.objectContaining({ rank: 1, score: 10, profile: expect.objectContaining({ id: b.id }) })]);
      expect(gems.me).toEqual({ rank: null, score: 0 });
      await t.http.get('/v1/leaderboards?board=nope').set(a.auth).expect(400);
    });
  });

  // ── wallet goal, settings, pushes ──────────────────────────────────────

  describe('gem goal', () => {
    it('set/clear via PATCH /me; crossing it on a gift tells you once (push when offline)', async () => {
      const a = await signUp(t, { name: 'Ayesha' });
      const b = await signUp(t, { name: 'Bilal' });
      await makeFriends(a, b);
      await t.prisma.wallet.update({ where: { userId: a.id }, data: { coins: 5000 } });
      await t.http.patch('/v1/me').set(b.auth).send({ gemGoal: 50 }).expect(400);
      expect((await t.http.patch('/v1/me').set(b.auth).send({ gemGoal: 100 }).expect(200)).body.gemGoal).toBe(100);
      expect((await t.http.get('/v1/wallet').set(b.auth).expect(200)).body).toMatchObject({ gemGoal: 100, freeBoosts: 0 });

      const sb = await online(b);
      await t.http.post(`/v1/friends/${b.id}/gifts`).set(a.auth).send({ giftId: 'coffee' }).expect(201); // 25 gems
      const reached = next(sb, 'wallet:goal-reached');
      await t.http.post(`/v1/friends/${b.id}/gifts`).set(a.auth).send({ giftId: 'fireworks' }).expect(201); // 75 total
      await t.http.post(`/v1/friends/${b.id}/gifts`).set(a.auth).send({ giftId: 'fireworks' }).expect(201); // 125 total
      expect(await reached).toEqual({ goal: 100 });
      let twice = false;
      sb.once('wallet:goal-reached', () => (twice = true));
      await t.http.post(`/v1/friends/${b.id}/gifts`).set(a.auth).send({ giftId: 'rose' }).expect(201);
      await sleep(100);
      expect(twice).toBe(false);

      // A new goal, reached while offline → push.
      await t.http.patch('/v1/me').set(b.auth).send({ gemGoal: 300 }).expect(200); // 128 gems now; a crown adds 250
      const token = await addToken(b);
      sb.disconnect();
      await sleep(150);
      await t.http.post(`/v1/friends/${b.id}/gifts`).set(a.auth).send({ giftId: 'crown' }).expect(201);
      await sleep(150);
      expect(pushesTo(token)).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Goal reached 🎯', data: { route: 'wallet' } })]));
      expect((await t.http.patch('/v1/me').set(b.auth).send({ gemGoal: null }).expect(200)).body.gemGoal).toBeNull();
    });
  });

  describe('settings and pushes', () => {
    it('quiet hours, time zone and break reminder are part of the profile', async () => {
      const u = await signUp(t);
      const me = (await t.http.get('/v1/me').set(u.auth).expect(200)).body;
      expect(me).toMatchObject({ quietHoursStart: null, quietHoursEnd: null, tzOffsetMinutes: 300, breakReminderMinutes: null, gemGoal: null, xp: 0, level: 1 });
      const r = await t.http.patch('/v1/me').set(u.auth).send({ quietHoursStart: 22 * 60, quietHoursEnd: 7 * 60, tzOffsetMinutes: 60, breakReminderMinutes: 60 }).expect(200);
      expect(r.body).toMatchObject({ quietHoursStart: 1320, quietHoursEnd: 420, tzOffsetMinutes: 60, breakReminderMinutes: 60 });
      await t.http.patch('/v1/me').set(u.auth).send({ breakReminderMinutes: 45 }).expect(400);
      await t.http.patch('/v1/me').set(u.auth).send({ quietHoursStart: 1440 }).expect(400);
      expect((await t.http.patch('/v1/me').set(u.auth).send({ breakReminderMinutes: null, quietHoursStart: null }).expect(200)).body).toMatchObject({ breakReminderMinutes: null, quietHoursStart: null, quietHoursEnd: 420 });
    });

    it('quiet hours hold back social/engagement/inbox pushes, never messages; reminders are capped per day', async () => {
      const q = await signUp(t, { name: 'Quiet' });
      const other = await signUp(t, { name: 'Sana' });
      await t.prisma.match.create({ data: { userAId: q.id, userBId: other.id } });
      const token = await addToken(q);
      const minute = Math.floor((Date.now() % DAY) / 60_000); // UTC
      await t.http.patch('/v1/me').set(q.auth).send({ tzOffsetMinutes: 0, quietHoursStart: (minute + 1440 - 60) % 1440, quietHoursEnd: (minute + 60) % 1440 }).expect(200);

      await t.http.post(`/v1/follows/${q.id}`).set(other.auth).expect(200);
      await sleep(150);
      expect(pushesTo(token)).toEqual([]);
      const push = t.app.get(PushService);
      expect(await push.sendToUser(q.id, { title: 'x', body: 'y', data: {}, category: 'engagement' })).toBe(0);
      expect(await push.sendToUser(q.id, { title: 'x', body: 'y', data: {}, category: 'inbox' })).toBe(0);
      expect(await push.sendToUser(q.id, { title: 'Sana', body: 'hi', data: {}, category: 'messages' })).toBe(1);
      expect(await push.sendToUser(q.id, { title: 'Paid', body: 'ok', data: {}, category: 'payments' })).toBe(1);

      await t.http.patch('/v1/me').set(q.auth).send({ quietHoursStart: null, quietHoursEnd: null }).expect(200);
      const results = [];
      for (let i = 0; i < 4; i++) results.push(await push.sendToUser(q.id, { title: `r${i}`, body: 'y', data: {}, category: 'engagement' }));
      expect(results).toEqual([1, 1, 1, 0]); // maxEngagementPushesPerDay = 3
      expect(await push.sendToUser(q.id, { title: 'still', body: 'social', data: {}, category: 'social' })).toBe(1);
    });

    it('a follow back says so', async () => {
      const a = await signUp(t, { name: 'Ayesha' });
      const b = await signUp(t, { name: 'Sana' });
      await t.prisma.match.create({ data: { userAId: a.id, userBId: b.id } });
      const tokenA = await addToken(a);
      const tokenB = await addToken(b);
      await t.http.post(`/v1/follows/${b.id}`).set(a.auth).expect(200);
      await sleep(150);
      expect(pushesTo(tokenB)).toEqual([expect.objectContaining({ body: 'Ayesha started following you' })]);
      await t.http.post(`/v1/follows/${a.id}`).set(b.auth).expect(200);
      await sleep(150);
      expect(pushesTo(tokenA)).toEqual([expect.objectContaining({ body: 'Sana followed you back' })]);
    });
  });

  describe('win-back and weekly recap', () => {
    it('people away for a week get one free boost (at most every 60 days) that the boost uses before coins', async () => {
      const w = await signUp(t, { name: 'Away' });
      const fresh = await signUp(t, { name: 'Here' });
      const bot = await t.prisma.user.create({ data: { name: 'Bot', isBot: true, inviteCode: 'BOTWB', lastSeenAt: new Date(Date.now() - 7.5 * DAY) } });
      const token = await addToken(w);
      await t.prisma.user.update({ where: { id: w.id }, data: { lastSeenAt: new Date(Date.now() - 7.5 * DAY) } });
      await t.prisma.user.update({ where: { id: fresh.id }, data: { lastSeenAt: new Date() } });
      const notifier = t.app.get(EngagementNotifier);
      expect(await notifier.winback()).toBe(1);
      expect(await notifier.winback()).toBe(0);
      expect(pushesTo(token)).toEqual([expect.objectContaining({ title: 'We miss you 👋', body: 'A free 30-min boost is waiting for you', category: 'engagement' })]);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: bot.id } })).winbackAt).toBeNull();
      expect((await t.http.get('/v1/wallet').set(w.auth).expect(200)).body.freeBoosts).toBe(1);

      const boost = await t.http.post('/v1/wallet/boost').set(w.auth).expect(200);
      expect(boost.body).toMatchObject({ free: true, paidCoins: 0, wallet: { coins: 30, freeBoosts: 0, boost: { active: true } } });
      const paid = await t.http.post('/v1/wallet/boost').set(fresh.auth).expect(402);
      expect(paid.body.error.code).toBe('INSUFFICIENT_COINS');
    });

    it('GET /me/recap and the Monday inbox message cover last week', async () => {
      const a = await signUp(t, { name: 'Ayesha' });
      const b = await signUp(t, { name: 'Bilal' });
      const idle = await signUp(t, { name: 'Idle' });
      const { from } = t.app.get(RecapService).lastWeek();
      const at = new Date(from.getTime() + 2 * DAY);
      const m = await t.prisma.match.create({ data: { userAId: a.id, userBId: b.id, startedAt: at } });
      await t.prisma.matchLike.create({ data: { matchId: m.id, fromId: b.id, toId: a.id, createdAt: at } });
      await t.prisma.giftTransfer.create({ data: { giftId: 'heart', fromId: b.id, toId: a.id, coins: 20, gems: 10, createdAt: at } });
      await t.prisma.ledgerEntry.create({ data: { userId: a.id, kind: 'GIFT_RECEIVED', title: 'Heart from Bilal', gems: 10, balanceCoins: 30, balanceGems: 10, createdAt: at } });
      await t.prisma.follow.create({ data: { followerId: b.id, followeeId: a.id, status: 'ACTIVE', acceptedAt: at } });
      // This week's activity is not part of last week's recap.
      await t.prisma.matchLike.create({ data: { matchId: (await t.prisma.match.create({ data: { userAId: a.id, userBId: idle.id } })).id, fromId: idle.id, toId: a.id } });
      await t.prisma.user.updateMany({ where: { id: { in: [a.id, b.id, idle.id] } }, data: { lastSeenAt: new Date() } });

      const recap = (await t.http.get('/v1/me/recap').set(a.auth).expect(200)).body;
      expect(recap).toEqual({ weekStart: from.toISOString(), weekEnd: new Date(from.getTime() + 7 * DAY).toISOString(), gemsEarned: 10, giftsReceived: 1, likesReceived: 1, newFollowers: 1, matches: 1, bestStreak: 0 });

      const token = await addToken(a);
      expect(await t.app.get(EngagementNotifier).weeklyRecap()).toBe(1); // b and idle received nothing last week
      expect(await t.app.get(EngagementNotifier).weeklyRecap()).toBe(0);
      const inbox = (await t.http.get('/v1/inbox').set(a.auth).expect(200)).body;
      expect(inbox.items[0]).toMatchObject({ title: 'Your week on Vibe', read: false });
      expect(inbox.items[0].body).toContain('💖 1 like');
      expect(pushesTo(token)).toEqual([expect.objectContaining({ title: 'Your week on Vibe ✨', category: 'engagement' })]);
    });
  });
});
