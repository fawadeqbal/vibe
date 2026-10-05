import { describe, expect, it } from "vitest";

import { ApiError } from "../api/errors";
import { friend, profile, wallet } from "../api/mappers";
import { parsePurchase } from "../payments";

describe("API mappers", () => {
  it("reads a profile with safe defaults", () => {
    const p = profile({ id: "u1", name: "Sana", age: 23, gender: "female", countryCode: "TR", interests: ["Music", 3] });
    expect(p).toMatchObject({ id: "u1", gender: "female", country: { code: "TR" }, interests: ["Music"], verified: false, bio: "" });
  });

  it("reads the wallet view", () => {
    const w = wallet({ coins: 340, gems: 1280, vip: { until: "2030-01-01T00:00:00Z" }, checkIn: { streakDay: 2, lastAt: null } });
    expect(w.coins).toBe(340);
    expect(w.vipUntil?.getUTCFullYear()).toBe(2030);
    expect(w.streakDay).toBe(2);
  });

  it("reads friends and purchases", () => {
    expect(friend({ profile: { id: "f" }, state: "requested", unread: 2 }).state).toBe("requested");
    const p = parsePurchase({ id: "p", status: "REQUIRES_ACTION", method: "JAZZCASH", amount: { currency: "PKR", value: 277 }, action: { type: "otp" } });
    expect(p).toMatchObject({ state: "requiresAction", method: "jazzCash", currency: "PKR", amount: 277, action: { type: "otp" } });
  });

  it("surfaces the first field message of a validation error", () => {
    const e = ApiError.fromBody(400, { error: { code: "VALIDATION_FAILED", message: "Some fields are invalid", details: { fields: ["Return URL must be vibe:// or https://"] } } });
    expect(e.message).toBe("Return URL must be vibe:// or https://");
  });
});
