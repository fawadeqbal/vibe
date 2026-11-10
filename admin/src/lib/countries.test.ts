import { describe, expect, it } from "vitest";

import { countryName, countryOptions } from "./countries";

describe("countries", () => {
  it("names codes", () => {
    expect(countryName("PK")).toBe("Pakistan");
    expect(countryName("GB")).toBe("United Kingdom");
  });

  it("lists countries people are from first, with counts and a name to type", () => {
    const o = countryOptions([
      { code: "PK", count: 120 },
      { code: "IN", count: 9 },
    ]);
    expect(o.slice(0, 2)).toEqual([
      { value: "PK", label: "🇵🇰 Pakistan", textValue: "Pakistan", count: 120 },
      { value: "IN", label: "🇮🇳 India", textValue: "India", count: 9 },
    ]);
    expect(o).toHaveLength(2);
  });

  it("keeps the current choice and can add the common list", () => {
    const o = countryOptions([{ code: "PK", count: 3 }], {
      include: ["NG"],
      fallback: true,
    });
    expect(o[1]).toMatchObject({ value: "NG", count: undefined });
    expect(o.filter((x) => x.value === "PK")).toHaveLength(1);
    expect(o.length).toBeGreaterThan(10);
  });

  it("falls back to the common list before counts load", () => {
    expect(countryOptions(undefined).length).toBeGreaterThan(10);
  });
});

describe("every country", () => {
  it("lists all 250 (ISO 3166-1 plus Kosovo) once, with names", async () => {
    const { ALL_COUNTRIES, allCountryOptions } = await import("./countries");
    expect(ALL_COUNTRIES).toHaveLength(250);
    expect(new Set(ALL_COUNTRIES).size).toBe(250);
    const o = allCountryOptions([{ code: "PK", count: 7 }]);
    expect(o).toHaveLength(250);
    expect(o.find((x) => x.value === "PK")).toMatchObject({ textValue: "Pakistan", count: 7 });
    expect(o.find((x) => x.value === "AE")?.textValue).toBe("United Arab Emirates");
  });
});
