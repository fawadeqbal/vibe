import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LedgerKind, PaymentMethod, SubscriptionStatus } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { Clock, MS } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService, Tx } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import type { VipPlan } from '../catalog/economy';
import { EconomyService } from '../catalog/economy.service';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';

/**
 * VIP subscriptions. `Wallet.vipUntil` is the fast flag every check reads;
 * `Subscription` is the history and drives monthly bonus coins and expiry.
 */
@Injectable()
export class VipService {
  private readonly logger = new Logger(VipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
    private readonly redis: RedisService,
    private readonly clock: Clock,
    private readonly economy: EconomyService,
    private readonly config: AppConfig,
  ) {}

  /** Where people manage (cancel) a store subscription. */
  private manageUrl(method: PaymentMethod | null, planId: string): string | null {
    if (method === PaymentMethod.GOOGLE_PLAY) {
      const pkg = this.config.get('GOOGLE_PLAY_PACKAGE');
      return `https://play.google.com/store/account/subscriptions?sku=vip_${planId}${pkg ? `&package=${pkg}` : ''}`;
    }
    if (method === PaymentMethod.APP_STORE) return 'https://apps.apple.com/account/subscriptions';
    return null;
  }

  /**
   * Starts or extends VIP after a successful payment (inside its transaction).
   * Store subscriptions pass `periodEnd` (the store decides the period and
   * any free trial) and `storeRef`, which later renewal/cancel notifications use.
   */
  async activate(
    userId: string,
    plan: VipPlan,
    ctx: { purchaseId: string; method: PaymentMethod; usdCents: number; periodEnd?: Date; storeRef?: string },
    tx: Tx,
  ): Promise<Date> {
    const now = this.clock.now();
    const w = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    const active = !!w.vipUntil && w.vipUntil > now;
    const hadTrial = (await tx.subscription.count({ where: { userId, trialEndsAt: { not: null } } })) > 0;
    const trial = !ctx.periodEnd && plan.trialDays > 0 && !active && !hadTrial;
    const from = active ? w.vipUntil! : now;
    const until = ctx.periodEnd
      ? new Date(Math.max(ctx.periodEnd.getTime(), active ? w.vipUntil!.getTime() : 0))
      : new Date(from.getTime() + (plan.days + (trial ? plan.trialDays : 0)) * MS.day);
    if (ctx.storeRef) await tx.subscription.updateMany({ where: { storeRef: ctx.storeRef }, data: { storeRef: null } });
    await tx.subscription.updateMany({ where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } }, data: { status: SubscriptionStatus.EXPIRED } });
    await tx.subscription.create({
      data: {
        userId,
        planId: plan.id,
        status: trial ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
        currentPeriodEnd: until,
        trialEndsAt: trial ? new Date(now.getTime() + plan.trialDays * MS.day) : null,
        lastBonusAt: now,
        purchaseId: ctx.purchaseId,
        method: ctx.method,
        storeRef: ctx.storeRef,
        autoRenew: true,
      },
    });
    await tx.wallet.update({ where: { userId }, data: { vipUntil: until } });
    await this.ledger.move(
      userId,
      {
        coins: this.economy.rules.vipMonthlyBonusCoins,
        kind: LedgerKind.VIP,
        title: `VIP ${plan.label.toLowerCase()}${trial ? ' (trial)' : ''}`,
        usdCents: ctx.usdCents,
        method: ctx.method,
        reference: ctx.purchaseId,
        idempotencyKey: `vip:${ctx.purchaseId}`,
      },
      { tx },
    );
    return until;
  }

  /** Staff gift of VIP time (no payment, no bonus coins). Extends any active VIP. */
  async grant(userId: string, days: number, reason: string): Promise<Date> {
    const until = await this.prisma.tx(async (tx) => {
      const now = this.clock.now();
      const w = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      const from = w.vipUntil && w.vipUntil > now ? w.vipUntil : now;
      const end = new Date(from.getTime() + days * MS.day);
      await tx.subscription.updateMany({ where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } }, data: { currentPeriodEnd: end } });
      const active = await tx.subscription.count({ where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.CANCELED] }, currentPeriodEnd: { gt: now } } });
      // Renewal state is the paid plan's; a gift alone never renews.
      if (!active) await tx.subscription.create({ data: { userId, planId: 'staff_grant', status: SubscriptionStatus.CANCELED, canceledAt: now, currentPeriodEnd: end, lastBonusAt: now } });
      await tx.wallet.update({ where: { userId }, data: { vipUntil: end } });
      await this.ledger.move(userId, { kind: LedgerKind.VIP, title: `VIP ${days} days from the Vibe team`, reference: reason.slice(0, 100) }, { tx });
      return end;
    });
    this.wallet.changed([userId]);
    return until;
  }

  /** Ends VIP now (refunds, abuse). */
  async revoke(userId: string, reason: string): Promise<void> {
    await this.prisma.tx(async (tx) => {
      const now = this.clock.now();
      await tx.subscription.updateMany({ where: { userId, status: { not: SubscriptionStatus.EXPIRED } }, data: { status: SubscriptionStatus.EXPIRED, currentPeriodEnd: now } });
      await tx.wallet.update({ where: { userId }, data: { vipUntil: now } });
      await this.ledger.move(userId, { kind: LedgerKind.VIP, title: 'VIP ended', reference: reason.slice(0, 100) }, { tx });
    });
    this.wallet.changed([userId]);
  }

  async status(userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    const w = await this.prisma.wallet.findUniqueOrThrow({ where: { userId }, select: { vipUntil: true } });
    const now = this.clock.now();
    return {
      active: !!w.vipUntil && w.vipUntil > now,
      until: w.vipUntil?.toISOString() ?? null,
      planId: sub?.planId ?? null,
      status: sub?.status ?? null,
      renews: !!sub && (sub.status === SubscriptionStatus.ACTIVE || sub.status === SubscriptionStatus.TRIALING),
      trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
      method: sub?.method ?? null,
      /** Store subscriptions are managed (cancelled) in the store; open this link. */
      manageUrl: sub ? this.manageUrl(sub.method, sub.planId) : null,
    };
  }

  /** Stops renewal; VIP stays until the end of the paid period. */
  async cancel(userId: string) {
    const current = await this.prisma.subscription.findFirst({ where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } }, orderBy: { createdAt: 'desc' } });
    const manage = current ? this.manageUrl(current.method, current.planId) : null;
    if (current?.storeRef && manage) {
      throw AppError.conflict(`This subscription is billed by ${current.method === PaymentMethod.GOOGLE_PLAY ? 'Google Play' : 'the App Store'}. Cancel it there.`, undefined, { manageUrl: manage });
    }
    await this.prisma.subscription.updateMany({
      where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } },
      data: { status: SubscriptionStatus.CANCELED, canceledAt: this.clock.now() },
    });
    await this.ledger.move(userId, { kind: LedgerKind.VIP, title: 'VIP renewal cancelled' });
    this.wallet.changed([userId]);
    return this.status(userId);
  }

  /** Daily: monthly bonus coins for long plans, and expiry. One instance runs it. */
  @Cron(CronExpression.EVERY_HOUR)
  async maintain(): Promise<void> {
    await this.redis.withLock('vip-maintain', 10 * MS.minute, async () => {
      const now = this.clock.now();
      const expired = await this.prisma.subscription.updateMany({
        where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.CANCELED] }, currentPeriodEnd: { lte: now } },
        data: { status: SubscriptionStatus.EXPIRED },
      });
      const due = await this.prisma.subscription.findMany({
        where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELED] }, currentPeriodEnd: { gt: now }, lastBonusAt: { lte: new Date(now.getTime() - 30 * MS.day) } },
        take: 500,
      });
      for (const s of due) {
        const month = Math.floor((now.getTime() - s.startedAt.getTime()) / (30 * MS.day));
        await this.prisma.tx(async (tx) => {
          await tx.subscription.update({ where: { id: s.id }, data: { lastBonusAt: now } });
          await this.ledger.move(s.userId, { coins: this.economy.rules.vipMonthlyBonusCoins, kind: LedgerKind.VIP, title: 'VIP monthly coins', idempotencyKey: `vip-bonus:${s.id}:${month}` }, { tx });
        });
        this.wallet.changed([s.userId]);
      }
      if (expired.count || due.length) this.logger.log(`VIP: ${expired.count} expired, ${due.length} bonuses`);
    });
  }
}
