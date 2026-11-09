import { create } from "zustand";

import { activityItem, asList, asMap } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import type { ActivityItem } from "@/lib/models";

import { api, realtime } from "./services";

const PAGE = 30;

/**
 * The Notifications page: friend and follow requests, new followers,
 * matches, missed calls, money and account news (`/activity`). The bell's
 * badge is `unread`; `activity:new` adds a line live, `activity:read` keeps
 * every device's badge in step.
 */
interface ActivityState {
  /** Newest first. */
  items: ActivityItem[];
  unread: number;
  loaded: boolean;
  cursor: string | null;
  loadingMore: boolean;
  load: () => Promise<void>;
  loadMore: () => Promise<void>;
  /** Clears the badge; lines keep their "new" look until the page is left. */
  markAllRead: () => Promise<void>;
  /** After acting on a line (accept, follow back…): re-read who's who. */
  refresh: () => Promise<void>;
  reset: () => void;
}

const parse = (page: unknown) => {
  const p = asMap(page);
  return { items: asList(p.items).map((e) => activityItem(asMap(e))), cursor: typeof p.nextCursor === "string" ? p.nextCursor : null, unread: typeof p.unread === "number" ? p.unread : 0 };
};

export const useActivity = create<ActivityState>()((set, get) => ({
  items: [],
  unread: 0,
  loaded: false,
  cursor: null,
  loadingMore: false,

  async load() {
    if (!api.hasSession) return;
    try {
      const { items, cursor, unread } = parse(await api.get("/activity", { limit: PAGE }));
      set({ items, cursor, unread, loaded: true });
    } catch {
      // Secondary: the rest of the app works without it.
    }
  },

  async loadMore() {
    const { cursor, loadingMore } = get();
    if (!cursor || loadingMore) return;
    set({ loadingMore: true });
    try {
      const page = parse(await api.get("/activity", { limit: PAGE, cursor }));
      set((s) => ({ items: [...s.items, ...page.items.filter((i) => !s.items.some((x) => x.id === i.id))], cursor: page.cursor }));
    } catch {
    } finally {
      set({ loadingMore: false });
    }
  },

  async markAllRead() {
    if (get().unread === 0) return;
    set({ unread: 0 });
    try {
      const r = asMap(await api.post("/activity/read", {}));
      if (typeof r.unread === "number") set({ unread: r.unread });
    } catch {}
  },

  async refresh() {
    if (!api.hasSession) return;
    try {
      const { items, unread } = parse(await api.get("/activity", { limit: Math.max(PAGE, get().items.length) }));
      // Keep this visit's "new" highlight on lines that were unread when the page opened.
      set((s) => ({ items: items.map((i) => ({ ...i, read: i.read && (s.items.find((x) => x.id === i.id)?.read ?? true) })), unread }));
    } catch {}
  },

  reset: () => set({ items: [], unread: 0, loaded: false, cursor: null }),
}));

realtime.on(Ev.activityNew, (d) => {
  const item = d.item && typeof d.item === "object" ? activityItem(asMap(d.item)) : null;
  useActivity.setState((s) => ({
    items: item && !s.items.some((x) => x.id === item.id) ? [item, ...s.items] : s.items,
    unread: typeof d.unread === "number" ? d.unread : s.unread + (item ? 1 : 0),
  }));
});
realtime.on(Ev.activityRead, (d) => {
  if (typeof d.unread === "number") useActivity.setState({ unread: d.unread });
});
