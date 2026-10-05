import { describe, expect, it } from "vitest";

import { flutterGradientCss, GRADIENTS } from "../gradients";

const angle = (css: string) => Number(/linear-gradient\(([-\d.]+)deg/.exec(css)![1]);
const stops = (css: string) => [...css.matchAll(/ ([-\d.]+)%/g)].map((m) => Number(m[1]));

describe("flutterGradientCss", () => {
  it("is 135deg corner to corner on a square", () => {
    const css = flutterGradientCss(GRADIENTS.brand, 100, 100);
    expect(angle(css)).toBeCloseTo(135, 3);
    expect(stops(css)).toEqual([0, 100]);
  });

  it("follows the real diagonal on a wide button (bands perpendicular to it)", () => {
    const css = flutterGradientCss(GRADIENTS.brand, 364, 56);
    expect(angle(css)).toBeCloseTo(90 + (Math.atan(56 / 364) * 180) / Math.PI, 3);
    const [a, b] = stops(css);
    expect(a).toBeCloseTo(0, 2);
    expect(b).toBeCloseTo(100, 2);
  });

  it("maps off-corner alignments onto the CSS gradient line", () => {
    const css = flutterGradientCss(GRADIENTS.vipCard, 372, 90);
    const [a, b] = stops(css);
    // The Flutter line is shorter than the CSS one: stops move inwards, symmetrically.
    expect(a).toBeGreaterThan(0);
    expect(a + b).toBeCloseTo(100, 2);
  });

  it("is a plain horizontal gradient for centerLeft → centerRight", () => {
    expect(angle(flutterGradientCss(GRADIENTS.bad, 300, 56))).toBeCloseTo(90, 3);
  });
});
