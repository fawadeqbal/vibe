import { generateKeyPairSync, sign } from 'node:crypto';

import { AppConfig } from '../../../config/app-config.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { SettingsService } from '../../settings/settings.service';
import { AdViews } from './ad-views';
import { AdMobProvider } from './admob.provider';
import { AdsService } from './ads.service';
import { MonetagProvider } from './monetag.provider';

/** In-memory stand-in for the bits of Redis the ads code uses. */
function fakeRedis() {
  const m = new Map<string, string>();
  return {
    client: {
      set: async (k: string, v: string, ...args: unknown[]) => (args.includes('NX') && m.has(k) ? null : (m.set(k, v), 'OK')),
      get: async (k: string) => m.get(k) ?? null,
      del: async (k: string) => (m.delete(k) ? 1 : 0),
    },
  } as unknown as RedisService;
}

/** Records AdView writes; reporting is best-effort, so one test makes it throw. */
function fakePrisma(rows: Map<string, Record<string, unknown>> = new Map(), fail = false) {
  const guard = () => {
    if (fail) throw new Error('db down');
  };
  return {
    adView: {
      create: async ({ data }: { data: Record<string, unknown> }) => (guard(), rows.set(data.token as string, { ...data })),
      upsert: async ({ where, update, create }: { where: { token: string }; update: Record<string, unknown>; create: Record<string, unknown> }) => {
        guard();
        rows.set(where.token, rows.has(where.token) ? { ...rows.get(where.token), ...update } : { ...create });
      },
      updateMany: async ({ where, data }: { where: { token: string }; data: Record<string, unknown> }) => {
        guard();
        if (rows.has(where.token)) rows.set(where.token, { ...rows.get(where.token), ...data });
      },
    },
  } as unknown as PrismaService;
}

function fakeSettings(values: Record<string, unknown>) {
  const s = { 'ads.web': 'monetag', 'ads.app': 'admob', 'ads.monetagZoneId': '9876543', 'ads.monetagSdkUrl': 'https://libtl.com/sdk.js', 'ads.monetagPayUnpaidViews': true, ...values };
  return { get: async (k: string) => s[k as keyof typeof s] } as unknown as SettingsService;
}

const config = (env: Record<string, string>, isProduction = true) =>
  ({
    get: (k: string) => ({ ADS_VERIFIER: 'auto', JWT_ACCESS_SECRET: 'x'.repeat(40), WEB_APP_URL: 'https://app.example.com/', ...env })[k],
    env,
    isProduction,
    list: (k: string) => (env[k] ? env[k].split(',') : []),
    url: (p: string) => `https://api.example.com${p}`,
  }) as unknown as AppConfig;

describe('AdMob server-side verification', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const callback = (q: Record<string, string>) => {
    const message = new URLSearchParams(q).toString();
    const sig = sign('sha256', Buffer.from(message), privateKey).toString('base64url');
    return `${message}&signature=${sig}&key_id=42`;
  };
  const build = (units = '1234567890') => {
    const views = new AdViews(fakeRedis(), fakePrisma());
    const cfg = config({ ADS_VERIFIER: 'live', ADMOB_AD_UNIT_IDS: units });
    const admob = new AdMobProvider(views, cfg);
    admob.fetchImpl = async () => new Response(JSON.stringify({ keys: [{ keyId: 42, pem: publicKey.export({ type: 'spki', format: 'pem' }) }] }), { headers: { 'content-type': 'application/json' } });
    const settings = fakeSettings({});
    const ads = new AdsService(views, settings, cfg, admob, new MonetagProvider(views, settings, cfg));
    return { admob, ads };
  };
  const base = { ad_network: '5450213213286189855', ad_unit: '1234567890', custom_data: 'nonce-9', reward_amount: '1', reward_item: 'coins', timestamp: String(Date.now()), transaction_id: 'tx-1', user_id: 'u1' };

  it('accepts a signed callback, then the claim pays once', async () => {
    const { admob, ads } = build();
    expect(admob.mode).toBe('live');
    expect(await admob.acceptCallback(callback(base))).toBe(true);
    expect(await ads.consume('u1', 'nonce-9', 0)).toBe(true);
    expect(await ads.consume('u1', 'nonce-9', 0)).toBe(false);
  });

  it('rejects tampering, other ad units and stale callbacks', async () => {
    const { admob, ads } = build();
    expect(await admob.acceptCallback(callback(base).replace('user_id=u1', 'user_id=u2'))).toBe(false);
    expect(await admob.acceptCallback(callback({ ...base, ad_unit: '999' }))).toBe(false);
    expect(await admob.acceptCallback(callback({ ...base, timestamp: String(Date.now() - 2 * 3600_000) }))).toBe(false);
    expect(await ads.consume('u1', 'nonce-9', 0)).toBe(false);
  });
});

