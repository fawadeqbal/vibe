import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { RedisService } from '../../../infra/redis/redis.service';

/** Where the person watches: decides which network the admin panel picked. */
export type AdPlatform = 'web' | 'android' | 'ios';
export const AD_PLATFORMS: readonly AdPlatform[] = ['web', 'android', 'ios'];

/** The ad networks Vibe knows. Add one by implementing [RewardedAdProvider]. */
export type AdProviderKey = 'monetag' | 'admob';

/**
 * One rewarded ad network. A provider tells the client how to show its ad
 * (`clientSetup`) and, from its own webhook, marks views as watched with
 * [AdViews.markWatched]. The claim (`POST /wallet/rewards/ad`) is the same for
 * every network, so adding one (e.g. Google Ad Manager on the web) needs no
 * change to the wallet.
 */
export interface RewardedAdProvider {
  readonly key: AdProviderKey;
  /** What the client needs to show this network's ad, or null when it can't right now (not set up). */
  clientSetup(platform: AdPlatform): Promise<Record<string, string> | null>;
}

export interface AdTicket {
  userId: string;
  provider: AdProviderKey;
}

const TICKET = (token: string) => `ad:ticket:${token}`;
const VERIFIED = (userId: string, token: string) => `ad:verified:${userId}:${token}`;
const USED = (userId: string, token: string) => `ad:used:${userId}:${token}`;

/** Redis bookkeeping shared by every network: tickets, watched views, single use. */
@Injectable()
export class AdViews {
  constructor(private readonly redis: RedisService) {}

  /** A one-off id for one view. Monetag gets it as `ymid` and sends it back in its postback. */
  async issue(userId: string, provider: AdProviderKey): Promise<string> {
    const token = `v${randomBytes(15).toString('base64url')}`;
    await this.redis.client.set(TICKET(token), JSON.stringify({ userId, provider } satisfies AdTicket), 'EX', 3600);
    return token;
  }

  async ticket(token: string): Promise<AdTicket | null> {
    const raw = await this.redis.client.get(TICKET(token));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AdTicket;
    } catch {
      return null;
    }
  }

  /** The network confirmed this view. The ticket is spent so a second postback does nothing. */
  async markWatched(userId: string, token: string, reference: string): Promise<boolean> {
    const fresh = (await this.redis.client.set(VERIFIED(userId, token), reference, 'EX', 86400, 'NX')) === 'OK';
    await this.redis.client.del(TICKET(token));
    return fresh;
  }

  /** Claims a confirmed view once. */
  async take(userId: string, token: string): Promise<boolean> {
    if ((await this.redis.client.del(VERIFIED(userId, token))) !== 1) return false;
    await this.redis.client.set(USED(userId, token), '1', 'EX', 86400 * 2);
    return true;
  }

  /** Development only: any token pays, once. */
  async takeUnverified(userId: string, token: string): Promise<boolean> {
    return (await this.redis.client.set(USED(userId, token), '1', 'EX', 86400 * 2, 'NX')) === 'OK';
  }
}
