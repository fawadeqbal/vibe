import { randomInt } from 'node:crypto';

/** Pakistan time (UTC+5, no DST) as yyyyMMddHHmmss — the format JazzCash wants. */
export function pktStamp(d: Date): string {
  const t = new Date(d.getTime() + 5 * 3600_000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`;
}

/** Short unique reference (≤ 20 chars): prefix + PKT timestamp + 4 random digits. */
export function txnRef(prefix: string, d = new Date()): string {
  return `${prefix}${pktStamp(d).slice(2)}${String(randomInt(0, 10_000)).padStart(4, '0')}`.slice(0, 20);
}

/** Any Pakistani mobile format → 03XXXXXXXXX (what JazzCash/Easypaisa expect), or null. */
export function localMobile(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  const m = digits.match(/^(?:0092|92|0)?(3\d{9})$/);
  return m ? `0${m[1]}` : null;
}

/** Paisa → "280.00" */
export const rupees = (minor: number): string => (minor / 100).toFixed(2);
