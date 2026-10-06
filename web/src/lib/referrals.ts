import { asList, asMap, bool, date, int, type Json, optStr, profile as mapProfile, str } from "./api/mappers";
import { thousands } from "./format";
import type { Profile } from "./models";

/**
 * Invites (Referrals v2), framework-free: capturing `?ref=` / `?s=` from a
 * landing-page link, the install id sent at sign-up, invite links, and the
 * `GET /referrals` view. Contract: docs/specs/2026-10-06-referrals-affiliates-api.md.
 */

// ── capture (web: `?ref=CODE&s=SOURCE` on any page) ─────────────────────────

/** The part of `localStorage` we use, so tests can pass a Map-backed fake. */
export type KeyValue = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const REF_KEY = "vibe.ref";
export const DEVICE_KEY = "vibe.deviceId";
/** A captured invite is kept this long (then a sign-up no longer carries it). */
export const REF_TTL_MS = 30 * 24 * 3600_000;

export interface CapturedRef {
  /** Upper-case user invite code or partner code. */
  code: string;
  /** The link's `s` channel (tiktok, whatsapp…), lower-case. */
  source: string | null;
  /** When it was captured (ms). */
  at: number;
}

/** `localStorage`, or null where the browser blocks it (private mode, sandboxed frames). */
export function browserStorage(): KeyValue | null {
  try {
    const s = window.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

/** A code as the server accepts it (3–20 letters, digits or _), upper-cased; null when it can't be one. */
export function normaliseCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return /^[A-Za-z0-9_]{3,20}$/.test(t) ? t.toUpperCase() : null;
}

/** A link channel (`s=`): trimmed, lower-case, `[a-z0-9_-]{1,24}`; null otherwise. */
export function normaliseSource(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  return /^[a-z0-9_-]{1,24}$/.test(t) ? t : null;
}

/**
 * Reads `?ref=` / `?s=` from a URL. A valid code is stored (the newest link
 * wins) and both parameters are removed from the address: `cleaned` is the
 * path + query + hash to `replaceState` to, or null when nothing changes.
 */
export function captureRef(url: URL, kv: KeyValue | null, now = Date.now()): { captured: CapturedRef | null; cleaned: string | null } {
  const params = url.searchParams;
  if (!params.has("ref") && !params.has("s")) return { captured: null, cleaned: null };
  const code = normaliseCode(params.get("ref"));
  let captured: CapturedRef | null = null;
  if (code) {
    captured = { code, source: normaliseSource(params.get("s")), at: now };
    try {
      kv?.setItem(REF_KEY, JSON.stringify(captured));
    } catch {
      // Storage full or blocked: the invite lasts until this tab closes.
    }
  }
  params.delete("ref");
  params.delete("s");
  const q = params.toString();
  return { captured, cleaned: `${url.pathname}${q ? `?${q}` : ""}${url.hash}` };
}

/** The stored invite, unless it is missing, malformed or older than {@link REF_TTL_MS} (then it is removed). */
export function readRef(kv: KeyValue | null, now = Date.now()): CapturedRef | null {
  let raw: string | null = null;
  try {
    raw = kv?.getItem(REF_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: Json = {};
  try {
    parsed = asMap(JSON.parse(raw));
  } catch {}
  const code = normaliseCode(parsed.code);
  const at = typeof parsed.at === "number" ? parsed.at : NaN;
  if (!code || !Number.isFinite(at) || now - at > REF_TTL_MS || at - now > 60_000) {
    clearRef(kv);
    return null;
  }
  return { code, source: normaliseSource(parsed.source), at };
}

export function clearRef(kv: KeyValue | null) {
  try {
    kv?.removeItem(REF_KEY);
  } catch {}
}

const DEVICE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
let sessionDeviceId: string | null = null;

/** A random id for this browser, made once and kept in storage (or for this tab when storage is blocked). */
export function deviceId(kv: KeyValue | null, make: () => string = randomId): string {
  try {
    const existing = kv?.getItem(DEVICE_KEY);
    if (existing && DEVICE_ID.test(existing)) return existing;
  } catch {}
  const id = sessionDeviceId ?? make();
  sessionDeviceId = id;
  try {
    kv?.setItem(DEVICE_KEY, id);
  } catch {}
  return id;
}

function randomId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export interface SignUpInvite {
  inviteCode?: string;
  inviteSource?: string;
  inviteVia?: "web";
  deviceId?: string;
}

/** What OTP verify / social sign-in carry: the captured invite (if any) and the device id. */
export function signUpFields(ref: CapturedRef | null, device: string | null): SignUpInvite {
  return {
    ...(ref ? { inviteCode: ref.code, ...(ref.source ? { inviteSource: ref.source } : {}), inviteVia: "web" as const } : {}),
    ...(device && DEVICE_ID.test(device) ? { deviceId: device } : {}),
  };
}

// ── links ───────────────────────────────────────────────────────────────────

/** `<site>/i/<CODE>` (+ `?s=`). */
export const inviteLink = (siteUrl: string, code: string, source?: string | null) => withSource(`${siteUrl.replace(/\/+$/, "")}/i/${encodeURIComponent(code)}`, source);

/** The same link tagged with a channel (`s=`); an empty source removes it. */
export function withSource(link: string, source?: string | null): string {
  const s = normaliseSource(source ?? "");
  try {
    const u = new URL(link);
    if (s) u.searchParams.set("s", s);
    else u.searchParams.delete("s");
    return u.toString();
  } catch {
    const base = link.split("?")[0];
    return s ? `${base}?s=${s}` : base;
  }
}

/** WhatsApp's share URL for a message. */
export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

// ── "Have an invite code?" ──────────────────────────────────────────────────

/** Friendly text for `POST /referrals/claim` errors. */
export function claimErrorMessage(code: string, fallback = "Couldn't add that code. Try again."): string {
  switch (code) {
    case "INVITE_CODE_INVALID":
      return "We couldn't find that code. Check the spelling and try again.";
    case "INVITE_TOO_LATE":
      return "Invite codes can only be added in your first 48 hours.";
    case "INVITE_ALREADY_USED":
      return "You've already joined with an invite.";
    case "INVITE_SELF":
      return "That's your own code (or someone you invited). Share it with friends instead.";
    case "VALIDATION_FAILED":
      return "Codes are 3–20 letters, digits or _.";
    default:
      return fallback;
  }
}

// ── GET /referrals ──────────────────────────────────────────────────────────

export type ReferralStatus = "PENDING" | "QUALIFIED" | "REWARDED" | "REJECTED";

export const referralStatus = (v: unknown): ReferralStatus => (v === "QUALIFIED" || v === "REWARDED" || v === "REJECTED" ? v : "PENDING");

export interface ReferralPerson {
  id: string;
  profile: Profile;
  status: ReferralStatus;
  rejectReason: string | null;
  steps: { verified: boolean; verifyNeeded: boolean; calls: number; callsNeeded: number };
  /** Coins you were paid for them. */
  coins: number;
  createdAt: Date;
  qualifiedAt: Date | null;
  rewardedAt: Date | null;
}

export interface MilestoneReward {
  kind: "vip" | "coins";
  amount: number;
}

export interface Milestone {
  count: number;
  reward: MilestoneReward;
  reached: boolean;
}

export interface ReferralOverview {
  code: string;
  link: string;
  rewards: { inviterCoins: number; inviteeCoins: number; activationCalls: number; requireVerified: boolean; holdHours: number };
  stats: { joined: number; pending: number; rewarded: number; rejected: number; coinsEarned: number };
  milestones: Milestone[];
  next: { count: number; remaining: number } | null;
  /** Newest first (latest 50). */
  people: ReferralPerson[];
  /** Your creator-partner link (ACTIVE partners only). */
  affiliate: { code: string; link: string } | null;
}

export const milestoneReward = (m: Json): MilestoneReward => ({ kind: m.kind === "coins" ? "coins" : "vip", amount: int(m.amount) });

export function referralPerson(m: Json): ReferralPerson {
  const s = asMap(m.steps);
  return {
    id: str(m.id),
    profile: mapProfile(asMap(m.profile)),
    status: referralStatus(m.status),
    rejectReason: optStr(m.rejectReason),
    steps: { verified: bool(s.verified), verifyNeeded: s.verifyNeeded !== false, calls: int(s.calls), callsNeeded: Math.max(0, int(s.callsNeeded)) },
    coins: int(m.coins),
    createdAt: date(m.createdAt) ?? new Date(0),
    qualifiedAt: date(m.qualifiedAt),
    rewardedAt: date(m.rewardedAt),
  };
}

export function referralOverview(m: Json): ReferralOverview {
  const r = asMap(m.rewards);
  const st = asMap(m.stats);
  const next = asMap(m.next);
  const aff = m.affiliate && typeof m.affiliate === "object" ? asMap(m.affiliate) : null;
  return {
    code: str(m.code),
    link: str(m.link),
    rewards: { inviterCoins: int(r.inviterCoins), inviteeCoins: int(r.inviteeCoins), activationCalls: int(r.activationCalls), requireVerified: r.requireVerified !== false, holdHours: int(r.holdHours) },
    stats: { joined: int(st.joined), pending: int(st.pending), rewarded: int(st.rewarded), rejected: int(st.rejected), coinsEarned: int(st.coinsEarned) },
    milestones: asList(m.milestones).map((x) => {
      const ms = asMap(x);
      return { count: int(ms.count), reward: milestoneReward(asMap(ms.reward)), reached: bool(ms.reached) };
    }),
    next: typeof next.count === "number" ? { count: int(next.count), remaining: int(next.remaining) } : null,
    people: asList(m.people).map((p) => referralPerson(asMap(p))),
    affiliate: aff && typeof aff.code === "string" ? { code: str(aff.code), link: str(aff.link) } : null,
  };
}

/** Puts a person from `referral:updated` in the list (replacing their old row), newest first. */
export function upsertPerson(list: ReferralPerson[], p: ReferralPerson): ReferralPerson[] {
  const rest = list.filter((x) => x.id !== p.id);
  return [p, ...rest].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** "7 days of VIP" / "1,000 coins". */
export const milestoneRewardLabel = (r: MilestoneReward) => (r.kind === "vip" ? `${r.amount} ${r.amount === 1 ? "day" : "days"} of VIP` : `${thousands(r.amount)} coins`);

/** Progress chips for a person: "Verified ✓ · 2/3 calls". */
export function personSteps(p: ReferralPerson): string {
  const bits: string[] = [];
  if (p.steps.verifyNeeded) bits.push(p.steps.verified ? "Verified ✓" : "Not verified yet");
  if (p.steps.callsNeeded > 0) bits.push(`${Math.min(p.steps.calls, p.steps.callsNeeded)}/${p.steps.callsNeeded} calls`);
  return bits.join(" · ");
}

/** Why a referral earned nothing, in plain words. */
export function rejectReasonLabel(reason: string | null): string {
  if (!reason) return "Not eligible";
  if (reason === "same_device") return "Same device as another account";
  if (reason === "bot") return "Not a real person";
  if (reason === "invitee_deleted") return "Account deleted";
  if (reason.startsWith("staff:")) return reason.slice(6).trim() || "Not eligible";
  return "Not eligible";
}

/** The invite message for WhatsApp / the share sheet. */
export const inviteMessage = (link: string, inviteeCoins: number, brand = "Vibe") =>
  `Come meet new people on ${brand} — video chat with real, verified people.${inviteeCoins > 0 ? ` Join with my link and get ${inviteeCoins} free coins:` : ""} ${link}`;

/**
 * How much of the milestone track to fill (0…1) for `count` rewarded friends:
 * the nodes sit at equal steps after a start at 0, and each segment fills in
 * proportion to the friends between its two milestones.
 */
export function milestoneFill(counts: number[], count: number): number {
  const n = counts.length;
  if (!n) return 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const target = counts[i];
    if (count < target) return (i + Math.max(0, count - prev) / Math.max(1, target - prev)) / n;
    prev = target;
  }
  return 1;
}
