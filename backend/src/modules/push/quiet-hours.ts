import type { PushCategory } from './push-sender';

/** Held back during quiet hours. Chat messages and payments always go. */
export const QUIET_CATEGORIES: ReadonlySet<PushCategory> = new Set(['social', 'engagement', 'inbox']);

/**
 * Is `nowMs` inside the user's quiet hours? Start/end are minutes after
 * midnight in the user's own UTC offset; the range may wrap midnight
 * (22:00 → 07:00). Off unless both are set and differ.
 */
export function inQuietHours(nowMs: number, q: { quietHoursStart: number | null; quietHoursEnd: number | null; tzOffsetMinutes: number }): boolean {
  const { quietHoursStart: start, quietHoursEnd: end } = q;
  if (start === null || end === null || start === end) return false;
  const minute = Math.floor((((nowMs + q.tzOffsetMinutes * 60_000) % 86_400_000) + 86_400_000) % 86_400_000 / 60_000);
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
