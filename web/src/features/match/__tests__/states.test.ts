import { describe, expect, it } from "vitest";

import { cameraErrorKind } from "@/stores/match";

import { cameraHelp } from "../match-sheets";
import { isSwipeNext, SWIPE_NEXT_PX } from "../swipe";

const err = (name: string) => Object.assign(new Error("x"), { name });

describe("camera failures", () => {
  it("sorts getUserMedia errors into what we can explain", () => {
    expect(cameraErrorKind(err("NotAllowedError"))).toBe("blocked");
    expect(cameraErrorKind(err("NotFoundError"))).toBe("missing");
    expect(cameraErrorKind(err("NotReadableError"))).toBe("busy");
    expect(cameraErrorKind(err("SecurityError"))).toBe("insecure");
    expect(cameraErrorKind("weird")).toBe("other");
  });

  it("gives iPhone people the Settings path, others the address bar", () => {
    expect(cameraHelp("blocked", true).steps[0]).toMatch(/Settings/);
    expect(cameraHelp("blocked", false).steps[0]).toMatch(/address/);
    expect(cameraHelp("busy").title).toMatch(/busy/);
  });
});

describe("swipe up for next", () => {
  it("far enough, or a quick flick; never down", () => {
    expect(isSwipeNext(-SWIPE_NEXT_PX, 800)).toBe(true);
    expect(isSwipeNext(-60, 600)).toBe(false);
    expect(isSwipeNext(-60, 80)).toBe(true);
    expect(isSwipeNext(-20, 10)).toBe(false);
    expect(isSwipeNext(200, 100)).toBe(false);
  });
});
