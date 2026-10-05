import { Injectable, OnModuleInit } from '@nestjs/common';
import { PaymentMethod, WebhookEvent } from '@prisma/client';

import { AppleJwsVerifier } from '../../integrations/apple/apple-jws';
import { WebhookInbox, WebhookOutcome } from '../../integrations/core/webhook-inbox.service';
import { AppleTransaction } from './adapters/store/app-store.client';
import { PaymentGateway } from './payment-gateway.service';
import { PaymentsService } from './payments.service';
import { StoreSubscriptionsService } from './store-subscriptions.service';

/** Google Play RTDN (inside the Pub/Sub message). */
export interface PlayNotification {
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: { notificationType: number; purchaseToken: string; subscriptionId: string };
  oneTimeProductNotification?: { notificationType: number; purchaseToken: string; sku: string };
  voidedPurchaseNotification?: { purchaseToken: string; orderId: string; productType?: number; refundType?: number };
  testNotification?: { version: string };
}

/** App Store Server Notification v2 (decoded signedPayload). */
export interface AppleNotification {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  data?: { bundleId?: string; appAppleId?: number; environment?: string; signedTransactionInfo?: string; signedRenewalInfo?: string; status?: number };
}

/** Play subscription notification types that mean "money given back". */
const PLAY_REVOKED = 12;

/**
 * What each stored provider callback does. Registered with the WebhookInbox,
 * so the same code runs on first receipt, on automatic retries and on the
 * admin panel's "retry". Callbacks are only a trigger: the truth is always
 * re-read from the provider (inquiry / store API) before money moves.
 */
@Injectable()
export class PaymentWebhookHandlers implements OnModuleInit {
  constructor(
    private readonly inbox: WebhookInbox,
    private readonly payments: PaymentsService,
    private readonly subs: StoreSubscriptionsService,
    private readonly gateway: PaymentGateway,
    private readonly jws: AppleJwsVerifier,
  ) {}

  onModuleInit(): void {
    this.inbox.register('jazzcash', (e) => this.refresh(PaymentMethod.JAZZCASH, (e.payload as unknown as Record<string, string>).pp_TxnRefNo));
    this.inbox.register('easypaisa', (e) => this.refresh(PaymentMethod.EASYPAISA, (e.payload as unknown as { orderId?: string }).orderId));
    this.inbox.register('card', (e) => this.card(e));
    this.inbox.register('google-play', (e) => this.play(e.payload as unknown as PlayNotification));
    this.inbox.register('app-store', (e) => this.apple(e.payload as unknown as AppleNotification));
  }

  private async refresh(method: PaymentMethod, ref: string | undefined): Promise<WebhookOutcome> {
    if (!ref) return { status: 'ignored', note: 'No transaction reference' };
    const p = await this.payments.refreshByRef(method, ref);
    if (!p) return { status: 'ignored', note: `No purchase for ${ref}` };
    return { status: 'processed', subjectType: 'purchase', subjectId: p.id, note: p.status.toLowerCase() };
  }

  private async card(e: WebhookEvent): Promise<WebhookOutcome> {
    const { sessionRef, purchaseId } = e.payload as unknown as { sessionRef?: string; purchaseId?: string };
    if (sessionRef) return this.refresh(PaymentMethod.CARD, sessionRef);
    return { status: 'ignored', note: purchaseId ? `No session ref (purchase ${purchaseId})` : 'No session ref' };
  }

  private async play(n: PlayNotification): Promise<WebhookOutcome> {
    if (n.testNotification) return { status: 'ignored', note: 'test notification' };
    if (n.voidedPurchaseNotification) {
      const v = n.voidedPurchaseNotification;
      return this.subs.refundCharge(PaymentMethod.GOOGLE_PLAY, v.orderId, v.purchaseToken, 'Refunded in Google Play');
    }
    if (n.subscriptionNotification) {
      const s = n.subscriptionNotification;
      if (s.notificationType === PLAY_REVOKED) return this.subs.refundCharge(PaymentMethod.GOOGLE_PLAY, undefined, s.purchaseToken, 'Subscription revoked in Google Play');
      const client = this.gateway.playClient;
      if (!client) return { status: 'ignored', note: 'Google Play is not live' };
      const state = StoreSubscriptionsService.fromPlay(s.purchaseToken, await client.getSubscription(s.purchaseToken));
      return this.subs.sync(state);
    }
    // One-time products: the app redeems them; pending purchases (cash) complete through the reconciler.
    if (n.oneTimeProductNotification) {
      const p = await this.payments.refreshByRef(PaymentMethod.GOOGLE_PLAY, n.oneTimeProductNotification.purchaseToken);
      return p ? { status: 'processed', subjectType: 'purchase', subjectId: p.id } : { status: 'ignored', note: 'one-time product' };
    }
    return { status: 'ignored', note: 'unknown notification' };
  }

  private async apple(n: AppleNotification): Promise<WebhookOutcome> {
    if (n.notificationType === 'TEST') return { status: 'ignored', note: 'test notification' };
    if (!n.data?.signedTransactionInfo) return { status: 'ignored', note: `${n.notificationType} without a transaction` };
    const tx = await this.jws.verify<AppleTransaction>(n.data.signedTransactionInfo);
    const renewal = n.data.signedRenewalInfo ? await this.jws.verify<{ autoRenewStatus?: number }>(n.data.signedRenewalInfo) : undefined;
    switch (n.notificationType) {
      case 'REFUND':
      case 'REVOKE':
        return this.subs.refundCharge(PaymentMethod.APP_STORE, tx.transactionId, undefined, n.notificationType === 'REFUND' ? 'Refunded by Apple' : 'Revoked by Apple (Family Sharing)');
      case 'SUBSCRIBED':
      case 'DID_RENEW':
      case 'DID_CHANGE_RENEWAL_STATUS':
      case 'DID_CHANGE_RENEWAL_PREF':
      case 'DID_FAIL_TO_RENEW':
      case 'RENEWAL_EXTENDED':
      case 'OFFER_REDEEMED':
        return this.subs.sync(StoreSubscriptionsService.fromApple(tx, { autoRenew: renewal ? renewal.autoRenewStatus === 1 : n.subtype !== 'AUTO_RENEW_DISABLED' }));
      case 'EXPIRED':
      case 'GRACE_PERIOD_EXPIRED':
        return this.subs.sync(StoreSubscriptionsService.fromApple(tx, { autoRenew: false, expired: true }));
      default:
        return { status: 'ignored', note: n.notificationType };
    }
  }
}
