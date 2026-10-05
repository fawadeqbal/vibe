import { create } from "zustand";

import { asList, asMap, teamMessage } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import type { TeamMessage } from "@/lib/models";

import { api, realtime } from "./services";

const PAGE = 30;

/**
 * "Messages from Vibe": what the team sends from the admin panel. A push on
 * `inbox:message` re-reads the newest page (mirror of `RemoteInboxProvider`).
 */
interface InboxState {
  /** Newest first. */
  messages: TeamMessage[];
  unread: number;
  loaded: boolean;
  cursor: string | null;
  loadingMore: boolean;
  load: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reset: () => void;
}

export const useInbox = create<InboxState>()((set, get) => ({
  messages: [],
  unread: 0,
  loaded: false,
  cursor: null,
  loadingMore: false,

  async load() {
    if (!api.hasSession) return;
    try {
      const [page, unread] = await Promise.all([api.get("/inbox", { limit: PAGE }), api.get("/inbox/unread")]);
      const p = asMap(page);
      set({
        messages: asList(p.items).map((e) => teamMessage(asMap(e))),
        cursor: typeof p.nextCursor === "string" ? p.nextCursor : null,
        unread: typeof asMap(unread).count === "number" ? (asMap(unread).count as number) : 0,
        loaded: true,
      });
    } catch {
      // The inbox is secondary; Chats still works without it.
    }
  },

  async loadMore() {
    const { cursor, loadingMore } = get();
    if (!cursor || loadingMore) return;
    set({ loadingMore: true });
    try {
      const p = asMap(await api.get("/inbox", { limit: PAGE, cursor }));
      set((s) => ({ messages: [...s.messages, ...asList(p.items).map((e) => teamMessage(asMap(e)))], cursor: typeof p.nextCursor === "string" ? p.nextCursor : null }));
    } catch {
    } finally {
      set({ loadingMore: false });
    }
  },

  async markRead(id) {
    const m = get().messages.find((x) => x.id === id);
    if (!m || m.read) return;
    set((s) => ({ messages: s.messages.map((x) => (x.id === id ? { ...x, read: true } : x)), unread: Math.max(0, s.unread - 1) }));
    try {
      await api.post(`/inbox/${id}/read`);
    } catch {}
  },

  async markAllRead() {
    if (get().unread === 0) return;
    set((s) => ({ messages: s.messages.map((x) => ({ ...x, read: true })), unread: 0 }));
    try {
      await api.post("/inbox/read-all");
    } catch {}
  },

  reset: () => set({ messages: [], unread: 0, loaded: false, cursor: null }),
}));

realtime.on(Ev.inboxMessage, () => void useInbox.getState().load());
