/**
 * Everything the landing page links to or counts, in one place.
 * NEXT_PUBLIC_* values are inlined at build time (see .env.example).
 */
const env = (value: string | undefined, fallback: string) => (value && value.trim() ? value.trim() : fallback);

const webApp = env(process.env.NEXT_PUBLIC_WEB_APP_URL, "http://localhost:3002").replace(/\/$/, "");
const api = env(process.env.NEXT_PUBLIC_VIBE_API, "").replace(/\/$/, "");

export const site = {
  name: "Vibe",
  url: env(process.env.NEXT_PUBLIC_SITE_URL, "http://localhost:3003").replace(/\/$/, ""),
  title: "Vibe — Meet someone new, right now",
  description:
    "One tap connects you on video with a real person somewhere in the world. Selfie-verified people, calls that start blurred, and gifts that turn into real money. Free, 18+.",

  links: {
    webApp,
    android: env(process.env.NEXT_PUBLIC_ANDROID_URL, "#download"),
    terms: env(process.env.NEXT_PUBLIC_TERMS_URL, "#faq"),
    privacy: env(process.env.NEXT_PUBLIC_PRIVACY_URL, "#faq"),
    support: env(process.env.NEXT_PUBLIC_SUPPORT_URL, "#faq"),
  },

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

/** External links open in a new tab; in-page anchors don't. */
export const isExternal = (href: string) => /^https?:\/\//.test(href);
