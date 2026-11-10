/** Numbers, money and time, written the way the Flutter app writes them (`Fmt`). */

/** 1234 → "1,234". */
export function thousands(n: number): string {
  const s = Math.abs(Math.trunc(n)).toString();
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ",";
    out += s[i];
  }
  return n < 0 ? `-${out}` : out;
}

/*
 * How amounts are written (coins, gems, money, counts) — the same rule as the
 * app's `Fmt`:
 *
 *  - compact(n): chips, tiles, list rows, counts. Never more than 5
 *    characters: 9,999 · 12.4K · 999K · 1.25M · 45.6M · 3.4B · 1.2T.
 *    It rounds DOWN, so a balance is never shown as more than it is.
 *    Pair it with a fixed-width slot (`AMOUNT_SLOT`) so a growing number
 *    never moves anything around it.
 *  - figure(n): the one big number on a screen (wallet balance, cash out,
 *    a coin pack). Exact up to 999,999, compact from a million.
 *  - thousands(n): sentences, receipts and history, where the exact value
 *    matters and the text can wrap.
 *
 * Wherever a short form is shown, the exact value goes in the accessible
 * label (or tooltip): "1,234,567 coins".
 */
const UNITS: [number, string][] = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

const floorTo = (v: number, places: number) => {
  const f = 10 ** places;
  // A hair of tolerance so 1.15 isn't floored to 1.14 by float error.
  return Math.floor(v * f + 1e-9) / f;
};
const trim = (s: string) => (s.includes(".") ? s.replace(/\.?0+$/, "") : s);

/** 9,999 · 12.4K · 999K · 1.25M · 3.4B — at most 5 characters (plus a minus sign). */
export function compact(n: number): string {
  const a = Math.abs(Math.trunc(n));
  const sign = n < 0 ? "-" : "";
  if (a < 10_000) return sign + thousands(a);
  for (const [size, unit] of UNITS) {
    if (a < size) continue;
    const v = a / size;
    if (v >= 1000) return `${sign}999${unit}+`;
    const s = v < 10 ? trim(floorTo(v, 2).toFixed(2)) : v < 100 ? trim(floorTo(v, 1).toFixed(1)) : String(Math.floor(v));
    return `${sign}${s}${unit}`;
  }
  return sign + thousands(a);
}

/** The one big number on a screen: exact up to 999,999, then compact. */
export const figure = (n: number) => (Math.abs(n) < 1_000_000 ? thousands(n) : compact(n));

/** @deprecated the old name: coins in a chip are `compact`. */
export const coins = compact;

/** Width of a 5-character amount slot (tabular figures): `style={{ width: AMOUNT_SLOT }}`. */
export const AMOUNT_SLOT = "5ch";

/** Money in a tight spot: "Rs 9,999" · "Rs 12.4K" · "$12.50" · "$1.25M". */
export const pkrCompact = (rupees: number) => `Rs ${compact(Math.round(rupees))}`;
export const usdCompact = (v: number) => (Math.abs(v) < 10_000 ? usd(v) : `$${compact(v)}`);

export const usd = (v: number) => `$${v.toFixed(2)}`;

export const pkr = (rupees: number) => `Rs ${thousands(Math.round(rupees))}`;

export const gemsAsUsd = (gems: number, usdPerGem: number) => usd(gems * usdPerGem);

/** 65 → "1:05"; 3700 → "1h 1m". */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Call timer: 84 → "01:24". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  if (s >= 3600) return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

const minutesSince = (t: Date, now: number) => Math.floor((now - t.getTime()) / 60_000);

export function ago(t: Date, now = Date.now()): string {
  const m = minutesSince(t, now);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${t.getDate()}/${t.getMonth() + 1}/${t.getFullYear()}`;
}

/**
 * A friend's status line: "Active now" while their app or tab is connected,
 * then "Active 5 min ago" from the moment it disconnected (the server records
 * it then), or null when we don't know (never from the friendship date).
 */
export function presenceLabel(online: boolean | null | undefined, lastSeenAt: Date | null | undefined, now = Date.now()): string | null {
  if (online) return "Active now";
  if (!lastSeenAt) return null;
  return activeAgo(lastSeenAt, now);
}

/** "Active just now", "Active 5 min ago", "Active 3 hours ago", "Active 2 days ago", "Active on 31 Oct". */
export function activeAgo(t: Date, now = Date.now()): string {
  const m = minutesSince(t, now);
  if (m < 1) return "Active just now";
  if (m < 60) return `Active ${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Active ${h} ${plural(h, "hour")} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `Active ${d} ${plural(d, "day")} ago`;
  return `Active on ${t.getDate()} ${MONTHS[t.getMonth()]}`;
}

/** Compact list timestamp: "now", "5m", "1h", "3d", "12/9". */
export function agoShort(t: Date, now = Date.now()): string {
  const m = minutesSince(t, now);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${t.getDate()}/${t.getMonth() + 1}`;
}

export function until(t: Date, now = Date.now()): string {
  const ms = t.getTime() - now;
  if (ms < 0) return "expired";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h left`;
  return `${Math.floor(h / 24)} days left`;
}

export const time = (t: Date) => `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const date = (t: Date) => `${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()}`;

export const sameDay = (a: Date | null | undefined, b: Date | null | undefined) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
