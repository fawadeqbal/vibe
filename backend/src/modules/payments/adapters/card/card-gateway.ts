/**
 * A card gateway with a hosted checkout page (card details never touch our
 * servers or the app, which keeps PCI scope minimal). To add a real gateway:
 *   1. implement this interface in card/gateways/<name>.gateway.ts,
 *   2. register it in CARD_GATEWAYS (card/gateways/index.ts),
 *   3. set CARD_GATEWAY=<name> and its keys (CARD_GATEWAY_API_KEY, …).
 * Everything else (purchases, webhooks, polling, expiry, the app's flow)
 * already works through the generic CardAdapter.
 */
export interface CardGateway {
  readonly name: string;
  /** Env keys this gateway needs (shown on the admin Integrations page). */
  readonly requiredEnv: string[];
  /** Start a hosted checkout for one purchase. */
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  /** Ask the gateway where a checkout stands. */
  getStatus(sessionRef: string): Promise<CardStatus>;
  /**
   * Verify a webhook (signature!) and say which checkout it is about.
   * Throw on a bad signature; return null for events we don't care about.
   * We never trust the payload's status: the CardAdapter re-checks with getStatus.
   */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<CardWebhook | null>;
}

export interface CheckoutInput {
  purchaseId: string;
  amountMinor: number;
  currency: 'PKR' | 'USD';
  description: string;
  customer: { id: string; email: string | null; name: string };
  /** Where the hosted page sends the person when done/cancelled. */
  returnUrl: string;
  cancelUrl: string;
  /** Our webhook URL for this gateway. */
  webhookUrl: string;
}

export interface CheckoutSession {
  sessionRef: string;
  redirectUrl: string;
  /** POST these fields to redirectUrl instead of opening it (some PK gateways). */
  fields?: Record<string, string>;
  expiresAt?: Date;
}

export type CardStatus =
  | { status: 'paid'; providerRef: string }
  | { status: 'pending' }
  | { status: 'failed' | 'expired'; reason: string };

export interface CardWebhook {
  /** Unique event id (dedupe). */
  eventId: string;
  type: string;
  sessionRef?: string;
  purchaseId?: string;
}
