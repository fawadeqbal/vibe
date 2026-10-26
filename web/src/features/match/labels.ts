import { country } from "@/lib/catalog";
import type { GenderFilter, MatchFilters } from "@/lib/models";

export const genderFilterLabel: Record<GenderFilter, string> = { anyone: "Anyone", women: "Women", men: "Men" };

export const genderFilterIcon: Record<GenderFilter, string> = { anyone: "group", women: "female", men: "male" };

/** What each gender choice means, in a line (lobby filter rows). */
export const genderFilterHint: Record<GenderFilter, string> = {
  anyone: "Every gender, no preference",
  women: "Only women",
  men: "Only men",
};

export function countryLabel(code: string | null): string {
  if (!code) return "Anywhere";
  const c = country(code);
  return `${c.flag} ${c.name}`;
}

/** What the country choice means, in a line. */
export function countryHint(code: string | null): string {
  if (!code) return "People from every country";
  return `Only people in ${country(code).name}`;
}

/** The trust filter, in a line. */
export const verifiedHint = (on: boolean) => (on ? "Only selfie-verified people" : "Everyone, verified or not");

/**
 * The filters as one sentence ("You'll meet anyone, from anywhere."), so the
 * pills read as a choice rather than decoration.
 */
export function filterSummary(f: MatchFilters): string {
  const who = f.gender === "anyone" ? "anyone" : f.gender === "women" ? "women" : "men";
  const where = f.countryCode ? `in ${country(f.countryCode).name}` : "from anywhere";
  return `You'll meet ${f.safeMode ? `verified ${who === "anyone" ? "people" : who}` : who} ${where}.`;
}

/** True when a filter narrows who you can meet (so widening it would find someone sooner). */
export const isNarrowed = (f: MatchFilters) => f.gender !== "anyone" || f.countryCode != null || f.safeMode;

/** "0:07", "1:42": how long a search has been running. */
export function searchClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
