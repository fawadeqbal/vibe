import { Injectable } from '@nestjs/common';
import { CashoutStatus, LedgerKind, PaymentMethod, Prisma, ProductType, PurchaseStatus, SubscriptionStatus } from '@prisma/client';

import { AppError } from '../../../common/errors/app-error';
import { Clock, MS } from '../../../common/utils/clock';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
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

/** Read side of money: purchases, cash-outs, subscriptions, the ledger, revenue mix. */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clock: Clock,
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

  /** Revenue mix for the last N days, cached for 5 minutes. */
  async summary(days: number) {
    return this.redis.remember(`admin:finance:summary:${days}`, 300, async () => {
      const since = new Date(this.clock.now().getTime() - days * MS.day);
      const ok = { status: PurchaseStatus.SUCCEEDED, completedAt: { gte: since } };
      const [byMethod, byProduct, refunds, failed, payouts, pendingPayouts] = await Promise.all([
        this.prisma.purchase.groupBy({ by: ['method'], where: ok, _sum: { usdCents: true }, _count: { _all: true } }),
        this.prisma.purchase.groupBy({ by: ['productType', 'productId'], where: ok, _sum: { usdCents: true }, _count: { _all: true } }),
        this.prisma.purchase.aggregate({ where: { status: PurchaseStatus.REFUNDED, createdAt: { gte: since } }, _sum: { usdCents: true }, _count: true }),
        this.prisma.purchase.count({ where: { status: PurchaseStatus.FAILED, createdAt: { gte: since } } }),
        this.prisma.cashout.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _sum: { usdCents: true }, _count: { _all: true } }),
        this.prisma.cashout.aggregate({ where: { status: { in: [CashoutStatus.REVIEW, CashoutStatus.REQUESTED, CashoutStatus.PROCESSING] } }, _sum: { usdCents: true }, _count: true }),
      ]);
      const gross = byMethod.reduce((s, m) => s + num(m._sum.usdCents), 0);
      return {
        days,
        grossUsd: gross / 100,
        refundsUsd: num(refunds._sum.usdCents) / 100,
        refundsCount: refunds._count,
        failedCount: failed,
        byMethod: byMethod.map((m) => ({ method: m.method, usd: num(m._sum.usdCents) / 100, count: m._count._all })).sort((a, b) => b.usd - a.usd),
        byProduct: byProduct.map((p) => ({ productType: p.productType, productId: p.productId, usd: num(p._sum.usdCents) / 100, count: p._count._all })).sort((a, b) => b.usd - a.usd),
        payouts: payouts.map((p) => ({ status: p.status, usd: num(p._sum.usdCents) / 100, count: p._count._all })),
        payoutsPendingUsd: num(pendingPayouts._sum.usdCents) / 100,
        payoutsPendingCount: pendingPayouts._count,
      };
    });
  }
}
