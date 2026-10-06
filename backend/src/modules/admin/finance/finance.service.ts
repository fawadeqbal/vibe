import { Injectable } from '@nestjs/common';
import { AffiliateCommissionStatus, AffiliatePayoutStatus, CashoutStatus, LedgerKind, PaymentMethod, Prisma, ProductType, PurchaseStatus, SubscriptionStatus } from '@prisma/client';

import { AppError } from '../../../common/errors/app-error';
import { Clock, MS } from '../../../common/utils/clock';
import { AppConfig } from '../../../config/app-config.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { feeShareFor } from '../../catalog/economy';
import { EconomyService } from '../../catalog/economy.service';
import { createdRange, pageArgs, toAdminPage } from '../core/admin-query';

export interface FinanceFilters {
  q?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit: number;
  userId?: string;
}

const WHO = { select: { id: true, name: true, avatarUrl: true } } as const;
const num = (v: number | bigint | null | undefined) => Number(v ?? 0);
/** Cents (possibly fractional, from fee rates and gem values) → dollars, rounded to the cent. */
const usd = (cents: number) => Math.round(cents) / 100;

/** Read side of money: purchases, cash-outs, subscriptions, the ledger, profit and loss. */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
    private readonly economy: EconomyService,
  ) {}

  async purchases(f: FinanceFilters & { status?: PurchaseStatus[]; method?: PaymentMethod[]; productType?: ProductType }) {
    const where: Prisma.PurchaseWhereInput = {
      userId: f.userId,
      status: f.status?.length ? { in: f.status } : undefined,
      method: f.method?.length ? { in: f.method } : undefined,
      productType: f.productType,
      createdAt: createdRange(f),
      ...(f.q ? { OR: [{ id: f.q }, { providerRef: f.q }, { user: { name: { contains: f.q, mode: 'insensitive' } } }] } : {}),
    };
    const rows = await this.prisma.purchase.findMany({ where, include: { user: WHO }, ...pageArgs(f) });
    return toAdminPage(rows, f.limit, (p) => ({ ...p, usd: p.usdCents / 100 }));
  }

  async purchase(id: string) {
    const p = await this.prisma.purchase.findUnique({ where: { id }, include: { user: WHO } });
    if (!p) throw AppError.notFound('Purchase');
    const ledger = await this.prisma.ledgerEntry.findMany({ where: { userId: p.userId, OR: [{ reference: p.id }, { idempotencyKey: { in: [`purchase:${p.id}`, `vip:${p.id}`, `refund:${p.id}`] } }] }, orderBy: { createdAt: 'asc' } });
    return { ...p, usd: p.usdCents / 100, ledger };
  }

  async cashouts(f: FinanceFilters & { status?: CashoutStatus[]; method?: PaymentMethod[] }) {
    const where: Prisma.CashoutWhereInput = {
      userId: f.userId,
      status: f.status?.length ? { in: f.status } : undefined,
      method: f.method?.length ? { in: f.method } : undefined,
      createdAt: createdRange(f),
      ...(f.q ? { OR: [{ id: f.q }, { providerRef: f.q }, { user: { name: { contains: f.q, mode: 'insensitive' } } }] } : {}),
    };
    const rows = await this.prisma.cashout.findMany({ where, include: { user: { select: { ...WHO.select, verified: true, createdAt: true } } }, ...pageArgs(f) });
    return toAdminPage(rows, f.limit, (c) => ({ ...c, usd: c.usdCents / 100 }));
  }

  async ledger(f: FinanceFilters & { kind?: LedgerKind[] }) {
    const where: Prisma.LedgerEntryWhereInput = {
      userId: f.userId,
      kind: f.kind?.length ? { in: f.kind } : undefined,
      createdAt: createdRange(f),
      ...(f.q ? { OR: [{ reference: f.q }, { title: { contains: f.q, mode: 'insensitive' } }] } : {}),
    };
    const rows = await this.prisma.ledgerEntry.findMany({ where, include: { user: WHO }, ...pageArgs(f) });
    return toAdminPage(rows, f.limit, (e) => e);
  }

  async subscriptions(f: FinanceFilters & { status?: SubscriptionStatus[]; planId?: string }) {
    const where: Prisma.SubscriptionWhereInput = {
      userId: f.userId,
      status: f.status?.length ? { in: f.status } : undefined,
      planId: f.planId,
      createdAt: createdRange(f),
      ...(f.q ? { user: { name: { contains: f.q, mode: 'insensitive' } } } : {}),
    };
    const rows = await this.prisma.subscription.findMany({ where, include: { user: WHO }, ...pageArgs(f) });
    return toAdminPage(rows, f.limit, (s) => s);
  }

  /**
   * Profit and loss for the last N business days (today included), cached for
   * 5 minutes. Two views:
   * - cash: what came in minus what actually went out (refunds, store and
   *   payment fees, creator cash-outs paid, partner payouts paid);
   * - earned: the same sales minus what people earned in the period, paid or
   *   not (gems given to creators at today's gem value, partner commissions).
   * Plus what we owe right now, whatever the period.
   */
  async summary(days: number) {
    return this.redis.remember(`admin:finance:summary:v2:${days}:${this.economy.version}`, 300, () => this.computeSummary(days));
  }

  private async computeSummary(days: number) {
    const rules = this.economy.rules;
    const offset = this.config.get('BUSINESS_TZ_OFFSET_MINUTES');
    const since = new Date(this.clock.dayOf().getTime() - (days - 1) * MS.day - offset * MS.minute);
    const dayExpr = (col: string) => `to_char(date_trunc('day', ${col} + make_interval(mins => ${offset})), 'YYYY-MM-DD')`;
    const q = <T>(sql: string) => this.prisma.$queryRawUnsafe<T[]>(sql, since);
    type DayMethod = { day: string; method: string; cents: bigint; n: bigint };
    type Day = { day: string; cents: bigint; n: bigint };
    const refundedAt = `COALESCE("refundedAt", "completedAt", "createdAt")`;
    const charged = { status: { in: [PurchaseStatus.SUCCEEDED, PurchaseStatus.REFUNDED] }, completedAt: { gte: since } };

    const [sales, refunds, creatorPaid, partnerPaid, byProduct, failed, payouts, pendingPayouts, gemsIssued, partnerEarned, gemsHeld, partnerOpen, partnerRequested] = await Promise.all([
      q<DayMethod>(`SELECT ${dayExpr('"completedAt"')} AS day, method::text AS method, SUM("usdCents") AS cents, COUNT(*) AS n FROM "Purchase" WHERE status IN ('SUCCEEDED', 'REFUNDED') AND "completedAt" >= $1 GROUP BY 1, 2`),
      q<DayMethod>(`SELECT ${dayExpr(refundedAt)} AS day, method::text AS method, SUM("usdCents") AS cents, COUNT(*) AS n FROM "Purchase" WHERE status = 'REFUNDED' AND ${refundedAt} >= $1 GROUP BY 1, 2`),
      q<Day>(`SELECT ${dayExpr('"processedAt"')} AS day, SUM("usdCents") AS cents, COUNT(*) AS n FROM "Cashout" WHERE status = 'PAID' AND "processedAt" >= $1 GROUP BY 1`),
      q<Day>(`SELECT ${dayExpr('"decidedAt"')} AS day, SUM("usdCents") AS cents, COUNT(*) AS n FROM "AffiliatePayout" WHERE status = 'PAID' AND "decidedAt" >= $1 GROUP BY 1`),
      this.prisma.purchase.groupBy({ by: ['productType', 'productId'], where: charged, _sum: { usdCents: true }, _count: { _all: true } }),
      this.prisma.purchase.count({ where: { status: PurchaseStatus.FAILED, createdAt: { gte: since } } }),
      this.prisma.cashout.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _sum: { usdCents: true }, _count: { _all: true } }),
      this.prisma.cashout.aggregate({ where: { status: { in: [CashoutStatus.REVIEW, CashoutStatus.REQUESTED, CashoutStatus.PROCESSING] } }, _sum: { usdCents: true }, _count: true }),
      // Gems handed out in the period (gifts received, bonuses, staff adjustments): each one can become a cash-out.
      this.prisma.ledgerEntry.aggregate({ where: { kind: { in: [LedgerKind.GIFT_RECEIVED, LedgerKind.EARN, LedgerKind.ADJUSTMENT] }, gems: { not: 0 }, createdAt: { gte: since } }, _sum: { gems: true } }),
      // Partner commissions earned in the period. Reversed ones never count; take-back rows are negative.
      this.prisma.affiliateCommission.aggregate({ where: { createdAt: { gte: since }, status: { not: AffiliateCommissionStatus.REVERSED } }, _sum: { usdCents: true } }),
      this.prisma.wallet.aggregate({ where: { gems: { gt: 0 } }, _sum: { gems: true }, _count: true }),
      this.prisma.affiliateCommission.aggregate({ where: { status: { in: [AffiliateCommissionStatus.PENDING, AffiliateCommissionStatus.AVAILABLE, AffiliateCommissionStatus.HELD] } }, _sum: { usdCents: true } }),
      this.prisma.affiliatePayout.aggregate({ where: { status: AffiliatePayoutStatus.REQUESTED }, _sum: { usdCents: true }, _count: true }),
    ]);

    // ── per day, zero-filled ──
    const fee = (method: string, cents: number) => cents * feeShareFor(method, rules);
    type Row = { gross: number; refunds: number; fees: number; creator: number; partner: number };
    const daysMap = new Map<string, Row>();
    const today = this.clock.dayOf().getTime();
    for (let i = 0; i < days; i++) daysMap.set(new Date(today - (days - 1 - i) * MS.day).toISOString().slice(0, 10), { gross: 0, refunds: 0, fees: 0, creator: 0, partner: 0 });
    const at = (day: string) => daysMap.get(day);
    for (const r of sales) {
      const d = at(r.day);
      if (!d) continue;
      d.gross += num(r.cents);
      d.fees += fee(r.method, num(r.cents));
    }
    // Stores give their fee back on a refund, so the fee goes with the sale.
    for (const r of refunds) {
      const d = at(r.day);
      if (!d) continue;
      d.refunds += num(r.cents);
      d.fees -= fee(r.method, num(r.cents));
    }
    for (const r of creatorPaid) {
      const d = at(r.day);
      if (d) d.creator += num(r.cents);
    }
    for (const r of partnerPaid) {
      const d = at(r.day);
      if (d) d.partner += num(r.cents);
    }
    let running = 0;
    const series = [...daysMap].map(([day, d]) => {
      const net = d.gross - d.refunds - d.fees;
      const profit = net - d.creator - d.partner;
      running += profit;
      return { day, grossUsd: usd(d.gross), netUsd: usd(net), paidOutUsd: usd(d.creator + d.partner), profitUsd: usd(profit), cumulativeProfitUsd: usd(running) };
    });

    // ── totals ──
    const sum = (rows: { cents: bigint }[]) => rows.reduce((s, r) => s + num(r.cents), 0);
    const count = (rows: { n: bigint }[]) => rows.reduce((s, r) => s + num(r.n), 0);
    const grossC = sum(sales);
    const refundsC = sum(refunds);
    const feesC = [...daysMap.values()].reduce((s, d) => s + d.fees, 0);
    const netC = grossC - refundsC - feesC;
    const creatorPaidC = sum(creatorPaid);
    const partnerPaidC = sum(partnerPaid);
    const profitC = netC - creatorPaidC - partnerPaidC;

    const methods = new Map<string, { gross: number; refunds: number; count: number }>();
    for (const r of sales) {
      const m = methods.get(r.method) ?? { gross: 0, refunds: 0, count: 0 };
      m.gross += num(r.cents);
      m.count += num(r.n);
      methods.set(r.method, m);
    }
    for (const r of refunds) {
      const m = methods.get(r.method) ?? { gross: 0, refunds: 0, count: 0 };
      m.refunds += num(r.cents);
      methods.set(r.method, m);
    }

    const gems = num(gemsIssued._sum.gems);
    const creatorEarnedC = gems * rules.usdCentsPerGem;
    const partnerEarnedC = num(partnerEarned._sum.usdCents);
    const earnedProfitC = netC - creatorEarnedC - partnerEarnedC;

    const gemsHeldN = num(gemsHeld._sum.gems);
    const owedCashoutsC = num(pendingPayouts._sum.usdCents);
    const owedGemsC = gemsHeldN * rules.usdCentsPerGem;
    const owedPartnersC = num(partnerOpen._sum.usdCents) + num(partnerRequested._sum.usdCents);

    return {
      days,
      from: since.toISOString(),
      // Sales
      grossUsd: usd(grossC),
      salesCount: count(sales),
      refundsUsd: usd(refundsC),
      refundsCount: count(refunds),
      feesUsd: usd(feesC),
      feeRates: { store: rules.storeFeeShare, wallet: rules.walletFeeShare, card: rules.cardFeeShare, bank: rules.bankFeeShare },
      netUsd: usd(netC),
      failedCount: failed,
      // Money out
      creatorPaidUsd: usd(creatorPaidC),
      creatorPaidCount: count(creatorPaid),
      partnerPaidUsd: usd(partnerPaidC),
      partnerPaidCount: count(partnerPaid),
      profitUsd: usd(profitC),
      /** Profit as a share of gross sales; null with no sales. */
      margin: grossC > 0 ? profitC / grossC : null,
      earned: {
        creatorGems: gems,
        creatorUsd: usd(creatorEarnedC),
        partnerUsd: usd(partnerEarnedC),
        profitUsd: usd(earnedProfitC),
        margin: grossC > 0 ? earnedProfitC / grossC : null,
      },
      owed: {
        cashoutsUsd: usd(owedCashoutsC),
        cashoutsCount: pendingPayouts._count,
        gems: gemsHeldN,
        gemsUsd: usd(owedGemsC),
        gemsHolders: gemsHeld._count,
        partnersUsd: usd(owedPartnersC),
        partnerPayoutsRequested: partnerRequested._count,
        totalUsd: usd(owedCashoutsC + owedGemsC + owedPartnersC),
      },
      byMethod: [...methods]
        .map(([method, m]) => ({ method, usd: usd(m.gross), count: m.count, refundsUsd: usd(m.refunds), feeRate: feeShareFor(method, rules), feesUsd: usd(fee(method, m.gross - m.refunds)), netUsd: usd(m.gross - m.refunds - fee(method, m.gross - m.refunds)) }))
        .sort((a, b) => b.usd - a.usd),
      byProduct: byProduct.map((p) => ({ productType: p.productType, productId: p.productId, usd: num(p._sum.usdCents) / 100, count: p._count._all })).sort((a, b) => b.usd - a.usd),
      payouts: payouts.map((p) => ({ status: p.status, usd: num(p._sum.usdCents) / 100, count: p._count._all })),
      payoutsPendingUsd: usd(owedCashoutsC),
      payoutsPendingCount: pendingPayouts._count,
      series,
    };
  }
}
