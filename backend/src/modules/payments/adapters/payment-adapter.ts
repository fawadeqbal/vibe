import { PaymentMethod, ProductType, Purchase } from '@prisma/client';

import { IntegrationMode } from '../../../integrations/core/integration.types';

/**
 * How a method collects money — drives what the app shows:
 * - store: Google Play / App Store billing; the app sends the receipt.
 * - wallet: JazzCash / Easypaisa; the person approves on their phone (or types an OTP in dev).
 * - redirect: a hosted payment page (card gateway) opened in the browser.
 * - manual: bank transfer, confirmed by staff.
 */
export type PaymentFlow = 'store' | 'wallet' | 'redirect' | 'manual';

/** What the person must do to finish a pending payment. */
export type PaymentAction = 'otp' | 'approve_in_app' | 'redirect' | 'bank_transfer';

export interface Money {
  currency: 'USD' | 'PKR';
  /** Minor units: cents / paisa. */
  minor: number;
}

/** Everything an adapter needs about one purchase. */
export interface PaymentContext {
  purchase: Purchase;
  /** Store SKU for store methods (see storeSku()). */
  sku: string;
  productType: ProductType;
  title: string;
  amount: Money;
  user: { id: string; email: string | null; name: string };
  /** Per-request input from the app (receipt, wallet number…). */
  input: PaymentInput;
}

export interface PaymentInput {
  /** Play purchase token / App Store transaction id. */
  receipt?: string;
  /** Mobile wallet number. */
  phone?: string;
  /** Last 6 digits of the CNIC (JazzCash mobile-wallet API v2 requires them). */
  cnicLast6?: string;
  /** Where hosted pages send the person back (defaults to PAYMENT_RETURN_URL). */
  returnUrl?: string;
}

/** Data the app needs for the next step. */
export interface ActionData {
  /** redirect: open this URL (GET), or post `fields` to it (form POST). */
  url?: string;
  method?: 'GET' | 'POST';
  fields?: Record<string, string>;
  /** Text to show (bank details, "approve the request in your JazzCash app"). */
  instructions?: string;
  /** bank_transfer details. */
  bank?: { bankName: string; accountTitle: string; iban: string; reference: string; amount: string };
}

export type PaymentStep =
  | {
      status: 'succeeded';
      /** Unique per charge (order id, transaction id). */
      providerRef: string;
      /** Store handle kept for renewals/refunds (purchase token, original transaction id). */
      storeRef?: string;
      /** Store subscriptions: the paid period ends here. */
      periodEnd?: Date;
      code?: string;
      raw?: unknown;
    }
  | {
      status: 'pending';
      action: PaymentAction;
      providerRef?: string;
      actionData?: ActionData;
      expiresAt?: Date;
      /**
       * Work that takes a while (a wallet push waits up to ~60 s for the person
       * to approve). Runs after the API has answered; its result is applied
       * then. If the process dies, the reconciler's status check finishes it.
       */
      background?: () => Promise<PaymentStep>;
      code?: string;
      raw?: unknown;
    }
  | { status: 'failed'; reason: string; code?: string; raw?: unknown };

/** One way of paying. Live and dev implementations share this shape. */
export interface PaymentAdapter {
  readonly method: PaymentMethod;
  readonly flow: PaymentFlow;
  /** Name in logs and the event trail (e.g. "jazzcash", "dev-wallet"). */
  readonly provider: string;
  start(ctx: PaymentContext): Promise<PaymentStep>;
  /** Finish a step the person did in the app (OTP). */
  confirm?(ctx: PaymentContext, input: { otp: string }): Promise<PaymentStep>;
  /** Ask the provider where a pending payment stands (polling, after callbacks). */
  check?(ctx: PaymentContext): Promise<PaymentStep>;
  /** After fulfilment: tell the store we delivered (Play acknowledge/consume). Must be idempotent. */
  finalize?(ctx: PaymentContext): Promise<void>;
}

export interface MethodInfo {
  method: PaymentMethod;
  flow: PaymentFlow;
  label: string;
  mode: IntegrationMode;
  currency: Money['currency'];
  /** Which fields the app must collect before starting. */
  needs: ('receipt' | 'phone' | 'cnicLast6')[];
}

/** Store product id for a pack/plan: create these exact ids in Play Console and App Store Connect. */
export function storeSku(type: ProductType, id: string): string {
  return `${type === ProductType.COIN_PACK ? 'coins' : 'vip'}_${id}`.toLowerCase();
}

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  GOOGLE_PLAY: 'Google Play',
  APP_STORE: 'App Store',
  JAZZCASH: 'JazzCash',
  EASYPAISA: 'Easypaisa',
  CARD: 'Debit / credit card',
  BANK: 'Bank transfer',
};
