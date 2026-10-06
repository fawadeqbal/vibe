import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { AffiliateStatus, LedgerKind, Prisma, Referral, ReferralStatus, UserStatus } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock, MS } from '../../common/utils/clock';
import { sha256 } from '../../common/utils/crypto';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { EconomyService } from '../catalog/economy.service';
import { MATCH_ENDED, MatchEndedEvent } from '../matching/matching.service';
import { GOOD_CALL_SECONDS } from '../matching/match-rules';
import { VipService } from '../payments/vip.service';
import { USER_ONBOARDED, USER_SIGNED_UP, USER_VERIFIED, UserOnboardedEvent, UserSignedUpEvent, UserVerifiedEvent } from '../users/profile.rules';
import { firstName, PROFILE_INCLUDE, PublicProfile, REFERRAL_CLAIM_WINDOW_MS, toPublicProfile } from '../users/user.mapper';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { AffiliatesService } from './affiliates.service';
import { activationSteps, ActivationSteps, DIRECT_CHANNEL, fraudReason, inviteLink, isQualified, milestoneKey, milestonesReached, milestoneTrack, normalizeChannel, normalizeCode, ReferralSource, SAME_DEVICE_WINDOW_DAYS, sourceOf } from './referral-rules';

/** What a code points at. Partner codes resolve while the partner is active or suspended. */
export type ResolvedCode =
  | { kind: 'user'; code: string; inviterId: string; name: string; avatarUrl: string; deviceHash: string | null }
  | { kind: 'affiliate'; code: string; affiliateId: string; userId: string; name: string; avatarUrl: string; deviceHash: string | null };

/** One invited person, as the inviter sees them (GET /referrals `people`, `referral:updated`). */
export interface ReferralPerson {
  id: string;
  profile: PublicProfile;
  status: ReferralStatus;
  rejectReason: string | null;
  steps: ActivationSteps;
  coins: number;
  createdAt: string;
  qualifiedAt: string | null;
  rewardedAt: string | null;
}

type InviteeRow = Prisma.UserGetPayload<{ include: typeof PROFILE_INCLUDE }>;

const PEOPLE = 50;
const REWARD_BATCH = 200;
const MAX_REWARD_PAGES = 25;

/**
 * Referrals v2: attribution at sign-up (or a late claim within 48 h), fraud
 * checks, activation (verified + real calls), a hold, then coins to both
 * sides, milestones for big inviters. Partner (affiliate) referrals share
 * the pipeline; their money is in AffiliatesService.
 */
