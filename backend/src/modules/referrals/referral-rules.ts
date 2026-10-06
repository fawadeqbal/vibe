import type { EconomyRules } from '../catalog/economy';

/**
 * Pure referral and affiliate rules: code formats, fraud checks, activation,
 * milestones, commission math and balances. The services feed them live
 * values; unit tests cover them directly.
 */

/** Any code someone can type or share: user invite codes (6–10 upper-case alnum) and partner codes (3–20 `[A-Za-z0-9_]`, stored upper-case). */
const CODE_RE = /^[A-Z0-9_]{3,20}$/;
/** The `s=` part of a share link. */
const CHANNEL_RE = /^[a-z0-9_-]{1,24}$/;
/** Clicks without `s=` are counted under this channel. */
export const DIRECT_CHANNEL = 'direct';

/** Partner codes nobody may take (they read as official). */
export const RESERVED_CODES: ReadonlySet<string> = new Set(['VIBE', 'VIBEAPP', 'VIBE_APP', 'ADMIN', 'SUPPORT', 'HELP', 'STAFF', 'TEAM', 'OFFICIAL', 'MOD', 'MODERATOR', 'TEST', 'NULL', 'UNDEFINED', 'API', 'APP', 'WWW', 'INVITE', 'PARTNER']);

/** Upper-cased code, or null when it can't be one. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = raw.trim().toUpperCase();
  return CODE_RE.test(c) ? c : null;
}

/** Lower-cased `s=` channel, or null when missing/invalid. */
export function normalizeChannel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = raw.trim().toLowerCase();
  return CHANNEL_RE.test(c) ? c : null;
}

/** Why a partner code can't be used (null = fine). Availability against the database is checked separately. */
export function partnerCodeProblem(raw: string): 'invalid' | 'reserved' | null {
  const c = normalizeCode(raw);
  if (!c) return 'invalid';
  if (RESERVED_CODES.has(c)) return 'reserved';
  return null;
}

/** `https://vibe.fawadiqbal.dev/i/CODE[?s=channel]` */
export function inviteLink(base: string, code: string, channel?: string | null): string {
  const s = normalizeChannel(channel);
  return `${base.replace(/\/+$/, '')}/${encodeURIComponent(code)}${s ? `?s=${s}` : ''}`;
}

export type ReferralSource = 'link' | 'install' | 'code' | 'web';
export const REFERRAL_SOURCES: readonly ReferralSource[] = ['link', 'install', 'code', 'web'];
export const sourceOf = (via: string | undefined | null): ReferralSource => (via && (REFERRAL_SOURCES as readonly string[]).includes(via) ? (via as ReferralSource) : 'link');

// ── fraud ────────────────────────────────────────────────────────────────────

/** Referred sign-ups from one device in 30 days: this many (including the new one) means a farm. */
export const SAME_DEVICE_LIMIT = 3;
export const SAME_DEVICE_WINDOW_DAYS = 30;

export type RejectReason = 'same_device' | 'bot' | 'staff' | 'invitee_deleted';

export interface FraudInput {
  inviteeIsBot: boolean;
  inviteeDevice: string | null | undefined;
  /** The inviter's (or the partner's user's) own sign-up device. */
  inviterDevice: string | null | undefined;
  /** Other referrals with the invitee's device hash in the last 30 days. */
  sameDeviceRecent: number;
}

/** Reason to reject a new referral at once, or null. */
export function fraudReason(i: FraudInput): RejectReason | null {
  if (i.inviteeIsBot) return 'bot';
  if (i.inviteeDevice) {
    if (i.inviterDevice && i.inviteeDevice === i.inviterDevice) return 'same_device';
    if (i.sameDeviceRecent + 1 >= SAME_DEVICE_LIMIT) return 'same_device';
  }
  return null;
}

// ── activation ───────────────────────────────────────────────────────────────

export interface InviteeState {
  verified: boolean;
  goodCallsCount: number;
  active: boolean;
  banned: boolean;
}

