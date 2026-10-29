import { describe, expect, it } from "vitest";

import { activeLabel } from "../discover-card";
import { comesBackIn } from "../discover-sheets";

describe("discover labels", () => {
  it("says when free likes come back in plain words", () => {
    const now = Date.UTC(2026, 9, 29, 12, 0);
    expect(comesBackIn(new Date(now + 40 * 60_000), now)).toBe("40 minutes");
    expect(comesBackIn(new Date(now + 60_000), now)).toBe("1 minute");
    expect(comesBackIn(new Date(now + 3 * 3_600_000), now)).toBe("3 hours");
    expect(comesBackIn(new Date(now + 3_600_000), now)).toBe("1 hour");
  });

  it("shows activity on a card", () => {
    expect(activeLabel({ online: true, lastSeenAt: null })).toBe("Active now");
    expect(activeLabel({ online: false, lastSeenAt: null })).toBe("");
    expect(activeLabel({ online: false, lastSeenAt: new Date(Date.now() - 3 * 3_600_000) })).toBe("Active 3h ago");
  });
});
