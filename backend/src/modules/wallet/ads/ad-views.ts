import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../../infra/prisma/prisma.service';
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

export interface WatchedDetails {
  provider: AdProviderKey;
  /** Monetag: false for `non_valued` (unpaid) views. */
  valued?: boolean;
  /** The network's estimate of what the view earned, USD. */
  estimatedUsd?: number;
}

/**
 * Bookkeeping shared by every network. Redis: tickets, watched views, single
 * use (fast, expiring). Postgres `AdView`: one row per view for admin reports —
 * written best-effort, so reporting can never block a reward.
 */
@Injectable()
export class AdViews {
  private readonly logger = new Logger(AdViews.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /** A one-off id for one view. Monetag gets it as `ymid` and sends it back in its postback. */
  async issue(userId: string, provider: AdProviderKey, platform: AdPlatform): Promise<string> {
    const token = `v${randomBytes(15).toString('base64url')}`;
    await this.redis.client.set(TICKET(token), JSON.stringify({ userId, provider } satisfies AdTicket), 'EX', 3600);
    await this.record(() => this.prisma.adView.create({ data: { token, userId, provider, platform } }));
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
  async markWatched(userId: string, token: string, reference: string, details?: WatchedDetails): Promise<boolean> {
    const fresh = (await this.redis.client.set(VERIFIED(userId, token), reference, 'EX', 86400, 'NX')) === 'OK';
    await this.redis.client.del(TICKET(token));
    if (fresh && details && token.length <= 64) {
      const fields = { valued: details.valued ?? null, estimatedUsd: details.estimatedUsd ?? null, watchedAt: new Date() };
      // Older AdMob builds make their own nonce, so there may be no row yet.
      await this.record(() => this.prisma.adView.upsert({ where: { token }, update: fields, create: { token, userId, provider: details.provider, platform: 'app', ...fields } }));
    }
    return fresh;
  }

  /** Coins were paid for this view. */
  async paid(token: string, coins: number): Promise<void> {
    if (token.length > 64) return;
    await this.record(() => this.prisma.adView.updateMany({ where: { token, paidAt: null }, data: { coins, paidAt: new Date() } }));
  }

  private async record(write: () => Promise<unknown>): Promise<void> {
    try {
      await write();
    } catch (e) {
      this.logger.warn(`Ad view not recorded: ${(e as Error).message}`);
    }
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
