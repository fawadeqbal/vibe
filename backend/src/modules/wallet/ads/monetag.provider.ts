import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { AppConfig } from '../../../config/app-config.service';
import { Integration, IntegrationReporter, IntegrationStatus } from '../../../integrations/core/integration.types';
import { SettingsService } from '../../settings/settings.service';
import { AdPlatform, AdViews, RewardedAdProvider } from './ad-views';

export type MonetagPostback = Partial<Record<'secret' | 'ymid' | 'event' | 'value' | 'zone' | 'price', string>>;
export type MonetagResult = 'paid' | 'duplicate' | 'ignored' | 'bad_secret' | 'wrong_zone' | 'unpaid_view' | 'unknown_view';

/**
 * Monetag Rewarded Interstitial (web, and in the app through the website's
 * /ad-frame page). The client asks us for a one-off token, shows the ad with
 * `show_<zone>({ ymid: token })`, and Monetag calls our postback URL
 * (`/v1/webhooks/monetag/postback`) with that ymid when the view counts.
 * Monetag doesn't sign postbacks, so the URL carries a secret, and the ymid
 * must be one we issued, unused, for a known person.
 *
 * Zone, SDK address and "pay unpaid views" are admin settings (Settings → Ads).
 */
@Integration()
@Injectable()
export class MonetagProvider implements RewardedAdProvider, IntegrationReporter {
  readonly key = 'monetag' as const;
  private readonly logger = new Logger(MonetagProvider.name);

  constructor(
    private readonly views: AdViews,
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
  ) {}

  /** MONETAG_POSTBACK_SECRET, or one derived from the server's own secret so it works without setup. */
  get secret(): string {
    return this.config.get('MONETAG_POSTBACK_SECRET') || createHmac('sha256', this.config.get('JWT_ACCESS_SECRET')).update('monetag-postback').digest('base64url').slice(0, 32);
  }

  async zone(): Promise<string> {
    return (await this.settings.get('ads.monetagZoneId')).trim();
  }

  async clientSetup(_platform: AdPlatform): Promise<Record<string, string> | null> {
    const zoneId = await this.zone();
    if (!zoneId) return null;
    return { zoneId, sdkUrl: await this.settings.get('ads.monetagSdkUrl'), frameUrl: `${this.config.get('WEB_APP_URL').replace(/\/$/, '')}/ad-frame` };
  }

  async acceptPostback(q: MonetagPostback): Promise<MonetagResult> {
    if (!this.secretMatches(q.secret)) return 'bad_secret';
    // Clicks come as a second postback for the same view; only the impression pays.
    if (q.event && q.event !== 'impression') return 'ignored';
    const zone = await this.zone();
    if (!zone || q.zone !== zone) {
      this.logger.warn(`Monetag postback for zone ${q.zone ?? '?'} (expected ${zone || 'none'})`);
      return 'wrong_zone';
    }
    if (q.value !== 'valued' && !(await this.settings.get('ads.monetagPayUnpaidViews'))) return 'unpaid_view';
    const token = q.ymid ?? '';
    const ticket = token ? await this.views.ticket(token) : null;
    if (!ticket || ticket.provider !== 'monetag') return 'unknown_view';
    const price = Number(q.price);
    const details = { provider: 'monetag' as const, valued: q.value === 'valued', estimatedUsd: Number.isFinite(price) && price >= 0 ? price : undefined };
    return (await this.views.markWatched(ticket.userId, token, `monetag:${q.value ?? 'valued'}`, details)) ? 'paid' : 'duplicate';
  }

  private secretMatches(given: string | undefined): boolean {
    const a = Buffer.from(given ?? '');
    const b = Buffer.from(this.secret);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async integrationStatus(): Promise<IntegrationStatus> {
    const zone = await this.zone();
    const [web, app] = await Promise.all([this.settings.get('ads.web'), this.settings.get('ads.app')]);
    const used = [web === 'monetag' ? 'website' : null, app === 'monetag' ? 'app' : null].filter(Boolean);
    return {
      key: 'ads.monetag',
      kind: 'ads',
      label: 'Monetag rewarded ads',
      mode: zone ? 'live' : 'off',
      requiredEnv: [],
      missingEnv: [],
      endpoints: [
        {
          label: 'Postback URL — paste in Monetag (zone → Postback)',
          url: this.config.url(`/v1/webhooks/monetag/postback?secret=${this.secret}&ymid={ymid}&event={event_type}&value={reward_event_type}&zone={zone_id}&price={estimated_price}`),
        },
      ],
      notes: [
        zone ? `Zone ${zone}` : 'Add the zone ID in Settings → Ads.',
        used.length ? `Shown in the Store on the ${used.join(' and ')}.` : 'Not picked for the website or the app (Settings → Ads).',
        'Keep the postback URL private: it contains the secret.',
      ],
      docsUrl: 'https://docs.monetag.com/docs/postbacks/macroses/',
    };
  }
}
