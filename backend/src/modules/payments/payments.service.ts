import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { LedgerKind, PaymentMethod, Prisma, ProductType, Purchase, PurchaseStatus } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock, MS } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ServerEvent } from '../../infra/realtime/realtime.events';
import { RealtimeService } from '../../infra/realtime/realtime.service';
import { RedisService } from '../../infra/redis/redis.service';
import { PaymentEvents } from '../../integrations/core/payment-events.service';
import { ProviderError } from '../../integrations/core/provider-http';
import type { CoinPack, VipPlan } from '../catalog/economy';
import { EconomyService } from '../catalog/economy.service';
import { SettingsService } from '../settings/settings.service';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { ActionData, Money, PaymentAdapter, PaymentContext, PaymentInput, PaymentStep, storeSku } from './adapters/payment-adapter';
import { appleAccountToken, playAccountToken } from './adapters/store/account-token';
import { CreatePurchaseDto } from './dto/purchase.dto';
import { PaymentGateway } from './payment-gateway.service';
import { PURCHASE_REFUNDED, PURCHASE_SUCCEEDED, PurchaseEvent } from './payment.events';
import { VipService } from './vip.service';

/** A copy of what was sold, kept on the purchase. */
interface ProductSnapshot {
  pack?: Pick<CoinPack, 'id' | 'name' | 'coins' | 'bonusPercent' | 'usdCents'>;
  plan?: VipPlan;
}

interface PurchaseMeta {
  product?: ProductSnapshot;
  /** Input kept so status checks can repeat the verification. Wallet numbers are masked. */
  receipt?: string;
  phone?: string;
  cnicLast6?: string;
  returnUrl?: string;
  bankReference?: string;
  /** Store purchases: when consume/acknowledge succeeded. */
  finalizedAt?: string;
  refund?: unknown;
}

const STORE_METHODS: PaymentMethod[] = [PaymentMethod.GOOGLE_PLAY, PaymentMethod.APP_STORE];
const OPEN: PurchaseStatus[] = [PurchaseStatus.PENDING, PurchaseStatus.REQUIRES_ACTION];

/** How we got a step's result (decides whether a decline throws to the caller). */
type Source = 'request' | 'background' | 'check' | 'webhook';

