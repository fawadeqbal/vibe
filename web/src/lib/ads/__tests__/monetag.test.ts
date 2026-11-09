import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";

import { MonetagAds } from "../monetag";

const setup = { zoneId: "9876543", sdkUrl: "https://libtl.com/sdk.js" };

describe("MonetagAds", () => {
  it("shows the ad with the server's token as ymid and returns that token", async () => {
    const show = vi.fn(async () => undefined);
    const ads = new MonetagAds(setup, { start: async () => ({ token: "vToken123" }), loadSdk: async () => show });
    expect(await ads.show()).toEqual({ outcome: "rewarded", token: "vToken123" });
    expect(show).toHaveBeenCalledWith({ ymid: "vToken123", requestVar: "store" });
  });

  it("no ad (the SDK rejects) is noFill, not a reward", async () => {
    const ads = new MonetagAds(setup, { start: async () => ({ token: "vToken123" }), loadSdk: async () => () => Promise.reject(new Error("no feed")) });
    expect((await ads.show()).outcome).toBe("noFill");
  });

  it("a blocked script says so", async () => {
    const ads = new MonetagAds(setup, { start: async () => ({ token: "vToken123" }), loadSdk: () => Promise.reject(new Error("blocked")) });
    const r = await ads.show();
    expect(r.outcome).toBe("noFill");
    expect(r.message).toMatch(/ad blocker/);
  });

  it("the server refusing (daily limit, ads off) passes its message on", async () => {
    const ads = new MonetagAds(setup, { start: () => Promise.reject(new ApiError("DAILY_LIMIT_REACHED", "You've watched all of today's ads", 409)), loadSdk: async () => async () => undefined });
    expect(await ads.show()).toEqual({ outcome: "unavailable", message: "You've watched all of today's ads" });
  });

  it("a second tap while one is playing does nothing", async () => {
    let finish: () => void = () => {};
    const ads = new MonetagAds(setup, { start: async () => ({ token: "vToken123" }), loadSdk: async () => () => new Promise<void>((r) => (finish = r)) });
    const first = ads.show();
    expect((await ads.show()).outcome).toBe("dismissed");
    await new Promise((r) => setTimeout(r, 0));
    finish();
    expect((await first).outcome).toBe("rewarded");
  });
});
