import { asList, asMap, bool, date, int, type Json, optStr, paymentMethodFromApi, str } from "./api/mappers";
import type { PaymentMethod } from "./models";
import { normaliseCode, withSource } from "./referrals";

/**
 * Creator partners (affiliates), framework-free: the `/v1/affiliate` views,
 * money in USD cents, the link builder and the apply form's checks. Partners
 * earn real money, so it's gold (money) in the UI, never coins.
 */

export type AffiliateStatus = "none" | "PENDING" | "ACTIVE" | "SUSPENDED" | "REJECTED";

export const affiliateStatus = (v: unknown): AffiliateStatus => (v === "PENDING" || v === "ACTIVE" || v === "SUSPENDED" || v === "REJECTED" ? v : "none");

export interface AffiliateTerms {
  code: string;
  displayName: string;
  link: string;
  revSharePercent: number;
  cpaUsdCents: number;
  commissionMonths: number;
  holdDays: number;
  minPayoutUsdCents: number;
  appliedAt: Date | null;
  /** Staff's reason when REJECTED / SUSPENDED. */
  decisionReason: string | null;
}

export interface AffiliateBalance {
  pendingUsdCents: number;
  /** Can be negative after a refund of an already-paid commission. */
  availableUsdCents: number;
  requestedUsdCents: number;
  paidUsdCents: number;
}

export type PayoutStatus = "REQUESTED" | "PAID" | "REJECTED";

