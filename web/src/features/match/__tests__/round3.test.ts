import { describe, expect, it } from "vitest";

import { pausedFor } from "../account-paused";

describe("account paused countdown", () => {
  it("a clock under a day, days and hours beyond", () => {
    expect(pausedFor(65)).toBe("01:05");
    expect(pausedFor(23 * 3600 + 41 * 60 + 5)).toBe("23:41:05");
    expect(pausedFor(86_400)).toBe("1 day");
    expect(pausedFor(2 * 86_400 + 4 * 3600 + 30)).toBe("2 days 4h");
    expect(pausedFor(-5)).toBe("00:00");
  });
});
