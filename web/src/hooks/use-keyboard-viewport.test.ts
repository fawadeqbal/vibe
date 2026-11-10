import { describe, expect, it } from "vitest";

import { viewportState } from "./use-keyboard-viewport";

describe("viewportState", () => {
  it("ignores iOS bouncing the page at the end of a list: nothing moves", () => {
    // Not typing; Safari's bar collapsed (taller) and the page rubber-banded 40px.
    const v = viewportState({ height: 760, full: 700, pageTop: 40, typing: false });
    expect(v).toEqual({ height: 760, full: 760, open: false, top: 0 });
  });

  it("follows the page iOS slid for the keyboard", () => {
    const v = viewportState({ height: 420, full: 760, pageTop: 310.4, typing: true });
    expect(v).toEqual({ height: 420, full: 760, open: true, top: 310 });
  });

  it("keeps following while the keyboard closes after the field lost focus", () => {
    const v = viewportState({ height: 500, full: 760, pageTop: 200, typing: false });
    expect(v.top).toBe(200);
    expect(v.open).toBe(false);
  });

  it("a focused field without a keyboard (hardware keyboard, desktop) isn't open", () => {
    const v = viewportState({ height: 760, full: 760, pageTop: 0, typing: true });
    expect(v).toEqual({ height: 760, full: 760, open: false, top: 0 });
  });
});
