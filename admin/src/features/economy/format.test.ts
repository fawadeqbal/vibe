import { describe, expect, it } from "vitest";

import type { RuleField } from "@/lib/api/types";

import { clockText, fromInput, parseClock, showRule, toInput } from "./format";

const vibeHour: RuleField = { key: "vibeHourStart", label: "Vibe Hour starts at", kind: "clock", min: 0, max: 1439 };

describe("clock rules", () => {
  it("shows minutes after midnight as HH:MM", () => {
    expect(clockText(1260)).toBe("21:00");
    expect(clockText(0)).toBe("00:00");
    expect(clockText(1439)).toBe("23:59");
    expect(showRule(vibeHour, 570)).toBe("09:30");
    expect(toInput(vibeHour, 1260)).toBe("21:00");
  });

  it("parses HH:MM back to minutes and rejects anything else", () => {
    expect(parseClock("9:30")).toBe(570);
    expect(parseClock(" 21:00 ")).toBe(1260);
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("12:60")).toBeNull();
    expect(parseClock("1260")).toBeNull();
    expect(fromInput(vibeHour, "21:15")).toEqual({ value: 1275 });
    expect(fromInput(vibeHour, "nine").error).toMatch(/time like 21:00/);
    expect(fromInput(vibeHour, "").error).toMatch(/required/);
  });
});

describe("referral and partner rules", () => {
  const flag: RuleField = { key: "referralRequireVerified", label: "Must verify", kind: "flag", min: 0, max: 1 };
  const days: RuleField = { key: "referralMilestone1VipDays", label: "VIP", kind: "days", min: 0, max: 365 };
  const cpa: RuleField = { key: "affiliateCpaUsdCents", label: "Per active user", kind: "cents", min: 0, max: 10_000, whole: true };

  it("flags read On/Off and accept on/off words", () => {
    expect(showRule(flag, 1)).toBe("On");
    expect(showRule(flag, 0)).toBe("Off");
    expect(toInput(flag, 1)).toBe("1");
    expect(fromInput(flag, "off")).toEqual({ value: 0 });
    expect(fromInput(flag, "1")).toEqual({ value: 1 });
    expect(fromInput(flag, "maybe").error).toMatch(/on or off/);
  });

  it("days and whole cents", () => {
    expect(showRule(days, 1)).toBe("1 day");
    expect(showRule(days, 30)).toBe("30 days");
    expect(showRule(cpa, 10)).toBe("$0.10");
    expect(fromInput(cpa, "0.25")).toEqual({ value: 25 });
    expect(fromInput(cpa, "0.105").error).toMatch(/whole cents/);
  });
});
