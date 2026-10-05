import { Injectable, Logger } from '@nestjs/common';
import { LedgerKind, PaymentMethod, Prisma, ProductType, PurchaseStatus, Subscription, SubscriptionStatus } from '@prisma/client';

import { Clock } from '../../common/utils/clock';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PaymentEvents } from '../../integrations/core/payment-events.service';
import { WebhookOutcome } from '../../integrations/core/webhook-inbox.service';
import { EconomyService } from '../catalog/economy.service';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { storeSku } from './adapters/payment-adapter';
import { AppleTransaction } from './adapters/store/app-store.client';
import { PlaySubscriptionV2 } from './adapters/store/google-play.client';
import { PaymentsService } from './payments.service';

/** What a store says about one subscription right now, in our terms. */
export interface StoreSubscriptionState {
  method: PaymentMethod;
  /** Play purchase token / Apple original transaction id. */
  storeRef: string;
  /** Play: the previous token on upgrade/resubscribe. */
  previousRef?: string;
  sku: string;
  state: 'active' | 'canceled' | 'expired' | 'pending';
  autoRenew: boolean;
  periodEnd?: Date;
  /** The charge behind the current period (Play order id / Apple transaction id). */
  latestChargeRef?: string;
}

/**
 * Store-side subscription life: renewals, auto-renew switched off,
 * expiry, refunds. Driven by Google Play RTDN and App Store Server
 * Notifications. Every renewal is recorded as its own Purchase (finance
 * sees the money) and extends VIP; refunds go through PaymentsService.refund.
 */
@Injectable()
export class StoreSubscriptionsService {
  private readonly logger = new Logger(StoreSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly ledger: LedgerService,
    private readonly wallet: WalletService,
    private readonly economy: EconomyService,
    private readonly events: PaymentEvents,
    private readonly clock: Clock,
  ) {}

  static fromPlay(token: string, sub: PlaySubscriptionV2): StoreSubscriptionState {
    const item = sub.lineItems?.[0];
    const s = sub.subscriptionState;
    const state = s === 'SUBSCRIPTION_STATE_ACTIVE' || s === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' ? 'active' : s === 'SUBSCRIPTION_STATE_CANCELED' ? 'canceled' : s === 'SUBSCRIPTION_STATE_PENDING' ? 'pending' : 'expired';
    return {
      method: PaymentMethod.GOOGLE_PLAY,
      storeRef: token,
      previousRef: sub.linkedPurchaseToken,
      sku: item?.productId ?? '',
      state,
      autoRenew: item?.autoRenewingPlan?.autoRenewEnabled ?? state === 'active',
      periodEnd: item?.expiryTime ? new Date(item.expiryTime) : undefined,
      latestChargeRef: sub.latestOrderId,
    };
  }

  static fromApple(tx: AppleTransaction, opts: { autoRenew: boolean; expired?: boolean }): StoreSubscriptionState {
    const end = tx.expiresDate ? new Date(tx.expiresDate) : undefined;
    const expired = opts.expired || (!!end && end.getTime() < Date.now());
    return {
      method: PaymentMethod.APP_STORE,
      storeRef: tx.originalTransactionId,
      sku: tx.productId,
      state: expired ? 'expired' : opts.autoRenew ? 'active' : 'canceled',
      autoRenew: opts.autoRenew,
      periodEnd: end,
      latestChargeRef: tx.transactionId,
    };
  }

  private async find(s: StoreSubscriptionState): Promise<Subscription | null> {
    const sub = await this.prisma.subscription.findUnique({ where: { storeRef: s.storeRef } });
    if (sub || !s.previousRef) return sub;
    // Upgrade / resubscribe on Play: a new token replaces the linked one.
    const prev = await this.prisma.subscription.findUnique({ where: { storeRef: s.previousRef } });
    return prev ? this.prisma.subscription.update({ where: { id: prev.id }, data: { storeRef: s.storeRef } }) : null;
  }

