import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { Affiliate, AffiliateCommission, AffiliateCommissionKind, AffiliateCommissionStatus, AffiliatePayout, AffiliatePayoutStatus, AffiliateStatus, Prisma, PurchaseStatus, ReferralStatus, UserStatus } from '@prisma/client';

import { cursorArgs, CursorQueryDto, toPage } from '../../common/dto/pagination.dto';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock, MS } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { EconomyService } from '../catalog/economy.service';
import { PURCHASE_REFUNDED, PURCHASE_SUCCEEDED, PurchaseEvent } from '../payments/payment.events';
import { SettingsService } from '../settings/settings.service';
import { firstName } from '../users/user.mapper';
import { PayoutAccountsService } from '../wallet/payouts/payout-accounts.service';
import { AffiliateFlag, affiliateFlags, balanceOf, DIRECT_CHANNEL, hasSevereFlag, inviteLink, normalizeCode, partnerCodeProblem, payoutAllowed, revShare, termsOf, toPkr, withinCommissionWindow } from './referral-rules';

export interface AffiliateChannel {
  platform: string;
  url: string;
  followers: number;
}

export interface ApplyInput {
  displayName: string;
  code: string;
  channels: AffiliateChannel[];
  note?: string;
}

export interface TermsInput {
  code?: string;
  displayName?: string;
  /** null = back to the economy default. */
  revSharePercent?: number | null;
  cpaUsdCents?: number | null;
  staffNote?: string | null;
}

export interface StatsDay {
  day: string;
  clicks: number;
  signups: number;
  qualified: number;
  revenueUsdCents: number;
  earnedUsdCents: number;
}

const OPEN_COMMISSION: AffiliateCommissionStatus[] = [AffiliateCommissionStatus.PENDING, AffiliateCommissionStatus.AVAILABLE, AffiliateCommissionStatus.HELD];
const EARNING: AffiliateStatus[] = [AffiliateStatus.ACTIVE, AffiliateStatus.SUSPENDED];
const DAY_MS = MS.day;

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/**
 * Creator partners: applications, the partner dashboard (balance, stats,
 * commissions), payouts, and the commission engine (rev-share on purchases
 * by people they brought, a fixed amount per active user, refunds taken
 * back). Commissions are USD cents; they wait `affiliateHoldDays` before
 * they can be paid out, and staff pay payouts by hand.
 */
@Injectable()
export class AffiliatesService {
  private readonly logger = new Logger(AffiliatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly economy: EconomyService,
    private readonly config: AppConfig,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly settings: SettingsService,
    private readonly accounts: PayoutAccountsService,
  ) {}

  link(code: string, channel?: string | null): string {
    return inviteLink(this.config.get('INVITE_LINK_BASE'), code, channel);
  }

  // ── codes ─────────────────────────────────────────────────────────────────

  /** Partner codes share one namespace with every user's invite code. */
  async codeAvailable(raw: string, exceptAffiliateId?: string): Promise<{ code: string | null; available: boolean; reason: 'invalid' | 'reserved' | 'taken' | null }> {
    const problem = partnerCodeProblem(raw);
    const code = normalizeCode(raw);
    if (problem || !code) return { code, available: false, reason: problem ?? 'invalid' };
    const [partner, user] = await Promise.all([this.prisma.affiliate.findUnique({ where: { code }, select: { id: true } }), this.prisma.user.findUnique({ where: { inviteCode: code }, select: { id: true } })]);
    const taken = (!!partner && partner.id !== exceptAffiliateId) || !!user;
    return { code, available: !taken, reason: taken ? 'taken' : null };
  }

  private async claimableCode(raw: string, exceptAffiliateId?: string): Promise<string> {
    const r = await this.codeAvailable(raw, exceptAffiliateId);
    if (!r.available || !r.code) {
      const msg = r.reason === 'invalid' ? 'Codes are 3–20 letters, digits or _' : r.reason === 'reserved' ? 'That code is reserved' : 'That code is taken';
      throw AppError.conflict(msg, ErrorCode.AFFILIATE_CODE_TAKEN, { reason: r.reason });
    }
    return r.code;
  }

