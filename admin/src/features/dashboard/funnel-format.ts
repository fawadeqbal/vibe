import { format } from "@/lib/format";

/** "42%" of a total, or "—" when there's nothing to divide by. */
export const share = (
  n: number | null | undefined,
  of: number | null | undefined,
): string => (n == null || !of ? "—" : format.percent(n / of));

/** Median minutes as "8 min", "2 h 15 min", "3 days". */
export function minutesLabel(m: number | null | undefined): string {
  if (m == null) return "—";
  if (m < 60) return `${Math.max(0, Math.round(m))} min`;
  if (m < 48 * 60) {
    const h = Math.floor(m / 60);
    const rest = Math.round(m % 60);
    return rest ? `${h} h ${rest} min` : `${h} h`;
  }
  return `${Math.round(m / 1440)} days`;
}

/** How many points (0–1) a step loses against the one before it; null when it can't be judged. */
export function dropFrom(
  prev: { rate: number; eligible: number },
  step: { rate: number; eligible: number },
): number | null {
  if (!prev.eligible || !step.eligible) return null;
  return Math.max(0, prev.rate - step.rate);
}
