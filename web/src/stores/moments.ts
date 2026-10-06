import { create } from "zustand";

import { asList, asMap, moment as mapMoment, momentFeed, profile as mapProfile } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import type { Moment, MomentGroup, Profile, ReportReason } from "@/lib/models";

import { api, realtime } from "./services";

/**
 * Moments: 24-hour photos from you, the people you follow and your friends.
 * `moments:new` re-reads the feed (mirror of the Flutter `MomentsProvider`).
 */
interface MomentsState {
  /** Yours, oldest first. */
  mine: Moment[];
  /** Unseen authors first; each author's moments oldest first. */
  people: MomentGroup[];
  loaded: boolean;

  load: () => Promise<void>;
  /** Rejects with ApiError (MOMENT_LIMIT, 415 wrong type…). */
  post: (photo: Blob, caption: string) => Promise<Moment>;
  /** Marks someone's moment seen (once per moment per session). */
  markSeen: (m: Moment) => void;
  viewers: (id: string) => Promise<{ profile: Profile; at: Date }[]>;
  remove: (id: string) => Promise<void>;
  report: (id: string, choice: { reason: ReportReason; note?: string; block: boolean }) => Promise<void>;
  reset: () => void;
}

const REASON_API: Record<ReportReason, string> = { nudity: "NUDITY", harassment: "HARASSMENT", underage: "UNDERAGE", spam: "SPAM", scam: "SCAM", other: "OTHER" };
const viewed = new Set<string>();

export const useMoments = create<MomentsState>()((set, get) => ({
  mine: [],
  people: [],
  loaded: false,

  async load() {
    if (!api.hasSession) return;
    try {
      const f = momentFeed(asMap(await api.get("/moments/feed")));
      set({ mine: f.mine, people: f.people, loaded: true });
    } catch {}
  },

  async post(photo, caption) {
    const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    const m = mapMoment(asMap(await api.uploadFiles("/moments", [{ field: "photo", file: photo, filename: `moment.${ext}` }], caption.trim() ? { caption: caption.trim() } : {})));
    set((s) => ({ mine: [...s.mine, m] }));
    return m;
  },

  markSeen(m) {
    if (m.seen || viewed.has(m.id)) return;
    viewed.add(m.id);
    // Seen locally at once; the feed's order changes on the next load.
    set((s) => ({
      people: s.people.map((g) => {
        if (!g.moments.some((x) => x.id === m.id)) return g;
        const moments = g.moments.map((x) => (x.id === m.id ? { ...x, seen: true } : x));
        return { ...g, moments, allSeen: moments.every((x) => x.seen) };
      }),
    }));
    api.post(`/moments/${m.id}/view`).catch(() => viewed.delete(m.id));
  },

  async viewers(id) {
    return asList(await api.get(`/moments/${id}/viewers`)).map((e) => {
      const v = asMap(e);
      return { profile: mapProfile(asMap(v.profile)), at: typeof v.at === "string" ? new Date(v.at) : new Date() };
    });
  },

  async remove(id) {
    await api.delete(`/moments/${id}`);
    set((s) => ({ mine: s.mine.filter((m) => m.id !== id) }));
  },

  async report(id, choice) {
    await api.post(`/moments/${id}/report`, { reason: REASON_API[choice.reason], ...(choice.note ? { note: choice.note } : {}), block: choice.block });
    if (choice.block) await get().load();
  },

  reset() {
    viewed.clear();
    set({ mine: [], people: [], loaded: false });
  },
}));

realtime.on(Ev.momentNew, () => void useMoments.getState().load());
