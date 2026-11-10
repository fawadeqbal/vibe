import { describe, expect, it } from "vitest";

import type {
  MarketingReport,
  MarketingTotals,
  MarketingVisit,
} from "@/lib/api/types";

import { buildExport, exportName } from "./export";

const totals = (x: Partial<MarketingTotals> = {}): MarketingTotals => ({
  visitors: 0,
  visits: 0,
  pageViews: 0,
  engagedVisits: 0,
  clickedVisits: 0,
  clicks: 0,
  downloadedVisits: 0,
  downloads: 0,
  signups: 0,
  firstCalls: 0,
  goodFirstCall: 0,
  paid: 0,
  medianSeconds: 0,
  ...x,
});

const report: MarketingReport = {
  days: 30,
  generatedAt: "2026-11-10T12:00:00.000Z",
  siteUrl: "https://vibe.example",
  totals: totals({ visitors: 8, visits: 10, clickedVisits: 4, signups: 2 }),
  previous: totals({ visits: 5 }),
  daily: [
    { day: "2026-11-10", visitors: 8, visits: 10, clicked: 4, signups: 2 },
  ],
  sources: [
    {
      source: "google",
      medium: "search",
      visitors: 8,
      visits: 10,
      clicked: 4,
      signups: 2,
      paid: 0,
    },
  ],
  countries: [{ country: "PK", visitors: 8, regions: [] }],
  cities: [{ city: "Lahore", country: "PK", visitors: 8 }],
  buttons: [{ button: "hero_get_app", target: null, clicks: 4, signups: 2 }],
  pages: [{ path: "/", visits: 10, clicked: 4, signups: 2 }],
  campaigns: [],
  devices: { device: [], os: [], browser: [], lang: [] },
  live: { now: 1, recent: [] },
};

const visit = (did: MarketingVisit["did"]): MarketingVisit => ({
  at: "2026-11-10T11:00:00.000Z",
  startedAt: "2026-11-10T10:59:00.000Z",
  country: "PK",
  region: null,
  city: "Lahore",
  source: "google",
  medium: "search",
  campaign: null,
  path: "/",
  device: "phone",
  os: "Android",
  browser: "Chrome",
  pages: 2,
  seconds: 40,
  did,
  button: null,
});

describe("marketing export", () => {
  it("has the period, every count, list and visit, with readable labels", () => {
    const x = buildExport(
      report,
      {
        items: [visit("signed_up"), visit("left")],
        total: 2,
        counts: { all: 2, reading: 0, clicked: 0, signed_up: 1, left: 1 },
      },
      new Date("2026-11-10T12:05:00.000Z"),
    );
    expect(x.period).toEqual({
      days: 30,
      label: "the last 30 days",
      from: "2026-10-11T12:00:00.000Z",
      to: "2026-11-10T12:00:00.000Z",
    });
    expect(x.counts.now.visits).toBe(10);
    expect(x.counts.before.visits).toBe(5);
    expect(x.journey.map((s) => s.step)).toEqual([
      "visits",
      "clicked",
      "signups",
      "firstCall",
      "goodFirstCall",
      "paid",
    ]);
    expect(x.journey[0].change).toBe("▲ 100% vs before");
    expect(x.channels[0]).toMatchObject({
      source: "google",
      sourceLabel: expect.any(String),
      mediumLabel: "Search",
    });
    expect(x.countries[0].name).not.toBe("");
    expect(x.cities[0].countryName).toBe(x.countries[0].name);
    expect(x.visits).toMatchObject({ total: 2, exported: 2, complete: true });
    expect(x.visits.items[0].outcome).toBeTruthy();
    expect(JSON.parse(JSON.stringify(x))).toEqual(x);
  });

  it("says when visits stopped short", () => {
    const x = buildExport(report, {
      items: [visit("left")],
      total: 3,
      counts: null,
    });
    expect(x.visits).toMatchObject({ total: 3, exported: 1, complete: false });
  });

  it("names the file after the period", () => {
    expect(exportName(1, new Date("2026-11-10T00:00:00Z"))).toBe(
      "vibe-marketing-today-2026-11-10.json",
    );
    expect(exportName(90, new Date("2026-11-10T00:00:00Z"))).toBe(
      "vibe-marketing-90-days-2026-11-10.json",
    );
  });
});
