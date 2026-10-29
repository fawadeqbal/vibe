import { Injectable, Logger } from '@nestjs/common';
import { isIP } from 'node:net';
import { dirname, join } from 'node:path';

export interface GeoLocation {
  country: string | null;
  region: string | null;
  city: string | null;
}

interface CityRecord {
  country_code?: string;
  state1?: string;
  city?: string;
}

/** The part of the maxmind reader we use (its record types don't fit this database's flat fields). */
interface Lookup {
  get(ip: string): unknown;
}

const NONE: GeoLocation = { country: null, region: null, city: null };

/** Addresses that can't be located: private, loopback, link-local, CGNAT. */
const PRIVATE =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i;

/**
 * The visitor's real address from the proxy chain, for a one-off location
 * lookup (never stored). Cloudflare's CF-Connecting-IP first, then the
 * first X-Forwarded-For entry, then X-Real-IP, then the socket address.
 */
export function clientIp(
  headers: Record<string, string | string[] | undefined>,
  fallback?: string | null,
): string | null {
  const first = (k: string) => {
    const v = headers[k];
    return (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim() || null;
  };
  for (const raw of [
    first('cf-connecting-ip'),
    first('true-client-ip'),
    first('x-forwarded-for'),
    first('x-real-ip'),
    fallback ?? null,
  ]) {
    if (!raw) continue;
    const ip = raw.replace(/^::ffff:/i, '').replace(/^\[|\]$/g, '');
    if (isIP(ip) && !PRIVATE.test(ip)) return ip;
  }
  return null;
}

/**
 * Country, region and city for an IP address, from the free GeoLite2 City
 * database shipped with the API (npm @ip-location-db/geolite2-city-mmdb,
 * CC BY-SA 4.0, MaxMind). Loaded once, on first use; lookups are in memory.
 */
@Injectable()
export class GeoService {
  private readonly log = new Logger(GeoService.name);
  private readers: Promise<{ v4: Lookup; v6: Lookup } | null> | null = null;

  private load() {
    if (!this.readers) {
      this.readers = (async () => {
        try {
          const { open } = await import('maxmind');
          const dir = dirname(require.resolve('@ip-location-db/geolite2-city-mmdb/package.json'));
          const [v4, v6] = await Promise.all([
            open(join(dir, 'geolite2-city-ipv4.mmdb')) as Promise<Lookup>,
            open(join(dir, 'geolite2-city-ipv6.mmdb')) as Promise<Lookup>,
          ]);
          return { v4, v6 };
        } catch (e) {
          this.log.warn(`IP location database not available: ${(e as Error).message}`);
          return null;
        }
      })();
    }
    return this.readers;
  }

  async lookup(ip: string | null): Promise<GeoLocation> {
    if (!ip) return NONE;
    const r = await this.load();
    if (!r) return NONE;
    try {
      const rec = (isIP(ip) === 6 ? r.v6 : r.v4).get(ip) as CityRecord | null;
      if (!rec) return NONE;
      const cc = rec.country_code?.toUpperCase();
      return {
        country: cc && /^[A-Z]{2}$/.test(cc) ? cc : null,
        region: rec.state1?.trim() || null,
        city: rec.city?.trim() || null,
      };
    } catch {
      return NONE;
    }
  }
}
