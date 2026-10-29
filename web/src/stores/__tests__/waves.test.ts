import { describe, expect, it } from "vitest";

import { recentPerson } from "../waves";

describe("recentPerson", () => {
  it("maps the API row", () => {
    const p = recentPerson({ profile: { id: "u1", name: "Sara Khan", age: 23, countryCode: "PK" }, online: true, lastSeenAt: "2026-10-29T10:00:00Z", iWaved: false, wavedAtMe: true });
    expect(p).toMatchObject({ online: true, iWaved: false, wavedAtMe: true, profile: { id: "u1", name: "Sara Khan", age: 23 } });
    expect(p.lastSeenAt?.toISOString()).toBe("2026-10-29T10:00:00.000Z");
  });

  it("is safe with missing fields", () => {
    expect(recentPerson({ profile: { id: "u2" } })).toMatchObject({ online: false, lastSeenAt: null, iWaved: false, wavedAtMe: false });
  });
});
