import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { RedisService } from '../../infra/redis/redis.service';
import type { SettingsSnapshot } from '../settings/settings.registry';
import { SettingsService } from '../settings/settings.service';
import { clientIp, GeoService } from '../site/geo.service';

type Headers = Record<string, string | string[] | undefined>;

/** Where a refusal happened (counted per country and day for the admin panel). */
export type RefusalPlace = 'api' | 'socket' | 'profile' | 'phone' | 'payout' | 'card';

/** HTTP 451 Unavailable For Legal Reasons (Nest's HttpStatus has no name for it). */
export const UNAVAILABLE_FOR_LEGAL_REASONS = 451 as HttpStatus;

const DAY_KEY = (d: Date) => `region:refused:${d.toISOString().slice(0, 10)}`;
const KEEP_DAYS = 40;

/**
 * Countries Vibe isn't offered in (admin → Settings → Region). Cloudflare
 * blocks them at the edge (`npm run region:cloudflare`); this is the check
 * behind it, for traffic that reaches the API anyway, plus the signals an
 * address can't give: the profile's country, phone numbers, IBANs and cards.
 */
@Injectable()
export class RegionService {
  private readonly log = new Logger(RegionService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly geo: GeoService,
    private readonly redis: RedisService,
  ) {}

  /** The blocked list, or none while blocking is switched off. */
  async blocked(): Promise<ReadonlySet<string>> {
    return blockedCountries(await this.settings.all());
  }

  /** The list clients leave out of their country pickers (empty while blocking is off). */
  async blockedList(): Promise<string[]> {
    return [...(await this.blocked())].sort();
  }

  /**
   * Which blocked country a request comes from, or null. Both Cloudflare's
   * CF-IPCountry and our own lookup of the address are checked, so one wrong
   * or missing answer can't let a visitor through.
   */
  async blockedOrigin(headers: Headers, socketIp?: string | null): Promise<string | null> {
    const blocked = await this.blocked();
    if (!blocked.size) return null;
    const cf = first(headers['cf-ipcountry'])?.toUpperCase();
    if (cf && blocked.has(cf)) return cf;
    const { country } = await this.geo.lookup(clientIp(headers, socketIp));
    return country && blocked.has(country) ? country : null;
  }

  /** Throws REGION_UNAVAILABLE (and counts it) when the request comes from a blocked country. */
  async assertOrigin(headers: Headers, socketIp: string | null | undefined, place: RefusalPlace, path?: string): Promise<void> {
    const cc = await this.blockedOrigin(headers, socketIp);
    if (cc) throw await this.refuse(cc, place, path);
  }

  /** A profile may not say it's in a blocked country. */
  async assertCountry(code: string | null | undefined, place: RefusalPlace = 'profile'): Promise<void> {
    if (code && (await this.blocked()).has(code)) throw await this.refuse(code, place, undefined, `Vibe isn't available in ${countryName(code)}. Choose the country you live in.`);
  }

  /** Phone numbers from a blocked country (+91, +972, +93 by default) are refused. */
  async assertPhone(raw: string | null | undefined, place: RefusalPlace = 'phone'): Promise<void> {
    const cc = phoneCountry(raw);
    if (cc && (await this.blocked()).has(cc)) throw await this.refuse(cc, place, undefined, `Phone numbers from ${countryName(cc)} can't be used on Vibe.`);
  }

  /** Bank accounts in a blocked country (the IBAN's first two letters) are refused. */
  async assertIban(iban: string | null | undefined): Promise<void> {
    const cc = iban?.replace(/\s+/g, '').slice(0, 2).toUpperCase();
    if (cc && /^[A-Z]{2}$/.test(cc) && (await this.blocked()).has(cc)) throw await this.refuse(cc, 'payout', undefined, `Bank accounts in ${countryName(cc)} can't be used on Vibe.`);
  }

  /**
   * Counts a refusal and builds the error: 451 REGION_UNAVAILABLE for the
   * visitor's own location (the apps then show only the "not available"
   * screen), 400 COUNTRY_NOT_SUPPORTED with `message` for a field (profile
   * country, phone, IBAN), which the form shows next to it.
   */
  async refuse(country: string, place: RefusalPlace, path?: string, message?: string): Promise<AppError> {
    this.log.warn({ country, place, path }, 'Refused: blocked country');
    try {
      const key = DAY_KEY(new Date());
      await this.redis.client.multi().hincrby(key, `${country}:${place}`, 1).expire(key, KEEP_DAYS * 86_400).exec();
    } catch {
      // Counting is best effort; the refusal still stands.
    }
    if (message) return new AppError(ErrorCode.COUNTRY_NOT_SUPPORTED, message, HttpStatus.BAD_REQUEST, { country });
    return new AppError(ErrorCode.REGION_UNAVAILABLE, "Vibe isn't available in your region.", UNAVAILABLE_FOR_LEGAL_REASONS, { country });
  }

  /** Refusals per country over the last `days` days (admin → Settings → Region). */
  async refusals(days = 7): Promise<{ days: number; total: number; countries: { country: string; total: number; places: Record<string, number> }[] }> {
    const now = Date.now();
    const keys = Array.from({ length: days }, (_, i) => DAY_KEY(new Date(now - i * 86_400_000)));
    const rows = await Promise.all(keys.map((k) => this.redis.client.hgetall(k).catch(() => ({}) as Record<string, string>)));
    const by = new Map<string, { country: string; total: number; places: Record<string, number> }>();
    for (const row of rows) {
      for (const [field, raw] of Object.entries(row)) {
        const [country, place] = field.split(':');
        const n = Number(raw) || 0;
        const e = by.get(country) ?? { country, total: 0, places: {} };
        e.total += n;
        e.places[place] = (e.places[place] ?? 0) + n;
        by.set(country, e);
      }
    }
    const countries = [...by.values()].sort((a, b) => b.total - a.total);
    return { days, total: countries.reduce((t, c) => t + c.total, 0), countries };
  }
}

/** The blocked countries in a settings snapshot (none while blocking is off). */
export function blockedCountries(s: Pick<SettingsSnapshot, 'region.blockEnabled' | 'region.blockedCountries'>): ReadonlySet<string> {
  return new Set(s['region.blockEnabled'] ? s['region.blockedCountries'] : []);
}

/** The country a phone number belongs to (international or Pakistani local format), or null. */
export function phoneCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/^00/, '+');
  try {
    return parsePhoneNumberFromString(s, 'PK')?.country ?? null;
  } catch {
    return null;
  }
}

const NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

/** "IN" → "India" (the code itself if unknown). */
export function countryName(code: string): string {
  try {
    return NAMES.of(code) ?? code;
  } catch {
    return code;
  }
}

function first(v: string | string[] | undefined): string | undefined {
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
}
