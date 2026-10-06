import { site } from "@/lib/site";

/**
 * Invite links (`/i/<CODE>?s=<channel>`): reading them, and where the page's
 * buttons go. Codes are a user's invite code or a creator partner's code
 * (3–20 letters, digits or _, case-insensitive); `s` is the channel the link
 * was shared on. Contract: docs/specs/2026-10-06-referrals-affiliates-api.md.
 */
export interface InviteRef {
  code: string;
  source: string | null;
}

export interface InvitePreview {
  valid: boolean;
  kind: "user" | "affiliate" | null;
  name: string | null;
  avatarUrl: string | null;
  inviteeCoins: number;
}

const CODE = /^[A-Za-z0-9_]{3,20}$/;
const SOURCE = /^[a-z0-9_-]{1,24}$/;

/** `/i/k7p2qxm/?s=TikTok` → `{ code: "K7P2QXM", source: "tiktok" }`; `?code=` works too (dev servers without the rewrite). */
export function parseInvite(pathname: string, search: string): InviteRef | null {
  const params = new URLSearchParams(search);
  let raw = "";
  try {
    raw = decodeURIComponent(/^\/i\/([^/]+)\/?$/.exec(pathname)?.[1] ?? "");
  } catch {}
  raw = (raw || params.get("code") || "").trim();
  if (!CODE.test(raw)) return null;
  const s = (params.get("s") ?? "").trim().toLowerCase();
  return { code: raw.toUpperCase(), source: SOURCE.test(s) ? s : null };
}

/** Play Store listing with the install referrer the app reads on first launch. */
export function playStoreUrl(ref: InviteRef | null): string {
  const base = `https://play.google.com/store/apps/details?id=${encodeURIComponent(site.androidPackage)}`;
  if (!ref) return base;
  const referrer = `vibe_ref=${ref.code}${ref.source ? `&utm_source=${ref.source}` : ""}`;
  return `${base}&referrer=${encodeURIComponent(referrer)}`;
}

/** The web app, carrying the invite (`?ref=&s=`), which it keeps until sign-up. */
export function webAppUrl(ref: InviteRef | null): string {
  if (!ref) return `${site.links.webApp}/`;
  const q = new URLSearchParams({ ref: ref.code, ...(ref.source ? { s: ref.source } : {}) });
  return `${site.links.webApp}/?${q.toString()}`;
}

/** Opens the installed app (harmless when it isn't installed). */
export const appDeepLink = (ref: InviteRef | null) => (ref ? `vibe://invite?code=${encodeURIComponent(ref.code)}` : "vibe://invite");

/** `GET <API>/v1/referrals/preview/:code?s=` (public; also counts the visit). Null when the API can't be reached. */
export async function fetchPreview(ref: InviteRef, signal?: AbortSignal): Promise<InvitePreview | null> {
  if (!site.api) return null;
  const q = ref.source ? `?s=${encodeURIComponent(ref.source)}` : "";
  try {
    const res = await fetch(`${site.api}/v1/referrals/preview/${encodeURIComponent(ref.code)}${q}`, { signal, cache: "no-store" });
    if (!res.ok) return null;
    const b = (await res.json()) as Record<string, unknown>;
    return {
      valid: b.valid === true,
      kind: b.kind === "user" || b.kind === "affiliate" ? b.kind : null,
      name: typeof b.name === "string" && b.name.trim() ? b.name.trim() : null,
      avatarUrl: typeof b.avatarUrl === "string" && /^https?:\/\//.test(b.avatarUrl) ? b.avatarUrl : null,
      inviteeCoins: typeof b.inviteeCoins === "number" && b.inviteeCoins > 0 ? Math.round(b.inviteeCoins) : 0,
    };
  } catch {
    return null;
  }
}
