import { describe, expect, it } from "vitest";

import type { InsightCounts, InsightRow, MarketingInsights } from "@/lib/api/types";

import { change, findings, glance, plain, rowName, show, signed, takeaway, toCsv, tzLabel, value } from "./insights";

const c = (x: Partial<InsightCounts> = {}): InsightCounts => ({ visitors: 0, visits: 0, clicked: 0, signups: 0, firstCalls: 0, paid: 0, revenueCents: 0, ...x });
/** A row where visits = visitors unless given. */
const row = (key: string, now: Partial<InsightCounts>, before: Partial<InsightCounts> = {}): InsightRow => ({
  key,
  ...c({ visits: now.visitors ?? 0, ...now }),
  before: c({ visits: before.visitors ?? 0, ...before }),
});
const hours = (f: (h: number) => Partial<InsightCounts> = () => ({})) => Array.from({ length: 24 }, (_, h) => row(String(h).padStart(2, "0"), f(h)));

const insights = (x: Partial<MarketingInsights> = {}): MarketingInsights => ({
  days: 30,
  generatedAt: "2026-11-18T10:00:00.000Z",
  tzOffsetMinutes: 300,
  totals: c(),
  previous: c(),
  daily: [],
  regions: [],
  channels: [],
  devices: [],
  hours: hours(),
  live: 0,
  ...x,
});

// The design's month: South Asia big but converts at 6.1%; North America small at 14.2%.
const month = () => {
  const regions = [
    { ...row("South Asia", { visitors: 7900, signups: 482, firstCalls: 265, paid: 12, revenueCents: 9600 }, { visitors: 6930 }), countries: [row("PK", { visitors: 6400, signups: 401 })] },
    { ...row("North America", { visitors: 620, signups: 88, firstCalls: 65, paid: 9, revenueCents: 14400 }, { visitors: 440 }), countries: [row("US", { visitors: 510, signups: 74 })] },
    { ...row("Oceania", { visitors: 50, signups: 5 }), countries: [row("AU", { visitors: 50, signups: 5 })] },
  ];
  const channels = [
    row("tiktok", { visitors: 4900, signups: 310, firstCalls: 161 }, { visitors: 2040 }),
    row("google", { visitors: 1700, signups: 150, firstCalls: 105 }, { visitors: 1360 }),
    row("facebook", { visitors: 1100, signups: 60, firstCalls: 35 }, { visitors: 1340 }),
  ];
  return insights({
    totals: c({ visitors: 8570, visits: 8570, clicked: 2485, signups: 575, firstCalls: 351, paid: 21, revenueCents: 24000 }),
    previous: c({ visitors: 7370, visits: 7370, clicked: 1900, signups: 528, firstCalls: 296, paid: 17, revenueCents: 19000 }),
    regions,
    channels,
    devices: [row("Android", { visitors: 6000, signups: 400 }), row("iPhone", { visitors: 1800, signups: 110 })],
    hours: hours((h) => (h < 6 ? { visitors: 100, signups: 20, firstCalls: 6 } : { visitors: 300, signups: 20, firstCalls: 14 })),
    daily: [
      { day: "2026-11-17", ...c({ visitors: 300, visits: 300, clicked: 90, signups: 20, firstCalls: 12 }) },
      { day: "2026-11-18", ...c({ visitors: 320, visits: 330, clicked: 99, signups: 22, firstCalls: 14 }) },
    ],
  });
};

describe("marketing insights: numbers", () => {
  it("rates divide visits; revenue is dollars", () => {
    const x = c({ visitors: 80, visits: 100, signups: 7, firstCalls: 5, revenueCents: 4430 });
    expect(value(x, "rate")).toBeCloseTo(7, 6);
    expect(value(x, "met")).toBeCloseTo(71.43, 1);
    expect(value(x, "revenue")).toBe(44.3);
    expect(value(c(), "rate")).toBe(0);
    expect([show(6.123, "rate"), show(61.4, "met"), show(1234, "visitors")]).toEqual(["6.1%", "61%", "1,234"]);
  });

  it("change and signs read without colour", () => {
    expect(change(140, 100)).toBe(40);
    expect(change(5, 0)).toBeNull();
    expect([signed(14), signed(-6), signed(0), signed(5, " pts")]).toEqual(["+14%", "−6%", "0%", "+5 pts"]);
  });

  it("names rows people know", () => {
    expect(rowName("channel", "tiktok")).toBe("TikTok");
    expect(rowName("channel", "direct")).toBe("Direct");
    expect(rowName("hour", "07")).toBe("07:00");
    expect(rowName("country", "PK")).toBe("Pakistan");
    expect(rowName("region", "Oceania")).toBe("Oceania");
    expect([tzLabel(300), tzLabel(-210), tzLabel(0)]).toEqual(["UTC+5", "UTC−3:30", "UTC"]);
  });

  it("at a glance: five numbers, rates change in points, losing more is bad", () => {
    const g = glance(month());
    expect(g.map((k) => k.label)).toEqual(["Visitors", "Sign-ups", "Met a real person", "Paid", "Lost before the app"]);
    expect(g[0]).toMatchObject({ value: "8,570", change: 16, sub: "320 today" });
    expect(g[1].sub).toBe("6.7% of visits");
    expect(g[2]).toMatchObject({ value: "61%", unit: " pts", change: 5 });
    expect(g[3].sub).toBe("$240.00 · $0.42 per sign-up");
    expect(g[4]).toMatchObject({ value: "71%", good: false, change: -3 });
  });
});

