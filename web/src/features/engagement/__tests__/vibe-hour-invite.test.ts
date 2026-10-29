import { describe, expect, it } from "vitest";

import { untilLabel } from "../vibe-hour-invite";

describe("untilLabel", () => {
  it("reads minutes and hours", () => {
    expect(untilLabel(12 * 60_000)).toBe("in 12 min");
    expect(untilLabel(20_000)).toBe("in 1 min");
    expect(untilLabel(3 * 3600_000)).toBe("in 3 h");
    expect(untilLabel(3 * 3600_000 + 20 * 60_000)).toBe("in 3 h 20 min");
  });
});
