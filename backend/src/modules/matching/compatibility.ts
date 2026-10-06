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

/** How many compatible people (in queue order) the matcher compares. */
export const PICK_WINDOW = 8;
/** The longest-waiting compatible person gets a fairness bonus after this long. */
export const FAIR_WAIT_MS = 20_000;

/** Interests both have (tickets from before interests were added have none). */
export const sharedInterests = (a: Pick<Ticket, 'interests'>, b: Pick<Ticket, 'interests'>): number => {
  const mine = new Set(a.interests ?? []);
  return new Set((b.interests ?? []).filter((i) => mine.has(i))).size;
};

/**
 * How good a pairing `c` is for `me`: shared interests (up to 3) and a
 * similar vibe score, plus +4 for the oldest candidate once it has waited
 * over 20 s so nobody starves behind better-scored newcomers.
 */
export function partnerScore(me: Ticket, c: Ticket, opts: { oldest: boolean; nowMs: number }): number {
  const shared = Math.min(sharedInterests(me, c), 3);
  const closeness = 1 - Math.abs((me.vibeScore ?? 0.5) - (c.vibeScore ?? 0.5));
  const fairness = opts.oldest && opts.nowMs - c.enqueuedAt > FAIR_WAIT_MS ? 4 : 0;
  return 2 * shared + 3 * closeness + fairness;
}

/**
 * Picks the best candidate for `me` from queue-ordered tickets: the
 * highest score among the first 8 compatible ones; ties go to whoever is
 * earlier in the queue.
 */
export function pickPartner(me: Ticket, candidates: Ticket[], nowMs: number = Date.now()): Ticket | undefined {
  const pool: Ticket[] = [];
  for (const c of candidates) {
    if (compatible(me, c)) pool.push(c);
    if (pool.length >= PICK_WINDOW) break;
  }
  if (pool.length <= 1) return pool[0];
  const oldest = pool.reduce((o, c) => (c.enqueuedAt < o.enqueuedAt ? c : o));
  let best = pool[0];
  let bestScore = -Infinity;
  for (const c of pool) {
    const score = partnerScore(me, c, { oldest: c === oldest, nowMs });
    if (score > bestScore) [best, bestScore] = [c, score];
  }
  return best;
}
