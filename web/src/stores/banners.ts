import { create } from "zustand";

import { Ev } from "@/lib/api/realtime";

import { realtime } from "./services";

/**
 * Live notifications while you're in the app (`notification:show`): the
 * server sends one instead of a push when you're online. Shown as a banner
 * at the top for a few seconds; tapping opens what it's about.
 */
export interface LiveBanner {
  id: string;
  key: string;
  group: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

interface BannerState {
  current: LiveBanner | null;
  queue: LiveBanner[];
  /** What's on screen right now (the path): a banner about it is skipped. */
  path: string;
  push: (b: LiveBanner) => void;
  dismiss: () => void;
  setPath: (path: string) => void;
}

/** How long a banner stays up. */
export const BANNER_MS = 5000;
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;

export const useBanners = create<BannerState>()((set, get) => ({
  current: null,
  queue: [],
  path: "",
  push(b) {
    if (!get().current) {
      set({ current: b });
      clearTimeout(timer);
      timer = setTimeout(() => get().dismiss(), BANNER_MS);
      return;
    }
    // A newer line about the same thing (another message from Sara) replaces the queued one; at most 3 wait.
    set((s) => ({ queue: [...s.queue.filter((q) => q.key !== b.key || q.data.friendId !== b.data.friendId), b].slice(-3) }));
  },
  dismiss() {
    clearTimeout(timer);
    const [next, ...rest] = get().queue;
    set({ current: next ?? null, queue: rest });
    if (next) timer = setTimeout(() => get().dismiss(), BANNER_MS);
  },
  setPath: (path) => set({ path }),
}));

/** Turns a `notification:show` payload into a banner, or null when it's about the page you're on. */
export function bannerFrom(d: Record<string, unknown>, path: string, pathOf: (data: Record<string, string>) => string): LiveBanner | null {
  const data: Record<string, string> = {};
  if (d.data && typeof d.data === "object") for (const [k, v] of Object.entries(d.data as Record<string, unknown>)) if (v != null) data[k] = String(v);
  const title = typeof d.title === "string" ? d.title : "";
  if (!title) return null;
  const target = pathOf(data);
  // Already looking at it (that chat, that receipt…): no banner.
  if (target && target.split("?")[0] === path) return null;
  return { id: `b${++seq}`, key: typeof d.key === "string" ? d.key : "", group: typeof d.group === "string" ? d.group : "", title, body: typeof d.body === "string" ? d.body : "", data };
}

export function startBanners(pathOf: (data: Record<string, string>) => string) {
  realtime.on(Ev.notificationShow, (d) => {
    const b = bannerFrom(d, useBanners.getState().path, pathOf);
    if (b) useBanners.getState().push(b);
  });
}