describe('Monetag postbacks', () => {
  const build = (settings: Record<string, unknown> = {}, env: Record<string, string> = {}, isProduction = true, rows = new Map<string, Record<string, unknown>>(), dbDown = false) => {
    const views = new AdViews(fakeRedis(), fakePrisma(rows, dbDown));
    const cfg = config(env, isProduction);
    const s = fakeSettings(settings);
    const monetag = new MonetagProvider(views, s, cfg);
    const ads = new AdsService(views, s, cfg, new AdMobProvider(views, cfg), monetag);
    return { monetag, ads, rows };
  };
  const postback = (monetag: MonetagProvider, ymid: string, extra: Record<string, string> = {}) =>
    monetag.acceptPostback({ secret: monetag.secret, ymid, event: 'impression', value: 'valued', zone: '9876543', ...extra });

  it('serves the admin-picked network per platform', async () => {
    const { ads } = build();
    expect(await ads.setup('web')).toEqual({ provider: 'monetag', config: { zoneId: '9876543', sdkUrl: 'https://libtl.com/sdk.js', frameUrl: 'https://app.example.com/ad-frame' } });
    expect(await ads.setup('android')).toEqual({ provider: 'admob', config: {} });
    expect((await build({ 'ads.web': 'off' }).ads.setup('web')).provider).toBe('off');
    // Monetag picked but no zone yet: hidden, not broken.
    expect((await build({ 'ads.monetagZoneId': '' }).ads.setup('web')).provider).toBe('off');
    await expect(build({ 'ads.web': 'off' }).ads.start('u1', 'web')).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });

  it('pays a confirmed view once, only to the person it was issued to', async () => {
    const { monetag, ads } = build();
    const { token } = await ads.start('u1', 'web');
    expect(await ads.consume('u1', token, 0)).toBe(false); // not confirmed yet
    expect(await postback(monetag, token)).toBe('paid');
    expect(await postback(monetag, token)).toBe('unknown_view'); // ticket spent
    expect(await ads.consume('u2', token, 0)).toBe(false);
    expect(await ads.consume('u1', token, 0)).toBe(true);
    expect(await ads.consume('u1', token, 0)).toBe(false);
  });

  it('refuses bad secrets, other zones, made-up ids, and clicks', async () => {
    const { monetag, ads } = build();
    const { token } = await ads.start('u1', 'web');
    expect(await postback(monetag, token, { secret: 'nope' })).toBe('bad_secret');
    expect(await postback(monetag, token, { zone: '111' })).toBe('wrong_zone');
    expect(await postback(monetag, 'vMadeUp')).toBe('unknown_view');
    expect(await postback(monetag, token, { event: 'click' })).toBe('ignored');
    expect(await ads.consume('u1', token, 0)).toBe(false);
  });

  it('unpaid views pay coins only when the admin allows it', async () => {
    const strict = build({ 'ads.monetagPayUnpaidViews': false });
    const a = await strict.ads.start('u1', 'web');
    expect(await postback(strict.monetag, a.token, { value: 'non_valued' })).toBe('unpaid_view');
    const lenient = build();
    const b = await lenient.ads.start('u1', 'web');
    expect(await postback(lenient.monetag, b.token, { value: 'non_valued' })).toBe('paid');
  });

  it('ADS_VERIFIER=dev never skips the postback in production', async () => {
    const prod = build({}, { ADS_VERIFIER: 'dev' }, true);
    const { token } = await prod.ads.start('u1', 'web');
    expect(await prod.ads.consume('u1', token, 0)).toBe(false);
    const dev = build({}, { ADS_VERIFIER: 'dev' }, false);
    const t2 = (await dev.ads.start('u1', 'web')).token;
    expect(await dev.ads.consume('u1', t2, 0)).toBe(true);
  });

  it('records each view for the admin report: started, watched with earnings, paid', async () => {
    const { monetag, ads, rows } = build();
    const { token } = await ads.start('u1', 'web');
    expect(rows.get(token)).toMatchObject({ userId: 'u1', provider: 'monetag', platform: 'web' });
    await postback(monetag, token, { price: '0.0012345' });
    expect(rows.get(token)).toMatchObject({ valued: true, estimatedUsd: 0.0012345 });
    await ads.paid(token, 10);
    expect(rows.get(token)).toMatchObject({ coins: 10 });
    expect(rows.get(token)!.paidAt).toBeInstanceOf(Date);
  });

  it('a database hiccup never blocks the reward', async () => {
    const { monetag, ads } = build({}, {}, true, new Map(), true);
    const { token } = await ads.start('u1', 'web');
    expect(await postback(monetag, token)).toBe('paid');
    expect(await ads.consume('u1', token, 0)).toBe(true);
  });

  it('uses MONETAG_POSTBACK_SECRET when set, a derived one otherwise', () => {
    expect(build({}, { MONETAG_POSTBACK_SECRET: 's3cret' }).monetag.secret).toBe('s3cret');
    expect(build().monetag.secret).toHaveLength(32);
  });
});
