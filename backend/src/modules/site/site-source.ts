/**
 * Pure helpers for marketing-site traffic: where a visit came from (UTM tags,
 * click ids, the referring site, in-app browsers), what device it is on, and
 * whether it is a bot. No I/O — unit-tested in site-source.spec.ts.
 */

export interface VisitSource {
  source: string;
  medium: string;
  campaign: string | null;
  referrerHost: string | null;
}

export interface VisitDevice {
  device: 'phone' | 'tablet' | 'computer';
  os: string;
  browser: string;
}

/** Referring hosts we know, matched on the end of the host name. */
const HOSTS: [RegExp, string, string][] = [
  [/(^|\.)google\.[a-z.]+$/, 'google', 'search'],
  [/(^|\.)bing\.com$/, 'bing', 'search'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo', 'search'],
  [/(^|\.)yahoo\.[a-z.]+$/, 'yahoo', 'search'],
  [/(^|\.)yandex\.[a-z.]+$/, 'yandex', 'search'],
  [/(^|\.)ecosia\.org$/, 'ecosia', 'search'],
  [/(^|\.)baidu\.com$/, 'baidu', 'search'],
  [/(^|\.)(chatgpt\.com|openai\.com)$/, 'chatgpt', 'ai'],
  [/(^|\.)perplexity\.ai$/, 'perplexity', 'ai'],
  [/(^|\.)(gemini\.google\.com|bard\.google\.com)$/, 'gemini', 'ai'],
  [/(^|\.)copilot\.microsoft\.com$/, 'copilot', 'ai'],
  [/(^|\.)claude\.ai$/, 'claude', 'ai'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'facebook', 'social'],
  [/(^|\.)instagram\.com$/, 'instagram', 'social'],
  [/(^|\.)tiktok\.com$/, 'tiktok', 'social'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube', 'social'],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp', 'social'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'x', 'social'],
  [/(^|\.)(t\.me|telegram\.org)$/, 'telegram', 'social'],
  [/(^|\.)snapchat\.com$/, 'snapchat', 'social'],
  [/(^|\.)reddit\.com$/, 'reddit', 'social'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'linkedin', 'social'],
  [/(^|\.)pinterest\.[a-z.]+$/, 'pinterest', 'social'],
];

/** Search engines' own UTM spellings and common variants → one name. */
const ALIASES: Record<string, string> = {
  fb: 'facebook',
  ig: 'instagram',
  insta: 'instagram',
  tt: 'tiktok',
  yt: 'youtube',
  wa: 'whatsapp',
  twitter: 'x',
  'google-ads': 'google',
  adwords: 'google',
};

const clean = (v: string | null | undefined, max = 60): string | null => {
  const s = (v ?? '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, max);
  return s ? s : null;
};

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '').replace(/^(m|l|lm|mobile)\./, '');
  } catch {
    return null;
  }
}

/**
 * Where a visit came from. Order: the link's UTM tags, ad click ids, invite
 * links, the referring site, an in-app browser, else direct. A referrer from
 * the site itself (or the web app) is not a source.
 */
