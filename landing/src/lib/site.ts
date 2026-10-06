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
  description: `${name} is free random video chat with real, selfie-verified people. One tap to meet someone new anywhere in the world. Calls start blurred. Free, 18+.`,
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
  ],
  locale: "en_US",
  /** When the site's own copy last changed meaningfully (sitemap lastModified). */
  updated: "2026-10-05",
  supportEmail: env(process.env.NEXT_PUBLIC_SUPPORT_EMAIL, ""),
  twitter: env(process.env.NEXT_PUBLIC_TWITTER_HANDLE, ""),
  /** Official profiles (Instagram, TikTok, X, Facebook, YouTube, Play Store…): schema.org sameAs. */
  sameAs: list(process.env.NEXT_PUBLIC_SOCIAL_LINKS),

  /** Android application id: invite pages build the Play Store link (with the install referrer) from it. */
  androidPackage: env(process.env.NEXT_PUBLIC_ANDROID_PACKAGE, "com.pingcrood.vibe_app"),
  /** The API origin ("" = none configured). */
  api,

  links: {
    webApp,
    android: env(process.env.NEXT_PUBLIC_ANDROID_URL, "#download"),
    terms: env(process.env.NEXT_PUBLIC_TERMS_URL, "/#faq"),
    privacy: env(process.env.NEXT_PUBLIC_PRIVACY_URL, "/#faq"),
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

  /** Live count for the hero pill: GET <api>/v1/stats/online → { online }. */
  onlineUrl: api ? `${api}/v1/stats/online` : null,
  /** Shown before the first answer, and whenever the API can't be reached. */
  onlineFallback: Number(env(process.env.NEXT_PUBLIC_ONLINE_FALLBACK, "2743")) || 0,

  /** Stats band. Placeholders from the design: replace with real figures before launch. */
  stats: [
    { value: "1M+", label: "matches made" },
    { value: "150+", label: "countries online" },
    { value: "4.6★", label: "average store rating" },
    { value: "24/7", label: "moderation coverage" },
  ],
} as const;

/** Absolute URL for a site path ("/blog/" → "https://host/blog/"). */
export const abs = (path = "/") => `${site.url}${path.startsWith("/") ? path : `/${path}`}`;

/** External links open in a new tab; in-page anchors don't. */
export const isExternal = (href: string) => /^https?:\/\//.test(href);
