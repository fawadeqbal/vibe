import { ErrorCode } from '../../common/errors/error-codes';
import type { RedisService } from '../../infra/redis/redis.service';
import type { SettingsService } from '../settings/settings.service';
import type { GeoService } from '../site/geo.service';
import { phoneCountry, RegionService } from './region.service';

function make(opts: { enabled?: boolean; list?: string[]; geo?: Record<string, string> } = {}) {
  const settings = { all: async () => ({ 'region.blockEnabled': opts.enabled ?? true, 'region.blockedCountries': opts.list ?? ['IN', 'IL', 'AF'] }) } as unknown as SettingsService;
  const geo = { lookup: async (ip: string | null) => ({ country: (ip && opts.geo?.[ip]) || null, region: null, city: null }) } as unknown as GeoService;
  const counts: Record<string, Record<string, number>> = {};
  const multi = () => {
    const ops: (() => void)[] = [];
    const chain = {
      hincrby: (k: string, f: string, n: number) => (ops.push(() => ((counts[k] ??= {})[f] = (counts[k]?.[f] ?? 0) + n)), chain),
      expire: () => chain,
      exec: async () => ops.forEach((o) => o()),
    };
    return chain;
  };
  const redis = { client: { multi, hgetall: async (k: string) => Object.fromEntries(Object.entries(counts[k] ?? {}).map(([f, n]) => [f, String(n)])) } } as unknown as RedisService;
  return new RegionService(settings, geo, redis);
}

describe('RegionService', () => {
  it('blocks by Cloudflare country header', async () => {
    const r = make();
    expect(await r.blockedOrigin({ 'cf-ipcountry': 'IN' })).toBe('IN');
    expect(await r.blockedOrigin({ 'cf-ipcountry': 'pk' })).toBeNull();
  });

  it('blocks by the address even when the header says otherwise', async () => {
    const r = make({ geo: { '49.36.0.1': 'IN' } });
    expect(await r.blockedOrigin({ 'cf-ipcountry': 'PK', 'cf-connecting-ip': '49.36.0.1' })).toBe('IN');
    expect(await r.blockedOrigin({}, '49.36.0.1')).toBe('IN');
    expect(await r.blockedOrigin({}, '39.32.0.1')).toBeNull();
  });

  it('lets everyone through while switched off', async () => {
    const r = make({ enabled: false });
    expect(await r.blockedOrigin({ 'cf-ipcountry': 'IN' })).toBeNull();
    expect(await r.blockedList()).toEqual([]);
    await expect(r.assertPhone('+919876543210')).resolves.toBeUndefined();
  });

  it('follows the list staff set', async () => {
    const r = make({ list: ['BD'] });
    expect(await r.blockedOrigin({ 'cf-ipcountry': 'IN' })).toBeNull();
    expect(await r.blockedOrigin({ 'cf-ipcountry': 'BD' })).toBe('BD');
  });

  it('refuses with 451 REGION_UNAVAILABLE and counts it', async () => {
    const r = make();
    await expect(r.assertOrigin({ 'cf-ipcountry': 'AF' }, null, 'api', '/v1/auth/google')).rejects.toMatchObject({ code: ErrorCode.REGION_UNAVAILABLE, status: 451, details: { country: 'AF' } });
    await expect(r.assertCountry('IL')).rejects.toMatchObject({ code: ErrorCode.COUNTRY_NOT_SUPPORTED, status: 400, message: expect.stringContaining('Israel') });
    await expect(r.assertCountry('PK')).resolves.toBeUndefined();
    const s = await r.refusals(7);
    expect(s.total).toBe(2);
    expect(s.countries.map((c) => c.country).sort()).toEqual(['AF', 'IL']);
    expect(s.countries.find((c) => c.country === 'AF')?.places).toEqual({ api: 1 });
  });

  it('refuses phone numbers and IBANs from blocked countries', async () => {
    const r = make();
    for (const n of ['+91 98765 43210', '00972501234567', '+93701234567']) await expect(r.assertPhone(n)).rejects.toMatchObject({ code: ErrorCode.COUNTRY_NOT_SUPPORTED });
    for (const n of ['03001234567', '+923001234567', undefined]) await expect(r.assertPhone(n)).resolves.toBeUndefined();
    await expect(r.assertIban('IL62 0108 0000 0009 9999 999')).rejects.toMatchObject({ code: ErrorCode.COUNTRY_NOT_SUPPORTED });
    await expect(r.assertIban('PK36SCBL0000001123456702')).resolves.toBeUndefined();
  });
});

describe('phoneCountry', () => {
  it('reads international and Pakistani local numbers', () => {
    expect(phoneCountry('+919876543210')).toBe('IN');
    expect(phoneCountry('03001234567')).toBe('PK');
    expect(phoneCountry('nonsense')).toBeNull();
  });
});
