import { Injectable, Logger } from '@nestjs/common';
import { createPublicKey, verify } from 'node:crypto';

import { AppConfig } from '../../../config/app-config.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { Integration, IntegrationMode, IntegrationReporter, IntegrationStatus, missingKeys, ProviderSwitch, resolveMode } from '../../../integrations/core/integration.types';
import { FetchLike, ProviderHttp } from '../../../integrations/core/provider-http';

const ADMOB_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const VERIFIED = (userId: string, token: string) => `ad:verified:${userId}:${token}`;
const USED = (userId: string, token: string) => `ad:used:${userId}:${token}`;

/**
 * Rewarded ads must really have been watched before coins are paid.
 *
 * Live (AdMob server-side verification): the app shows the ad with
 * ServerSideVerificationOptions(userId = our user id, customData = a fresh
 * nonce). AdMob calls /v1/webhooks/admob/ssv with a signed callback; we check
 * Google's signature, the ad unit and freshness, and remember the nonce.
 * The app then claims with that nonce (POST /wallet/rewards/ad).
 *
 * Dev: any token, once.
 */
@Integration()
@Injectable()
export class AdsService implements IntegrationReporter {
  private readonly logger = new Logger(AdsService.name);
  readonly mode: IntegrationMode;
  private keys = new Map<string, string>();
  private keysAt = 0;
  /** Swappable in tests. */
  fetchImpl: FetchLike = (i, init) => fetch(i, init);

  constructor(
    private readonly redis: RedisService,
    private readonly config: AppConfig,
  ) {
    this.mode = resolveMode(config.get('ADS_VERIFIER') as ProviderSwitch, missingKeys(config.env, ['ADMOB_AD_UNIT_IDS']).length === 0, config.isProduction);
  }

  /** AdMob's callback (raw query string, signature over everything before `&signature=`). */
  async acceptCallback(rawQuery: string): Promise<boolean> {
    if (this.mode !== 'live') return false;
    const sigIndex = rawQuery.indexOf('&signature=');
    if (sigIndex < 0) return false;
    const message = rawQuery.slice(0, sigIndex);
    const p = new URLSearchParams(rawQuery);
    const signature = p.get('signature');
    const keyId = p.get('key_id');
    const tx = p.get('transaction_id');
    const userId = p.get('user_id');
    if (!signature || !keyId || !tx || !userId) return false;
    const pem = await this.key(keyId);
    if (!pem || !verify('sha256', Buffer.from(message), createPublicKey(pem), Buffer.from(signature, 'base64url'))) return false;
    const units = this.config.list('ADMOB_AD_UNIT_IDS');
    const unit = p.get('ad_unit') ?? '';
    if (units.length && !units.some((u) => unit === u || u.endsWith(`/${unit}`))) {
      this.logger.warn(`AdMob reward for unexpected ad unit ${unit}`);
      return false;
    }
    const ts = Number(p.get('timestamp'));
    if (ts && Math.abs(Date.now() - ts) > 3600_000) return false;
    const token = p.get('custom_data') || tx;
    await this.redis.client.set(VERIFIED(userId, token), tx, 'EX', 86400);
    return true;
  }

  /**
   * Waits briefly for AdMob's callback (it usually lands within a second or
   * two of the ad closing) and claims the token once.
   */
  async consume(userId: string, token: string, waitMs = 4000): Promise<boolean> {
    if (!token) return false;
    if (this.mode === 'dev') return (await this.redis.client.set(USED(userId, token), '1', 'EX', 86400 * 2, 'NX')) === 'OK';
    if (this.mode === 'off') return false;
    const until = Date.now() + waitMs;
    do {
      if ((await this.redis.client.del(VERIFIED(userId, token))) === 1) return true;
      await new Promise((r) => setTimeout(r, 250));
    } while (Date.now() < until);
    return false;
  }

  private async key(id: string): Promise<string | undefined> {
    if (Date.now() - this.keysAt > 24 * 3600_000 || !this.keys.has(id)) {
      try {
        const r = await new ProviderHttp('admob-keys', '', this.fetchImpl).request<{ keys: { keyId: number; pem: string }[] }>(ADMOB_KEYS_URL, { retries: 2 });
        this.keys = new Map(r.body.keys.map((k) => [String(k.keyId), k.pem]));
        this.keysAt = Date.now();
      } catch (e) {
        this.logger.warn(`Could not fetch AdMob keys: ${(e as Error).message}`);
      }
    }
    return this.keys.get(id);
  }

  integrationStatus(): IntegrationStatus {
    return {
      key: 'ads.admob',
      kind: 'ads',
      label: 'AdMob rewarded ads',
      mode: this.mode,
      requiredEnv: ['ADMOB_AD_UNIT_IDS'],
      missingEnv: missingKeys(this.config.env, ['ADMOB_AD_UNIT_IDS']),
      endpoints: [{ label: 'Server-side verification callback URL', url: this.config.url('/v1/webhooks/admob/ssv') }],
      notes: this.mode === 'dev' ? ['Dev: any ad token pays once.'] : [],
    };
  }
}
