import { describe, expect, it } from "vitest";

import { agoShort, clock, coins, compact, duration, figure, pkrCompact, thousands, until, usd, usdCompact } from "../format";

describe("format (mirrors the app's Fmt)", () => {
  it("groups thousands and shortens millions", () => {
    expect(thousands(0)).toBe("0");
    expect(thousands(1234)).toBe("1,234");
    expect(thousands(-1234567)).toBe("-1,234,567");
    expect(coins(1_200_000)).toBe("1.2M");
    expect(usd(9.99)).toBe("$9.99");
  });

  it("writes amounts short, in at most 5 characters, never rounding up", () => {
    const cases: [number, string][] = [
      [0, "0"],
      [30, "30"],
      [9_999, "9,999"],
      [10_000, "10K"],
      [12_345, "12.3K"],
      [99_999, "99.9K"],
      [100_000, "100K"],
      [999_999, "999K"],
      [1_000_000, "1M"],
      [1_250_000, "1.25M"],
      [1_259_999, "1.25M"],
      [45_678_901, "45.6M"],
      [999_999_999, "999M"],
      [3_400_000_000, "3.4B"],
      [1_200_000_000_000, "1.2T"],
      [5e15, "999T+"],
      [-12_345, "-12.3K"],
    ];
    for (const [n, want] of cases) {
      expect(compact(n)).toBe(want);
      expect(compact(n).replace("-", "").length).toBeLessThanOrEqual(5);
    }
    expect(figure(999_999)).toBe("999,999");
    expect(figure(1_234_567)).toBe("1.23M");
    expect(pkrCompact(12_499.6)).toBe("Rs 12.5K");
    expect(usdCompact(12.5)).toBe("$12.50");
    expect(usdCompact(1_250_000)).toBe("$1.25M");
  });

  it("formats call lengths and timers", () => {
    expect(duration(65)).toBe("1:05");
    expect(duration(3700)).toBe("1h 1m");
    expect(clock(84)).toBe("01:24");
    expect(clock(3725)).toBe("1:02:05");
  });

  it("writes relative times", () => {
    const now = new Date(2026, 9, 5, 12, 0).getTime();
    expect(agoShort(new Date(now - 30_000), now)).toBe("now");
    expect(agoShort(new Date(now - 5 * 60_000), now)).toBe("5m");
    expect(agoShort(new Date(now - 3 * 3600_000), now)).toBe("3h");
    expect(agoShort(new Date(2026, 8, 12), now)).toBe("12/9");
    expect(until(new Date(now + 30 * 60_000), now)).toBe("30m left");
    expect(until(new Date(now - 1), now)).toBe("expired");
  });
});
