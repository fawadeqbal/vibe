import { create } from "zustand";

import { Ev } from "@/lib/api/realtime";

import { realtime } from "./services";

/**
 * Live notifications while you're in the app (`notification:show`): the
 * server sends one instead of a push when you're using Vibe. They stack at
 * the top, newest first, like on a phone: each stays until you tap it or
 * close it (or open what it's about), never pushed away by the next one.
 */
export interface LiveBanner {
  id: string;
  key: string;
  group: string;
  title: string;
  body: string;
  data: Record<string, string>;
  /** Where tapping it goes; opening that page clears it. */
  path: string;
}

interface BannerState {
  /** Newest first. */
  items: LiveBanner[];
  /** What's on screen right now (the path): a banner about it is skipped. */
  path: string;
  push: (b: LiveBanner) => void;
  dismiss: (id: string) => void;
  clear: () => void;
  setPath: (path: string) => void;
}

/** How many are kept (the oldest beyond this go; they're all on the Notifications page anyway). */
export const MAX_BANNERS = 20;
let seq = 0;

const samePage = (a: string, b: string) => !!a && a.split("?")[0] === b.split("?")[0];

export const useBanners = create<BannerState>()((set) => ({
  items: [],
  path: "",
  push: (b) => set((s) => ({ items: [b, ...s.items].slice(0, MAX_BANNERS) })),
  dismiss: (id) => set((s) => ({ items: s.items.filter((b) => b.id !== id) })),
  clear: () => set({ items: [] }),
  // Opened that chat, that receipt…: its banners are read.
  setPath: (path) => set((s) => ({ path, items: s.items.some((b) => samePage(b.path, path)) ? s.items.filter((b) => !samePage(b.path, path)) : s.items })),
}));

/** Turns a `notification:show` payload into a banner, or null when it's about the page you're on. */
export function bannerFrom(d: Record<string, unknown>, path: string, pathOf: (data: Record<string, string>) => string): LiveBanner | null {
  const data: Record<string, string> = {};
  if (d.data && typeof d.data === "object") for (const [k, v] of Object.entries(d.data as Record<string, unknown>)) if (v != null) data[k] = String(v);
  const title = typeof d.title === "string" ? d.title : "";
  if (!title) return null;
  const target = pathOf(data);
  // Already looking at it (that chat, that receipt…): no banner.
  if (samePage(target, path)) return null;
  return { id: `b${++seq}`, key: typeof d.key === "string" ? d.key : "", group: typeof d.group === "string" ? d.group : "", title, body: typeof d.body === "string" ? d.body : "", data, path: target };
}

export function startBanners(pathOf: (data: Record<string, string>) => string) {
  realtime.on(Ev.notificationShow, (d) => {
    const b = bannerFrom(d, useBanners.getState().path, pathOf);
    if (b) useBanners.getState().push(b);
  });
}