@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly economy: EconomyService,
    private readonly config: AppConfig,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
    private readonly vip: VipService,
    private readonly affiliates: AffiliatesService,
  ) {}

  link(code: string, channel?: string | null): string {
    return inviteLink(this.config.get('INVITE_LINK_BASE'), code, channel);
  }

  // ── codes ─────────────────────────────────────────────────────────────────

  async resolveCode(raw: string | null | undefined): Promise<ResolvedCode | null> {
    const code = normalizeCode(raw);
    if (!code) return null;
    const partner = await this.prisma.affiliate.findUnique({ where: { code }, include: { user: { select: { status: true, avatarUrl: true, signupDeviceHash: true } } } });
    if (partner && (partner.status === AffiliateStatus.ACTIVE || partner.status === AffiliateStatus.SUSPENDED) && partner.user.status === UserStatus.ACTIVE) {
      return { kind: 'affiliate', code, affiliateId: partner.id, userId: partner.userId, name: partner.displayName, avatarUrl: partner.user.avatarUrl, deviceHash: partner.user.signupDeviceHash };
    }
    const user = await this.prisma.user.findUnique({ where: { inviteCode: code }, select: { id: true, name: true, avatarUrl: true, status: true, isBot: true, signupDeviceHash: true } });
    if (user && user.status === UserStatus.ACTIVE && !user.isBot) return { kind: 'user', code, inviterId: user.id, name: firstName(user.name), avatarUrl: user.avatarUrl, deviceHash: user.signupDeviceHash };
    return null;
  }

  /** The landing page: who invited you (first name + photo only) and what you get. Counts a click (once per IP per hour). */
  async preview(rawCode: string, rawChannel: string | undefined, ip: string | undefined) {
    const resolved = await this.resolveCode(rawCode);
    if (resolved) await this.countClick(resolved.code, normalizeChannel(rawChannel) ?? DIRECT_CHANNEL, ip).catch((e: Error) => this.logger.warn(`click count failed: ${e.message}`));
    return {
      valid: !!resolved,
      kind: resolved?.kind ?? null,
      name: resolved?.name || null,
      avatarUrl: resolved?.avatarUrl || null,
      inviteeCoins: this.economy.rules.inviteeRewardCoins,
    };
  }

  private async countClick(code: string, channel: string, ip: string | undefined): Promise<void> {
    const hour = Math.floor(this.clock.now().getTime() / MS.hour);
    const who = sha256(`${ip ?? 'unknown'}`).slice(0, 16);
    if ((await this.redis.client.set(`ref:click:${code}:${channel}:${who}:${hour}`, '1', 'EX', 3600, 'NX')) !== 'OK') return;
    const day = this.clock.dayOf();
    await this.prisma.$executeRaw`
      INSERT INTO "ReferralClick" ("code", "channel", "day", "clicks") VALUES (${code}, ${channel}, ${day}, 1)
      ON CONFLICT ("code", "channel", "day") DO UPDATE SET "clicks" = "ReferralClick"."clicks" + 1`;
  }

  // ── attribution ───────────────────────────────────────────────────────────

  /** A new account that arrived with a code (OTP or social sign-up). An unknown code is ignored. */
  @OnEvent(USER_SIGNED_UP, { async: true, promisify: true })
  async onSignedUp(e: UserSignedUpEvent): Promise<void> {
    if (!e.inviteCode) return;
    try {
      const resolved = await this.resolveCode(e.inviteCode);
      if (!resolved) return;
      await this.attribute(e.userId, resolved, { source: sourceOf(e.inviteVia), channel: normalizeChannel(e.inviteSource), ip: e.ip });
    } catch (err) {
      this.logger.error(`referral attribution for ${e.userId} failed: ${(err as Error).message}`);
    }
  }

  /** "Have an invite code?" — once, within 48 h of sign-up, not your own. */
  async claim(userId: string, rawCode: string, ip?: string) {
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, createdAt: true, status: true, referralGot: { select: { id: true } } } });
    if (!me || me.status !== UserStatus.ACTIVE) throw AppError.notFound('User');
    if (me.referralGot) throw AppError.conflict('You already joined with an invite', ErrorCode.INVITE_ALREADY_USED);
    if (this.clock.now().getTime() - me.createdAt.getTime() > REFERRAL_CLAIM_WINDOW_MS) throw AppError.conflict('Invite codes can be added within 48 hours of signing up', ErrorCode.INVITE_TOO_LATE);
    const resolved = await this.resolveCode(rawCode);
    if (!resolved) throw new AppError(ErrorCode.INVITE_CODE_INVALID, 'We could not find that code', HttpStatus.NOT_FOUND);
    const owner = resolved.kind === 'user' ? resolved.inviterId : resolved.userId;
    if (owner === userId) throw new AppError(ErrorCode.INVITE_SELF, "That's your own code", HttpStatus.FORBIDDEN);
    // No invite loops: you can't claim the code of someone you invited.
    const loop = await this.prisma.referral.findFirst({ where: { inviteeId: owner, inviterId: userId }, select: { id: true } });
    if (loop) throw new AppError(ErrorCode.INVITE_SELF, 'You invited them', HttpStatus.FORBIDDEN);
    const ref = await this.attribute(userId, resolved, { source: 'code', channel: null, ip });
    if (!ref) throw AppError.conflict('You already joined with an invite', ErrorCode.INVITE_ALREADY_USED);
    return { id: ref.id, status: ref.status, rejectReason: ref.rejectReason, inviter: { name: resolved.name }, kind: resolved.kind, inviteeCoins: this.economy.rules.inviteeRewardCoins };
  }

  /** Creates the referral (fraud-checked), keeps `User.invitedById` in sync, tells the inviter, and checks activation at once. */
  private async attribute(inviteeId: string, r: ResolvedCode, meta: { source: ReferralSource; channel: string | null; ip?: string }): Promise<Referral | null> {
    const invitee = await this.prisma.user.findUniqueOrThrow({ where: { id: inviteeId }, select: { isBot: true, signupDeviceHash: true, name: true } });
    const since = new Date(this.clock.now().getTime() - SAME_DEVICE_WINDOW_DAYS * MS.day);
    const sameDeviceRecent = invitee.signupDeviceHash ? await this.prisma.referral.count({ where: { deviceHash: invitee.signupDeviceHash, createdAt: { gte: since } } }) : 0;
    const reason = fraudReason({ inviteeIsBot: invitee.isBot, inviteeDevice: invitee.signupDeviceHash, inviterDevice: r.deviceHash, sameDeviceRecent });
    let ref: Referral;
    try {
      ref = await this.prisma.tx(async (tx) => {
        const created = await tx.referral.create({
          data: {
            inviterId: r.kind === 'user' ? r.inviterId : null,
            affiliateId: r.kind === 'affiliate' ? r.affiliateId : null,
            inviteeId,
            code: r.code,
            source: meta.source,
            channel: meta.channel,
            status: reason ? ReferralStatus.REJECTED : ReferralStatus.PENDING,
            rejectReason: reason,
            deviceHash: invitee.signupDeviceHash,
            ip: meta.ip?.slice(0, 64),
            createdAt: this.clock.now(),
          },
        });
        if (r.kind === 'user') await tx.user.update({ where: { id: inviteeId }, data: { invitedById: r.inviterId } });
        return created;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null;
      throw e;
    }
    if (ref.status === ReferralStatus.PENDING) {
      // OTP sign-ups have no name yet: "<name> joined" waits for profile setup.
      if (invitee.name.trim()) await this.notifyJoined(ref.id);
      await this.evaluate(inviteeId);
    }
    return this.prisma.referral.findUniqueOrThrow({ where: { id: ref.id } });
  }

  /** "<name> joined Vibe with your invite" — once per referral. */
  private async notifyJoined(id: string): Promise<void> {
    if ((await this.redis.client.set(`ref:joined:${id}`, '1', 'EX', 30 * 86_400, 'NX')) !== 'OK') return;
    await this.notifyInviter(id, 'joined');
  }

  @OnEvent(USER_ONBOARDED, { async: true, promisify: true })
  async onOnboarded(e: UserOnboardedEvent): Promise<void> {
    try {
      const ref = await this.prisma.referral.findUnique({ where: { inviteeId: e.userId }, select: { id: true, inviterId: true, status: true } });
      if (ref?.inviterId && ref.status !== ReferralStatus.REJECTED) await this.notifyJoined(ref.id);
    } catch (err) {
      this.logger.warn(`referral joined notice failed: ${(err as Error).message}`);
    }
  }

  // ── activation ────────────────────────────────────────────────────────────

  /** PENDING → QUALIFIED once the invitee is active. Safe to call any time. */
  async evaluate(inviteeId: string): Promise<boolean> {
    const ref = await this.prisma.referral.findUnique({ where: { inviteeId }, include: { invitee: { select: { verified: true, goodCallsCount: true, status: true, bannedUntil: true } } } });
    if (!ref || ref.status !== ReferralStatus.PENDING) return false;
    const u = ref.invitee;
    const ok = isQualified({ verified: u.verified, goodCallsCount: u.goodCallsCount, active: u.status === UserStatus.ACTIVE, banned: !!u.bannedUntil && u.bannedUntil > this.clock.now() }, this.economy.rules);
    if (!ok) return false;
    const moved = await this.prisma.referral.updateMany({ where: { id: ref.id, status: ReferralStatus.PENDING }, data: { status: ReferralStatus.QUALIFIED, qualifiedAt: this.clock.now() } });
    if (moved.count === 0) return false;
    if (ref.affiliateId) await this.affiliates.onQualified(ref).catch((e: Error) => this.logger.error(`CPA for ${ref.id} failed: ${e.message}`));
    await this.notifyInviter(ref.id, 'qualified');
    return true;
  }

  @OnEvent(USER_VERIFIED, { async: true, promisify: true })
  async onVerified(e: UserVerifiedEvent): Promise<void> {
    await this.evaluate(e.userId).catch((err: Error) => this.logger.warn(`referral check failed: ${err.message}`));
  }

  /** Good calls are counted before MATCH_ENDED goes out. */
  @OnEvent(MATCH_ENDED, { async: true, promisify: true })
  async onMatchEnded(e: MatchEndedEvent): Promise<void> {
    if (e.durationSeconds < GOOD_CALL_SECONDS) return;
    for (const id of [e.a, e.b]) await this.evaluate(id).catch((err: Error) => this.logger.warn(`referral check failed: ${err.message}`));
  }

  // ── rewards ───────────────────────────────────────────────────────────────

  /** QUALIFIED referrals whose hold is over get paid (in order; daily caps leave the rest for tomorrow). */
  async rewardDue(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - this.economy.rules.referralHoldHours * MS.hour);
    // Inviters at today's cap are skipped for the rest of the run, so one big inviter can't starve the queue.
    const capped = new Set<string>();
    let paid = 0;
    let cursor: string | undefined;
    for (let page = 0; page < MAX_REWARD_PAGES; page++) {
      const due = await this.prisma.referral.findMany({
        where: { status: ReferralStatus.QUALIFIED, qualifiedAt: { lte: cutoff } },
        orderBy: [{ qualifiedAt: 'asc' }, { id: 'asc' }],
        take: REWARD_BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true, inviterId: true },
      });
      for (const r of due) {
        if (r.inviterId && capped.has(r.inviterId)) continue;
        try {
          const out = await this.reward(r.id);
          if (out === 'paid') paid++;
          else if (out === 'capped' && r.inviterId) capped.add(r.inviterId);
        } catch (e) {
          this.logger.error(`referral reward ${r.id} failed: ${(e as Error).message}`);
        }
      }
      if (due.length < REWARD_BATCH) break;
      cursor = due[due.length - 1].id;
    }
    return paid;
  }

  /** Tests call `rewardDue` directly (controlled clock). */
  @Interval(MS.minute)
  async scheduled(): Promise<void> {
    if (this.config.isTest) return;
    await this.redis.withLock('referrals-reward', 55_000, async () => {
      try {
        await this.rewardDue();
      } catch (e) {
        this.logger.error(`referral rewards failed: ${(e as Error).message}`);
      }
    });
  }

  /** Pays one referral: both sides (partner referrals: only the new user), then milestones. */
  async reward(id: string): Promise<'paid' | 'capped' | 'waiting' | 'skipped'> {
    const r = await this.prisma.referral.findUnique({
      where: { id },
      include: { invitee: { select: { id: true, name: true, status: true, bannedUntil: true } }, inviter: { select: { id: true, name: true, status: true } }, affiliate: { select: { displayName: true } } },
    });
    if (!r || r.status !== ReferralStatus.QUALIFIED) return 'skipped';
    const now = this.clock.now();
    if (r.invitee.status !== UserStatus.ACTIVE) {
      await this.setRejected(r.id, [ReferralStatus.QUALIFIED], 'invitee_deleted');
      return 'skipped';
    }
    if (r.invitee.bannedUntil && r.invitee.bannedUntil > now) return 'waiting'; // wait until the ban is over
    const rules = this.economy.rules;
    const inviter = r.inviter && r.inviter.status === UserStatus.ACTIVE ? r.inviter : null;
    if (inviter) {
      const today = await this.prisma.referral.count({ where: { inviterId: inviter.id, status: ReferralStatus.REWARDED, rewardedAt: { gte: this.clock.startOfDay(now) } } });
      if (today >= rules.maxReferralRewardsPerDay) return 'capped';
    }
    const inviterCoins = inviter ? rules.inviteRewardCoins : 0;
    const inviteeCoins = rules.inviteeRewardCoins;
    const fromName = r.affiliate?.displayName || firstName(r.inviter?.name ?? '') || 'a friend';
    const done = await this.prisma.tx(async (tx) => {
      const claimed = await tx.referral.updateMany({ where: { id, status: ReferralStatus.QUALIFIED }, data: { status: ReferralStatus.REWARDED, rewardedAt: now, inviterCoins, inviteeCoins } });
      if (claimed.count === 0) return null;
      if (inviter && inviterCoins > 0) await this.ledger.move(inviter.id, { coins: inviterCoins, kind: LedgerKind.EARN, title: `Invited ${firstName(r.invitee.name) || 'a friend'}`, reference: id, idempotencyKey: `referral:${id}:inviter` }, { tx });
      if (inviteeCoins > 0) await this.ledger.move(r.inviteeId, { coins: inviteeCoins, kind: LedgerKind.EARN, title: `Welcome bonus from ${fromName}`, reference: id, idempotencyKey: `referral:${id}:invitee` }, { tx });
      const granted: { index: number; count: number; reward: { kind: 'vip' | 'coins'; amount: number } }[] = [];
      if (inviter) {
        const { referralsRewarded } = await tx.user.update({ where: { id: inviter.id }, data: { referralsRewarded: { increment: 1 } }, select: { referralsRewarded: true } });
        for (const m of milestonesReached(rules, referralsRewarded)) {
          const key = milestoneKey(m.index);
          if (await tx.ledgerEntry.findUnique({ where: { userId_idempotencyKey: { userId: inviter.id, idempotencyKey: key } }, select: { id: true } })) continue;
          if (m.reward.kind === 'vip') await this.vip.grant(inviter.id, m.reward.amount, `referral milestone ${m.index}`, { tx, title: `VIP ${m.reward.amount} days · ${m.count} friends joined`, idempotencyKey: key });
          else await this.ledger.move(inviter.id, { coins: m.reward.amount, kind: LedgerKind.EARN, title: `Invite milestone · ${m.count} friends`, idempotencyKey: key }, { tx });
          granted.push(m);
        }
      }
      return { granted };
    });
    if (!done) return 'skipped';
    this.wallet.changed([r.inviteeId, ...(inviter ? [inviter.id] : [])]);
    if (inviter) {
      await this.notifyInviter(id, 'rewarded');
      for (const m of done.granted) this.realtime.toUser(inviter.id, ServerEvent.ReferralMilestone, { index: m.index, count: m.count, reward: m.reward });
    }
    return 'paid';
  }

  private async setRejected(id: string, from: ReferralStatus[], reason: string): Promise<boolean> {
    const moved = await this.prisma.referral.updateMany({ where: { id, status: { in: from } }, data: { status: ReferralStatus.REJECTED, rejectReason: reason.slice(0, 120) } });
    if (moved.count) await this.affiliates.reverseReferral(id);
    return moved.count > 0;
  }

  // ── the inviter's view ────────────────────────────────────────────────────

  private personView(r: Referral & { invitee: InviteeRow }): ReferralPerson {
    const now = this.clock.now();
    return {
      id: r.id,
      profile: toPublicProfile(r.invitee, now),
      status: r.status,
      rejectReason: r.rejectReason,
      steps: activationSteps(r.invitee, this.economy.rules),
      coins: r.inviterCoins,
      createdAt: r.createdAt.toISOString(),
      qualifiedAt: r.qualifiedAt?.toISOString() ?? null,
      rewardedAt: r.rewardedAt?.toISOString() ?? null,
    };
  }

  /** `referral:updated` to the inviter (user referrals only); offline → push. */
  private async notifyInviter(id: string, event: 'joined' | 'qualified' | 'rewarded' | 'rejected'): Promise<void> {
    try {
      const r = await this.prisma.referral.findUnique({ where: { id }, include: { invitee: { include: PROFILE_INCLUDE } } });
      if (!r?.inviterId) return;
      this.realtime.toUser(r.inviterId, ServerEvent.ReferralUpdated, { referral: this.personView(r), event, coins: r.inviterCoins });
    } catch (e) {
      this.logger.warn(`referral notify failed: ${(e as Error).message}`);
    }
  }

  /** GET /referrals: my code and link, the rewards, totals, milestones and the people I invited. */
  async overview(userId: string) {
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { inviteCode: true, referralsRewarded: true, affiliate: { select: { code: true, status: true } } } });
    if (!me) throw AppError.notFound('User');
    const rules = this.economy.rules;
    const [groups, earned, people] = await Promise.all([
      this.prisma.referral.groupBy({ by: ['status'], where: { inviterId: userId }, _count: { _all: true } }),
      this.prisma.referral.aggregate({ where: { inviterId: userId }, _sum: { inviterCoins: true } }),
      this.prisma.referral.findMany({ where: { inviterId: userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: PEOPLE, include: { invitee: { include: PROFILE_INCLUDE } } }),
    ]);
    const n = (s: ReferralStatus) => groups.find((g) => g.status === s)?._count._all ?? 0;
    return {
      code: me.inviteCode,
      link: this.link(me.inviteCode),
      rewards: { inviterCoins: rules.inviteRewardCoins, inviteeCoins: rules.inviteeRewardCoins, activationCalls: rules.referralActivationCalls, requireVerified: rules.referralRequireVerified === 1, holdHours: rules.referralHoldHours },
      stats: {
        joined: groups.reduce((s, g) => s + g._count._all, 0),
        pending: n(ReferralStatus.PENDING) + n(ReferralStatus.QUALIFIED),
        rewarded: n(ReferralStatus.REWARDED),
        rejected: n(ReferralStatus.REJECTED),
        coinsEarned: earned._sum.inviterCoins ?? 0,
      },
      ...milestoneTrack(rules, me.referralsRewarded),
      people: people.map((r) => this.personView(r)),
      affiliate: me.affiliate?.status === AffiliateStatus.ACTIVE ? { code: me.affiliate.code, link: this.link(me.affiliate.code) } : null,
    };
  }

  // ── staff ─────────────────────────────────────────────────────────────────

  async adminList(q: { status?: ReferralStatus[]; q?: string; kind?: 'user' | 'affiliate'; affiliateId?: string; cursor?: string; limit: number }) {
    const term = q.q?.trim();
    const where: Prisma.ReferralWhereInput = {
      status: q.status?.length ? { in: q.status } : undefined,
      affiliateId: q.affiliateId ?? (q.kind === 'affiliate' ? { not: null } : q.kind === 'user' ? null : undefined),
      ...(term
        ? {
            OR: [
              { code: term.toUpperCase() },
              { id: term },
              { inviteeId: term },
              { inviterId: term },
              { invitee: { name: { contains: term, mode: 'insensitive' } } },
              { inviter: { name: { contains: term, mode: 'insensitive' } } },
              { invitee: { email: { contains: term.toLowerCase() } } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.referral.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { invitee: { select: PERSON }, inviter: { select: PERSON }, affiliate: { select: { id: true, code: true, displayName: true } } },
      take: q.limit + 1,
      ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
    });
    const hasMore = rows.length > q.limit;
    const slice = hasMore ? rows.slice(0, q.limit) : rows;
    return { items: slice.map((r) => this.adminView(r)), nextCursor: hasMore ? slice[slice.length - 1].id : null };
  }

  private adminView(r: Referral & { invitee: PersonRow; inviter: PersonRow | null; affiliate: { id: string; code: string; displayName: string } | null }) {
    return {
      id: r.id,
      code: r.code,
      kind: r.affiliateId ? ('affiliate' as const) : ('user' as const),
      source: r.source,
      channel: r.channel,
      status: r.status,
      rejectReason: r.rejectReason,
      inviterCoins: r.inviterCoins,
      inviteeCoins: r.inviteeCoins,
      device: r.deviceHash ? r.deviceHash.slice(0, 8) : null,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
      qualifiedAt: r.qualifiedAt?.toISOString() ?? null,
      rewardedAt: r.rewardedAt?.toISOString() ?? null,
      invitee: r.invitee,
      inviter: r.inviter,
      affiliate: r.affiliate,
      steps: activationSteps(r.invitee, this.economy.rules),
    };
  }

  private async adminOne(id: string) {
    const r = await this.prisma.referral.findUnique({ where: { id }, include: { invitee: { select: PERSON }, inviter: { select: PERSON }, affiliate: { select: { id: true, code: true, displayName: true } } } });
    if (!r) throw AppError.notFound('Referral');
    return this.adminView(r);
  }

  /** "Approve anyway": REJECTED → PENDING, then checked again (it may qualify at once). */
  async approve(id: string) {
    const moved = await this.prisma.referral.updateMany({ where: { id, status: ReferralStatus.REJECTED }, data: { status: ReferralStatus.PENDING, rejectReason: null, qualifiedAt: null } });
    if (moved.count === 0) {
      await this.adminOne(id);
      throw AppError.conflict('Only rejected referrals can be approved');
    }
    const r = await this.prisma.referral.findUniqueOrThrow({ where: { id } });
    await this.evaluate(r.inviteeId);
    return this.adminOne(id);
  }

  /** PENDING/QUALIFIED → REJECTED (nothing is paid; a partner's commissions for it are taken back). */
  async reject(id: string, reason: string) {
    if (!(await this.setRejected(id, [ReferralStatus.PENDING, ReferralStatus.QUALIFIED], `staff: ${reason}`))) {
      await this.adminOne(id);
      throw AppError.conflict('Only pending or qualified referrals can be rejected');
    }
    await this.notifyInviter(id, 'rejected');
    return this.adminOne(id);
  }

  /** User page "Referrals": who invited them, who they invited, their partner account. */
  async forUser(userId: string) {
    const [got, made, total, affiliate] = await Promise.all([
      this.prisma.referral.findUnique({ where: { inviteeId: userId }, include: { invitee: { select: PERSON }, inviter: { select: PERSON }, affiliate: { select: { id: true, code: true, displayName: true } } } }),
      this.prisma.referral.findMany({ where: { inviterId: userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: PEOPLE, include: { invitee: { select: PERSON }, inviter: { select: PERSON }, affiliate: { select: { id: true, code: true, displayName: true } } } }),
      this.prisma.referral.groupBy({ by: ['status'], where: { inviterId: userId }, _count: { _all: true } }),
      this.prisma.affiliate.findUnique({ where: { userId }, select: { id: true, code: true, status: true, displayName: true } }),
    ]);
    return {
      invitedBy: got ? this.adminView(got) : null,
      invited: { counts: Object.fromEntries(total.map((g) => [g.status, g._count._all])), items: made.map((r) => this.adminView(r)) },
      affiliate,
    };
  }
}

const PERSON = { id: true, name: true, avatarUrl: true, verified: true, goodCallsCount: true, status: true } as const;
type PersonRow = { id: string; name: string; avatarUrl: string; verified: boolean; goodCallsCount: number; status: UserStatus };
