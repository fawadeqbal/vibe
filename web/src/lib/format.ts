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

/** 1234 → "1,234"; 1200000 → "1.2M". */
export const coins = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : thousands(n));

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
