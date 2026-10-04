import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { LedgerKind, Prisma, ProductType, Purchase, PurchaseStatus } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { CoinPack, VipPlan } from '../catalog/economy';
import { EconomyService } from '../catalog/economy.service';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { CreatePurchaseDto } from './dto/purchase.dto';
import { ChargeInput, ChargeResult, PaymentProvider } from './providers/payment.provider';
import { VipService } from './vip.service';

/** A copy of what was sold, kept on the purchase. */
interface ProductSnapshot {
  pack?: Pick<CoinPack, 'id' | 'name' | 'coins' | 'bonusPercent' | 'usdCents'>;
  plan?: VipPlan;
}

/**
 * Real money in. Every purchase is a row first (so retries and webhooks
 * find it), then a provider charge, then fulfilment — crediting coins or
 * VIP exactly once, guarded by the purchase status and ledger idempotency.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: PaymentProvider,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
    private readonly vip: VipService,
    private readonly clock: Clock,
    private readonly economy: EconomyService,
  ) {}

  /** Price, title and a copy of the product as sold — later price edits don't change what this purchase delivers. */
  private product(type: ProductType, id: string): { usdCents: number; title: string; snapshot: ProductSnapshot } {
    if (type === ProductType.COIN_PACK) {
      const p = this.economy.findPack(id);
      if (p) return { usdCents: p.usdCents, title: `${p.name} pack`, snapshot: { pack: { id: p.id, name: p.name, coins: p.coins, bonusPercent: p.bonusPercent, usdCents: p.usdCents } } };
    } else {
      const p = this.economy.findPlan(id);
      if (p) return { usdCents: p.usdCents, title: `VIP ${p.label.toLowerCase()}`, snapshot: { plan: { ...p } } };
    }
    throw new AppError(ErrorCode.UNKNOWN_PRODUCT, 'That product does not exist', HttpStatus.NOT_FOUND);
  }

  /** The pack as sold (older purchases without a copy fall back to today's pack). */
  private packOf(p: Purchase): Pick<CoinPack, 'name' | 'coins' | 'bonusPercent'> {
    const sold = ((p.metadata ?? {}) as { product?: ProductSnapshot }).product?.pack;
    const pack = sold ?? this.economy.findPack(p.productId);
    if (!pack) throw AppError.conflict(`Pack ${p.productId} no longer exists`);
    return pack;
  }

  private planOf(p: Purchase): VipPlan {
    const sold = ((p.metadata ?? {}) as { product?: ProductSnapshot }).product?.plan;
    const plan = sold ?? this.economy.findPlan(p.productId);
    if (!plan) throw AppError.conflict(`VIP plan ${p.productId} no longer exists`);
    return plan;
  }

  async create(userId: string, dto: CreatePurchaseDto, idempotencyKey: string) {
    const prior = await this.prisma.purchase.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
    if (prior) return this.view(prior);
    const { usdCents, snapshot } = this.product(dto.productType, dto.productId);
    const purchase = await this.prisma.purchase.create({
      data: { userId, productType: dto.productType, productId: dto.productId, method: dto.method, usdCents, idempotencyKey, metadata: { ...(dto.phone ? { phone: dto.phone } : {}), product: snapshot } as unknown as Prisma.InputJsonValue },
    });
    const input: ChargeInput = { purchaseId: purchase.id, userId, method: dto.method, productType: dto.productType, productId: dto.productId, usdCents, receipt: dto.receipt, phone: dto.phone, cardToken: dto.cardToken };
    return this.view(await this.apply(purchase, await this.provider.charge(input)));
  }

  async confirm(userId: string, purchaseId: string, otp: string) {
    const purchase = await this.prisma.purchase.findFirst({ where: { id: purchaseId, userId } });
    if (!purchase) throw AppError.notFound('Purchase');
    if (purchase.status !== PurchaseStatus.REQUIRES_ACTION) return this.view(purchase);
    const meta = (purchase.metadata ?? {}) as { phone?: string };
    const result = await this.provider.confirm({
      purchaseId: purchase.id,
      userId,
      method: purchase.method,
      productType: purchase.productType,
      productId: purchase.productId,
      usdCents: purchase.usdCents,
      phone: meta.phone,
      providerRef: purchase.providerRef ?? undefined,
      otp,
    });
    return this.view(await this.apply(purchase, result));
  }

  async get(userId: string, id: string) {
    const p = await this.prisma.purchase.findFirst({ where: { id, userId } });
    if (!p) throw AppError.notFound('Purchase');
    return this.view(p);
  }

  /** Provider webhook / admin: a pending charge was paid (e.g. bank transfer seen). */
  async markPaid(purchaseId: string, providerRef: string) {
    const p = await this.prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } });
    return this.view(await this.apply(p, { status: 'succeeded', providerRef }));
  }

  /**
   * Reverses what a purchase gave: coins come back out (as many as are left;
   * the shortfall is reported), VIP ends. The money itself is refunded in
   * the payment provider's console; this records it and undoes the goods.
   */
  async refund(purchaseId: string, reason: string) {
    const p = await this.prisma.purchase.findUnique({ where: { id: purchaseId } });
    if (!p) throw AppError.notFound('Purchase');
    if (p.status !== PurchaseStatus.SUCCEEDED) throw AppError.conflict('Only successful purchases can be refunded');
    const owed = p.productType === ProductType.COIN_PACK ? this.economy.packTotalCoins(this.packOf(p)) : this.economy.rules.vipMonthlyBonusCoins;
    const result = await this.prisma.tx(async (tx) => {
      const claimed = await tx.purchase.updateMany({ where: { id: p.id, status: PurchaseStatus.SUCCEEDED }, data: { status: PurchaseStatus.REFUNDED } });
      if (claimed.count === 0) throw AppError.conflict('Already refunded');
      const w = await tx.wallet.findUniqueOrThrow({ where: { userId: p.userId } });
      const clawback = Math.min(owed, w.coins);
      await this.ledger.move(
        p.userId,
        { coins: -clawback, kind: LedgerKind.REFUND, title: p.productType === ProductType.COIN_PACK ? 'Purchase refunded' : 'VIP refunded', usdCents: p.usdCents, method: p.method, reference: p.id, idempotencyKey: `refund:${p.id}` },
        { tx },
      );
      await tx.purchase.update({
        where: { id: p.id },
        data: { metadata: { ...((p.metadata ?? {}) as object), refund: { reason, at: this.clock.now().toISOString(), coinsClawedBack: clawback, coinsShortfall: owed - clawback } } },
      });
      return { coinsClawedBack: clawback, coinsShortfall: owed - clawback };
    });
    if (p.productType === ProductType.VIP_PLAN) await this.vip.revoke(p.userId, `refund ${p.id}`);
    this.wallet.changed([p.userId]);
    return result;
  }

  private async apply(purchase: Purchase, result: ChargeResult): Promise<Purchase> {
    if (result.status === 'failed') {
      const failed = await this.prisma.purchase.update({ where: { id: purchase.id }, data: { status: PurchaseStatus.FAILED, failureReason: result.reason, completedAt: this.clock.now() } });
      throw new AppError(ErrorCode.PAYMENT_DECLINED, result.reason, HttpStatus.PAYMENT_REQUIRED, { purchaseId: failed.id });
    }
    if (result.status === 'requires_action') {
      return this.prisma.purchase.update({ where: { id: purchase.id }, data: { status: PurchaseStatus.REQUIRES_ACTION, nextAction: result.action, providerRef: result.providerRef } });
    }
    return this.fulfil(purchase, result.providerRef);
  }

  private async fulfil(purchase: Purchase, providerRef: string): Promise<Purchase> {
    try {
      const done = await this.prisma.tx(async (tx) => {
        const claimed = await tx.purchase.updateMany({
          where: { id: purchase.id, status: { in: [PurchaseStatus.PENDING, PurchaseStatus.REQUIRES_ACTION] } },
          data: { status: PurchaseStatus.SUCCEEDED, providerRef, nextAction: null, completedAt: this.clock.now() },
        });
        if (claimed.count === 0) return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id } }); // already fulfilled
        if (purchase.productType === ProductType.COIN_PACK) {
          const pack = this.packOf(purchase);
          const total = this.economy.packTotalCoins(pack);
          const bonus = total - pack.coins;
          await this.ledger.move(
            purchase.userId,
            {
              coins: total,
              kind: LedgerKind.PURCHASE,
              title: `${pack.name} pack${bonus > 0 ? ` +${bonus} bonus` : ''}`,
              usdCents: purchase.usdCents,
              method: purchase.method,
              reference: providerRef,
              idempotencyKey: `purchase:${purchase.id}`,
            },
            { tx },
          );
        } else {
          await this.vip.activate(purchase.userId, this.planOf(purchase), { purchaseId: purchase.id, method: purchase.method, usdCents: purchase.usdCents }, tx);
        }
        return tx.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
      });
      this.wallet.changed([purchase.userId]);
      return done;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // The same store receipt was already redeemed (possibly by another account).
        await this.prisma.purchase.update({ where: { id: purchase.id }, data: { status: PurchaseStatus.FAILED, failureReason: 'Receipt already used' } });
        throw AppError.conflict('This purchase was already redeemed', ErrorCode.PAYMENT_DECLINED);
      }
      throw e;
    }
  }

  private async view(p: Purchase) {
    return {
      id: p.id,
      status: p.status,
      productType: p.productType,
      productId: p.productId,
      method: p.method,
      usd: p.usdCents / 100,
      receipt: p.providerRef,
      nextAction: p.nextAction,
      failureReason: p.failureReason,
      createdAt: p.createdAt.toISOString(),
      completedAt: p.completedAt?.toISOString() ?? null,
      wallet: p.status === PurchaseStatus.SUCCEEDED ? await this.wallet.view(p.userId) : undefined,
    };
  }
}
