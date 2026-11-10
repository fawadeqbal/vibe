import { create } from "zustand";

import { activityItem, asList, asMap } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import type { ActivityItem } from "@/lib/models";

import { api, realtime } from "./services";

const PAGE = 30;

/** Lines about a chat: read when you open that chat. Mirrors the backend's CHAT_TYPES. */
export const CHAT_TYPES = ["chat.message", "chat.gift", "chat.reaction"];

/**
 * The Notifications page: friend and follow requests, new followers,
 * matches, missed calls, money and account news (`/activity`).
 *
 * Two kinds of "read", like on any social app:
 *  - the bell (`unread`) counts what came since you last opened the page;
 *    opening the page clears it (`seen`);
 *  - each line stays highlighted until you open it: tap the line, its push
 *    or its banner, or open what it's about (that chat, answering that
 *    request — the server does those), or "Mark all read".
 * `activity:new` adds a line live; `activity:read` keeps every device's
 * bell and highlights in step.
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
  /** Opened the page: the bell goes to 0; lines stay highlighted. */
  seen: () => Promise<void>;
  /** Opened these lines (a tap on the line, its push or banner). */
  markRead: (ids: string[]) => Promise<void>;
  /** "Mark all read": every line and the bell. */
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

  async seen() {
    set({ unread: 0 });
    try {
      const r = asMap(await api.post("/activity/seen", {}));
      if (typeof r.unread === "number") set({ unread: r.unread });
    } catch {}
  },

  async markRead(ids) {
    const todo = ids.filter((id) => get().items.find((i) => i.id === id)?.read !== true);
    if (!todo.length) return;
    set((s) => ({ items: s.items.map((i) => (todo.includes(i.id) ? { ...i, read: true } : i)) }));
    try {
      const r = asMap(await api.post("/activity/read", { ids: todo }));
      if (typeof r.unread === "number") set({ unread: r.unread });
    } catch {}
  },

  async markAllRead() {
    set((s) => ({ unread: 0, items: s.items.map((i) => (i.read ? i : { ...i, read: true })) }));
    try {
      const r = asMap(await api.post("/activity/read", {}));
      if (typeof r.unread === "number") set({ unread: r.unread });
    } catch {}
  },

  async refresh() {
    if (!api.hasSession) return;
    try {
      const { items, cursor, unread } = parse(await api.get("/activity", { limit: Math.max(PAGE, get().items.length) }));
      set({ items, cursor, unread, loaded: true });
    } catch {}
  },

  reset: () => set({ items: [], unread: 0, loaded: false, cursor: null }),
}));

realtime.on(Ev.activityNew, (d) => {
  const item = d.item && typeof d.item === "object" ? activityItem(asMap(d.item)) : null;
  useActivity.setState((s) => ({
    // A collapsed line (one per chat) comes back with the same id: move it to the top with its new text.
    items: item ? [item, ...s.items.filter((x) => x.id !== item.id)] : s.items,
    unread: typeof d.unread === "number" ? d.unread : s.unread + (item ? 1 : 0),
  }));
});
realtime.on(Ev.activityRead, (d) => {
  // Read here or on another device (a line, a chat, everything): the bell and the highlights follow.
  const ids = Array.isArray(d.ids) ? d.ids.filter((x): x is string => typeof x === "string") : [];
  useActivity.setState((s) => ({
    unread: typeof d.unread === "number" ? d.unread : s.unread,
    items: d.all === true ? s.items.map((i) => (i.read ? i : { ...i, read: true })) : ids.length ? s.items.map((i) => (ids.includes(i.id) ? { ...i, read: true } : i)) : s.items,
  }));
});

/** A push or banner carries its line's id: opening it reads the line. */
export function readFromTap(data: Record<string, unknown>) {
  const id = data.activityId;
  if (typeof id === "string" && id) void useActivity.getState().markRead([id]);
}
