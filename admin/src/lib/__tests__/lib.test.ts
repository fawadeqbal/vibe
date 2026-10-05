import { describe, expect, it } from "vitest";

import { filenameFrom, toQueryString } from "../api/client";
import { flag, format } from "../format";
import { isActive, NAV } from "../nav";
import { P } from "../permissions";

describe("toQueryString", () => {
  it("drops empty values and joins lists", () => {
    expect(toQueryString({ q: "", status: ["OPEN", "ACTIONED"], limit: 30, x: undefined, y: null, z: [] })).toBe("?status=OPEN%2CACTIONED&limit=30");
    expect(toQueryString({})).toBe("");
  });
});

describe("filenameFrom", () => {
  it("reads the download name from Content-Disposition", () => {
    expect(filenameFrom('attachment; filename="vibe-payouts-2026-10-05-abc123.csv"')).toBe("vibe-payouts-2026-10-05-abc123.csv");
    expect(filenameFrom("attachment; filename*=UTF-8''batch%201.csv")).toBe("batch 1.csv");
    expect(filenameFrom(null)).toBeNull();
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

  it("rupees and other currencies", () => {
    expect(format.pkr(2800).replace(/\s/g, " ")).toBe("PKR 2,800");
    expect(format.money(139_700, "PKR").replace(/\s/g, " ")).toBe("PKR 1,397");
    expect(format.money(499, "USD")).toBe("$4.99");
    expect(format.money(null, "PKR")).toBe("—");
  });

  it("country flags", () => {
    expect(flag("PK")).toBe("🇵🇰");
    expect(flag(null)).toBe("🌍");
  });
});

describe("integrations helpers", () => {
  it("missing keys copy as .env lines; payment keys map to webhook providers", async () => {
    const { envLines, webhookProviderFor } = await import("@/features/integrations/api");
    expect(envLines(["JAZZCASH_MERCHANT_ID", "JAZZCASH_PASSWORD"])).toBe("JAZZCASH_MERCHANT_ID=\nJAZZCASH_PASSWORD=");
    expect(webhookProviderFor("payments.google_play")).toBe("google-play");
    expect(webhookProviderFor("payments.jazzcash")).toBe("jazzcash");
    expect(webhookProviderFor("payouts.bank")).toBeNull();
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

  it("new money and ops screens are in the menu with the right permission", () => {
    expect(item("/finance/payout-batches").permission).toBe(P.FinanceView);
    expect(item("/integrations").permission).toBe(P.OpsIntegrations);
    expect(item("/webhooks").permission).toBe(P.OpsIntegrations);
    expect(item("/verifications").permission).toBe(P.UsersVerify);
    // A batch's detail page lights up "Payout batches", not "Cash-outs".
    expect(isActive("/finance/payout-batches/abc", item("/finance/payout-batches"))).toBe(true);
    expect(isActive("/finance/payout-batches/abc", item("/finance/cashouts"))).toBe(false);
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