describe("marketing insights: takeaways", () => {
  it("conversion: best vs worst, small rows left out", () => {
    expect(plain(takeaway(month(), "region", "rate"))).toBe("North America turns 14.2% of visits into sign-ups, 2.3× South Asia. More of that traffic pays off most.");
  });

  it("visitors: biggest share and fastest growing", () => {
    expect(plain(takeaway(month(), "channel", "visitors"))).toBe("TikTok brings 64% of visitors. Fastest growing: TikTok, +140% on the 30 days before.");
  });

  it("met a real person: the loneliest group", () => {
    expect(plain(takeaway(month(), "channel", "met"))).toBe("Only 52% of sign-ups from TikTok meet a real person, against 70% from Google. Those people leave before they see what Vibe is.");
  });

  it("hours: the busiest four in a row", () => {
    expect(plain(takeaway(month(), "hour", "visitors"))).toMatch(/^06:00 to 10:00 brings \d+% of visitors \(UTC\+5\)/);
    expect(plain(takeaway(month(), "hour", "met"))).toBe("Sign-ups at 06:00 meet a real person most often (70%); at 00:00 only 30% do.");
    const flat = insights({ hours: hours(() => ({ visitors: 200, signups: 20, firstCalls: 10 })) });
    expect(plain(takeaway(flat, "hour", "met"))).toBe("Every hour is close: 50% to 50% of sign-ups meet a real person.");
  });

  it("money: most and most per visitor", () => {
    expect(plain(takeaway(month(), "region", "revenue"))).toBe("North America brings the most money ($144.00). Per 1,000 visitors North America earns $232.26, the most of any region.");
  });

  it("says so when there's nothing", () => {
    expect(plain(takeaway(insights(), "region", "visitors"))).toBe("No visitors this month yet.");
    expect(plain(takeaway(insights({ regions: [{ ...row("Europe", { visitors: 20, signups: 2 }), countries: [] }] }), "region", "rate"))).toBe("Too few visits in any region to compare yet.");
  });
});

describe("marketing insights: what matters", () => {
  it("an opportunity, what's working and where people are lost", () => {
    const f = findings(month());
    expect(f.map((x) => x.tone)).toEqual(["idea", "good", "bad"]);
    expect(f[0]).toMatchObject({ title: "North America converts 2.3× better than South Asia", action: { measure: "rate", split: "region" } });
    expect(f[0].text).toContain("Only 7% of visitors come from there");
    expect(f[1]).toMatchObject({ title: "TikTok visits are up 140%", action: { measure: "visitors", split: "channel" } });
    expect(f[1].text).toBe("4,900 visitors and 310 sign-ups, 54% of all sign-ups.");
    expect(f[2]).toMatchObject({ title: "Most sign-ups after midnight never meet anyone", action: { measure: "met", split: "hour" } });
  });

  it("falls back when the main rule doesn't fire, and stays quiet with no data", () => {
    const m = month();
    // Nights as good as days; TikTok flat: the bad card is the loneliest channel, the good one Google's growth.
    const f = findings({ ...m, hours: hours(() => ({ visitors: 300, signups: 20, firstCalls: 12 })), channels: [row("tiktok", { visitors: 4900, signups: 310, firstCalls: 140 }, { visitors: 4800 }), m.channels[1]] });
    expect(f.find((x) => x.tone === "bad")?.title).toBe("Only 45% of sign-ups from TikTok meet a real person");
    expect(f.find((x) => x.tone === "good")?.title).toBe("Google visits are up 25%");
    expect(findings(insights())).toEqual([]);
  });
});

it("exports every split as CSV", () => {
  const csv = toCsv(month()).split("\n");
  expect(csv[0]).toBe("split,key,name,visitors,visits,clicked,signups,firstCalls,paid,revenueCents,before_visitors,before_visits,before_clicked,before_signups,before_firstCalls,before_paid,before_revenueCents");
  expect(csv[1].startsWith("total,all,All visits,8570,")).toBe(true);
  expect(csv).toContain("country,PK,Pakistan,6400,6400,0,401,0,0,0,0,0,0,0,0,0,0");
  expect(csv.some((l) => l.startsWith("hour,23,23:00,"))).toBe(true);
});
