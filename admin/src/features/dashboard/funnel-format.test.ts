import { describe, expect, it } from "vitest";

import { dropFrom, minutesLabel, share } from "./funnel-format";

describe("funnel formatting", () => {
  it("shares", () => {
    expect(share(1, 4)).toMatch(/^25\s?%$/);
    expect(share(3, 0)).toBe("—");
    expect(share(undefined, 10)).toBe("—");
  });

  it("minutes", () => {
    expect(minutesLabel(null)).toBe("—");
    expect(minutesLabel(7.6)).toBe("8 min");
    expect(minutesLabel(135)).toBe("2 h 15 min");
    expect(minutesLabel(120)).toBe("2 h");
    expect(minutesLabel(4 * 1440)).toBe("4 days");
  });

  it("drops", () => {
    expect(
      dropFrom({ rate: 0.9, eligible: 10 }, { rate: 0.4, eligible: 10 }),
    ).toBeCloseTo(0.5);
    expect(
      dropFrom({ rate: 0.4, eligible: 10 }, { rate: 0.5, eligible: 10 }),
    ).toBe(0);
    expect(
      dropFrom({ rate: 0.4, eligible: 10 }, { rate: 0, eligible: 0 }),
    ).toBeNull();
  });
});
