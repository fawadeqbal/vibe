import { describe, expect, it } from "vitest";

import { agoShort, clock, coins, duration, thousands, until, usd } from "../format";

describe("format (mirrors the app's Fmt)", () => {
  it("groups thousands and shortens millions", () => {
    expect(thousands(0)).toBe("0");
    expect(thousands(1234)).toBe("1,234");
    expect(thousands(-1234567)).toBe("-1,234,567");
    expect(coins(1_200_000)).toBe("1.2M");
    expect(usd(9.99)).toBe("$9.99");
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