export interface ActivationSteps {
  verified: boolean;
  verifyNeeded: boolean;
  calls: number;
  callsNeeded: number;
}

type ActivationRules = Pick<EconomyRules, 'referralActivationCalls' | 'referralRequireVerified'>;

export const activationSteps = (u: Pick<InviteeState, 'verified' | 'goodCallsCount'>, r: ActivationRules): ActivationSteps => ({
  verified: u.verified,
  verifyNeeded: r.referralRequireVerified === 1,
  calls: Math.min(u.goodCallsCount, r.referralActivationCalls),
  callsNeeded: r.referralActivationCalls,
});

/** The invitee is active: verified (when required), enough good calls, not banned or deleted. */
export function isQualified(u: InviteeState, r: ActivationRules): boolean {
  if (!u.active || u.banned) return false;
  if (r.referralRequireVerified === 1 && !u.verified) return false;
  return u.goodCallsCount >= r.referralActivationCalls;
}

// ── milestones ───────────────────────────────────────────────────────────────

export interface Milestone {
  /** 1, 2, 3 — stable; each is granted once per user (ledger key `referral-milestone-<index>`). */
  index: number;
  count: number;
  reward: { kind: 'vip' | 'coins'; amount: number };
}

type MilestoneRules = Pick<EconomyRules, 'referralMilestone1' | 'referralMilestone1VipDays' | 'referralMilestone2' | 'referralMilestone2VipDays' | 'referralMilestone3' | 'referralMilestone3Coins'>;

export const milestonesOf = (r: MilestoneRules): Milestone[] => [
  { index: 1, count: r.referralMilestone1, reward: { kind: 'vip', amount: r.referralMilestone1VipDays } },
  { index: 2, count: r.referralMilestone2, reward: { kind: 'vip', amount: r.referralMilestone2VipDays } },
  { index: 3, count: r.referralMilestone3, reward: { kind: 'coins', amount: r.referralMilestone3Coins } },
];

export const milestoneKey = (index: number) => `referral-milestone-${index}`;

/** Milestones reached at `rewarded` referrals that give something (zero rewards are skipped). */
export const milestonesReached = (r: MilestoneRules, rewarded: number): Milestone[] => milestonesOf(r).filter((m) => rewarded >= m.count && m.reward.amount > 0);

/** The track for the invite screen: every milestone with `reached`, and the next one to aim for. */
export function milestoneTrack(r: MilestoneRules, rewarded: number) {
  const all = milestonesOf(r)
    .slice()
    .sort((a, b) => a.count - b.count);
  const upcoming = all.find((m) => m.count > rewarded);
  return {
    milestones: all.map((m) => ({ count: m.count, reward: m.reward, reached: rewarded >= m.count })),
    next: upcoming ? { count: upcoming.count, remaining: upcoming.count - rewarded } : null,
  };
}

// ── affiliate commissions ────────────────────────────────────────────────────

const STORE_METHODS = new Set(['GOOGLE_PLAY', 'APP_STORE']);