export function classifySource(input: { url: string; referrer?: string | null; userAgent?: string | null; ownHosts?: string[] }): VisitSource {
  let params: URLSearchParams;
  let path = '/';
  try {
    const u = new URL(input.url, 'https://site.invalid');
    params = u.searchParams;
    path = u.pathname;
  } catch {
    params = new URLSearchParams();
  }
  const own = (input.ownHosts ?? []).map((h) => h.replace(/^www\./, ''));
  const refHost = hostOf(input.referrer);
  const referrerHost = refHost && !own.includes(refHost) ? refHost : null;
  const campaign = clean(params.get('utm_campaign'));

  const utmSource = clean(params.get('utm_source'));
  if (utmSource) {
    const source = ALIASES[utmSource] ?? utmSource;
    const known = HOSTS.find(([, name]) => name === source);
    const medium = clean(params.get('utm_medium')) ?? known?.[2] ?? 'referral';
    return { source, medium, campaign, referrerHost };
  }
  if (params.has('gclid') || params.has('gbraid') || params.has('wbraid')) return { source: 'google', medium: 'paid', campaign, referrerHost };
  if (params.has('msclkid')) return { source: 'bing', medium: 'paid', campaign, referrerHost };
  if (params.has('ttclid')) return { source: 'tiktok', medium: 'paid', campaign, referrerHost };
  if (path.startsWith('/i/') || params.has('invite') || params.has('ref')) return { source: 'invite', medium: 'invite', campaign, referrerHost };

  if (referrerHost) {
    const hit = HOSTS.find(([re]) => re.test(referrerHost));
    if (hit) return { source: hit[1], medium: params.has('fbclid') && hit[1] === 'facebook' ? 'social' : hit[2], campaign, referrerHost };
    return { source: referrerHost, medium: 'referral', campaign, referrerHost };
  }
  if (params.has('fbclid')) return { source: inAppSource(input.userAgent) ?? 'facebook', medium: 'social', campaign, referrerHost };
  const app = inAppSource(input.userAgent);
  if (app) return { source: app, medium: 'social', campaign, referrerHost };
  return { source: 'direct', medium: 'direct', campaign, referrerHost };
}

/** Links opened inside a social app's own browser say so in the user agent. */
export function inAppSource(ua: string | null | undefined): string | null {
  if (!ua) return null;
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS/.test(ua)) return 'facebook';
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'tiktok';
  if (/Snapchat/i.test(ua)) return 'snapchat';
  if (/LinkedInApp/i.test(ua)) return 'linkedin';
  if (/Twitter/i.test(ua)) return 'x';
  return null;
}

export function parseDevice(ua: string | null | undefined): VisitDevice {
  const s = ua ?? '';
  const tablet = /iPad|Tablet|PlayBook|Silk/i.test(s) || (/Android/i.test(s) && !/Mobile/i.test(s));
  const phone = !tablet && /Mobi|iPhone|iPod|Android|Windows Phone/i.test(s);
  const os = /Android/i.test(s)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(s)
      ? 'iOS'
      : /Windows/i.test(s)
        ? 'Windows'
        : /CrOS/.test(s)
          ? 'ChromeOS'
          : /Mac OS X|Macintosh/i.test(s)
            ? 'macOS'
            : /Linux/i.test(s)
              ? 'Linux'
              : 'Other';
  const browser = inAppSource(s)
    ? `${inAppSource(s)} app`
    : /Edg\//.test(s)
      ? 'Edge'
      : /SamsungBrowser/i.test(s)
        ? 'Samsung Internet'
        : /OPR\/|Opera/.test(s)
          ? 'Opera'
          : /Firefox|FxiOS/.test(s)
            ? 'Firefox'
            : /Chrome|CriOS/.test(s)
              ? 'Chrome'
              : /Safari/.test(s)
                ? 'Safari'
                : 'Other';
  return { device: tablet ? 'tablet' : phone ? 'phone' : 'computer', os, browser };
}

/** Crawlers, link previews and headless browsers: not people. */
export function isBot(ua: string | null | undefined): boolean {
  if (!ua) return true;
  return /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|WhatsApp\/|TelegramBot|Discordbot|preview|HeadlessChrome|Lighthouse|PageSpeed|curl|wget|python|axios|node-fetch|Go-http/i.test(ua);
}

/** Location from the CDN's headers (Cloudflare: CF-IPCountry; region/city need "Add visitor location headers"). */
export function locationFrom(headers: Record<string, string | string[] | undefined>): { country: string | null; region: string | null; city: string | null } {
  const h = (k: string) => {
    const v = headers[k];
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    return s ? s.slice(0, 80) : null;
  };
  const cc = h('cf-ipcountry')?.toUpperCase() ?? null;
  return {
    country: cc && /^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1' ? cc : null,
    region: h('cf-region'),
    city: h('cf-ipcity'),
  };
}
