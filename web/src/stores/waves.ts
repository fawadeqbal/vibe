import { create } from "zustand";

import { errorMessage } from "@/lib/api/errors";
import { asList, asMap, profile as mapProfile } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import { notifyInBackground } from "@/lib/browser-notify";
import type { Profile } from "@/lib/models";

import { api, realtime } from "./services";
import { toast } from "./ui";
import { useWaitlist } from "./waitlist";

/** Someone in "Recently here". */
export interface RecentPerson {
  profile: Profile;
  online: boolean;
  lastSeenAt: Date | null;
  iWaved: boolean;
  wavedAtMe: boolean;
}

/**
 * Waves (GET /waves/recent, POST /waves/:id). "Recently here" shows real
 * people seen in the last two days; a wave tells them, and two people who
 * waved are matched first when both are searching. `lookingFrom` is set
 * when someone you waved with starts searching ("Sara is looking now").
 */
interface WavesState {
  recent: RecentPerson[];
  loaded: boolean;
  unseen: number;
  /** Someone you waved with is searching right now. */
  lookingFrom: Profile | null;
  load: () => Promise<void>;
  wave: (userId: string) => Promise<void>;
  markSeen: () => Promise<void>;
  clearLooking: () => void;
  reset: () => void;
}

export const recentPerson = (m: Record<string, unknown>): RecentPerson => ({
  profile: mapProfile(asMap(m.profile)),
  online: m.online === true,
  lastSeenAt: typeof m.lastSeenAt === "string" ? new Date(m.lastSeenAt) : null,
  iWaved: m.iWaved === true,
  wavedAtMe: m.wavedAtMe === true,
});

const firstName = (p: { name: string }) => p.name.trim().split(/\s+/)[0] || "Someone";

export const useWaves = create<WavesState>()((set, get) => ({
  recent: [],
  loaded: false,
  unseen: 0,
  lookingFrom: null,

  async load() {
    if (!api.hasSession) return;
    try {
      const [recent, received] = await Promise.all([api.get("/waves/recent"), api.get("/waves/received")]);
      set({ recent: asList(recent).map((x) => recentPerson(asMap(x))), unseen: Number(asMap(received).unseen) || 0, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  async wave(userId) {
    const before = get().recent;
    set({ recent: before.map((p) => (p.profile.id === userId ? { ...p, iWaved: true } : p)) });
    try {
      const r = asMap(await api.post(`/waves/${userId}`));
      const p = before.find((x) => x.profile.id === userId);
      const name = p ? firstName(p.profile) : "them";
      toast(r.mutual ? `You and ${name} waved 👋 You're matched first when you're both looking.` : `Waved at ${name} 👋 We'll let them know.`);
    } catch (e) {
      set({ recent: before });
      toast(errorMessage(e), { error: true });
    }
  },

  async markSeen() {
    if (!get().unseen) return;
    set({ unseen: 0 });
    try {
      await api.post("/waves/seen");
    } catch {}
  },

  clearLooking: () => set({ lookingFrom: null }),
  reset: () => set({ recent: [], loaded: false, unseen: 0, lookingFrom: null }),
}));

realtime.on(Ev.waveNew, (e) => {
  const from = mapProfile(asMap(e.from));
  const mutual = e.mutual === true;
  useWaves.setState((s) => {
    // Whoever just waved goes to the front.
    const known = s.recent.find((p) => p.profile.id === from.id);
    const card = known ? { ...known, wavedAtMe: true, online: true } : { profile: from, online: true, lastSeenAt: new Date(), iWaved: mutual, wavedAtMe: true };
    const recent = [card, ...s.recent.filter((p) => p.profile.id !== from.id)];
    return { recent, unseen: s.unseen + 1 };
  });
  const text = mutual ? `${firstName(from)} waved back 👋` : `${firstName(from)} waved at you 👋`;
  if (!notifyInBackground(text, mutual ? "You're matched first when you're both looking." : "Wave back, and you're matched first when you're both on.", { tag: `vibe-wave-${from.id}` })) toast(text);
});

realtime.on(Ev.waveLooking, (e) => {
  const from = mapProfile(asMap(e.from));
  useWaves.setState({ lookingFrom: from });
  // Same banner as "someone's looking" (lobby strip, bar on other pages).
  useWaitlist.setState({ someoneLookingAt: new Date() });
  notifyInBackground(`${firstName(from)} is looking for a match now`, "Come back and press Start: you two are matched first.", { tag: "vibe-someone-looking" });
});
