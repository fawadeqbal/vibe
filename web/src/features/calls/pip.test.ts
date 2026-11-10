import { describe, expect, it } from "vitest";

import { cornerPoint, nearestCorner, PIP_FRAME } from "./pip";

const f = PIP_FRAME; // 100 × 140, header 78, dock 132, margin 12

describe("call picture-in-picture", () => {
  it("each corner keeps clear of the header, the controls and the safe areas", () => {
    expect(cornerPoint("tr", 390, 844, f)).toEqual({ x: 278, y: 78 });
    expect(cornerPoint("tl", 390, 844, f)).toEqual({ x: 12, y: 78 });
    expect(cornerPoint("br", 390, 844, f)).toEqual({ x: 278, y: 572 });
    expect(cornerPoint("bl", 390, 844, f, 47, 34)).toEqual({ x: 12, y: 538 });
    expect(cornerPoint("tr", 390, 844, f, 47).y).toBe(125);
  });

  it("let go: it snaps to the nearest corner", () => {
    expect(nearestCorner(20, 100, 390, 844, f)).toBe("tl");
    expect(nearestCorner(260, 90, 390, 844, f)).toBe("tr");
    expect(nearestCorner(30, 600, 390, 844, f)).toBe("bl");
    expect(nearestCorner(250, 500, 390, 844, f)).toBe("br");
  });
});
