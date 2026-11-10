"use client";

import { useEffect, useState } from "react";

/** How long a video call's controls stay up after the last tap. */
export const AUTO_HIDE_MS = 4000;

export interface AutoHide {
  readonly shown: boolean;
  /** Show the controls and start the countdown again (any tap, key or mouse move). */
  poke: () => void;
  /** A tap on the video itself: hide them at once, or bring them back. */
  toggle: () => void;
  /** While held (a sheet open, dragging the small picture, no video yet) they stay up. */
  hold: (held: boolean) => void;
  dispose: () => void;
}

/**
 * The controls of a video call that get out of the way, like WhatsApp or
 * FaceTime: up when the call starts, gone after `ms` without a tap, back on
 * the next tap. Framework-free, so it is tested with fake timers.
 * (app: screens/calls/auto_hide.dart)
 */
export function createAutoHide(onChange: (shown: boolean) => void, ms = AUTO_HIDE_MS): AutoHide {
  let shown = true;
  let held = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const set = (v: boolean) => {
    if (v === shown) return;
    shown = v;
    onChange(v);
  };
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const arm = () => {
    clear();
    if (held || !shown) return;
    timer = setTimeout(() => {
      timer = null;
      set(false);
    }, ms);
  };
  const poke = () => {
    set(true);
    arm();
  };
  return {
    get shown() {
      return shown;
    },
    poke,
    toggle: () => {
      if (!shown || held) return poke();
      clear();
      set(false);
    },
    hold: (v) => {
      held = v;
      if (v) set(true);
      arm();
    },
    dispose: clear,
  };
}

/** `createAutoHide` for a component. Call `hold` from an effect when what holds them changes. */
export function useAutoHide(ms = AUTO_HIDE_MS) {
  const [shown, setShown] = useState(true);
  const [ctl] = useState(() => createAutoHide(setShown, ms));
  useEffect(() => {
    ctl.poke();
    return ctl.dispose;
  }, [ctl]);
  return { shown, poke: ctl.poke, toggle: ctl.toggle, hold: ctl.hold };
}
