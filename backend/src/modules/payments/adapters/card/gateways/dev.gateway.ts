import { createHmac } from 'node:crypto';

import { randomToken, safeEqual } from '../../../../../common/utils/crypto';
import { RedisService } from '../../../../../infra/redis/redis.service';
import { CardGateway, CardStatus, CardWebhook, CheckoutInput, CheckoutSession } from '../card-gateway';

interface DevSession {
  purchaseId: string;
  amountMinor: number;
  currency: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  webhookUrl: string;
  status: 'pending' | 'paid' | 'failed';
}

const KEY = (ref: string) => `dev-card:${ref}`;

/**
 * A built-in fake gateway with a real hosted page (/v1/payments/dev-checkout/:ref)
 * where you press Pay or Decline — so the app's whole card flow (open page,
 * come back, webhook, polling) can be tested on a phone without a merchant account.
 */
export class DevCardGateway implements CardGateway {
  readonly name = 'dev';
  readonly requiredEnv: string[] = [];

  constructor(
    private readonly redis: RedisService,
    private readonly publicUrl: (path: string) => string,
    private readonly webhookSecret: string,
  ) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const ref = `dcs_${randomToken(12)}`;
    const session: DevSession = { ...input, status: 'pending' };
    await this.redis.setJson(KEY(ref), session, 3600);
    return { sessionRef: ref, redirectUrl: this.publicUrl(`/v1/payments/dev-checkout/${ref}`), expiresAt: new Date(Date.now() + 30 * 60_000) };
  }

  async session(ref: string): Promise<DevSession | null> {
    return this.redis.getJson<DevSession>(KEY(ref));
  }

  /** The hosted page's buttons. Returns where to send the browser. */
  async complete(ref: string, pay: boolean): Promise<{ session: DevSession; body: string; signature: string } | null> {
    const s = await this.session(ref);
    if (!s || s.status !== 'pending') return null;
    s.status = pay ? 'paid' : 'failed';
    await this.redis.setJson(KEY(ref), s, 3600);
    const body = JSON.stringify({ id: `evt_${randomToken(8)}`, type: pay ? 'checkout.paid' : 'checkout.failed', sessionRef: ref, purchaseId: s.purchaseId });
    return { session: s, body, signature: this.sign(body) };
  }

  async getStatus(ref: string): Promise<CardStatus> {
    const s = await this.session(ref);
    if (!s) return { status: 'expired', reason: 'The card page expired' };
    if (s.status === 'paid') return { status: 'paid', providerRef: `ch_${ref.slice(4)}` };
    if (s.status === 'failed') return { status: 'failed', reason: 'Your bank declined the card. Try another card.' };
    return { status: 'pending' };
  }

  async parseWebhook(raw: Buffer, headers: Record<string, string | string[] | undefined>): Promise<CardWebhook | null> {
    const sig = headers['x-dev-signature'];
    if (typeof sig !== 'string' || !safeEqual(sig, this.sign(raw.toString('utf8')))) throw new Error('Bad signature');
    const e = JSON.parse(raw.toString('utf8')) as { id: string; type: string; sessionRef: string; purchaseId: string };
    return { eventId: e.id, type: e.type, sessionRef: e.sessionRef, purchaseId: e.purchaseId };
  }

  sign(body: string): string {
    return createHmac('sha256', this.webhookSecret).update(body).digest('hex');
  }
}
