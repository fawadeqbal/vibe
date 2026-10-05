import { create } from "zustand";

import { ApiError } from "@/lib/api/errors";
import { asList, asMap, followEntry, followSettings, followState, profile as mapProfile, profileView } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import type { FollowEntry, FollowList, FollowSettings, FollowState, ProfileView, ReportReason } from "@/lib/models";

import { api, realtime } from "./services";
import { toast } from "./ui";

/**
 * One-way follows and the tiered profile view (mirror of the Flutter
 * `FollowsProvider`). Following never unlocks chat — that stays with friends.
 */
interface FollowsState {
  settings: FollowSettings;
  /** What we last heard about your follow towards each person. */
  states: Record<string, FollowState>;

  load: () => Promise<void>;
  /** Null when the profile can't be shown (never met, blocked, gone). */
  view: (userId: string) => Promise<ProfileView | null>;
  /** Follows, or sends a request to a private account. */
  follow: (userId: string) => Promise<FollowState>;
  /** Unfollows, or takes back a request. */
  unfollow: (userId: string) => Promise<void>;
  list: (which: FollowList, cursor?: string | null) => Promise<{ items: FollowEntry[]; nextCursor: string | null }>;
  accept: (userId: string) => Promise<void>;
  decline: (userId: string) => Promise<void>;
  removeFollower: (userId: string) => Promise<void>;
  report: (userId: string, choice: { reason: ReportReason; note?: string; block: boolean }) => Promise<void>;
  /** False when it could not be saved (the switch flips back). */
  setPrivacy: (patch: Partial<Pick<FollowSettings, "privateAccount" | "hideStats">>) => Promise<boolean>;
  reset: () => void;
}

const EMPTY: FollowSettings = { followers: 0, following: 0, privateAccount: false, hideStats: false };
const REASON_API: Record<ReportReason, string> = { nudity: "NUDITY", harassment: "HARASSMENT", underage: "UNDERAGE", spam: "SPAM", scam: "SCAM", other: "OTHER" };
const LIST_PATH: Record<FollowList, string> = { followers: "/me/followers", following: "/me/following", requests: "/me/follow-requests" };

export const useFollows = create<FollowsState>()((set, get) => {
  const reloadSettings = async () => {
    try {
      set({ settings: followSettings(asMap(await api.get("/me"))) });
    } catch {}
  };
  const remember = (userId: string, state: FollowState) => set((s) => ({ states: { ...s.states, [userId]: state } }));

  return {
    settings: EMPTY,
    states: {},

    async load() {
      if (!api.hasSession) return;
      await reloadSettings();
    },

    async view(userId) {
      try {
        const v = profileView(asMap(await api.get(`/users/${userId}/view`)));
        remember(userId, v.follow);
        return v;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },

    async follow(userId) {
      const state = followState(asMap(await api.post(`/follows/${userId}`)).state);
      remember(userId, state);
      void reloadSettings();
      return state;
    },

    async unfollow(userId) {
      await api.delete(`/follows/${userId}`);
      remember(userId, "none");
      void reloadSettings();
    },

    async list(which, cursor) {
      const r = asMap(await api.get(LIST_PATH[which], { limit: 50, ...(cursor ? { cursor } : {}) }));
      return { items: asList(r.items).map((e) => followEntry(asMap(e))), nextCursor: typeof r.nextCursor === "string" ? r.nextCursor : null };
    },

    async accept(userId) {
      await api.post(`/me/follow-requests/${userId}/accept`);
      void reloadSettings();
    },

    async decline(userId) {
      await api.post(`/me/follow-requests/${userId}/decline`);
    },

    async removeFollower(userId) {
      await api.delete(`/me/followers/${userId}`);
      void reloadSettings();
    },

    async report(userId, choice) {
      await api.post("/reports", { userId, reason: REASON_API[choice.reason], ...(choice.note ? { note: choice.note } : {}), block: choice.block });
    },

    async setPrivacy(patch) {
      const before = get().settings;
      set({ settings: { ...before, ...patch } });
      try {
        set({ settings: followSettings(asMap(await api.patch("/me", patch))) });
        return true;
      } catch {
        set({ settings: before });
        return false;
      }
    },

    reset() {
      set({ settings: EMPTY, states: {} });
    },
  };
});

export const followStateOf = (s: Pick<FollowsState, "states">, userId: string): FollowState => s.states[userId] ?? "none";

const reload = () => void useFollows.getState().load();
const nameOf = (v: unknown) => mapProfile(asMap(v)).name || "Someone";
realtime.on(Ev.followNew, (d) => {
  toast(`${nameOf(d.from)} started following you`);
  reload();
});
realtime.on(Ev.followRequest, (d) => {
  toast(`${nameOf(d.from)} wants to follow you`);
  reload();
});
realtime.on(Ev.followAccepted, (d) => {
  const p = mapProfile(asMap(d.by));
  useFollows.setState((s) => ({ states: { ...s.states, [p.id]: "following" } }));
  toast(`${p.name || "Someone"} accepted your follow request`);
  reload();
});
realtime.on(Ev.followRemoved, reload);
