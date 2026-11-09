import { Injectable, Logger } from '@nestjs/common';
import { createPublicKey, verify } from 'node:crypto';

import { AppConfig } from '../../../config/app-config.service';
import { Integration, IntegrationMode, IntegrationReporter, IntegrationStatus, missingKeys, ProviderSwitch, resolveMode } from '../../../integrations/core/integration.types';
import { FetchLike, ProviderHttp } from '../../../integrations/core/provider-http';
import { AdPlatform, AdViews, RewardedAdProvider } from './ad-views';

const ADMOB_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';

/**
 * Google AdMob (phone apps only). The app shows the ad with
 * ServerSideVerificationOptions(userId = our user id, customData = a nonce);
 * AdMob calls /v1/webhooks/admob/ssv with a signed callback; we check Google's
 * signature, the ad unit and freshness, and mark the nonce watched.
 */
@Integration()
@Injectable()
export class AdMobProvider implements RewardedAdProvider, IntegrationReporter {
  readonly key = 'admob' as const;
  private readonly logger = new Logger(AdMobProvider.name);
  readonly mode: IntegrationMode;
  private keys = new Map<string, string>();
  private keysAt = 0;
  /** Swappable in tests. */
  fetchImpl: FetchLike = (i, init) => fetch(i, init);

  constructor(
    private readonly views: AdViews,
    private readonly config: AppConfig,
  ) {
    this.mode = resolveMode(config.get('ADS_VERIFIER') as ProviderSwitch, missingKeys(config.env, ['ADMOB_AD_UNIT_IDS']).length === 0, config.isProduction);
  }

  /** The app has the ad unit baked in, so there is nothing to send. Not on the web. */
  async clientSetup(platform: AdPlatform): Promise<Record<string, string> | null> {
    return platform === 'web' ? null : {};
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
    const pem = await this.publicKey(keyId);
    if (!pem || !verify('sha256', Buffer.from(message), createPublicKey(pem), Buffer.from(signature, 'base64url'))) return false;
    const units = this.config.list('ADMOB_AD_UNIT_IDS');
    const unit = p.get('ad_unit') ?? '';
    if (units.length && !units.some((u) => unit === u || u.endsWith(`/${unit}`))) {
      this.logger.warn(`AdMob reward for unexpected ad unit ${unit}`);
      return false;
    }
    const ts = Number(p.get('timestamp'));
    if (ts && Math.abs(Date.now() - ts) > 3600_000) return false;
    await this.views.markWatched(userId, p.get('custom_data') || tx, tx);
    return true;
  }

  private async publicKey(id: string): Promise<string | undefined> {
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
