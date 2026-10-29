import { create } from "zustand";

import { asMap } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import { askToNotify, notifyInBackground } from "@/lib/browser-notify";

import { api, realtime } from "./services";

/**
 * "Tell me when someone's looking" (POST /match/notify-me). For quiet hours:
 * leave the queue instead of watching a spinner; the next person who starts
 * searching wakes you up — a banner in the lobby, a browser notification if
 * this tab is in the background, or a push on your phone if the app is closed.
 * One-shot, lasts 3 hours.
 */
interface WaitlistState {
  /** When the request lapses; null when there's none. */
  until: Date | null;
  /** Someone started looking after you asked (cleared once you start or dismiss). */
  someoneLookingAt: Date | null;
  /** Browser notifications are allowed, so a background tab can be pinged. */
  browserAlerts: boolean;
  load: () => Promise<void>;
  notifyMe: () => Promise<boolean>;
  cancel: () => Promise<void>;
  dismiss: () => void;
  reset: () => void;
}

const untilOf = (v: unknown) => {
  const s = asMap(v).until;
  const d = typeof s === "string" ? new Date(s) : null;
  return d && d.getTime() > Date.now() ? d : null;
};

export const useWaitlist = create<WaitlistState>()((set) => ({
  until: null,
  someoneLookingAt: null,
  browserAlerts: false,

  async load() {
    try {
      set({ until: untilOf(await api.get("/match/notify-me")) });
    } catch {}
  },

  async notifyMe() {
    // Ask from the click itself; the request still works without it (banner + phone push).
    const browserAlerts = await askToNotify();
    try {
      set({ until: untilOf(await api.post("/match/notify-me")), someoneLookingAt: null, browserAlerts });
      return true;
    } catch {
      return false;
    }
  },

  async cancel() {
    set({ until: null });
    try {
      await api.delete("/match/notify-me");
    } catch {}
  },

  dismiss: () => set({ someoneLookingAt: null }),
  reset: () => set({ until: null, someoneLookingAt: null }),
}));

realtime.on(Ev.matchSomeoneLooking, () => {
  useWaitlist.setState({ until: null, someoneLookingAt: new Date() });
  // Clicking it brings this tab back, where the lobby (or the bar on other pages) has a Start button.
  notifyInBackground("Someone's looking for a match", "You asked us to tell you. Come back to Vibe to meet them.", { tag: "vibe-someone-looking" });
});
