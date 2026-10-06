import type { AffiliateChannel, AffiliateFlag, ReferralRow } from "@/lib/api/types";
import { format } from "@/lib/format";

/** Why a referral was rejected, in words. Staff rejections carry their own text ("staff: …"). */
export function rejectReasonText(reason: string | null | undefined): string {
  if (!reason) return "—";
  if (reason.startsWith("staff: ")) return `By staff: ${reason.slice(7)}`;
  return (
    {
      same_device: "Same device as the inviter, or 3+ sign-ups from one device",
      bot: "Dev bot",
      invitee_deleted: "Deleted their account",
      staff: "By staff",
    }[reason] ?? format.enum(reason)
  );
}

/** "Verified ✓ · 2/3 calls" — where the new user is on the way to active. */
export function progressText(steps: ReferralRow["steps"]): string {
  const parts: string[] = [];
  if (steps.verifyNeeded) parts.push(steps.verified ? "Verified ✓" : "Not verified");
  if (steps.callsNeeded > 0) parts.push(`${steps.calls}/${steps.callsNeeded} calls`);
  return parts.join(" · ") || "No steps";
}

export const SOURCE_LABEL: Record<string, string> = { link: "App link", install: "Play install", code: "Typed code", web: "Web app" };

/** "TikTok · 25K" */
export function channelText(c: AffiliateChannel): string {
  const name = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", x: "X", snapchat: "Snapchat", twitch: "Twitch", other: "Other" }[c.platform] ?? format.enum(c.platform);
  return `${name} · ${format.compact(c.followers)}`;
}

export const totalFollowers = (channels: AffiliateChannel[]) => channels.reduce((s, c) => s + (c.followers || 0), 0);

/** Terms as one line: "30% for 6 months · $0.10 per active user". */
export function termsText(t: { revSharePercent: number; cpaUsdCents: number }): string {
  return `${t.revSharePercent}% of purchases · ${format.cents(t.cpaUsdCents)} per active user`;
}

export const flagTone = (f: Pick<AffiliateFlag, "level">) => (f.level === "severe" ? "bad" : "warn") as "bad" | "warn";

/** Parse an optional whole-number input: "" → null (use the default), else an integer in range or an error. */
export function parseOptionalInt(raw: string, min: number, max: number): { value: number | null } | { error: string } {
  const t = raw.trim();
  if (!t) return { value: null };
  const n = Number(t);
  if (!Number.isInteger(n)) return { error: "Whole numbers only" };
  if (n < min || n > max) return { error: `Between ${min} and ${max}` };
  return { value: n };
}

/** Dollars as typed ("0.25") → whole cents (25); "" → null. */
export function parseOptionalCents(raw: string, maxCents: number): { value: number | null } | { error: string } {
  const t = raw.trim().replace(/^\$/, "");
  if (!t) return { value: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return { error: "Enter an amount in dollars" };
  const cents = Math.round(n * 100);
  if (Math.abs(cents - n * 100) > 1e-6) return { error: "Whole cents only" };
  if (cents > maxCents) return { error: `At most ${format.cents(maxCents)}` };
  return { value: cents };
}

export const CODE_RE = /^[A-Za-z0-9_]{3,20}$/;
