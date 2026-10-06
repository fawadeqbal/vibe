import { describe, expect, it } from "vitest";

import { channelText, CODE_RE, flagTone, parseOptionalCents, parseOptionalInt, progressText, rejectReasonText, termsText, totalFollowers } from "./format";

describe("growth formatting", () => {
  it("reject reasons read as words", () => {
    expect(rejectReasonText("same_device")).toMatch(/Same device/);
    expect(rejectReasonText("staff: Fake account")).toBe("By staff: Fake account");
    expect(rejectReasonText("invitee_deleted")).toBe("Deleted their account");
    expect(rejectReasonText(null)).toBe("—");
  });

  it("activation progress", () => {
    expect(progressText({ verified: true, verifyNeeded: true, calls: 2, callsNeeded: 3 })).toBe("Verified ✓ · 2/3 calls");
    expect(progressText({ verified: false, verifyNeeded: true, calls: 0, callsNeeded: 3 })).toBe("Not verified · 0/3 calls");
    expect(progressText({ verified: false, verifyNeeded: false, calls: 0, callsNeeded: 0 })).toBe("No steps");
  });

  it("channels, followers and terms", () => {
    expect(channelText({ platform: "tiktok", url: "https://tiktok.com/@a", followers: 25_000 })).toBe("TikTok · 25K");
    expect(totalFollowers([{ platform: "x", url: "", followers: 5 }, { platform: "youtube", url: "", followers: 10 }])).toBe(15);
    expect(termsText({ revSharePercent: 30, cpaUsdCents: 10 })).toBe("30% of purchases · $0.10 per active user");
    expect(flagTone({ level: "severe" })).toBe("bad");
    expect(flagTone({ level: "warn" })).toBe("warn");
  });

  it("term inputs: empty means the default", () => {
    expect(parseOptionalInt("", 0, 80)).toEqual({ value: null });
    expect(parseOptionalInt("30", 0, 80)).toEqual({ value: 30 });
    expect(parseOptionalInt("81", 0, 80)).toEqual({ error: "Between 0 and 80" });
    expect(parseOptionalInt("2.5", 0, 80)).toEqual({ error: "Whole numbers only" });
    expect(parseOptionalCents("$0.25", 10_000)).toEqual({ value: 25 });
    expect(parseOptionalCents("", 10_000)).toEqual({ value: null });
    expect(parseOptionalCents("0.105", 10_000)).toEqual({ error: "Whole cents only" });
    expect(parseOptionalCents("101", 10_000)).toEqual({ error: "At most $100.00" });
    expect(CODE_RE.test("ALI_VLOGS")).toBe(true);
    expect(CODE_RE.test("ali-vlogs")).toBe(false);
  });
});
