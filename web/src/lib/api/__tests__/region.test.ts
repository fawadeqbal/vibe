import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClient } from "../client";
import { ApiError } from "../errors";

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("region blocking", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tells the app when the API says Vibe isn't offered here (451)", async () => {
    vi.stubGlobal("fetch", reply(451, { error: { code: "REGION_UNAVAILABLE", message: "Vibe isn't available in your region.", details: { country: "IN" } } }));
    const api = new ApiClient("https://api.test/v1");
    const onRegionBlocked = vi.fn();
    api.onRegionBlocked = onRegionBlocked;
    const e = await api.get("/catalog").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).isRegionUnavailable).toBe(true);
    expect(onRegionBlocked).toHaveBeenCalledWith("Vibe isn't available in your region.");
  });

  it("a blocked phone number is only a form error", async () => {
    vi.stubGlobal("fetch", reply(400, { error: { code: "COUNTRY_NOT_SUPPORTED", message: "Phone numbers from India can't be used on Vibe." } }));
    const api = new ApiClient("https://api.test/v1");
    const onRegionBlocked = vi.fn();
    api.onRegionBlocked = onRegionBlocked;
    await expect(api.post("/wallet/payout-accounts", {})).rejects.toMatchObject({ code: "COUNTRY_NOT_SUPPORTED" });
    expect(onRegionBlocked).not.toHaveBeenCalled();
  });
});