  /** Bring our subscription in line with the store's view. Idempotent. */
  async sync(s: StoreSubscriptionState): Promise<WebhookOutcome> {
    const sub = await this.find(s);
    if (!sub) return { status: 'ignored', note: 'Unknown subscription (the app redeems new ones itself)' };
    const subject = { subjectType: 'subscription', subjectId: sub.id };
    const now = this.clock.now();

    if (s.state === 'pending') return { status: 'ignored', ...subject, note: 'pending' };

    if (s.state === 'expired') {
      if (sub.status === SubscriptionStatus.EXPIRED) return { status: 'ignored', ...subject };
      await this.prisma.tx(async (tx) => {
        await tx.subscription.update({ where: { id: sub.id }, data: { status: SubscriptionStatus.EXPIRED, autoRenew: false, currentPeriodEnd: s.periodEnd && s.periodEnd < now ? s.periodEnd : now } });
        const w = await tx.wallet.findUniqueOrThrow({ where: { userId: sub.userId } });
        // Only end VIP time this subscription gave (not a later staff grant).
        if (w.vipUntil && w.vipUntil > now && w.vipUntil <= new Date(sub.currentPeriodEnd.getTime() + 60_000)) await tx.wallet.update({ where: { userId: sub.userId }, data: { vipUntil: now } });
        await this.ledger.move(sub.userId, { kind: LedgerKind.VIP, title: 'VIP subscription ended', reference: sub.id, idempotencyKey: `vip-store-expired:${sub.id}:${sub.currentPeriodEnd.getTime()}` }, { tx });
      });
      this.wallet.changed([sub.userId]);
      return { status: 'processed', ...subject, note: 'expired' };
    }

    // active or canceled (= still paid up, won't renew)
    let renewed = false;
    if (s.latestChargeRef && s.periodEnd && s.periodEnd > sub.currentPeriodEnd) {
      renewed = await this.recordRenewal(sub, s);
    }
    const status = s.state === 'canceled' ? SubscriptionStatus.CANCELED : SubscriptionStatus.ACTIVE;
    if (sub.status !== status || sub.autoRenew !== s.autoRenew) {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { status, autoRenew: s.autoRenew, canceledAt: status === SubscriptionStatus.CANCELED ? (sub.canceledAt ?? now) : null } });
      this.wallet.changed([sub.userId]);
    }
    return { status: renewed || sub.status !== status || sub.autoRenew !== s.autoRenew ? 'processed' : 'ignored', ...subject, note: renewed ? 'renewed' : s.state };
  }

  /** A new paid period: a Purchase row for finance, longer VIP, a ledger line. Once per charge. */
  private async recordRenewal(sub: Subscription, s: StoreSubscriptionState): Promise<boolean> {
    const plan = this.economy.plans.find((p) => storeSku(ProductType.VIP_PLAN, p.id) === s.sku) ?? this.economy.findPlan(sub.planId);
    if (!plan) {
      this.logger.warn(`Renewal for unknown plan ${s.sku}`);
      return false;
    }
    try {
      await this.prisma.tx(async (tx) => {
        const purchase = await tx.purchase.create({
          data: {
            userId: sub.userId,
            productType: ProductType.VIP_PLAN,
            productId: plan.id,
            method: s.method,
            usdCents: plan.usdCents,
            currency: 'USD',
            amountMinor: plan.usdCents,
            status: PurchaseStatus.SUCCEEDED,
            providerRef: s.latestChargeRef,
            storeRef: s.storeRef,
            idempotencyKey: `renewal:${s.method}:${s.latestChargeRef}`,
            completedAt: this.clock.now(),
            metadata: { renewalOf: sub.id, product: { plan } } as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.subscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: s.periodEnd!, status: SubscriptionStatus.ACTIVE } });
        const w = await tx.wallet.findUniqueOrThrow({ where: { userId: sub.userId } });
        if (!w.vipUntil || w.vipUntil < s.periodEnd!) await tx.wallet.update({ where: { userId: sub.userId }, data: { vipUntil: s.periodEnd! } });
        await this.ledger.move(sub.userId, { kind: LedgerKind.VIP, title: `VIP ${plan.label.toLowerCase()} renewed`, usdCents: plan.usdCents, method: s.method, reference: purchase.id, idempotencyKey: `vip-renew:${s.method}:${s.latestChargeRef}` }, { tx });
        await this.events.log({ purchaseId: purchase.id, provider: s.method === PaymentMethod.GOOGLE_PLAY ? 'google-play' : 'app-store', type: 'subscription.renewed', message: s.latestChargeRef }, tx);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false; // this charge is already recorded
      throw e;
    }
    this.wallet.changed([sub.userId]);
    return true;
  }

  /** Store refunded/revoked a charge: undo what it gave. */
  async refundCharge(method: PaymentMethod, chargeRef: string | undefined, storeRef: string | undefined, reason: string): Promise<WebhookOutcome> {
    const p =
      (chargeRef ? await this.prisma.purchase.findUnique({ where: { method_providerRef: { method, providerRef: chargeRef } } }) : null) ??
      (storeRef ? await this.prisma.purchase.findFirst({ where: { method, storeRef, status: PurchaseStatus.SUCCEEDED }, orderBy: { createdAt: 'desc' } }) : null);
    if (!p) return { status: 'ignored', note: 'No matching purchase' };
    if (p.status !== PurchaseStatus.SUCCEEDED) return { status: 'ignored', subjectType: 'purchase', subjectId: p.id, note: `already ${p.status.toLowerCase()}` };
    await this.payments.refund(p.id, reason, method === PaymentMethod.GOOGLE_PLAY ? 'google-play' : 'app-store');
    return { status: 'processed', subjectType: 'purchase', subjectId: p.id, note: 'refunded' };
  }
}