/**
 * Real money in. A purchase is a row first (so retries, webhooks and the
 * reconciler find it), then the method's adapter runs, then fulfilment —
 * coins or VIP credited exactly once, guarded by the purchase status and
 * ledger idempotency. Every provider step lands in PaymentEvent.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGateway,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
    private readonly vip: VipService,
    private readonly clock: Clock,
    private readonly economy: EconomyService,
    private readonly settings: SettingsService,
    private readonly events: PaymentEvents,
    private readonly realtime: RealtimeService,
    private readonly redis: RedisService,
    private readonly emitter: EventEmitter2,
  ) {}

  // ── catalogue ────────────────────────────────────────────────────────

  /** What the app can offer, plus the tokens it passes to the stores and the SKU naming rule. */
  async methods(userId: string, store?: 'play' | 'appstore') {
    return {
      methods: await this.gateway.methods(store),
      usdToPkr: await this.settings.get('payments.usdToPkr'),
      store: { playAccountId: playAccountToken(userId), appleAccountToken: appleAccountToken(userId), skus: this.skus() },
    };
  }

  /** Store product ids to create in Play Console / App Store Connect. */
  skus() {
    return {
      coinPacks: this.economy.packs.map((p) => ({ id: p.id, sku: storeSku(ProductType.COIN_PACK, p.id), usd: p.usdCents / 100 })),
      vipPlans: this.economy.plans.map((p) => ({ id: p.id, sku: storeSku(ProductType.VIP_PLAN, p.id), usd: p.usdCents / 100 })),
    };
  }

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

  /** Store methods charge the store's USD price; local methods charge PKR at the configured rate (whole rupees). */
  private async amountFor(method: PaymentMethod, usdCents: number): Promise<Money> {
    if (STORE_METHODS.includes(method)) return { currency: 'USD', minor: usdCents };
    const rate = await this.settings.get('payments.usdToPkr');
    return { currency: 'PKR', minor: Math.round((usdCents / 100) * rate) * 100 };
  }

  private packOf(p: Purchase): Pick<CoinPack, 'name' | 'coins' | 'bonusPercent'> {
    const sold = this.meta(p).product?.pack;
    const pack = sold ?? this.economy.findPack(p.productId);
    if (!pack) throw AppError.conflict(`Pack ${p.productId} no longer exists`);
    return pack;
  }

  private planOf(p: Purchase): VipPlan {
    const sold = this.meta(p).product?.plan;
    const plan = sold ?? this.economy.findPlan(p.productId);
    if (!plan) throw AppError.conflict(`VIP plan ${p.productId} no longer exists`);
    return plan;
  }

  private meta(p: Purchase): PurchaseMeta {
    return (p.metadata ?? {}) as PurchaseMeta;
  }

  private async context(p: Purchase, input: PaymentInput = {}): Promise<PaymentContext> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: p.userId }, select: { id: true, email: true, name: true } });
    const m = this.meta(p);
    return {
      purchase: p,
      sku: storeSku(p.productType, p.productId),
      productType: p.productType,
      title: p.productType === ProductType.COIN_PACK ? `${this.packOf(p).name} pack` : `VIP ${this.planOf(p).label.toLowerCase()}`,
      amount: { currency: p.currency as Money['currency'], minor: p.amountMinor ?? p.usdCents },
      user,
      input: { receipt: m.receipt, returnUrl: m.returnUrl, ...input },
    };
  }

  // ── the purchase flow ────────────────────────────────────────────────

  async create(userId: string, dto: CreatePurchaseDto, idempotencyKey: string) {
    const prior = await this.prisma.purchase.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
    if (prior && !(prior.status === PurchaseStatus.FAILED && STORE_METHODS.includes(prior.method) && dto.receipt)) return this.view(prior);
    if (prior) return this.view(await this.retryStore(prior, dto));
    const adapter = await this.gateway.adapter(dto.method);
    const { usdCents, snapshot } = this.product(dto.productType, dto.productId);
    const amount = await this.amountFor(dto.method, usdCents);
    const meta: PurchaseMeta = { product: snapshot, receipt: dto.receipt, returnUrl: dto.returnUrl, ...(dto.phone ? { phone: dto.phone.slice(-4) } : {}) };
    const purchase = await this.prisma.purchase.create({
      data: { userId, productType: dto.productType, productId: dto.productId, method: dto.method, usdCents, currency: amount.currency, amountMinor: amount.minor, idempotencyKey, metadata: meta as unknown as Prisma.InputJsonValue },
    });
    const ctx = await this.context(purchase, { receipt: dto.receipt, phone: dto.phone, cnicLast6: dto.cnicLast6, returnUrl: dto.returnUrl });
    await this.events.log({ purchaseId: purchase.id, provider: adapter.provider, type: 'charge.started', message: `${amount.currency} ${amount.minor / 100}` });
    const step = await this.run(purchase, adapter, 'start', () => adapter.start(ctx));
    return this.view(await this.apply(purchase, adapter, step, 'request'));
  }

  /**
   * The app resends a store receipt that failed before (its idempotency key
   * comes from the receipt). Store receipts stay valid, so a failure caused by
   * a transient problem or a fixed misconfiguration must not stick: verify again.
   * (A receipt that is really invalid fails again, harmlessly.)
   */
  private async retryStore(prior: Purchase, dto: CreatePurchaseDto): Promise<Purchase> {
    const adapter = await this.gateway.adapter(prior.method);
    const reopened = await this.prisma.purchase.updateMany({ where: { id: prior.id, status: PurchaseStatus.FAILED }, data: { status: PurchaseStatus.PENDING, failureReason: null, completedAt: null } });
    const purchase = await this.prisma.purchase.findUniqueOrThrow({ where: { id: prior.id } });
    if (!reopened.count) return purchase;
    await this.events.log({ purchaseId: purchase.id, provider: adapter.provider, type: 'charge.retried' });
    const ctx = await this.context(purchase, { receipt: dto.receipt });
    const step = await this.run(purchase, adapter, 'start', () => adapter.start(ctx));
    return this.apply(purchase, adapter, step, 'request');
  }

  /** Finish an OTP step (dev wallets; any provider that asks for a code). */
  async confirm(userId: string, purchaseId: string, otp: string) {
    const purchase = await this.owned(userId, purchaseId);
    if (purchase.status !== PurchaseStatus.REQUIRES_ACTION) return this.view(purchase);
    const adapter = this.gateway.adapterFor(purchase.method);
    if (!adapter?.confirm) throw AppError.conflict('This payment has nothing to confirm');
    const ctx = await this.context(purchase);
    const step = await this.run(purchase, adapter, 'confirm', () => adapter.confirm!(ctx, { otp }));
    return this.view(await this.apply(purchase, adapter, step, 'request'));
  }

  /** "I've paid / approved": ask the provider now (at most every 5 s per purchase). */
  async check(userId: string, purchaseId: string) {
    const purchase = await this.owned(userId, purchaseId);
    if (!OPEN.includes(purchase.status)) return this.view(purchase);
    if ((await this.redis.client.set(`pay:check:${purchase.id}`, '1', 'PX', 5000, 'NX')) !== 'OK') return this.view(purchase);
    return this.view(await this.checkNow(purchase));
  }

  /** The person gave up on a pending payment (closed the card page, cancelled the wallet prompt). */
  async cancel(userId: string, purchaseId: string) {
    const purchase = await this.owned(userId, purchaseId);
    if (!OPEN.includes(purchase.status)) return this.view(purchase);
    // A wallet push or card page might still complete: check once before closing it.
    const fresh = await this.checkNow(purchase).catch(() => purchase);
    if (!OPEN.includes(fresh.status)) return this.view(fresh);
    const done = await this.close(fresh, PurchaseStatus.EXPIRED, 'Cancelled');
    return this.view(done);
  }

  /** Bank transfer: the person tells us their bank's reference to help staff match it. */
  async bankReference(userId: string, purchaseId: string, reference: string) {
    const p = await this.owned(userId, purchaseId);
    if (p.method !== PaymentMethod.BANK || p.status !== PurchaseStatus.REQUIRES_ACTION) throw AppError.conflict('Only waiting bank transfers take a reference');
    const updated = await this.prisma.purchase.update({ where: { id: p.id }, data: { metadata: { ...this.meta(p), bankReference: reference } as unknown as Prisma.InputJsonValue } });
    await this.events.log({ purchaseId: p.id, provider: 'bank', type: 'bank.reference', message: reference });
    return this.view(updated);
  }

  /** The deep link the app asked hosted pages to return to (if any). */
  async returnUrlOf(purchaseId: string): Promise<string | undefined> {
    const p = await this.prisma.purchase.findUnique({ where: { id: purchaseId } });
    return p ? this.meta(p).returnUrl : undefined;
  }

  async get(userId: string, id: string) {
    return this.view(await this.owned(userId, id));
  }

  async list(userId: string) {
    const rows = await this.prisma.purchase.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return Promise.all(rows.map((r) => this.view(r, false)));
  }

  private async owned(userId: string, id: string): Promise<Purchase> {
    const p = await this.prisma.purchase.findFirst({ where: { id, userId } });
    if (!p) throw AppError.notFound('Purchase');
    return p;
  }

  // ── provider-driven updates (webhooks, reconciler, staff) ────────────

  /** A provider told us something about (method, ref): re-check with the provider and apply. */
  async refreshByRef(method: PaymentMethod, providerRef: string): Promise<Purchase | null> {
    const p = await this.prisma.purchase.findUnique({ where: { method_providerRef: { method, providerRef } } });
    if (!p) return null;
    if (!OPEN.includes(p.status)) return p;
    return this.checkNow(p);
  }

  /** Asks the adapter where a pending purchase stands and applies the answer. */
  async checkNow(purchase: Purchase): Promise<Purchase> {
    const adapter = this.gateway.adapterFor(purchase.method);
    if (!adapter?.check) return purchase;
    const ctx = await this.context(purchase);
    let step: PaymentStep;
    try {
      step = await adapter.check(ctx);
    } catch (e) {
      await this.prisma.purchase.update({ where: { id: purchase.id }, data: { lastCheckedAt: this.clock.now(), checkAttempts: { increment: 1 } } });
      await this.events.log({ purchaseId: purchase.id, provider: adapter.provider, type: 'status.error', message: (e as Error).message });
      return purchase;
    }
    await this.prisma.purchase.update({ where: { id: purchase.id }, data: { lastCheckedAt: this.clock.now(), checkAttempts: { increment: 1 } } });
    await this.events.log({ purchaseId: purchase.id, provider: adapter.provider, type: 'status.checked', code: step.code ?? step.status, data: step.raw });
    const current = await this.prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
    return this.apply(current, adapter, step, 'check');
  }

  /** Staff "Mark paid" (bank transfer seen) and the generic signed webhook. */
  async markPaid(purchaseId: string, providerRef: string) {
    const p = await this.prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } });
    await this.events.log({ purchaseId, provider: 'staff', type: 'charge.marked_paid', message: providerRef });
    return this.view(await this.fulfil(p, { status: 'succeeded', providerRef: p.method === PaymentMethod.BANK && p.providerRef ? p.providerRef : providerRef }));
  }

  /**
   * Reverses what a purchase gave: coins come back out (as many as are left;
   * the shortfall is reported), VIP ends. Money goes back through the
   * provider's console (or the store did it); this records it and undoes the goods.
   */
  async refund(purchaseId: string, reason: string, source = 'staff') {
    const p = await this.prisma.purchase.findUnique({ where: { id: purchaseId } });
    if (!p) throw AppError.notFound('Purchase');
    if (p.status !== PurchaseStatus.SUCCEEDED) throw AppError.conflict('Only successful purchases can be refunded');
    const owed = p.productType === ProductType.COIN_PACK ? this.economy.packTotalCoins(this.packOf(p)) : this.economy.rules.vipMonthlyBonusCoins;
    const result = await this.prisma.tx(async (tx) => {
      const claimed = await tx.purchase.updateMany({ where: { id: p.id, status: PurchaseStatus.SUCCEEDED }, data: { status: PurchaseStatus.REFUNDED, refundedAt: this.clock.now() } });
      if (claimed.count === 0) throw AppError.conflict('Already refunded');
      const w = await tx.wallet.findUniqueOrThrow({ where: { userId: p.userId } });
      const clawback = Math.min(owed, w.coins);
      await this.ledger.move(
        p.userId,
        { coins: -clawback, kind: LedgerKind.REFUND, title: p.productType === ProductType.COIN_PACK ? 'Purchase refunded' : 'VIP refunded', usdCents: p.usdCents, method: p.method, reference: p.id, idempotencyKey: `refund:${p.id}` },
        { tx },
      );
      await tx.purchase.update({ where: { id: p.id }, data: { metadata: { ...this.meta(p), refund: { reason, source, at: this.clock.now().toISOString(), coinsClawedBack: clawback, coinsShortfall: owed - clawback } } as unknown as Prisma.InputJsonValue } });
      return { coinsClawedBack: clawback, coinsShortfall: owed - clawback };
    });
    await this.events.log({ purchaseId: p.id, provider: source, type: 'refund', message: reason, data: result });
    if (p.productType === ProductType.VIP_PLAN) await this.vip.revoke(p.userId, `refund ${p.id}`);
    this.wallet.changed([p.userId]);
    this.emitter.emit(PURCHASE_REFUNDED, { purchaseId: p.id, userId: p.userId } satisfies PurchaseEvent);
    this.notify(p.userId, p.id);
    return result;
  }

  // ── internals ────────────────────────────────────────────────────────

  /** Runs an adapter call; provider/network errors become a recorded, readable failure. */
  private async run(purchase: Purchase, adapter: PaymentAdapter, what: string, fn: () => Promise<PaymentStep>): Promise<PaymentStep> {
    try {
      return await fn();
    } catch (e) {
      this.logger.error({ err: e, purchaseId: purchase.id, provider: adapter.provider }, `Payment ${what} failed`);
      await this.events.log({ purchaseId: purchase.id, provider: adapter.provider, type: `${what}.error`, message: (e as Error).message });
      if (e instanceof ProviderError && e.kind === 'unknown') {
        // The provider may have charged: keep it open; the reconciler will check.
        return { status: 'pending', action: 'approve_in_app', code: 'unknown' };
      }
      return { status: 'failed', reason: e instanceof ProviderError && e.kind === 'misconfigured' ? 'Payments are not set up correctly. Please try later.' : 'Could not reach the payment provider. Nothing was charged — try again.', code: e instanceof ProviderError ? e.kind : 'error' };
    }
  }

  private async apply(purchase: Purchase, adapter: PaymentAdapter, step: PaymentStep, source: Source): Promise<Purchase> {
    if (step.status === 'succeeded') {
      await this.events.log({ purchaseId: purchase.id, provider: adapter.provider, type: 'charge.succeeded', code: step.code, message: step.providerRef, data: source === 'check' ? undefined : step.raw });
      const done = await this.fulfil(purchase, step);
      if (adapter.finalize) void this.finalize(done, adapter);
      if (source !== 'request') this.notify(done.userId, done.id);
      return done;
    }
    if (step.status === 'failed') {
      await this.events.log({ purchaseId: purchase.id, provider: adapter.provider, type: 'charge.failed', code: step.code, message: step.reason, data: source === 'check' ? undefined : step.raw });
      const failed = await this.close(purchase, PurchaseStatus.FAILED, step.reason);
      if (source === 'request') throw new AppError(ErrorCode.PAYMENT_DECLINED, step.reason, HttpStatus.PAYMENT_REQUIRED, { purchaseId: failed.id });
      return failed;
    }
    // pending
    if (purchase.status === PurchaseStatus.REQUIRES_ACTION && source === 'check') return purchase; // still waiting: nothing new
    const updated = await this.prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        status: PurchaseStatus.REQUIRES_ACTION,
        nextAction: step.action,
        providerRef: step.providerRef ?? purchase.providerRef,
        ...(step.actionData ? { actionData: step.actionData as unknown as Prisma.InputJsonValue } : {}),
        expiresAt: step.expiresAt ?? purchase.expiresAt ?? new Date(this.clock.now().getTime() + 30 * MS.minute),
      },
    });
    if (source !== 'check') await this.events.log({ purchaseId: purchase.id, provider: adapter.provider, type: 'charge.pending', code: step.code ?? step.action, message: step.actionData?.instructions, data: step.raw });
    if (step.background) void this.runBackground(updated, adapter, step.background);
    return updated;
  }

  /** Slow provider calls (wallet approval) finish here, after the API answered. */
  private async runBackground(purchase: Purchase, adapter: PaymentAdapter, work: () => Promise<PaymentStep>): Promise<void> {
    try {
      const step = await work();
      const current = await this.prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
      if (!OPEN.includes(current.status)) return;
      if (step.status === 'pending') {
        await this.events.log({ purchaseId: purchase.id, provider: adapter.provider, type: 'charge.waiting', code: step.code, data: step.raw });
        return;
      }
      await this.apply(current, adapter, step, 'background');
    } catch (e) {
      this.logger.error({ err: e, purchaseId: purchase.id }, 'Background payment step failed; the reconciler will check it');
      await this.events.log({ purchaseId: purchase.id, provider: adapter.provider, type: 'charge.background_error', message: (e as Error).message });
    }
  }

  private async close(purchase: Purchase, status: 'FAILED' | 'EXPIRED', reason: string): Promise<Purchase> {
    const moved = await this.prisma.purchase.updateMany({ where: { id: purchase.id, status: { in: OPEN } }, data: { status, failureReason: reason, nextAction: null, completedAt: this.clock.now() } });
    const after = await this.prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
    if (moved.count) {
      if (status === PurchaseStatus.EXPIRED) await this.events.log({ purchaseId: purchase.id, provider: 'vibe', type: 'charge.expired', message: reason });
      this.notify(after.userId, after.id);
    }
    return after;
  }

  private async fulfil(purchase: Purchase, step: Extract<PaymentStep, { status: 'succeeded' }>): Promise<Purchase> {
    try {
      const done = await this.prisma.tx(async (tx) => {
        const claimed = await tx.purchase.updateMany({
          where: { id: purchase.id, status: { in: [...OPEN, PurchaseStatus.EXPIRED] } },
          data: { status: PurchaseStatus.SUCCEEDED, providerRef: step.providerRef, storeRef: step.storeRef ?? purchase.storeRef, nextAction: null, actionData: Prisma.DbNull, failureReason: null, completedAt: this.clock.now() },
        });
        if (claimed.count === 0) return { purchase: await tx.purchase.findUniqueOrThrow({ where: { id: purchase.id } }), fulfilled: false }; // already fulfilled (or failed for good)
        if (purchase.productType === ProductType.COIN_PACK) {
          const pack = this.packOf(purchase);
          const total = this.economy.packTotalCoins(pack);
          const bonus = total - pack.coins;
          await this.ledger.move(
            purchase.userId,
            { coins: total, kind: LedgerKind.PURCHASE, title: `${pack.name} pack${bonus > 0 ? ` +${bonus} bonus` : ''}`, usdCents: purchase.usdCents, method: purchase.method, reference: step.providerRef, idempotencyKey: `purchase:${purchase.id}` },
            { tx },
          );
        } else {
          await this.vip.activate(
            purchase.userId,
            this.planOf(purchase),
            { purchaseId: purchase.id, method: purchase.method, usdCents: purchase.usdCents, periodEnd: step.periodEnd, storeRef: STORE_METHODS.includes(purchase.method) ? step.storeRef : undefined },
            tx,
          );
        }
        return { purchase: await tx.purchase.findUniqueOrThrow({ where: { id: purchase.id } }), fulfilled: true };
      });
      this.wallet.changed([purchase.userId]);
      if (done.fulfilled) this.emitter.emit(PURCHASE_SUCCEEDED, { purchaseId: purchase.id, userId: purchase.userId } satisfies PurchaseEvent);
      return done.purchase;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // The same store receipt / provider charge was already redeemed (possibly by another account).
        await this.prisma.purchase.update({ where: { id: purchase.id }, data: { status: PurchaseStatus.FAILED, failureReason: 'Receipt already used', completedAt: this.clock.now() } });
        await this.events.log({ purchaseId: purchase.id, provider: 'vibe', type: 'charge.duplicate', message: step.providerRef });
        throw AppError.conflict('This purchase was already redeemed', ErrorCode.PAYMENT_DECLINED);
      }
      throw e;
    }
  }

  /** Store bookkeeping after delivery (Play consume/acknowledge). Retried by the reconciler until done. */
  private async finalize(purchase: Purchase, adapter: PaymentAdapter): Promise<void> {
    if (!adapter.finalize || purchase.status !== PurchaseStatus.SUCCEEDED || this.meta(purchase).finalizedAt) return;
    try {
      await adapter.finalize(await this.context(purchase));
      await this.prisma.purchase.update({ where: { id: purchase.id }, data: { metadata: { ...this.meta(purchase), finalizedAt: this.clock.now().toISOString() } as unknown as Prisma.InputJsonValue } });
      await this.events.log({ purchaseId: purchase.id, provider: adapter.provider, type: 'store.finalized' });
    } catch (e) {
      this.logger.warn({ err: e, purchaseId: purchase.id }, 'Store finalize failed; will retry');
      await this.events.log({ purchaseId: purchase.id, provider: adapter.provider, type: 'store.finalize_error', message: (e as Error).message });
    }
  }

  private notify(userId: string, purchaseId: string): void {
    void this.prisma.purchase
      .findUnique({ where: { id: purchaseId } })
      .then(async (p) => p && this.realtime.toUser(userId, ServerEvent.PaymentUpdated, await this.view(p, false)))
      .catch(() => undefined);
  }

  /**
   * Keeps pending payments moving without anyone watching:
   * - asks providers about open wallet/card/store payments (backoff 15 s → 10 min),
   * - expires checkouts past their time (after one last check),
   * - retries store consume/acknowledge (Play refunds unacknowledged purchases after 3 days).
   */
  @Interval(15_000)
  async reconcile(): Promise<void> {
    await this.redis.withLock('payments-reconcile', 14_000, async () => {
      const now = this.clock.now();
      const open = await this.prisma.purchase.findMany({ where: { status: PurchaseStatus.REQUIRES_ACTION }, orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } }, take: 50 });
      for (const p of open) {
        const adapter = this.gateway.adapterFor(p.method);
        const expired = !!p.expiresAt && p.expiresAt <= now;
        const due = !p.lastCheckedAt || now.getTime() - p.lastCheckedAt.getTime() >= Math.min(10 * MS.minute, 15_000 * 2 ** Math.min(p.checkAttempts, 6));
        let current = p;
        if (adapter?.check && (due || expired)) current = await this.checkNow(p).catch(() => p);
        if (expired && OPEN.includes(current.status)) await this.close(current, PurchaseStatus.EXPIRED, 'The payment was not completed in time');
      }
      const recent = await this.prisma.purchase.findMany({
        where: { status: PurchaseStatus.SUCCEEDED, method: PaymentMethod.GOOGLE_PLAY, completedAt: { gt: new Date(now.getTime() - 3 * MS.day), lt: new Date(now.getTime() - MS.minute) } },
        orderBy: { completedAt: 'asc' },
        take: 200,
      });
      for (const p of recent.filter((r) => !this.meta(r).finalizedAt).slice(0, 20)) {
        const adapter = this.gateway.adapterFor(p.method);
        if (adapter) await this.finalize(p, adapter);
      }
    });
  }

  async view(p: Purchase, withWallet = true) {
    const action = p.status === PurchaseStatus.REQUIRES_ACTION && p.nextAction ? { type: p.nextAction, ...((p.actionData ?? {}) as ActionData) } : null;
    return {
      id: p.id,
      status: p.status,
      productType: p.productType,
      productId: p.productId,
      method: p.method,
      usd: p.usdCents / 100,
      amount: { currency: p.currency, value: (p.amountMinor ?? p.usdCents) / 100 },
      receipt: p.providerRef,
      nextAction: p.nextAction,
      action,
      expiresAt: p.expiresAt?.toISOString() ?? null,
      failureReason: p.failureReason,
      createdAt: p.createdAt.toISOString(),
      completedAt: p.completedAt?.toISOString() ?? null,
      wallet: withWallet && p.status === PurchaseStatus.SUCCEEDED ? await this.wallet.view(p.userId) : undefined,
    };
  }
}
