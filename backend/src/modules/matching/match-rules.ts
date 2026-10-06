import { MatchEndReason } from '@prisma/client';

/**
 * Reconnect is free for a while after a call that dropped (someone's
 * connection died) or where both liked each other; otherwise it costs the
 * normal price. Null = not free.
 */
export function freeReconnectUntil(m: { endedAt: Date | null; endReason: MatchEndReason | null; mutualLike: boolean }, freeMinutes: number): Date | null {
  if (!m.endedAt || freeMinutes <= 0) return null;
  if (m.endReason !== MatchEndReason.DISCONNECTED && !m.mutualLike) return null;
  return new Date(m.endedAt.getTime() + freeMinutes * 60_000);
}

export const isFreeReconnect = (until: Date | null, now: Date): boolean => !!until && now < until;

/** A call this long counts as a good call (XP, streaks, badges). */
export const GOOD_CALL_SECONDS = 60;

/**
 * How one call went for one person, 0–1, or null when it says nothing
 * (they left a short call themselves). Feeds `User.vibeScore` (EMA, α 0.1).
 */
export function callSignal(c: { durationSeconds: number; likedByPartner: boolean; reportedByPartner: boolean; skippedByPartner: boolean }): number | null {
  if (c.reportedByPartner) return 0;
  if (c.durationSeconds >= GOOD_CALL_SECONDS || c.likedByPartner) return 1;
  if (c.durationSeconds >= 15) return 0.6;
  if (c.skippedByPartner) return 0.3;
  return null;
}

export const VIBE_SCORE_ALPHA = 0.1;
export const nextVibeScore = (current: number, signal: number): number => current + VIBE_SCORE_ALPHA * (signal - current);

/** Calls that start 00:00–04:00 business time count toward the night-owl badge. */
export const isNightCall = (minuteOfDay: number): boolean => minuteOfDay < 4 * 60;
