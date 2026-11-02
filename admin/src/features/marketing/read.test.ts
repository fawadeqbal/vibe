import { describe, expect, it } from "vitest";

import type { MarketingReport, MarketingTotals } from "@/lib/api/types";

import { averages, delta, journey, neverPressed, notes, verdict } from "./read";

const totals = (x: Partial<MarketingTotals> = {}): MarketingTotals => ({
  visitors: 0,
  visits: 0,
  pageViews: 0,
  clickedVisits: 0,
  clicks: 0,
  signups: 0,
  firstCalls: 0,
  medianSeconds: 0,
  downloads: 0,
  ...x,
});
const report = (x: Partial<MarketingReport>): MarketingReport =>
  ({
    days: 7,
    generatedAt: "",
    siteUrl: "https://x",
    totals: totals(),
    previous: totals(),
    daily: [],
    sources: [],
    countries: [],
    cities: [],
    buttons: [],
    pages: [],
    campaigns: [],
    devices: { device: [], os: [], browser: [], lang: [] },
    live: { now: 0, recent: [] },
    ...x,
  }) as MarketingReport;

describe("marketing reading", () => {
  it("delta against the period before", () => {
    expect(delta(5, 0)).toEqual({ text: "new", tone: "ok" });
    expect(delta(0, 0).text).toBe("");
    expect(delta(12, 10)).toEqual({ text: "▲ 20% vs before", tone: "ok" });
    expect(delta(9, 10).tone).toBe("bad");
  });

  it("journey: rates, losses and the worst step", () => {
    const s = journey(totals({ visitors: 9, visits: 9, pageViews: 12, clickedVisits: 7, signups: 1, downloads: 3 }), totals());
    expect(s.map((x) => x.value)).toEqual([9, 7, 3, 1, 0]);
    expect(s[1].rate).toBe("78% of visits");
    expect(s[3].rate).toBe("14% of clicks");
    expect(s.map((x) => x.lostAfter)).toEqual([2, null, 6, 1, null]);
    expect(s.find((x) => x.worst)?.key).toBe("signups");
  });

  it("verdicts need 5 visitors to compare", () => {
    const avg = { clickRate: 0.5, signupRate: 0.1 };
    expect(verdict({ visitors: 3, clicked: 3, signups: 1 }, avg).label).toBe("Brings sign-ups");
    expect(verdict({ visitors: 1, clicked: 0, signups: 0 }, avg).label).toBe("Nobody clicked");
    expect(verdict({ visitors: 1, clicked: 1, signups: 0 }, avg).label).toBe("Too few to tell");
    expect(verdict({ visitors: 10, clicked: 5, signups: 3 }, avg).label).toBe("Best");
    expect(verdict({ visitors: 10, clicked: 1, signups: 0 }, avg).label).toBe("Below average");
    expect(averages(totals({ visits: 10, clickedVisits: 5, visitors: 8, signups: 2 }))).toEqual({ clickRate: 0.5, signupRate: 0.25 });
  });

  it("buttons nobody pressed", () => {
    const left = neverPressed([{ button: "hero_start", target: "/match", clicks: 1, signups: 0 }]);
    expect(left).toContain("Footer · Android app");
    expect(left).not.toContain("Home hero · Start");
  });

  it("notes: lost after the click, best channel, strongest page", () => {
    const n = notes(
      report({
        totals: totals({ visitors: 9, visits: 9, clickedVisits: 7, signups: 1 }),
        sources: [
          { source: "tiktok", medium: "social", visitors: 3, clicked: 3, signups: 1 },
          { source: "chatgpt", medium: "ai", visitors: 1, clicked: 0, signups: 0 },
        ],
        campaigns: [{ campaign: "launch", source: "tiktok", medium: "social", visitors: 3, signups: 1 }],
        pages: [{ path: "/omegle-alternative/", visits: 3, clicked: 3 }],
      }),
    );
    expect(n.map((x) => x.tone)).toEqual(["bad", "good", "info"]);
    expect(n[0].title).toBe("6 of 7 people who clicked never signed up");
    expect(n[1].text).toContain("“launch”");
    expect(n[2].title).toContain("/omegle-alternative/");
    expect(notes(report({}))).toEqual([]);
  });
});
