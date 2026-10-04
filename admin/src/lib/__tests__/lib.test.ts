import { describe, expect, it } from "vitest";

import { toQueryString } from "../api/client";
import { flag, format } from "../format";
import { isActive, NAV } from "../nav";

describe("toQueryString", () => {
  it("drops empty values and joins lists", () => {
    expect(toQueryString({ q: "", status: ["OPEN", "ACTIONED"], limit: 30, x: undefined, y: null, z: [] })).toBe("?status=OPEN%2CACTIONED&limit=30");
    expect(toQueryString({})).toBe("");
  });
});

describe("format", () => {
  it("money, numbers and enums", () => {
    expect(format.usd(4.99)).toBe("$4.99");
    expect(format.cents(2499)).toBe("$24.99");
    expect(format.signed(5)).toBe("+5");
    expect(format.compact(12_500)).toBe("12.5K");
    expect(format.enum("GOOGLE_PLAY")).toBe("Google Play");
    expect(format.enum("REQUIRES_ACTION")).toBe("Requires action");
    expect(format.duration(75)).toBe("1m 15s");
    expect(format.initials("Ayesha Khan")).toBe("AK");
  });

  it("country flags", () => {
    expect(flag("PK")).toBe("🇵🇰");
    expect(flag(null)).toBe("🌍");
  });
});

describe("navigation", () => {
  const item = (href: string) => NAV.flatMap((g) => g.items).find((i) => i.href === href)!;
  it("marks the most specific item active", () => {
    expect(isActive("/finance/purchases", item("/finance/purchases"))).toBe(true);
    expect(isActive("/finance/purchases", item("/finance"))).toBe(false);
    expect(isActive("/users/abc", item("/users"))).toBe(true);
    expect(isActive("/", item("/"))).toBe(true);
    expect(isActive("/users", item("/"))).toBe(false);
  });

  it("every screen has a permission", () => {
    for (const g of NAV) for (const i of g.items) expect(i.permission).toMatch(/^[a-z]+\.[a-z.]+$/);
  });
});

describe("permission keys", () => {
  it("match the API's catalog (apps/vibe/backend)", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const { P } = await import("../permissions");
    const file = resolve(__dirname, "../../../../backend/src/modules/admin/core/permissions.ts");
    if (!existsSync(file)) return; // admin checked out on its own
    const block = readFileSync(file, "utf8").split("export const P = {")[1].split("} as const")[0];
    const server = [...block.matchAll(/:\s*'([a-z.]+)'/g)].map((m) => m[1]).sort();
    expect(Object.values(P).sort()).toEqual(server);
  });
});
