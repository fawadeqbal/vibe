import { create } from "zustand";

import { ApiError } from "@/lib/api/errors";
import { asMap, callsOf, profile as mapProfile } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import { notifyInBackground } from "@/lib/browser-notify";
import type { Profile } from "@/lib/models";

import { api, realtime } from "./services";
import { useSocial } from "./social";

/** Someone calling you. */
export type CallMedia = "voice" | "video";

export interface IncomingCall {
  callId: string;
  from: Profile;
  expiresAt: Date;
  media: CallMedia;
}

/** Your call, ringing on their side — or how it ended. */
export interface OutgoingCall {
  callId: string | null;
  to: Profile;
  media: CallMedia;
  status: "ringing" | "declined" | "no_answer" | "busy" | "paused" | "error";
  reply: string | null;
  message: string | null;
}

/** What the server says about calls in one chat. */
export interface CallState {
  mine: boolean;
  theirs: boolean;
  /** Each side allows video too. */
  mineVideo: boolean;
  theirsVideo: boolean;
  /** Both allowed: voice calls work. */
  on: boolean;
  /** Both allowed video too: video calls work. */
  video: boolean;
  canAsk: boolean;
  askAfter: Date | null;
  askBlockedBy: "messages" | "wait" | null;
}

const callState = (m: Record<string, unknown>): CallState => ({
  ...callsOf(m),
  on: m.on === true,
  video: m.video === undefined ? m.on === true : m.video === true,
  canAsk: m.canAsk === true,
  askAfter: typeof m.askAfter === "string" ? new Date(m.askAfter) : null,
  askBlockedBy: m.askBlockedBy === "messages" || m.askBlockedBy === "wait" ? m.askBlockedBy : null,
});

/** Updates the friend's `calls` in the friends list. */
function setFriendCalls(friendId: string, calls: { mine: boolean; theirs: boolean; mineVideo: boolean; theirsVideo: boolean }) {
  useSocial.setState((s) => ({ all: s.all.map((f) => (f.profile.id === friendId ? { ...f, calls } : f)) }));
}

/**
 * Video calls between friends, from a chat. Calls are off until both allow
 * them (`allow` asks, or says yes to their ask); either can turn them off
 * for both. Then `ring` → they get `incoming` → accept starts a normal call
 * (`match:found` with friendCall), decline / no answer / cancel end it.
 */
interface CallsState {
  incoming: IncomingCall | null;
  outgoing: OutgoingCall | null;
  /** Per chat, the last state read from the server (canAsk, askAfter). */
  states: Record<string, CallState>;

  loadState: (friendId: string) => Promise<CallState | null>;
  /**
   * Ask them, say yes to their ask, or change your level: `video` false =
   * voice calls only. Throws ApiError (CALL_NEEDS_MESSAGES, CALL_ASK_TOO_SOON).
   */
  allow: (friendId: string, video?: boolean) => Promise<CallState>;
  /** Turn calls off for both (or "not now" to their ask, or take back yours). */
  turnOff: (friendId: string) => Promise<CallState>;
  ring: (friend: Profile, media?: CallMedia) => Promise<void>;
  accept: () => Promise<void>;
  decline: (reply?: string) => Promise<void>;
  cancel: () => Promise<void>;
  dismissOutgoing: () => void;
  /** A call that was already ringing when the app opened. */
  checkIncoming: () => Promise<void>;
  reset: () => void;
}

