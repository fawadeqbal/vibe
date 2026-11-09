import { HttpStatus, Injectable } from '@nestjs/common';

import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AppConfig } from '../../../config/app-config.service';
import { SettingsService } from '../../settings/settings.service';
import { AdPlatform, AdProviderKey, AdViews, RewardedAdProvider } from './ad-views';
import { AdMobProvider } from './admob.provider';
import { MonetagProvider } from './monetag.provider';

export interface AdSetup {
  /** `off` hides the Store's video card. */
  provider: AdProviderKey | 'off';
  /** Provider-specific client config (Monetag: zoneId, sdkUrl, frameUrl). */
  config?: Record<string, string>;
}

/**
 * Rewarded videos in the Store, whatever the network.
 *
 * 1. `setup(platform)`: which network the admin picked for the website / app.
 * 2. `start(userId, platform)`: a one-off token for one view.
 * 3. The client shows the network's ad with that token; the network's webhook
 *    marks the view watched ([AdViews.markWatched]).
 * 4. `consume(userId, token)`: the claim pays once, after the network confirmed.
 */
@Injectable()
export class AdsService {
  private readonly providers: Record<AdProviderKey, RewardedAdProvider>;

  constructor(
    private readonly views: AdViews,
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
    private readonly admob: AdMobProvider,
    monetag: MonetagProvider,
  ) {
    this.providers = { admob, monetag };
  }

  async setup(platform: AdPlatform): Promise<AdSetup> {
    const picked = platform === 'web' ? await this.settings.get('ads.web') : await this.settings.get('ads.app');
    if (picked === 'off') return { provider: 'off' };
    const config = await this.providers[picked].clientSetup(platform);
    return config ? { provider: picked, config } : { provider: 'off' };
  }

  async start(userId: string, platform: AdPlatform): Promise<AdSetup & { token: string }> {
    const s = await this.setup(platform);
    if (s.provider === 'off') throw new AppError(ErrorCode.FEATURE_DISABLED, 'Videos are off for now', HttpStatus.FORBIDDEN);
    return { ...s, token: await this.views.issue(userId, s.provider, platform) };
  }

  /**
   * Claims a watched view once, waiting briefly for the network's callback
   * (it usually lands within a few seconds of the ad closing).
   */
  async consume(userId: string, token: string, waitMs = 8000): Promise<boolean> {
    if (!token) return false;
    if (await this.views.take(userId, token)) return true;
    const ticket = await this.views.ticket(token);
    if (ticket) {
      if (ticket.userId !== userId) return false;
      // Tokens we issued (Monetag) always need the network's postback, except on a dev machine.
      if (this.devPays && !this.config.isProduction) return this.views.takeUnverified(userId, token);
    } else if (this.devPays) {
      // Older app builds make their own AdMob nonce; ADS_VERIFIER=dev pays those as before.
      return this.views.takeUnverified(userId, token);
    }
    const until = Date.now() + waitMs;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 250));
      if (await this.views.take(userId, token)) return true;
    }
    return false;
  }

  /** For the admin report: coins actually paid for this view. */
  paid(token: string, coins: number): Promise<void> {
    return this.views.paid(token, coins);
  }

  private get devPays(): boolean {
    return this.admob.mode === 'dev';
  }
}
