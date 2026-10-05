import { country } from "@/lib/catalog";
import type { GenderFilter } from "@/lib/models";

export const genderFilterLabel: Record<GenderFilter, string> = { anyone: "Anyone", women: "Women", men: "Men" };

export const genderFilterIcon: Record<GenderFilter, string> = { anyone: "group", women: "female", men: "male" };

export function countryLabel(code: string | null): string {
  if (!code) return "Anywhere";
  const c = country(code);
  return `${c.flag} ${c.name}`;
}

/** A believable "people online" figure for the lobby (the app shows the same curve). */
export function onlineEstimate(now = new Date()): number {
  const h = now.getHours();
  const base = h >= 20 || h < 2 ? 2400 : h >= 12 ? 1500 : 700;
  return base + now.getMinutes() * 7;
}
