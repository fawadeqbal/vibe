/**
 * Everything the landing page links to, counts or calls itself, in one place.
 * NEXT_PUBLIC_* values are inlined at build time (see .env.example).
 *
 * Renaming the product or moving domains = change NEXT_PUBLIC_BRAND_NAME and
 * NEXT_PUBLIC_SITE_URL and rebuild. Every title, heading, schema block, share
 * card, sitemap entry and article on the site reads them from here.
 */
const env = (value: string | undefined, fallback: string) => (value && value.trim() ? value.trim() : fallback);
const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const name = env(process.env.NEXT_PUBLIC_BRAND_NAME, "Vibe");
const webApp = env(process.env.NEXT_PUBLIC_WEB_APP_URL, "http://localhost:3002").replace(/\/$/, "");
const api = env(process.env.NEXT_PUBLIC_VIBE_API, "").replace(/\/$/, "");
const url = env(process.env.NEXT_PUBLIC_SITE_URL, "http://localhost:3003").replace(/\/$/, "");

export const site = {
  /** The product name, as people should search for it. */
  name,
  /** Company / publisher name for schema.org (defaults to the product name). */
  legalName: env(process.env.NEXT_PUBLIC_BRAND_LEGAL_NAME, name),
  url,
  /** Bare host, e.g. "vibe.fawadiqbal.dev" — handy in copy. */
  host: url.replace(/^https?:\/\//, ""),
  /** Home page <title>: keyword first (people search for the thing, not yet the brand). */
  title: `Free Random Video Chat with Verified People | ${name}`,
  tagline: "Meet someone new, right now",
  /** Meta description: keep ≤ 160 characters. */
  description: `${name} is free random video chat and swipe-to-match with real, selfie-verified people. Meet someone new in one tap, anywhere in the world. Free, 18+.`,
  /** Search phrases the home page is written around (also the meta keywords tag). */
  keywords: [
    "random video chat",
    "video chat with strangers",
    "talk to strangers",
    "omegle alternative",
    "free video chat app",
    "meet new people online",
    "video chat Pakistan",
    "online video call app",
    "make friends online",
    "safe video chat",
    "meet new people app",
    "swipe and match",
    "azar alternative",
  ],
  locale: "en_US",
  /** When the site's own copy last changed meaningfully (sitemap lastModified). */
  updated: "2026-10-29",
  supportEmail: env(process.env.NEXT_PUBLIC_SUPPORT_EMAIL, ""),
  twitter: env(process.env.NEXT_PUBLIC_TWITTER_HANDLE, ""),
  /** Official profiles (Instagram, TikTok, X, Facebook, YouTube, Play Store…): schema.org sameAs. */
  sameAs: list(process.env.NEXT_PUBLIC_SOCIAL_LINKS),

  /** Android application id (for a future Play Store listing). */
  androidPackage: env(process.env.NEXT_PUBLIC_ANDROID_PACKAGE, "com.pingcrood.vibe_app"),
  /** The API origin ("" = none configured). */
  api,

  links: {
    webApp,
    /** Android: the API counts the download, then sends the browser to the latest APK (GitHub release). */
    android: env(process.env.NEXT_PUBLIC_ANDROID_URL, api ? `${api}/v1/site/download/android` : "#download"),
    terms: env(process.env.NEXT_PUBLIC_TERMS_URL, "/terms/"),
    privacy: env(process.env.NEXT_PUBLIC_PRIVACY_URL, "/privacy/"),
    support: env(process.env.NEXT_PUBLIC_SUPPORT_URL, "/#faq"),
  },

  /** Search engine ownership checks (Search Console, Bing Webmaster Tools, Yandex). */
  verification: {
    google: env(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION, ""),
    bing: env(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION, ""),
    yandex: env(process.env.NEXT_PUBLIC_YANDEX_VERIFICATION, ""),
  },
  /** Google Analytics 4 measurement id (G-XXXX). Empty = no analytics script at all. */
  gaId: env(process.env.NEXT_PUBLIC_GA_ID, ""),

  /** Legal pages (GET <api>/v1/legal/:slug), edited in admin → Legal pages. */
  legalUrl: (slug: string) => (api ? `${api}/v1/legal/${slug}` : null),
  /** Startup config (GET <api>/v1/config): the landing Vignette is switched on/off there. */
  configUrl: api ? `${api}/v1/config` : null,
  /** Live count for the hero pill: GET <api>/v1/stats/online → { online }. */
  onlineUrl: api ? `${api}/v1/stats/online` : null,
  /** The live count only shows from this many people up; below it the pill shows the busy hours instead. */
  onlineMinToShow: Number(env(process.env.NEXT_PUBLIC_ONLINE_MIN, "10")) || 10,
  /**
   * When most people are on (24h clock, business time zone). Read it from
   * admin → Matching ("When people search") and update it here when it moves.
   */
  busyHours: { from: 21, to: 24, offsetMinutes: 300, zone: "Pakistan time" },

  /** Stats band: only things that are true today. Swap in real counts once they're worth showing. */
  stats: [
    { value: "Free", label: "to match and chat" },
    { value: "18+", label: "adults only, always" },
    { value: "2 taps", label: "to report anyone" },
    { value: "24/7", label: "report review" },
  ],
} as const;

/** Absolute URL for a site path ("/blog/" → "https://host/blog/"). */
export const abs = (path = "/") => `${site.url}${path.startsWith("/") ? path : `/${path}`}`;

/** External links open in a new tab; in-page anchors don't. */
/** The "count it, then download the APK" link on the API. */
export const isApkDownload = (href: string) => /\/v1\/site\/download\/android(\?|$)/.test(href);

/** Outside links open in a new tab, except the APK download (it downloads in place, no empty tab). */
export const isExternal = (href: string) => /^https?:\/\//.test(href) && !isApkDownload(href);