  // ── the partner ───────────────────────────────────────────────────────────

  async apply(userId: string, input: ApplyInput) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { verified: true, status: true } });
    if (!user || user.status !== UserStatus.ACTIVE) throw AppError.notFound('User');
    if (!user.verified) throw new AppError(ErrorCode.VERIFICATION_REQUIRED, 'Verify your profile (selfie) before applying', HttpStatus.FORBIDDEN);
    if (await this.prisma.affiliate.findUnique({ where: { userId }, select: { id: true } })) throw AppError.conflict('You already applied', ErrorCode.AFFILIATE_EXISTS);
    const code = await this.claimableCode(input.code);
    try {
      await this.prisma.affiliate.create({
        data: { userId, code, displayName: input.displayName.trim(), channels: input.channels as unknown as Prisma.InputJsonValue, note: input.note?.trim() ?? '', appliedAt: this.clock.now() },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw AppError.conflict('That code is taken, or you already applied', ErrorCode.AFFILIATE_CODE_TAKEN);
      throw e;
    }
    return this.overview(userId);
  }

  private terms(a: Affiliate) {
    const r = this.economy.rules;
    return {
      ...termsOf(a, r),
      commissionMonths: r.affiliateCommissionMonths,
      holdDays: r.affiliateHoldDays,
      minPayoutUsdCents: r.affiliateMinPayoutUsdCents,
    };
  }

  async overview(userId: string) {
    const a = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (!a) return { status: 'none' as const };
    await this.releaseDue(a.id);
    const [balance, openPayout] = await Promise.all([this.balance(a.id), this.prisma.affiliatePayout.findFirst({ where: { affiliateId: a.id, status: AffiliatePayoutStatus.REQUESTED } })]);
    return {
      status: a.status,
      affiliate: { code: a.code, displayName: a.displayName, link: this.link(a.code), ...this.terms(a), appliedAt: a.appliedAt.toISOString(), decisionReason: a.decisionReason },
      balance,
      openPayout: openPayout ? this.payoutView(openPayout) : null,
    };
  }

  /** pending (incl. held) · available · requested (in an open payout) · paid out. */
  async balance(affiliateId: string) {
    const [groups, paid] = await Promise.all([
      this.prisma.affiliateCommission.groupBy({ by: ['status'], where: { affiliateId }, _sum: { usdCents: true } }),
      this.prisma.affiliatePayout.aggregate({ where: { affiliateId, status: AffiliatePayoutStatus.PAID }, _sum: { usdCents: true } }),
    ]);
    const b = balanceOf(groups.map((g) => ({ status: g.status, usdCents: g._sum.usdCents ?? 0 })));
    const paidOut = paid._sum.usdCents ?? 0;
    return { pendingUsdCents: b.pendingUsdCents, availableUsdCents: b.availableUsdCents, requestedUsdCents: b.paidUsdCents - paidOut, paidUsdCents: paidOut };
  }

  private async mine(userId: string): Promise<Affiliate> {
    const a = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (!a) throw new AppError(ErrorCode.AFFILIATE_NOT_ACTIVE, 'You are not a creator partner yet', HttpStatus.FORBIDDEN);
    return a;
  }

  async stats(userId: string, days: number) {
    return this.statsFor(await this.mine(userId), days);
  }

  /** Clicks, sign-ups, active users, revenue and earnings over the last `days` business days (today included). */
  async statsFor(a: Pick<Affiliate, 'id' | 'code'>, days: number) {
    const today = this.clock.dayIndex();
    const first = today - days + 1;
    const start = this.clock.dayStart(first);
    const label = (dayIndex: number) => new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);
    const [clicks, signups, qualified, commissions, purchases] = await Promise.all([
      this.prisma.referralClick.findMany({ where: { code: a.code, day: { gte: new Date(first * DAY_MS) } } }),
      this.prisma.referral.findMany({ where: { affiliateId: a.id, createdAt: { gte: start } }, select: { createdAt: true, channel: true } }),
      this.prisma.referral.findMany({ where: { affiliateId: a.id, qualifiedAt: { gte: start } }, select: { qualifiedAt: true, channel: true } }),
      this.prisma.affiliateCommission.findMany({ where: { affiliateId: a.id, createdAt: { gte: start }, status: { not: AffiliateCommissionStatus.REVERSED } }, select: { createdAt: true, usdCents: true, referral: { select: { channel: true } } } }),
      this.prisma.purchase.findMany({ where: { status: PurchaseStatus.SUCCEEDED, completedAt: { gte: start }, user: { referralGot: { affiliateId: a.id } } }, select: { userId: true, usdCents: true, completedAt: true } }),
    ]);
    const daily = new Map<string, StatsDay>();
    for (let d = first; d <= today; d++) daily.set(label(d), { day: label(d), clicks: 0, signups: 0, qualified: 0, revenueUsdCents: 0, earnedUsdCents: 0 });
    const bump = (at: Date | null, key: Exclude<keyof StatsDay, 'day'>, n: number) => {
      const row = at && daily.get(label(this.clock.dayIndex(at)));
      if (row) row[key] += n;
    };
    const channels = new Map<string, { channel: string; clicks: number; signups: number; qualified: number; earnedUsdCents: number }>();
    const ch = (c: string | null) => {
      const key = c || DIRECT_CHANNEL;
      let row = channels.get(key);
      if (!row) channels.set(key, (row = { channel: key, clicks: 0, signups: 0, qualified: 0, earnedUsdCents: 0 }));
      return row;
    };
    for (const c of clicks) {
      const row = daily.get(c.day.toISOString().slice(0, 10));
      if (row) row.clicks += c.clicks;
      ch(c.channel).clicks += c.clicks;
    }
    for (const r of signups) {
      bump(r.createdAt, 'signups', 1);
      ch(r.channel).signups++;
    }
    for (const r of qualified) {
      bump(r.qualifiedAt, 'qualified', 1);
      ch(r.channel).qualified++;
    }
    for (const c of commissions) {
      bump(c.createdAt, 'earnedUsdCents', c.usdCents);
      ch(c.referral.channel).earnedUsdCents += c.usdCents;
    }
    for (const p of purchases) bump(p.completedAt, 'revenueUsdCents', p.usdCents);
    const rows = [...daily.values()];
    const sum = (k: Exclude<keyof StatsDay, 'day'>) => rows.reduce((s, r) => s + r[k], 0);
    return {
      days,
      totals: {
        clicks: sum('clicks'),
        signups: sum('signups'),
        qualified: sum('qualified'),
        payingUsers: new Set(purchases.map((p) => p.userId)).size,
        revenueUsdCents: sum('revenueUsdCents'),
        earnedUsdCents: sum('earnedUsdCents'),
      },
      daily: rows,
      byChannel: [...channels.values()].sort((x, y) => y.signups - x.signups || y.clicks - x.clicks),
    };
  }

  async commissions(userId: string, q: CursorQueryDto) {
    const a = await this.mine(userId);
    const rows = await this.prisma.affiliateCommission.findMany({
      where: { affiliateId: a.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { referral: { select: { invitee: { select: { name: true } } } } },
      ...cursorArgs(q),
    });
    return toPage(rows, q.limit, (c) => ({ ...this.commissionView(c), user: { name: firstName(c.referral.invitee.name) || 'Someone' } }));
  }

  commissionView(c: AffiliateCommission) {
    return { id: c.id, kind: c.kind, usdCents: c.usdCents, baseUsdCents: c.baseUsdCents, status: c.status, availableAt: c.availableAt.toISOString(), createdAt: c.createdAt.toISOString(), adjustment: c.usdCents < 0 };
  }

  payoutView(p: AffiliatePayout) {
    return { id: p.id, usdCents: p.usdCents, amountPkr: p.amountPkr, method: p.method, accountMasked: p.accountMasked, status: p.status, reference: p.reference, failureReason: p.failureReason, createdAt: p.createdAt.toISOString(), decidedAt: p.decidedAt?.toISOString() ?? null };
  }

  async payouts(userId: string) {
    const a = await this.mine(userId);
    const rows = await this.prisma.affiliatePayout.findMany({ where: { affiliateId: a.id }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((p) => this.payoutView(p));
  }

  /** The whole available balance to a saved payout account; staff pay it by hand. One open payout at a time. */
  async requestPayout(userId: string, payoutAccountId: string) {
    const a = await this.mine(userId);
    if (a.status !== AffiliateStatus.ACTIVE) throw new AppError(ErrorCode.AFFILIATE_NOT_ACTIVE, 'Payouts are paused on your partner account', HttpStatus.FORBIDDEN);
    const account = await this.accounts.owned(userId, payoutAccountId);
    const rate = await this.settings.get('payments.usdToPkr');
    const min = this.economy.rules.affiliateMinPayoutUsdCents;
    await this.releaseDue(a.id);
    const payout = await this.prisma.tx(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Affiliate" WHERE "id" = ${a.id} FOR UPDATE`;
      if (await tx.affiliatePayout.findFirst({ where: { affiliateId: a.id, status: AffiliatePayoutStatus.REQUESTED }, select: { id: true } })) {
        throw AppError.conflict('Your last payout is still being processed', ErrorCode.AFFILIATE_PAYOUT_OPEN);
      }
      const rows = await tx.affiliateCommission.findMany({ where: { affiliateId: a.id, status: AffiliateCommissionStatus.AVAILABLE }, select: { id: true, usdCents: true } });
      const total = rows.reduce((s, r) => s + r.usdCents, 0);
      if (!payoutAllowed(total, min)) throw new AppError(ErrorCode.AFFILIATE_BELOW_MINIMUM, `Payouts start at $${(min / 100).toFixed(2)}`, HttpStatus.BAD_REQUEST, { minimumUsdCents: min, availableUsdCents: total });
      const p = await tx.affiliatePayout.create({ data: { affiliateId: a.id, usdCents: total, amountPkr: toPkr(total, rate), payoutAccountId: account.id, accountMasked: account.accountMasked, method: account.method } });
      await tx.affiliateCommission.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: AffiliateCommissionStatus.PAID, payoutId: p.id } });
      return p;
    });
    return this.payoutView(payout);
  }

  // ── the commission engine ─────────────────────────────────────────────────

  /** HELD while the partner is suspended or has a severe fraud flag; otherwise PENDING until the hold ends. */
  private async newStatus(a: Affiliate): Promise<AffiliateCommissionStatus> {
    if (a.status === AffiliateStatus.SUSPENDED) return AffiliateCommissionStatus.HELD;
    return hasSevereFlag(await this.flags(a)) ? AffiliateCommissionStatus.HELD : AffiliateCommissionStatus.PENDING;
  }

  private async addCommission(a: Affiliate, data: { referralId: string; purchaseId?: string; kind: AffiliateCommissionKind; key: string; baseUsdCents: number; usdCents: number }): Promise<AffiliateCommission | null> {
    if (data.usdCents <= 0) return null;
    try {
      return await this.prisma.affiliateCommission.create({
        data: { ...data, affiliateId: a.id, status: await this.newStatus(a), availableAt: this.clock.plus(this.economy.rules.affiliateHoldDays * MS.day) },
      });
    } catch (e) {
      if (isUniqueViolation(e)) return null; // already recorded
      throw e;
    }
  }

  /** CPA: the referred user became active. */
  async onQualified(referral: { id: string; affiliateId: string | null }): Promise<void> {
    if (!referral.affiliateId) return;
    const a = await this.prisma.affiliate.findUnique({ where: { id: referral.affiliateId } });
    if (!a || !EARNING.includes(a.status)) return;
    const amount = termsOf(a, this.economy.rules).cpaUsdCents;
    await this.addCommission(a, { referralId: referral.id, kind: AffiliateCommissionKind.CPA, key: `cpa:${referral.id}`, baseUsdCents: amount, usdCents: amount });
  }

  /** Rev-share on every successful purchase by a referred user, within the commission window. */
  @OnEvent(PURCHASE_SUCCEEDED, { async: true, promisify: true })
  async onPurchase(e: PurchaseEvent): Promise<void> {
    try {
      const p = await this.prisma.purchase.findUnique({ where: { id: e.purchaseId } });
      if (!p || p.status !== PurchaseStatus.SUCCEEDED) return;
      const ref = await this.prisma.referral.findUnique({ where: { inviteeId: p.userId }, include: { affiliate: true, invitee: { select: { createdAt: true } } } });
      if (!ref?.affiliate || ref.status === ReferralStatus.REJECTED || !EARNING.includes(ref.affiliate.status)) return;
      const r = this.economy.rules;
      if (!withinCommissionWindow(ref.invitee.createdAt, p.completedAt ?? this.clock.now(), r.affiliateCommissionMonths)) return;
      const share = revShare(p, termsOf(ref.affiliate, r).revSharePercent, r.affiliateStoreFeePercent);
      await this.addCommission(ref.affiliate, { referralId: ref.id, purchaseId: p.id, kind: AffiliateCommissionKind.REVSHARE, key: `rev:${p.id}`, ...share });
    } catch (err) {
      this.logger.error(`commission for purchase ${e.purchaseId} failed: ${(err as Error).message}`);
    }
  }

  /** A refunded purchase takes its commission back (a negative row if it was already paid out). */
  @OnEvent(PURCHASE_REFUNDED, { async: true, promisify: true })
  async onRefund(e: PurchaseEvent): Promise<void> {
    try {
      const c = await this.prisma.affiliateCommission.findUnique({ where: { key: `rev:${e.purchaseId}` } });
      if (c) await this.prisma.tx((tx) => this.reverse(c, tx));
    } catch (err) {
      this.logger.error(`commission reversal for purchase ${e.purchaseId} failed: ${(err as Error).message}`);
    }
  }

  /** Staff rejected a referral: everything it earned goes back. */
  async reverseReferral(referralId: string, tx?: Tx): Promise<void> {
    await this.prisma.tx(async (t) => {
      const rows = await t.affiliateCommission.findMany({ where: { referralId, usdCents: { gt: 0 }, status: { not: AffiliateCommissionStatus.REVERSED } } });
      for (const c of rows) await this.reverse(c, t);
    }, tx);
  }

  private async reverse(c: AffiliateCommission, tx: Tx): Promise<void> {
    if (c.usdCents <= 0) return;
    if (OPEN_COMMISSION.includes(c.status)) {
      await tx.affiliateCommission.updateMany({ where: { id: c.id, status: { in: OPEN_COMMISSION } }, data: { status: AffiliateCommissionStatus.REVERSED } });
    } else if (c.status === AffiliateCommissionStatus.PAID) {
      const exists = await tx.affiliateCommission.findUnique({ where: { key: `undo:${c.id}` }, select: { id: true } });
      if (!exists) {
        await tx.affiliateCommission.create({
          data: { affiliateId: c.affiliateId, referralId: c.referralId, purchaseId: c.purchaseId, kind: c.kind, key: `undo:${c.id}`, baseUsdCents: -c.baseUsdCents, usdCents: -c.usdCents, status: AffiliateCommissionStatus.AVAILABLE, availableAt: this.clock.now() },
        });
      }
    }
  }

  /** PENDING → AVAILABLE once the hold is over (all partners from the job; one partner before showing or paying out a balance). */
  async releaseDue(affiliateId?: string): Promise<number> {
    const r = await this.prisma.affiliateCommission.updateMany({ where: { affiliateId, status: AffiliateCommissionStatus.PENDING, availableAt: { lte: this.clock.now() } }, data: { status: AffiliateCommissionStatus.AVAILABLE } });
    return r.count;
  }

  /** Tests call `releaseDue` directly (controlled clock). */
  @Interval(5 * MS.minute)
  async scheduled(): Promise<void> {
    if (this.config.isTest) return;
    await this.redis.withLock('affiliates-release', 60_000, async () => {
      try {
        await this.releaseDue();
      } catch (e) {
        this.logger.error(`affiliate release failed: ${(e as Error).message}`);
      }
    });
  }

  // ── fraud signals ─────────────────────────────────────────────────────────

  async flags(a: Pick<Affiliate, 'id' | 'code'>): Promise<AffiliateFlag[]> {
    const weekAgo = new Date(this.clock.now().getTime() - 7 * MS.day);
    const referred = { referralGot: { affiliateId: a.id } };
    const [matureUsers, idleUsers, clusters, purchases, refunds, clicks, signups] = await Promise.all([
      this.prisma.user.count({ where: { ...referred, createdAt: { lte: weekAgo } } }),
      this.prisma.user.count({ where: { ...referred, createdAt: { lte: weekAgo }, goodCallsCount: 0 } }),
      this.prisma.referral.groupBy({ by: ['deviceHash'], where: { affiliateId: a.id, deviceHash: { not: null } }, _count: { _all: true }, having: { deviceHash: { _count: { gte: 3 } } } }),
      this.prisma.purchase.count({ where: { user: referred, status: { in: [PurchaseStatus.SUCCEEDED, PurchaseStatus.REFUNDED] } } }),
      this.prisma.purchase.count({ where: { user: referred, status: PurchaseStatus.REFUNDED } }),
      this.prisma.referralClick.aggregate({ where: { code: a.code }, _sum: { clicks: true } }),
      this.prisma.referral.count({ where: { affiliateId: a.id } }),
    ]);
    return affiliateFlags({ matureUsers, idleUsers, deviceClusters: clusters.length, purchases, refunds, clicks: clicks._sum.clicks ?? 0, signups });
  }

  // ── staff ─────────────────────────────────────────────────────────────────

  private notify(userId: string, payload: Record<string, unknown>): void {
    this.realtime.toUser(userId, ServerEvent.AffiliateUpdated, payload);
  }

  private async getOr404(id: string): Promise<Affiliate> {
    const a = await this.prisma.affiliate.findUnique({ where: { id } });
    if (!a) throw AppError.notFound('Partner');
    return a;
  }

  private async transition(id: string, from: AffiliateStatus[], data: Prisma.AffiliateUpdateManyMutationInput, what: string): Promise<Affiliate> {
    const r = await this.prisma.affiliate.updateMany({ where: { id, status: { in: from } }, data });
    if (r.count === 0) {
      await this.getOr404(id);
      throw AppError.conflict(`Only ${from.map((s) => s.toLowerCase()).join(' or ')} partners can be ${what}`);
    }
    return this.getOr404(id);
  }

  async approve(id: string, staffId: string, input: TermsInput = {}): Promise<Affiliate> {
    const a = await this.getOr404(id);
    const code = input.code !== undefined ? await this.claimableCode(input.code, id) : a.code;
    const done = await this.transition(
      id,
      [AffiliateStatus.PENDING, AffiliateStatus.REJECTED],
      { status: AffiliateStatus.ACTIVE, code, decidedAt: this.clock.now(), decidedById: staffId, decisionReason: null, ...termsData(input) },
      'approved',
    );
    this.notify(a.userId, { status: done.status, event: 'approved' });
    return done;
  }

  async reject(id: string, staffId: string, reason: string): Promise<Affiliate> {
    const done = await this.transition(id, [AffiliateStatus.PENDING], { status: AffiliateStatus.REJECTED, decidedAt: this.clock.now(), decidedById: staffId, decisionReason: reason }, 'rejected');
    this.notify(done.userId, { status: done.status, event: 'rejected' });
    return done;
  }

  async suspend(id: string, staffId: string, reason: string): Promise<Affiliate> {
    const done = await this.transition(id, [AffiliateStatus.ACTIVE], { status: AffiliateStatus.SUSPENDED, decidedAt: this.clock.now(), decidedById: staffId, decisionReason: reason }, 'suspended');
    this.notify(done.userId, { status: done.status, event: 'suspended' });
    return done;
  }

  /** Back to ACTIVE; commissions held while suspended continue their hold. */
  async reactivate(id: string, staffId: string): Promise<Affiliate> {
    const done = await this.transition(id, [AffiliateStatus.SUSPENDED], { status: AffiliateStatus.ACTIVE, decidedAt: this.clock.now(), decidedById: staffId, decisionReason: null }, 'reactivated');
    await this.releaseHeld(id);
    this.notify(done.userId, { status: done.status, event: 'reactivated' });
    return done;
  }

  /** Held commissions (suspension, fraud flags) go back to waiting out their hold. */
  async releaseHeld(id: string): Promise<{ released: number }> {
    await this.getOr404(id);
    const r = await this.prisma.affiliateCommission.updateMany({ where: { affiliateId: id, status: AffiliateCommissionStatus.HELD }, data: { status: AffiliateCommissionStatus.PENDING } });
    return { released: r.count };
  }

  async update(id: string, input: TermsInput): Promise<Affiliate> {
    await this.getOr404(id);
    const code = input.code !== undefined ? await this.claimableCode(input.code, id) : undefined;
    return this.prisma.affiliate.update({ where: { id }, data: { ...termsData(input), code, displayName: input.displayName?.trim(), staffNote: input.staffNote === undefined ? undefined : input.staffNote?.trim() || null } });
  }

  async adminList(q: { status?: AffiliateStatus[]; q?: string; cursor?: string; limit: number }) {
    const where: Prisma.AffiliateWhereInput = {
      status: q.status?.length ? { in: q.status } : undefined,
      ...(q.q
        ? {
            OR: [
              { code: { contains: q.q.toUpperCase() } },
              { displayName: { contains: q.q, mode: 'insensitive' } },
              { user: { name: { contains: q.q, mode: 'insensitive' } } },
              { user: { email: { contains: q.q.toLowerCase() } } },
              { id: q.q },
              { userId: q.q },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.affiliate.findMany({
      where,
      orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
      include: { user: { select: { id: true, name: true, avatarUrl: true, verified: true } }, _count: { select: { referrals: true } } },
      take: q.limit + 1,
      ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
    });
    const hasMore = rows.length > q.limit;
    const slice = hasMore ? rows.slice(0, q.limit) : rows;
    return { items: slice.map((a) => ({ ...this.adminSummary(a), user: a.user, referrals: a._count.referrals })), nextCursor: hasMore ? slice[slice.length - 1].id : null };
  }

  adminSummary(a: Affiliate) {
    const t = termsOf(a, this.economy.rules);
    return {
      id: a.id,
      userId: a.userId,
      code: a.code,
      displayName: a.displayName,
      status: a.status,
      link: this.link(a.code),
      revSharePercent: t.revSharePercent,
      cpaUsdCents: t.cpaUsdCents,
      customTerms: a.revSharePercent !== null || a.cpaUsdCents !== null,
      channels: a.channels as unknown as AffiliateChannel[],
      appliedAt: a.appliedAt.toISOString(),
      decidedAt: a.decidedAt?.toISOString() ?? null,
    };
  }

  async adminGet(id: string) {
    const a = await this.prisma.affiliate.findUnique({ where: { id }, include: { user: { select: { id: true, name: true, avatarUrl: true, verified: true, email: true, createdAt: true } } } });
    if (!a) throw AppError.notFound('Partner');
    await this.releaseDue(id);
    const [stats, flags, balance, referred, commissions, payouts, decidedBy] = await Promise.all([
      this.statsFor(a, 30),
      this.flags(a),
      this.balance(a.id),
      this.prisma.referral.findMany({ where: { affiliateId: id }, orderBy: { createdAt: 'desc' }, take: 50, include: { invitee: { select: { id: true, name: true, avatarUrl: true, verified: true, goodCallsCount: true, status: true } } } }),
      this.prisma.affiliateCommission.findMany({ where: { affiliateId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50, include: { referral: { select: { invitee: { select: { id: true, name: true } } } } } }),
      this.prisma.affiliatePayout.findMany({ where: { affiliateId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      a.decidedById ? this.prisma.staffUser.findUnique({ where: { id: a.decidedById }, select: { name: true } }) : null,
    ]);
    return {
      ...this.adminSummary(a),
      user: { id: a.user.id, name: a.user.name, avatarUrl: a.user.avatarUrl, verified: a.user.verified, createdAt: a.user.createdAt.toISOString() },
      note: a.note,
      staffNote: a.staffNote,
      decisionReason: a.decisionReason,
      decidedBy: decidedBy?.name ?? null,
      defaults: { revSharePercent: this.economy.rules.affiliateRevSharePercent, cpaUsdCents: this.economy.rules.affiliateCpaUsdCents },
      stats,
      flags,
      balance,
      referred: referred.map((r) => ({ id: r.id, status: r.status, rejectReason: r.rejectReason, channel: r.channel, source: r.source, createdAt: r.createdAt.toISOString(), qualifiedAt: r.qualifiedAt?.toISOString() ?? null, invitee: r.invitee })),
      commissions: commissions.map((c) => ({ ...this.commissionView(c), purchaseId: c.purchaseId, payoutId: c.payoutId, user: c.referral.invitee })),
      payouts: payouts.map((p) => this.payoutView(p)),
    };
  }

  async adminStats(id: string, days: number) {
    return this.statsFor(await this.getOr404(id), days);
  }

  async payoutQueue(q: { status?: AffiliatePayoutStatus[]; q?: string; cursor?: string; limit: number }) {
    const where: Prisma.AffiliatePayoutWhereInput = {
      status: q.status?.length ? { in: q.status } : undefined,
      ...(q.q ? { OR: [{ id: q.q }, { reference: q.q }, { affiliate: { code: { contains: q.q.toUpperCase() } } }, { affiliate: { displayName: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    const rows = await this.prisma.affiliatePayout.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { affiliate: { select: { id: true, code: true, displayName: true, status: true, user: { select: { id: true, name: true, avatarUrl: true } } } } },
      take: q.limit + 1,
      ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
    });
    const hasMore = rows.length > q.limit;
    const slice = hasMore ? rows.slice(0, q.limit) : rows;
    return { items: slice.map((p) => ({ ...this.payoutView(p), affiliate: p.affiliate })), nextCursor: hasMore ? slice[slice.length - 1].id : null };
  }

  /** The full account to pay to (staff with the payouts permission; audited). */
  async payoutDestination(id: string) {
    const p = await this.prisma.affiliatePayout.findUnique({ where: { id } });
    if (!p) throw AppError.notFound('Payout');
    const account = p.payoutAccountId ? await this.prisma.payoutAccount.findUnique({ where: { id: p.payoutAccountId } }) : null;
    if (!account) throw AppError.notFound('Payout account');
    return { method: account.method, ...this.accounts.destination(account) };
  }

  async markPayoutPaid(id: string, staffId: string, reference: string) {
    const r = await this.prisma.affiliatePayout.updateMany({ where: { id, status: AffiliatePayoutStatus.REQUESTED }, data: { status: AffiliatePayoutStatus.PAID, reference, decidedAt: this.clock.now(), decidedById: staffId } });
    if (r.count === 0) throw AppError.conflict('Only requested payouts can be marked paid');
    return this.afterPayout(id, 'payout_paid');
  }

  /** Rejected: its commissions are available again. */
  async rejectPayout(id: string, staffId: string, reason: string) {
    await this.prisma.tx(async (tx) => {
      const r = await tx.affiliatePayout.updateMany({ where: { id, status: AffiliatePayoutStatus.REQUESTED }, data: { status: AffiliatePayoutStatus.REJECTED, failureReason: reason, decidedAt: this.clock.now(), decidedById: staffId } });
      if (r.count === 0) throw AppError.conflict('Only requested payouts can be rejected');
      await tx.affiliateCommission.updateMany({ where: { payoutId: id }, data: { status: AffiliateCommissionStatus.AVAILABLE, payoutId: null } });
    });
    return this.afterPayout(id, 'payout_rejected');
  }

  private async afterPayout(id: string, event: string) {
    const p = await this.prisma.affiliatePayout.findUniqueOrThrow({ where: { id }, include: { affiliate: { select: { userId: true, status: true } } } });
    const view = this.payoutView(p);
    this.notify(p.affiliate.userId, { status: p.affiliate.status, event, payout: view });
    return view;
  }
}

function termsData(input: TermsInput): Prisma.AffiliateUpdateManyMutationInput {
  return {
    ...(input.revSharePercent !== undefined ? { revSharePercent: input.revSharePercent } : {}),
    ...(input.cpaUsdCents !== undefined ? { cpaUsdCents: input.cpaUsdCents } : {}),
  };
}
