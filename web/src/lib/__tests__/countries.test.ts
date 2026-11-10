import { describe, expect, it } from "vitest";

import { COUNTRIES, country, countryOptions, DEFAULT_BLOCKED_COUNTRIES, DEFAULT_COUNTRY, findCountry, fold, isBlockedCountry, setBlockedCountries } from "../countries";

describe("countries", () => {
  it("has every country once (ISO 3166-1 plus Kosovo), A–Z, each with a flag", () => {
    expect(COUNTRIES).toHaveLength(250);
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(250);
    for (const code of ["PK", "IN", "IL", "AF", "XK", "PS", "TW", "AE", "GB", "US", "BD", "SA"]) expect(findCountry(code), code).not.toBeNull();
    const names = COUNTRIES.map((c) => fold(c.name));
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    for (const c of COUNTRIES) expect(c.flag).toMatch(/^\p{Regional_Indicator}{2}$/u);
  });

  it("falls back to Pakistan for an unknown code", () => {
    expect(country("ZZ").code).toBe(DEFAULT_COUNTRY);
    expect(country(null).name).toBe("Pakistan");
    expect(findCountry("ZZ")).toBeNull();
  });

  it("search finds other names and ignores accents", () => {
    const find = (q: string) => countryOptions().filter((o) => fold(`${o.label} ${o.keywords ?? ""}`).includes(fold(q))).map((o) => o.value);
    expect(find("uae")).toContain("AE");
    expect(find("turkey")).toContain("TR");
    expect(find("cote")).toContain("CI");
    expect(find("ivory")).toContain("CI");
    expect(find("usa")).toContain("US");
    expect(find("pak")).toEqual(["PK"]);
  });

  it("leaves blocked countries out of the pickers, following the catalog", () => {
    const codes = () => countryOptions().map((o) => o.value);
    expect(codes()).toHaveLength(250 - DEFAULT_BLOCKED_COUNTRIES.length);
    for (const c of ["IN", "IL", "AF"]) expect(codes()).not.toContain(c);
    expect(isBlockedCountry("IN")).toBe(true);
    setBlockedCountries(["BD"]);
    expect(codes()).toContain("IN");
    expect(codes()).not.toContain("BD");
    setBlockedCountries(DEFAULT_BLOCKED_COUNTRIES);
    // A blocked country still has a name (old profiles, chips).
    expect(findCountry("IN")?.name).toBe("India");
  });
});
