/**
 * Friend streaks, pure. A business day counts when both friends were
 * active that day (sent each other a chat message or gift, or were in a
 * call of a minute or more together). Days are business day indexes
 * (Clock.dayIndex). The stored row is only updated on activity; what the
 * app sees is derived lazily from "today", so nothing has to run at midnight.
 */
export interface StreakRow {
  streakCount: number;
  streakBest: number;
  /** Last counted day. */
  streakDay: number | null;
  /** Last day the lower-id / higher-id friend was active. */
  streakLowDay: number | null;
  streakHighDay: number | null;
}

export type StreakSide = 'low' | 'high';

export interface StreakUpdate {
  row: StreakRow;
  /** True when this activity completed the day (the streak grew or restarted). */
  counted: boolean;
}

/** Activity by one or both sides on day `day`. */
export function applyActivity(row: StreakRow, sides: StreakSide[], day: number): StreakUpdate {
  const next: StreakRow = { ...row };
  if (sides.includes('low')) next.streakLowDay = Math.max(next.streakLowDay ?? day, day);
  if (sides.includes('high')) next.streakHighDay = Math.max(next.streakHighDay ?? day, day);
  if (next.streakLowDay !== day || next.streakHighDay !== day || next.streakDay === day) return { row: next, counted: false };
  next.streakCount = next.streakDay === day - 1 ? next.streakCount + 1 : 1;
  next.streakDay = day;
  next.streakBest = Math.max(next.streakBest, next.streakCount);
  return { row: next, counted: true };
}

/** Every 7th day pays both friends. */
export const isWeeklyMilestone = (count: number): boolean => count > 0 && count % 7 === 0;

/** Streaks shorter than this neither warn nor can be restored. */
export const MIN_STREAK_TO_KEEP = 3;

export interface StreakView {
  /** Current streak (0 once it has broken). */
  count: number;
  best: number;
  /** Today already counted. */
  today: boolean;
  /** Counted yesterday, not yet today, and long enough to care: ends at midnight. */
  atRisk: boolean;
  mineToday: boolean;
  theirsToday: boolean;
  /** Broke yesterday; can be restored for `restoreCost` (0 for VIP). */
  restorable: boolean;
  /** The count a restore brings back (0 unless restorable). */
  lostCount: number;
  restoreCost: number;
}

export function streakView(row: StreakRow, today: number, mySide: StreakSide, restoreCost: number): StreakView {
  const day = row.streakDay;
  const count = day !== null && day >= today - 1 ? row.streakCount : 0;
  const restorable = day === today - 2 && row.streakCount >= MIN_STREAK_TO_KEEP;
  const mine = mySide === 'low' ? row.streakLowDay : row.streakHighDay;
  const theirs = mySide === 'low' ? row.streakHighDay : row.streakLowDay;
  return {
    count,
    best: row.streakBest,
    today: day === today,
    atRisk: day === today - 1 && count >= MIN_STREAK_TO_KEEP,
    mineToday: mine === today,
    theirsToday: theirs === today,
    restorable,
    lostCount: restorable ? row.streakCount : 0,
    restoreCost,
  };
}

export const EMPTY_STREAK: StreakRow = { streakCount: 0, streakBest: 0, streakDay: null, streakLowDay: null, streakHighDay: null };