export interface AffiliatePayout {
  id: string;
  usdCents: number;
  amountPkr: number;
  method: PaymentMethod;
  accountMasked: string;
  status: PayoutStatus;
  reference: string | null;
  failureReason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

export interface AffiliateOverview {
  status: AffiliateStatus;
  affiliate: AffiliateTerms | null;
  balance: AffiliateBalance | null;
  openPayout: AffiliatePayout | null;
}

export interface StatsTotals {
  clicks: number;
  signups: number;
  qualified: number;
  payingUsers: number;
  revenueUsdCents: number;
  earnedUsdCents: number;
}

export interface StatsDay {
  day: string;
  clicks: number;
  signups: number;
  qualified: number;
  revenueUsdCents: number;
  earnedUsdCents: number;
}

export interface ChannelStats {
  channel: string;
  clicks: number;
  signups: number;
  qualified: number;
  earnedUsdCents: number;
}

export interface AffiliateStats {
  days: number;
  totals: StatsTotals;
  /** Oldest → today, zero-filled. */
  daily: StatsDay[];
  byChannel: ChannelStats[];
}

export type CommissionStatus = "PENDING" | "AVAILABLE" | "PAID" | "REVERSED" | "HELD";

export interface Commission {
  id: string;
  kind: "REVSHARE" | "CPA";
  usdCents: number;
  baseUsdCents: number;
  status: CommissionStatus;
  availableAt: Date | null;
  createdAt: Date;
  /** A negative row: refund of a commission that was already paid. */
  adjustment: boolean;
  userName: string;
}

export const STATS_RANGES = [7, 30, 90] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

// ── parsing ─────────────────────────────────────────────────────────────────

const payoutStatus = (v: unknown): PayoutStatus => (v === "PAID" || v === "REJECTED" ? v : "REQUESTED");
const commissionStatus = (v: unknown): CommissionStatus => (v === "AVAILABLE" || v === "PAID" || v === "REVERSED" || v === "HELD" ? v : "PENDING");

export function affiliatePayout(m: Json): AffiliatePayout {
  return {
    id: str(m.id),
    usdCents: int(m.usdCents),
    amountPkr: int(m.amountPkr),
    method: paymentMethodFromApi(m.method) ?? "bank",
    accountMasked: str(m.accountMasked),
    status: payoutStatus(m.status),
    reference: optStr(m.reference),
    failureReason: optStr(m.failureReason),
    createdAt: date(m.createdAt) ?? new Date(0),
    decidedAt: date(m.decidedAt),
  };
}

export function affiliateOverview(m: Json): AffiliateOverview {
  const status = affiliateStatus(m.status);
  if (status === "none") return { status, affiliate: null, balance: null, openPayout: null };
  const a = asMap(m.affiliate);
  const b = asMap(m.balance);
  return {
    status,
    affiliate: {
      code: str(a.code),
      displayName: str(a.displayName),
      link: str(a.link),
      revSharePercent: int(a.revSharePercent),
      cpaUsdCents: int(a.cpaUsdCents),
      commissionMonths: int(a.commissionMonths),
      holdDays: int(a.holdDays),
      minPayoutUsdCents: int(a.minPayoutUsdCents),
      appliedAt: date(a.appliedAt),
      decisionReason: optStr(a.decisionReason),
    },
    balance: { pendingUsdCents: int(b.pendingUsdCents), availableUsdCents: int(b.availableUsdCents), requestedUsdCents: int(b.requestedUsdCents), paidUsdCents: int(b.paidUsdCents) },
    openPayout: m.openPayout && typeof m.openPayout === "object" ? affiliatePayout(asMap(m.openPayout)) : null,
  };
}

export function affiliateStats(m: Json): AffiliateStats {
  const t = asMap(m.totals);
  return {
    days: int(m.days) || 30,
    totals: { clicks: int(t.clicks), signups: int(t.signups), qualified: int(t.qualified), payingUsers: int(t.payingUsers), revenueUsdCents: int(t.revenueUsdCents), earnedUsdCents: int(t.earnedUsdCents) },
    daily: asList(m.daily).map((x) => {
      const d = asMap(x);
      return { day: str(d.day), clicks: int(d.clicks), signups: int(d.signups), qualified: int(d.qualified), revenueUsdCents: int(d.revenueUsdCents), earnedUsdCents: int(d.earnedUsdCents) };
    }),
    byChannel: asList(m.byChannel).map((x) => {
      const c = asMap(x);
      return { channel: str(c.channel) || "direct", clicks: int(c.clicks), signups: int(c.signups), qualified: int(c.qualified), earnedUsdCents: int(c.earnedUsdCents) };
    }),
  };
}

export function commission(m: Json): Commission {
  return {
    id: str(m.id),
    kind: m.kind === "CPA" ? "CPA" : "REVSHARE",
    usdCents: int(m.usdCents),
    baseUsdCents: int(m.baseUsdCents),
    status: commissionStatus(m.status),
    availableAt: date(m.availableAt),
    createdAt: date(m.createdAt) ?? new Date(0),
    adjustment: bool(m.adjustment),
    userName: str(asMap(m.user).name) || "Someone",
  };
}

// ── money (USD cents) ───────────────────────────────────────────────────────

const group = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** 123456 → "$1,234.56"; -120 → "−$1.20". */
export function usdCents(cents: number): string {
  const c = Math.round(cents);
  const abs = Math.abs(c);
  return `${c < 0 ? "−" : ""}$${group(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, "0")}`;
}

/** Chart axis labels: "$0", "$40", "$1.2k". */
export function usdCentsShort(cents: number): string {
  const d = Math.round(cents) / 100;
  const abs = Math.abs(d);
  const sign = d < 0 ? "−" : "";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  if (abs >= 10 || Number.isInteger(abs)) return `${sign}$${Math.round(abs)}`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** Whole numbers on count axes: 1234 → "1.2k". */
export function countShort(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(Math.abs(n) >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(Math.round(n));
}

/** Is a payout possible now, and if not, why. */
export function payoutBlock(o: AffiliateOverview): string | null {
  if (o.status !== "ACTIVE") return o.status === "SUSPENDED" ? "Payouts are paused while your partner account is suspended." : "Payouts open once you're an active partner.";
  if (o.openPayout) return "You have a payout on its way. You can ask for the next one when it's done.";
  const b = o.balance;
  const min = o.affiliate?.minPayoutUsdCents ?? 0;
  if (!b || b.availableUsdCents <= 0) return "Nothing available yet. Commissions become available after the hold period.";
  if (b.availableUsdCents < min) return `You can cash out from ${usdCents(min)}. ${usdCents(min - b.availableUsdCents)} to go.`;
  return null;
}

// ── link builder ────────────────────────────────────────────────────────────

/** Channels offered as chips in the link builder (any `[a-z0-9_-]{1,24}` works). */
export const LINK_SOURCES = ["tiktok", "youtube", "instagram", "whatsapp", "facebook", "x", "snapchat"] as const;

export const sourceLabel = (s: string) =>
  ({ tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", whatsapp: "WhatsApp", facebook: "Facebook", x: "X", snapchat: "Snapchat", twitch: "Twitch", direct: "Direct", other: "Other" })[s] ?? s;

/** The partner link for one channel: `…/i/CODE?s=tiktok` (no source = the plain link). */
export const partnerLink = (link: string, source?: string | null) => withSource(link, source);

// ── apply form ──────────────────────────────────────────────────────────────

export const PLATFORMS = ["tiktok", "youtube", "instagram", "facebook", "x", "snapchat", "twitch", "other"] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface ChannelInput {
  platform: Platform;
  url: string;
  followers: string;
}

export interface ApplyInput {
  displayName: string;
  code: string;
  channels: ChannelInput[];
  note: string;
}

/** Followers as typed ("25k", "1.2m", "12,500") → a whole number, or null. */
export function parseFollowers(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/,/g, "");
  const m = /^(\d+(?:\.\d+)?)([km])?$/.exec(t);
  if (!m) return null;
  const n = Math.round(Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1));
  return Number.isFinite(n) && n >= 0 && n <= 1e9 ? n : null;
}

const isHttpsUrl = (s: string) => {
  try {
    const u = new URL(s.trim());
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
  } catch {
    return false;
  }
};

/** Field errors before sending (`displayName`, `code`, `channels.<i>.url`, `channels.<i>.followers`, `channels`, `note`). */
export function applyErrors(a: ApplyInput): Record<string, string> {
  const e: Record<string, string> = {};
  const name = a.displayName.trim();
  if (name.length < 2 || name.length > 40) e.displayName = "2–40 characters.";
  if (!normaliseCode(a.code)) e.code = "3–20 letters, digits or _.";
  if (a.channels.length < 1) e.channels = "Add at least one channel.";
  if (a.channels.length > 5) e.channels = "At most 5 channels.";
  a.channels.forEach((c, i) => {
    if (!c.url.trim() || !isHttpsUrl(withScheme(c.url.trim())) || c.url.trim().length > 300) e[`channels.${i}.url`] = "The full link to your profile (https://…).";
    if (parseFollowers(c.followers) == null) e[`channels.${i}.followers`] = "A number, e.g. 25000 or 25k.";
  });
  if (a.note.length > 1000) e.note = "At most 1000 characters.";
  return e;
}

/** The `POST /affiliate/apply` body. */
export function applyBody(a: ApplyInput) {
  const note = a.note.trim();
  return {
    displayName: a.displayName.trim(),
    code: normaliseCode(a.code) ?? a.code.trim(),
    channels: a.channels.map((c) => ({ platform: c.platform, url: withScheme(c.url.trim()), followers: parseFollowers(c.followers) ?? 0 })),
    ...(note ? { note } : {}),
  };
}

const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/** Why a code can't be used (`GET /affiliate/code-available` reason). */
export const codeReasonLabel = (reason: string | null) => (reason === "taken" ? "That code is taken." : reason === "reserved" ? "That code is reserved." : "3–20 letters, digits or _.");

// ── chart ───────────────────────────────────────────────────────────────────

export type ChartMetric = "clicks" | "signups" | "qualified" | "earnedUsdCents";

export interface ChartBar {
  /** First and last day in the bar ('YYYY-MM-DD'); the same for daily bars. */
  from: string;
  to: string;
  value: number;
}

/** Daily bars for 7/30 days; 90 days become weekly bars (the last one ends today). */
export function chartBars(daily: StatsDay[], metric: ChartMetric, days: number): ChartBar[] {
  const size = days > 30 ? 7 : 1;
  const bars: ChartBar[] = [];
  for (let end = daily.length; end > 0; end -= size) {
    const chunk = daily.slice(Math.max(0, end - size), end);
    bars.unshift({ from: chunk[0].day, to: chunk[chunk.length - 1].day, value: chunk.reduce((s, d) => s + d[metric], 0) });
  }
  return bars;
}

/** A clean axis top ≥ v: 1, 2, 5 × 10ⁿ (at least `min`). */
export function niceMax(v: number, min = 1): number {
  const x = Math.max(v, min);
  const p = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 5, 10]) if (m * p >= x) return m * p;
  return 10 * p;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** '2026-10-06' → "6 Oct". */
export function dayLabel(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]}` : day;
}
