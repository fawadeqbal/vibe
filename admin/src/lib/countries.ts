import { flag } from "./format";

/** Common countries, offered when we don't know yet who's on Vibe (and as a fallback list). */
export const COMMON_COUNTRIES = [
  "PK",
  "IN",
  "BD",
  "AE",
  "SA",
  "GB",
  "US",
  "CA",
  "AU",
  "TR",
  "DE",
  "FR",
  "ES",
  "IT",
  "NL",
  "EG",
  "NG",
  "ID",
  "MY",
  "PH",
  "BR",
  "MX",
  "JP",
  "KR",
];

let names: Intl.DisplayNames | null = null;

/** "PK" → "Pakistan" (falls back to the code). */
export function countryName(code: string): string {
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

export interface CountryCount {
  code: string;
  count: number;
}

/** Menu options: "🇵🇰 Pakistan" with the user count, most users first; type a letter to jump by name. */
export function countryOptions(
  counts: CountryCount[] | undefined,
  opts: { include?: string[]; fallback?: boolean } = {},
) {
  const known = new Map((counts ?? []).map((c) => [c.code, c.count]));
  const codes = [...known.keys()];
  for (const c of [
    ...(opts.include ?? []),
    ...(opts.fallback || !counts?.length ? COMMON_COUNTRIES : []),
  ])
    if (c && !known.has(c) && !codes.includes(c)) codes.push(c);
  return codes.map((code) => ({
    value: code,
    label: `${flag(code)} ${countryName(code)}`,
    textValue: countryName(code),
    count: known.get(code),
  }));
}
