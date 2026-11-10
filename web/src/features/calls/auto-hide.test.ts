import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTO_HIDE_MS, createAutoHide } from "./auto-hide";

describe("createAutoHide", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("hides the controls 4 s after the last tap, and a tap brings them back", () => {
    const seen: boolean[] = [];
    const a = createAutoHide((v) => seen.push(v));
    a.poke();
    vi.advanceTimersByTime(AUTO_HIDE_MS - 1);
    expect(a.shown).toBe(true);
    a.poke(); // a tap restarts the countdown
    vi.advanceTimersByTime(AUTO_HIDE_MS - 1);
    expect(a.shown).toBe(true);
    vi.advanceTimersByTime(1);
    expect(a.shown).toBe(false);
    a.poke();
    expect(a.shown).toBe(true);
    expect(seen).toEqual([false, true]);
  });

  it("a tap on the video hides them at once, the next one shows them", () => {
    const a = createAutoHide(() => {});
    a.poke();
    a.toggle();
    expect(a.shown).toBe(false);
    a.toggle();
    expect(a.shown).toBe(true);
    vi.advanceTimersByTime(AUTO_HIDE_MS);
    expect(a.shown).toBe(false);
  });

  it("stays up while held (a sheet open, dragging, no video yet), then counts down again", () => {
    const a = createAutoHide(() => {});
    a.poke();
    vi.advanceTimersByTime(AUTO_HIDE_MS);
    expect(a.shown).toBe(false);
    a.hold(true);
    expect(a.shown).toBe(true);
    a.toggle();
    vi.advanceTimersByTime(AUTO_HIDE_MS * 3);
    expect(a.shown).toBe(true);
    a.hold(false);
    vi.advanceTimersByTime(AUTO_HIDE_MS);
    expect(a.shown).toBe(false);
  });

  it("stops its timer when disposed", () => {
    const onChange = vi.fn();
    const a = createAutoHide(onChange);
    a.poke();
    a.dispose();
    vi.advanceTimersByTime(AUTO_HIDE_MS * 2);
    expect(onChange).not.toHaveBeenCalled();
  });
});
