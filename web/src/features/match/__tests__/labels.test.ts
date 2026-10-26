import { describe, expect, it } from "vitest";

import { countryHint, filterSummary, isNarrowed, searchClock, verifiedHint } from "../labels";

const anyone = { gender: "anyone", countryCode: null, safeMode: false } as const;

describe("match filter labels", () => {
  it("reads the default filters as a plain sentence", () => {
    expect(filterSummary(anyone)).toBe("You'll meet anyone from anywhere.");
  });

  it("names each narrowing filter", () => {
    expect(filterSummary({ ...anyone, safeMode: true })).toBe("You'll meet verified people from anywhere.");
    expect(filterSummary({ gender: "women", countryCode: null, safeMode: true })).toBe("You'll meet verified women from anywhere.");
    expect(filterSummary({ gender: "men", countryCode: "PK", safeMode: false })).toMatch(/^You'll meet men in .+\.$/);
  });

  it("explains each filter on its own", () => {
    expect(countryHint(null)).toBe("People from every country");
    expect(countryHint("PK")).toMatch(/^Only people in /);
    expect(verifiedHint(true)).toMatch(/selfie/);
  });

  it("knows when the filters narrow the pool", () => {
    expect(isNarrowed(anyone)).toBe(false);
    expect(isNarrowed({ ...anyone, safeMode: true })).toBe(true);
    expect(isNarrowed({ ...anyone, gender: "women" })).toBe(true);
    expect(isNarrowed({ ...anyone, countryCode: "PK" })).toBe(true);
  });

  it("formats the search clock", () => {
    expect(searchClock(0)).toBe("0:00");
    expect(searchClock(7.9)).toBe("0:07");
    expect(searchClock(102)).toBe("1:42");
    expect(searchClock(-3)).toBe("0:00");
  });
});