export const useCalls = create<CallsState>()((set, get) => {
  const apply = (friendId: string, st: CallState) => {
    set((s) => ({ states: { ...s.states, [friendId]: st } }));
    setFriendCalls(friendId, { mine: st.mine, theirs: st.theirs, mineVideo: st.mineVideo, theirsVideo: st.theirsVideo });
    return st;
  };

  return {
    incoming: null,
    outgoing: null,
    states: {},

    async loadState(friendId) {
      try {
        return apply(friendId, callState(asMap(await api.get(`/friends/${friendId}/calls`))));
      } catch {
        return null;
      }
    },

    async allow(friendId, video = true) {
      return apply(friendId, callState(asMap(await api.put(`/friends/${friendId}/calls`, { allow: true, video }))));
    },

    async turnOff(friendId) {
      return apply(friendId, callState(asMap(await api.put(`/friends/${friendId}/calls`, { allow: false }))));
    },

    async ring(friend, media = "video") {
      set({ outgoing: { callId: null, to: friend, media, status: "ringing", reply: null, message: null } });
      try {
        const r = asMap(await api.post(`/friends/${friend.id}/call`, { media }));
        set((s) => (s.outgoing?.to.id === friend.id ? { outgoing: { ...s.outgoing, callId: String(r.callId) } } : {}));
      } catch (e) {
        const code = e instanceof ApiError ? e.code : "";
        const status: OutgoingCall["status"] = code === "CALL_BUSY" ? "busy" : code === "CALL_PAUSED" ? "paused" : "error";
        set({ outgoing: { callId: null, to: friend, media, status, reply: null, message: e instanceof Error ? e.message : null } });
        if (code === "CALLS_NOT_ALLOWED") void get().loadState(friend.id);
      }
    },

    async accept() {
      const c = get().incoming;
      if (!c) return;
      set({ incoming: null });
      try {
        await api.post(`/calls/${c.callId}/accept`);
      } catch {
        // Already over (they hung up): the chat shows the missed call.
      }
    },

    async decline(reply) {
      const c = get().incoming;
      if (!c) return;
      set({ incoming: null });
      await api.post(`/calls/${c.callId}/decline`, reply ? { reply } : {}).catch(() => {});
    },

    async cancel() {
      const c = get().outgoing;
      set({ outgoing: null });
      if (c?.callId) await api.post(`/calls/${c.callId}/cancel`).catch(() => {});
    },

    dismissOutgoing() {
      set({ outgoing: null });
    },

    async checkIncoming() {
      if (!api.hasSession) return;
      try {
        const c = asMap(await api.get("/calls/incoming")).call;
        if (c && typeof c === "object") {
          const m = asMap(c);
          set({ incoming: { callId: String(m.callId), from: mapProfile(asMap(m.from)), expiresAt: new Date(String(m.expiresAt)), media: m.media === "voice" ? "voice" : "video" } });
        }
      } catch {}
    },

    reset() {
      set({ incoming: null, outgoing: null, states: {} });
    },
  };
});

// ── server events ──────────────────────────────────────────────────────────

realtime.on(Ev.callConsent, (e) => {
  if (typeof e.friendId !== "string") return;
  setFriendCalls(e.friendId, callsOf(e));
  void useCalls.getState().loadState(e.friendId);
  if (e.asked === true && e.from) {
    const from = mapProfile(asMap(e.from));
    notifyInBackground(`${from.name.split(" ")[0]} wants to call you`, e.video === false ? "Voice calls — say yes in the chat, or not now." : "Voice and video calls — say yes in the chat, or not now.", { tag: `call-ask:${from.id}` });
  }
});

realtime.on(Ev.callIncoming, (e) => {
  const from = mapProfile(asMap(e.from));
  const media: CallMedia = e.media === "voice" ? "voice" : "video";
  useCalls.setState({ incoming: { callId: String(e.callId), from, expiresAt: new Date(String(e.expiresAt)), media } });
  notifyInBackground(`${from.name.split(" ")[0]} is calling ${media === "voice" ? "📞" : "📹"}`, `${media === "voice" ? "Voice" : "Video"} call on Vibe — click to answer.`, { tag: `call:${String(e.callId)}` });
});

realtime.on(Ev.callRinging, (e) => {
  useCalls.setState((s) => (s.outgoing && !s.outgoing.callId ? { outgoing: { ...s.outgoing, callId: String(e.callId) } } : {}));
});

realtime.on(Ev.callEnded, (e) => {
  const id = String(e.callId);
  const reason = typeof e.reason === "string" ? e.reason : "";
  const s = useCalls.getState();
  if (s.incoming?.callId === id) useCalls.setState({ incoming: null });
  if (s.outgoing && (s.outgoing.callId === id || !s.outgoing.callId)) {
    if (reason === "accepted") useCalls.setState({ outgoing: null });
    else if (reason === "declined" || reason === "no_answer")
      useCalls.setState({ outgoing: { ...s.outgoing, callId: id, status: reason, reply: typeof e.reply === "string" ? e.reply : null } });
    else useCalls.setState({ outgoing: null });
  }
  if ((reason === "no_answer" || reason === "cancelled") && e.from) {
    const from = mapProfile(asMap(e.from));
    notifyInBackground("Missed call", `From ${from.name.split(" ")[0]}.`, { tag: `call:${id}` });
  }
});
