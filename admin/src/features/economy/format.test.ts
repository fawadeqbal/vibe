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
