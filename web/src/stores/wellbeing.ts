import { create } from "zustand";

import { BreakTimer } from "@/lib/engagement";

import { useMatch } from "./match";
import { useSession } from "./session";

/**
 * The break reminder (spec §11), client only: counts time with the page
 * visible while you are searching or in a call. At your limit (Me →
 * Notifications & wellbeing) `due` turns on and the engagement host asks
 * "Time for a break?". Ten minutes without counting starts it over.
 */
interface WellbeingState {
  due: boolean;
  /** Minutes counted when it came due (for the copy). */
  dueMinutes: number;
  /** "Keep going": count again from zero. */
  dismiss: () => void;
}

const TICK_MS = 15_000;
const timer = new BreakTimer();
let interval: ReturnType<typeof setInterval> | undefined;
let wasCounting = false;
let unsubscribe: (() => void) | undefined;

export const useWellbeing = create<WellbeingState>()((set) => ({
  due: false,
  dueMinutes: 0,
  dismiss() {
    timer.reset();
    set({ due: false });
  },
}));

const counting = () => {
  const st = useMatch.getState().status;
  return (st === "searching" || st === "connected") && typeof document !== "undefined" && document.visibilityState === "visible";
};

function tick() {
  const limit = useSession.getState().prefs.breakReminderMinutes;
  // The state since the last tick is what counts for the time that passed.
  const due = timer.tick(Date.now(), wasCounting, limit);
  wasCounting = counting();
  if (due) useWellbeing.setState({ due: true, dueMinutes: limit ?? 0 });
}

/** Runs while signed in (stores/runtime.ts). */
export function startBreakReminder() {
  if (interval) return;
  timer.reset();
  wasCounting = counting();
  timer.tick(Date.now(), false, null);
  interval = setInterval(tick, TICK_MS);
  // Status / visibility changes settle the time up to now under the old state.
  unsubscribe = useMatch.subscribe((s, prev) => {
    if (s.status !== prev.status) tick();
  });
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", tick);
}

export function stopBreakReminder() {
  clearInterval(interval);
  interval = undefined;
  unsubscribe?.();
  unsubscribe = undefined;
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", tick);
  timer.reset();
  useWellbeing.setState({ due: false });
}
