/** Names people know for the marketing site's sources, buttons and countries. */

export const SOURCE_LABELS: Record<string, string> = {
  google: "Google",
  bing: "Bing",
  duckduckgo: "DuckDuckGo",
  yahoo: "Yahoo",
  yandex: "Yandex",
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  copilot: "Copilot",
  claude: "Claude",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  x: "X (Twitter)",
  telegram: "Telegram",
  snapchat: "Snapchat",
  reddit: "Reddit",
  linkedin: "LinkedIn",
  invite: "Invite links",
  direct: "Direct / typed",
};
export const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;

export const MEDIUM_LABELS: Record<string, string> = { search: "Search", social: "Social", paid: "Ads", invite: "Invite", ai: "AI chat", referral: "Other site", email: "E-mail", direct: "Direct" };
export const mediumLabel = (m: string) => MEDIUM_LABELS[m] ?? m;

/** Every "go to the app" button on the site (the ones never pressed are listed too). */
export const BUTTON_LABELS: Record<string, string> = {
  hero_start: "Home hero · Start",
  hero_android: "Home hero · Android",
  header_app: "Header · Get the app",
  discover_open: "Discover · Open Discover",
  vip_trial: "VIP · Start free trial",
  final_cta: "Home bottom · Get the app (Android)",
  final_cta_web: "Home bottom · Start video chat (iPhone, computer)",
  invite_open: "Invite friends",
  page_cta: "Search page · box button",
  page_android: "Search page · box Android",
  page_hero: "Search page · top button",
  page_hero_android: "Search page · top Android",
  invite_web: "Invite page · web app",
  footer_web: "Footer · Open web app",
  footer_android: "Footer · Android app",
};
export const buttonLabel = (b: string) => BUTTON_LABELS[b] ?? (b === "link" ? "Other links" : b);

const regionNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
export const countryName = (code: string | null | undefined) => {
  if (!code || code === "Unknown") return "Unknown";
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
};

/** "Lahore, Punjab, PK" without repeats or blanks. */
export const placeLabel = (v: { city?: string | null; region?: string | null; country?: string | null }) =>
  [v.city, v.region && v.region !== v.city ? v.region : null, v.country].filter(Boolean).join(", ") || "Unknown place";

export const DID_LABELS = {
  signed_up: { label: "Signed up", tone: "ok" },
  clicked: { label: "Clicked to the app", tone: "primary" },
  reading: { label: "Reading now", tone: "info" },
  left: { label: "Left", tone: "neutral" },
} as const;
export type VisitOutcome = keyof typeof DID_LABELS;
