import { classifySource, isBot, locationFrom, parseDevice } from './site-source';

const own = ['vibe.test', 'app.vibe.test'];
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const android = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';

describe('classifySource', () => {
  const src = (url: string, referrer?: string, userAgent?: string) => classifySource({ url, referrer, userAgent, ownHosts: own });

  it('UTM tags win, with aliases and a guessed medium', () => {
    expect(src('/?utm_source=TikTok&utm_campaign=Launch Week', 'https://www.google.com/')).toMatchObject({ source: 'tiktok', medium: 'social', campaign: 'launch-week' });
    expect(src('/?utm_source=fb&utm_medium=paid')).toMatchObject({ source: 'facebook', medium: 'paid' });
    expect(src('/?utm_source=propakistani.pk')).toMatchObject({ source: 'propakistani.pk', medium: 'referral' });
  });

  it('ad click ids and invite links', () => {
    expect(src('/?gclid=abc')).toMatchObject({ source: 'google', medium: 'paid' });
    expect(src('/i/ALI')).toMatchObject({ source: 'invite', medium: 'invite' });
    expect(src('/?invite=ALI')).toMatchObject({ source: 'invite' });
  });

  it('referring sites: search, social, AI, other; own site is not a source', () => {
    expect(src('/omegle-alternative/', 'https://www.google.com.pk/')).toMatchObject({ source: 'google', medium: 'search', referrerHost: 'google.com.pk' });
    expect(src('/', 'https://l.facebook.com/l.php?u=x')).toMatchObject({ source: 'facebook', medium: 'social' });
    expect(src('/', 'https://chatgpt.com/')).toMatchObject({ source: 'chatgpt', medium: 'ai' });
    expect(src('/', 'https://propakistani.pk/2026/vibe')).toMatchObject({ source: 'propakistani.pk', medium: 'referral' });
    expect(src('/blog/', 'https://vibe.test/')).toMatchObject({ source: 'direct', referrerHost: null });
  });

  it('in-app browsers without a referrer, else direct', () => {
    expect(src('/', '', `${iphone} Instagram 300.0`)).toMatchObject({ source: 'instagram', medium: 'social' });
    expect(src('/', '', `${android} [FBAN/FB4A;FBAV/400.0]`)).toMatchObject({ source: 'facebook' });
    expect(src('/', '', android)).toMatchObject({ source: 'direct', medium: 'direct' });
  });
});

describe('device, bots, location', () => {
  it('reads device, system and browser', () => {
    expect(parseDevice(android)).toEqual({ device: 'phone', os: 'Android', browser: 'Chrome' });
    expect(parseDevice(iphone)).toEqual({ device: 'phone', os: 'iOS', browser: 'Safari' });
    expect(parseDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0')).toEqual({ device: 'computer', os: 'Windows', browser: 'Edge' });
    expect(parseDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1').device).toBe('tablet');
  });

  it('drops bots and link previews', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isBot('WhatsApp/2.23.20.0')).toBe(true);
    expect(isBot('facebookexternalhit/1.1')).toBe(true);
    expect(isBot(undefined)).toBe(true);
    expect(isBot(android)).toBe(false);
  });

  it('location from Cloudflare headers', () => {
    expect(locationFrom({ 'cf-ipcountry': 'pk', 'cf-region': 'Punjab', 'cf-ipcity': 'Lahore' })).toEqual({ country: 'PK', region: 'Punjab', city: 'Lahore' });
    expect(locationFrom({ 'cf-ipcountry': 'XX' })).toEqual({ country: null, region: null, city: null });
  });
});
