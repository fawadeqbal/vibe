const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

export interface VibeHourWindow {
  active: boolean;
  /** The current window if active, otherwise the next one; null when Vibe Hour is off. */
  startsAt: Date | null;
  endsAt: Date | null;
  /** Business day the window starts on: the key for once-per-window jobs. */
  day: number | null;
}

/**
 * The daily Vibe Hour window around `nowMs`. `startMinute` is minutes after
 * business midnight; a window may run past midnight (23:30 + 60 min). Off
 * when `lengthMinutes` is 0.
 */
export function vibeHourWindow(nowMs: number, offsetMinutes: number, startMinute: number, lengthMinutes: number): VibeHourWindow {
  if (lengthMinutes <= 0) return { active: false, startsAt: null, endsAt: null, day: null };
  const offsetMs = offsetMinutes * MIN_MS;
  const today = Math.floor((nowMs + offsetMs) / DAY_MS);
  for (const day of [today - 1, today, today + 1]) {
    const start = day * DAY_MS - offsetMs + startMinute * MIN_MS;
    const end = start + lengthMinutes * MIN_MS;
    if (nowMs < end) return { active: nowMs >= start, startsAt: new Date(start), endsAt: new Date(end), day };
  }
  /* istanbul ignore next — tomorrow's window always ends after now */
  return { active: false, startsAt: null, endsAt: null, day: null };
}

/** The most recent window that has already ended (for the "Vibe Hour is over" broadcast). */
export function lastVibeHourEnded(nowMs: number, offsetMinutes: number, startMinute: number, lengthMinutes: number): { endsAt: Date; day: number } | null {
  if (lengthMinutes <= 0) return null;
  const offsetMs = offsetMinutes * MIN_MS;
  const today = Math.floor((nowMs + offsetMs) / DAY_MS);
  for (const day of [today, today - 1, today - 2]) {
    const end = day * DAY_MS - offsetMs + (startMinute + lengthMinutes) * MIN_MS;
    if (end <= nowMs) return { endsAt: new Date(end), day };
  }
  return null;
}
