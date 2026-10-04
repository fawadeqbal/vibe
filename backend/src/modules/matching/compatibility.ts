import { Ticket } from './matching.types';

/** Does `a`'s filter accept `b`? */
export function accepts(a: Ticket, b: Ticket): boolean {
  const p = a.prefs;
  if (p.gender === 'WOMEN' && b.gender !== 'FEMALE') return false;
  if (p.gender === 'MEN' && b.gender !== 'MALE') return false;
  if (p.countryCode && b.countryCode !== p.countryCode) return false;
  if (p.safeMode && !b.verified) return false;
  return true;
}

/** Both filters agree and neither excludes the other. */
export function compatible(a: Ticket, b: Ticket): boolean {
  return a.userId !== b.userId && !a.exclude.includes(b.userId) && !b.exclude.includes(a.userId) && accepts(a, b) && accepts(b, a);
}

/**
 * Queue score: earlier is better. VIP and boosted users jump ahead by a
 * fixed head start rather than to the very front, so free users still move.
 */
export function queueScore(t: Pick<Ticket, 'enqueuedAt' | 'vip' | 'boosted'>): number {
  const headStartMs = (t.vip ? 20_000 : 0) + (t.boosted ? 30_000 : 0);
  return t.enqueuedAt - headStartMs;
}

/** Picks the best candidate for `me` from queue-ordered tickets. */
export function pickPartner(me: Ticket, candidates: Ticket[]): Ticket | undefined {
  return candidates.find((c) => compatible(me, c));
}
