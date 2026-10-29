import { describe, expect, it } from "vitest";

import { DEFAULT_DISCOVER_FILTERS } from "@/stores/discover";

import { activeFilters } from "../discover-states";

describe("filters that hide people", () => {
  it("none for the defaults", () => {
    expect(activeFilters(DEFAULT_DISCOVER_FILTERS)).toEqual([]);
  });

  it("lists each one, and removing it keeps the others", () => {
    const f = { ...DEFAULT_DISCOVER_FILTERS, gender: "women" as const, countryCode: "PK", onlineOnly: true, minAge: 22, maxAge: 30 };
    const a = activeFilters(f);
    expect(a.map((x) => x.label)).toEqual(["Online now", "Pakistan", "Women", "Ages 22–30"]);
    const noCountry = a.find((x) => x.key === "country")!.without;
    expect(noCountry).toEqual({ ...f, countryCode: "" });
    expect(a.find((x) => x.key === "age")!.without.minAge).toBe(18);
  });
});