/** Calendar months later (clamped to the month's last day). */
export function addMonths(at: Date, months: number): Date {
  const d = new Date(at.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** A purchase earns rev-share while it is within `months` of the referred user's sign-up. */
export const withinCommissionWindow = (signupAt: Date, purchaseAt: Date, months: number): boolean => purchaseAt.getTime() >= signupAt.getTime() && purchaseAt < addMonths(signupAt, months);

/** Rev-share: base = price minus the store's fee (Play / App Store only), amount = base × share, in whole cents (rounded down). */
export function revShare(p: { usdCents: number; method: string }, sharePercent: number, storeFeePercent: number): { baseUsdCents: number; usdCents: number } {
  const base = STORE_METHODS.has(p.method) ? Math.round((p.usdCents * (100 - storeFeePercent)) / 100) : p.usdCents;
  return { baseUsdCents: base, usdCents: Math.floor((base * sharePercent) / 100) };
}

/** A partner's terms: their own numbers, else the economy defaults. */
export const termsOf = (a: { revSharePercent: number | null; cpaUsdCents: number | null }, r: Pick<EconomyRules, 'affiliateRevSharePercent' | 'affiliateCpaUsdCents'>) => ({
  revSharePercent: a.revSharePercent ?? r.affiliateRevSharePercent,
  cpaUsdCents: a.cpaUsdCents ?? r.affiliateCpaUsdCents,
});

export interface CommissionRow {
  status: 'PENDING' | 'AVAILABLE' | 'PAID' | 'REVERSED' | 'HELD';
  usdCents: number;
}

/** Pending (incl. held), available (may be negative after refunds of paid commissions) and paid-out-or-requested totals. */
export function balanceOf(rows: CommissionRow[]): { pendingUsdCents: number; availableUsdCents: number; paidUsdCents: number } {
  let pending = 0;
  let available = 0;
  let paid = 0;
  for (const r of rows) {
    if (r.status === 'PENDING' || r.status === 'HELD') pending += r.usdCents;
    else if (r.status === 'AVAILABLE') available += r.usdCents;
    else if (r.status === 'PAID') paid += r.usdCents;
  }
  return { pendingUsdCents: pending, availableUsdCents: available, paidUsdCents: paid };
}

/** Can a payout be requested for this available balance? */
export const payoutAllowed = (availableUsdCents: number, minUsdCents: number): boolean => availableUsdCents > 0 && availableUsdCents >= minUsdCents;

/** USD cents → whole rupees at the cash-out rate. */
export const toPkr = (usdCents: number, usdToPkr: number): number => Math.floor((usdCents / 100) * usdToPkr);

// ── fraud flags (partners) ───────────────────────────────────────────────────

export interface FlagInput {
  /** Referred users older than 7 days, and how many of them never had a good call. */
  matureUsers: number;
  idleUsers: number;
  /** Device hashes with 3+ referred users. */
  deviceClusters: number;
  /** Purchases by referred users: succeeded + refunded, and refunded. */
  purchases: number;
  refunds: number;
  clicks: number;
  signups: number;
}

export interface AffiliateFlag {
  key: 'idle_users' | 'device_clusters' | 'refunds' | 'click_ratio';
  level: 'warn' | 'severe';
  message: string;
  value: number;
}

/**
 * Computed fraud signals for a partner. Severe flags put new commissions
 * on HOLD until staff look. Small samples never flag.
 */
export function affiliateFlags(i: FlagInput): AffiliateFlag[] {
  const out: AffiliateFlag[] = [];
  if (i.matureUsers >= 5) {
    const share = i.idleUsers / i.matureUsers;
    if (share > 0.7) out.push({ key: 'idle_users', level: share > 0.9 && i.matureUsers >= 10 ? 'severe' : 'warn', message: `${Math.round(share * 100)}% of people older than 7 days never had a real call`, value: share });
  }
  if (i.deviceClusters > 0) out.push({ key: 'device_clusters', level: i.deviceClusters >= 2 ? 'severe' : 'warn', message: `${i.deviceClusters} device${i.deviceClusters === 1 ? '' : 's'} signed up 3 or more people`, value: i.deviceClusters });
  if (i.purchases >= 3) {
    const rate = i.refunds / i.purchases;
    if (rate > 0.2) out.push({ key: 'refunds', level: rate > 0.4 ? 'severe' : 'warn', message: `${Math.round(rate * 100)}% of purchases were refunded`, value: rate });
  }
  if (i.signups >= 10 && i.signups > i.clicks) out.push({ key: 'click_ratio', level: 'warn', message: `More sign-ups (${i.signups}) than link visits (${i.clicks})`, value: i.clicks ? i.signups / i.clicks : i.signups });
  return out;
}

export const hasSevereFlag = (flags: AffiliateFlag[]): boolean => flags.some((f) => f.level === 'severe');
