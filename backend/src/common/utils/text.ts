/** "03001234567" → "•••••••4567". */
export function maskAccount(account: string): string {
  const clean = account.replace(/\s+/g, '');
  if (clean.length <= 4) return '•'.repeat(clean.length);
  return '•'.repeat(clean.length - 4) + clean.slice(-4);
}

/** One spelling per address: trimmed and lower-cased (`Sara@Gmail.com ` → `sara@gmail.com`). */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** The two ids of a pair in a stable order (friendships, block checks). */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export const clampText = (s: string, max: number): string => (s.length > max ? s.slice(0, max) : s);

/** "sara.khan@gmail.com" → "s•••n@gmail.com" (for people without contact-detail access). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  const shown = local.length <= 2 ? `${local[0] ?? ''}•••` : `${local[0]}•••${local[local.length - 1]}`;
  return `${shown}@${domain}`;
}
