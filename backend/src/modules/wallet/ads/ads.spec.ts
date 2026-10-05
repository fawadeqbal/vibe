import { generateKeyPairSync, sign } from 'node:crypto';

import { AppConfig } from '../../../config/app-config.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { AdsService } from './ads.service';

/** In-memory stand-in for the bits of Redis AdsService uses. */
function fakeRedis() {
  const m = new Map<string, string>();
  return {
    client: {
      set: async (k: string, v: string, ...args: unknown[]) => (args.includes('NX') && m.has(k) ? null : (m.set(k, v), 'OK')),
      del: async (k: string) => (m.delete(k) ? 1 : 0),
    },
  } as unknown as RedisService;
}

describe('AdMob server-side verification', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const config = (units: string) =>
    ({ get: (k: string) => ({ ADS_VERIFIER: 'live', ADMOB_AD_UNIT_IDS: units })[k], env: { ADMOB_AD_UNIT_IDS: units }, isProduction: true, list: () => units.split(','), url: (p: string) => p }) as unknown as AppConfig;
  const callback = (q: Record<string, string>) => {
    const message = new URLSearchParams(q).toString();
    const sig = sign('sha256', Buffer.from(message), privateKey).toString('base64url');
    return `${message}&signature=${sig}&key_id=42`;
  };
  const service = (units = '1234567890') => {
    const s = new AdsService(fakeRedis(), config(units));
    s.fetchImpl = async () => new Response(JSON.stringify({ keys: [{ keyId: 42, pem: publicKey.export({ type: 'spki', format: 'pem' }) }] }), { headers: { 'content-type': 'application/json' } });
    return s;
  };
  const base = { ad_network: '5450213213286189855', ad_unit: '1234567890', custom_data: 'nonce-9', reward_amount: '1', reward_item: 'coins', timestamp: String(Date.now()), transaction_id: 'tx-1', user_id: 'u1' };

  it('accepts a signed callback, then the claim pays once', async () => {
    const s = service();
    expect(s.mode).toBe('live');
    expect(await s.acceptCallback(callback(base))).toBe(true);
    expect(await s.consume('u1', 'nonce-9', 0)).toBe(true);
    expect(await s.consume('u1', 'nonce-9', 0)).toBe(false);
  });

  it('rejects tampering, other ad units and stale callbacks', async () => {
    const s = service();
    expect(await s.acceptCallback(callback(base).replace('user_id=u1', 'user_id=u2'))).toBe(false);
    expect(await s.acceptCallback(callback({ ...base, ad_unit: '999' }))).toBe(false);
    expect(await s.acceptCallback(callback({ ...base, timestamp: String(Date.now() - 2 * 3600_000) }))).toBe(false);
    expect(await s.consume('u1', 'nonce-9', 0)).toBe(false);
  });
});
