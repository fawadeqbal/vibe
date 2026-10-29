import type { KeyValue } from "./referrals";

/**
 * The marketing site puts its visit on every app link (?vid=…&b=button).
 * We keep it through sign-in and send it once (POST /site/attribution), so
 * admin → Marketing site can count sign-ups per source, page and button.
 */
export const VISIT_KEY = "vibe.siteVisit";
const MAX_AGE_MS = 2 * 86_400_000;
const ID = /^[A-Za-z0-9_-]{8,40}$/;

export interface CapturedVisit {
  id: string;
  at: number;
}

/** Stores `vid` from the URL (if any) and returns the URL without `vid`/`b`, or null when unchanged. */
export function captureVisit(url: URL, kv: KeyValue | null, now = Date.now()): string | null {
  const vid = url.searchParams.get("vid");
  if (!vid && !url.searchParams.has("b")) return null;
  if (vid && ID.test(vid) && kv) {
    try {
      kv.setItem(VISIT_KEY, JSON.stringify({ id: vid, at: now } satisfies CapturedVisit));
    } catch {}
  }
  url.searchParams.delete("vid");
  url.searchParams.delete("b");
  const q = url.searchParams.toString();
  return `${url.pathname}${q ? `?${q}` : ""}${url.hash}`;
}

/** The kept visit, if it's still fresh (expired ones are dropped). */
export function readVisit(kv: KeyValue | null, now = Date.now()): CapturedVisit | null {
  if (!kv) return null;
  try {
    const v = JSON.parse(kv.getItem(VISIT_KEY) ?? "null") as CapturedVisit | null;
    if (v && typeof v.id === "string" && ID.test(v.id) && typeof v.at === "number" && now - v.at < MAX_AGE_MS) return v;
    kv.removeItem(VISIT_KEY);
  } catch {}
  return null;
}

export function clearVisit(kv: KeyValue | null) {
  try {
    kv?.removeItem(VISIT_KEY);
  } catch {}
}
