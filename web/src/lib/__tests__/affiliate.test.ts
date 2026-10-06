import { describe, expect, it } from "vitest";

import {
  affiliateOverview,
  applyBody,
  applyErrors,
  chartBars,
  commission,
  countShort,
  dayLabel,
  niceMax,
  parseFollowers,
  partnerLink,
  payoutBlock,
  type StatsDay,
  usdCents,
  usdCentsShort,
} from "../affiliate";

describe("money (USD cents)", () => {
  it("formats cents as dollars", () => {
    expect(usdCents(0)).toBe("$0.00");
    expect(usdCents(7)).toBe("$0.07");
    expect(usdCents(1234)).toBe("$12.34");
    expect(usdCents(123456789)).toBe("$1,234,567.89");
    expect(usdCents(-120)).toBe("−$1.20");
  });
  it("shortens axis labels", () => {
    expect(usdCentsShort(0)).toBe("$0");
    expect(usdCentsShort(50)).toBe("$0.50");
    expect(usdCentsShort(4000)).toBe("$40");
    expect(usdCentsShort(120_000)).toBe("$1.2k");
    expect(usdCentsShort(2_500_000)).toBe("$25k");
    expect(countShort(950)).toBe("950");
    expect(countShort(1200)).toBe("1.2k");
  });
});

describe("link builder", () => {
  it("tags the partner link per channel", () => {
    expect(partnerLink("https://vibe.test/i/ALI", "tiktok")).toBe("https://vibe.test/i/ALI?s=tiktok");
    expect(partnerLink("https://vibe.test/i/ALI?s=tiktok", "YouTube")).toBe("https://vibe.test/i/ALI?s=youtube");
    expect(partnerLink("https://vibe.test/i/ALI?s=tiktok", null)).toBe("https://vibe.test/i/ALI");
  });
});

describe("apply form", () => {
  const good = { displayName: "Ali Vlogs", code: "ali", channels: [{ platform: "tiktok" as const, url: "tiktok.com/@ali", followers: "25k" }], note: "" };
  it("reads follower counts", () => {
    expect(parseFollowers("25k")).toBe(25_000);
    expect(parseFollowers("1.2M")).toBe(1_200_000);
    expect(parseFollowers("12,500")).toBe(12_500);
    expect(parseFollowers("lots")).toBeNull();
    expect(parseFollowers("2000m")).toBeNull();
  });
  it("validates before sending", () => {
    expect(applyErrors(good)).toEqual({});
    const e = applyErrors({ ...good, displayName: "A", code: "a!", channels: [{ platform: "youtube", url: "not a url", followers: "x" }] });
    expect(Object.keys(e).sort()).toEqual(["channels.0.followers", "channels.0.url", "code", "displayName"]);
    expect(applyErrors({ ...good, channels: [] }).channels).toBeTruthy();
  });
  it("builds the request body", () => {
    expect(applyBody(good)).toEqual({ displayName: "Ali Vlogs", code: "ALI", channels: [{ platform: "tiktok", url: "https://tiktok.com/@ali", followers: 25_000 }] });
    expect(applyBody({ ...good, note: "  hi " }).note).toBe("hi");
  });
});

describe("overview and payouts", () => {
  const active = (balance: Record<string, number>, extra: Record<string, unknown> = {}) =>
    affiliateOverview({
      status: "ACTIVE",
      affiliate: { code: "ALI", displayName: "Ali", link: "L", revSharePercent: 20, cpaUsdCents: 10, commissionMonths: 6, holdDays: 14, minPayoutUsdCents: 1000, appliedAt: "2026-10-01T00:00:00Z", decisionReason: null },
      balance: { pendingUsdCents: 0, availableUsdCents: 0, requestedUsdCents: 0, paidUsdCents: 0, ...balance },
      openPayout: null,
      ...extra,
    });
  it("parses status none", () => {
    expect(affiliateOverview({ status: "none" })).toEqual({ status: "none", affiliate: null, balance: null, openPayout: null });
  });
  it("says when a payout is possible", () => {
    expect(payoutBlock(active({ availableUsdCents: 1500 }))).toBeNull();
    expect(payoutBlock(active({ availableUsdCents: 400 }))).toMatch(/\$10\.00.*\$6\.00 to go/);
    expect(payoutBlock(active({ availableUsdCents: -50 }))).toMatch(/Nothing available/);
    expect(payoutBlock(active({ availableUsdCents: 5000 }, { openPayout: { id: "p", usdCents: 100, method: "JAZZCASH", status: "REQUESTED", createdAt: "2026-10-01T00:00:00Z" } }))).toMatch(/on its way/);
    expect(payoutBlock({ ...active({ availableUsdCents: 5000 }), status: "SUSPENDED" })).toMatch(/suspended/);
    expect(active({}, { openPayout: { id: "p", usdCents: 100, method: "JAZZCASH", status: "REQUESTED" } }).openPayout?.method).toBe("jazzCash");
  });
  it("parses commissions", () => {
    const c = commission({ id: "c", kind: "CPA", usdCents: -10, baseUsdCents: 0, status: "AVAILABLE", adjustment: true, user: { name: "Sara" }, createdAt: "2026-10-01T00:00:00Z" });
    expect(c).toMatchObject({ kind: "CPA", usdCents: -10, adjustment: true, userName: "Sara", status: "AVAILABLE" });
  });
});

describe("chart", () => {
  const days = (n: number): StatsDay[] => Array.from({ length: n }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, clicks: i + 1, signups: 0, qualified: 0, revenueUsdCents: 0, earnedUsdCents: 10 }));
  it("keeps days for 7/30 and groups 90 into weeks ending today", () => {
    expect(chartBars(days(7), "clicks", 7)).toHaveLength(7);
    const weekly = chartBars(days(30).concat(days(30)).concat(days(30)), "earnedUsdCents", 90);
    expect(weekly).toHaveLength(13);
    expect(weekly[12].value).toBe(70);
    expect(weekly[0].value).toBe(60); // 90 = 12 × 7 + 6
  });
  it("rounds axis tops", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(3)).toBe(5);
    expect(niceMax(17)).toBe(20);
    expect(niceMax(4100)).toBe(5000);
    expect(niceMax(0, 100)).toBe(100);
    expect(dayLabel("2026-10-06")).toBe("6 Oct");
  });
});
