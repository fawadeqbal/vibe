import { create } from "zustand";

import { type CallMedia, type CallNotice, type CallSnap, type IncomingCall, isNewer, missedFor, type OutgoingCall, parseSnap, viewOf } from "@/features/calls/call-machine";
import { ApiError } from "@/lib/api/errors";
import { asMap, callsOf, profile as mapProfile } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import { notifyInBackground } from "@/lib/browser-notify";
import type { Profile } from "@/lib/models";

import { api, realtime } from "./services";
import { useMatch } from "./match";
import { useSession } from "./session";
import { useSocial } from "./social";

export type { CallMedia, CallNotice, IncomingCall, OutgoingCall } from "@/features/calls/call-machine";
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

/** This device, for "Answered on your other device" (kept for the tab's life). */
function deviceId(): string {
  try {
    const k = "vibe.device";
    const v = sessionStorage.getItem(k) ?? `web-${Math.random().toString(36).slice(2, 12)}`;
    sessionStorage.setItem(k, v);
    return v;
  } catch {
    return "web";
  }
}

/**
 * Calls between friends, from a chat. Calls are off until both allow them
 * (`allow` asks, or says yes to their ask); either can turn them off for
 * both. A call itself is the server's: every move arrives as `call:state`
 * with the whole snapshot, and `incoming` / `outgoing` / `notice` are worked
 * out from the newest one (call-machine.ts). Nothing here decides a call
 * ended on its own, except a request that never reached the server.
 */
interface CallsState {
  /** The newest snapshot of your call (any state). */
  call: CallSnap | null;
  incoming: IncomingCall | null;
  outgoing: OutgoingCall | null;
  /** For the person called: why the ring stopped (hung up, answered elsewhere, too late, couldn't connect). */
  notice: CallNotice | null;
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
  /** Pick up; "voice" answers a video call as voice only. */
  accept: (media?: CallMedia) => Promise<void>;
  decline: (reply?: string) => Promise<void>;
  cancel: () => Promise<void>;
  dismissOutgoing: () => void;
  dismissNotice: () => void;
  /** Asks the server where your call is (on connect, back in the tab, and while a call screen is open). */
  reconcile: () => Promise<void>;
  /** A snapshot from the server (an event or a reply). */
  apply: (raw: unknown) => void;
  reset: () => void;
}

let acceptTried: string | null = null;
let cancelWanted = false;
let dismissed: string | null = null;
const acked = new Set<string>();
const upSent = new Set<string>();

export const useCalls = create<CallsState>()((set, get) => {
  const apply = (friendId: string, st: CallState) => {
    set((s) => ({ states: { ...s.states, [friendId]: st } }));
    setFriendCalls(friendId, { mine: st.mine, theirs: st.theirs, mineVideo: st.mineVideo, theirsVideo: st.theirsVideo });
    return st;
  };

  /** Redraws from the newest snapshot. */
  const draw = (c: CallSnap) => {
    const me = useSession.getState().me?.id ?? "";
    const v = viewOf(c, me, deviceId(), acceptTried === c.callId);
    const notice = v.notice && dismissed !== `${c.callId}:${v.notice.kind}` ? v.notice : null;
    const outgoing = v.outgoing && dismissed !== `${c.callId}:out` ? v.outgoing : null;
    set({ call: c, incoming: v.incoming, outgoing, notice });
    // Their screen is showing it: the caller's "Calling…" becomes "Ringing…".
    if (v.incoming && !c.reached && !acked.has(c.callId)) {
      acked.add(c.callId);
      api.post(`/calls/${c.callId}/ringing`).catch(() => {});
      notifyInBackground(`${c.from.name.split(" ")[0]} is calling ${c.media === "voice" ? "📞" : "📹"}`, `${c.media === "voice" ? "Voice" : "Video"} call on Vibe — click to answer.`, { tag: `call:${c.callId}` });
    }
    if (c.state === "ended" && c.to.id === me && missedFor(c.reason) && c.reason !== "unavailable")
      notifyInBackground("Missed call", `From ${c.from.name.split(" ")[0]}.`, { tag: `call:${c.callId}` });
  };

  const take = (raw: unknown) => {
    const c = raw && typeof raw === "object" ? parseSnap(raw as Record<string, unknown>, (m) => mapProfile(m)) : null;
    if (!c || !isNewer(get().call, c)) return;
    draw(c);
  };

  return {
    call: null,
    incoming: null,
    outgoing: null,
    notice: null,
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
      // "Calling…" at once; the server's snapshot takes over when it answers.
      cancelWanted = false;
      dismissed = null;
      set({ outgoing: { callId: null, to: friend, media, status: "ringing", reply: null, message: null } });
      try {
        const r = await api.post(`/friends/${friend.id}/call`, { media });
        take(r);
        const c = get().call;
        if (cancelWanted && c && c.state === "ringing") take(await api.post(`/calls/${c.callId}/cancel`));
      } catch (e) {
        const code = e instanceof ApiError ? e.code : "";
        const status: OutgoingCall["status"] = code === "CALL_PAUSED" ? "paused" : "error";
        set({ outgoing: cancelWanted ? null : { callId: null, to: friend, media, status, reply: null, message: e instanceof Error ? e.message : null } });
        if (code === "CALLS_NOT_ALLOWED") void get().loadState(friend.id);
      }
    },

    async accept(media) {
      const c = get().incoming;
      if (!c) return;
      acceptTried = c.callId;
      set({ incoming: null });
      try {
        take(await api.post(`/calls/${c.callId}/accept`, { deviceId: deviceId(), ...(media === "voice" ? { media: "voice" } : {}) }));
      } catch {
        // Too late (they hung up, or another device answered): ask where it is.
        await api.get(`/calls/${c.callId}`).then(take, () => {});
      }
    },

    async decline(reply) {
      const c = get().incoming;
      if (!c) return;
      set({ incoming: null });
      await api.post(`/calls/${c.callId}/decline`, reply ? { reply } : {}).then(take, () => {});
    },

    async cancel() {
      const c = get().outgoing;
      set({ outgoing: null });
      if (!c?.callId) {
        cancelWanted = true; // the call is still being placed: cancel it once it is
        return;
      }
      await api.post(`/calls/${c.callId}/cancel`).then(take, () => {});
    },

    dismissOutgoing() {
      const c = get().call;
      if (c) dismissed = `${c.callId}:out`;
      set({ outgoing: null });
    },

    dismissNotice() {
      const n = get().notice;
      if (n) dismissed = `${n.callId}:${n.kind}`;
      set({ notice: null });
    },

    async reconcile() {
      if (!api.hasSession) return;
      try {
        const cur = asMap(await api.get("/calls/current")).call;
        if (cur && typeof cur === "object") return take(cur);
        // Nothing going on: if we still think a call is, ask about that one.
        const c = get().call;
        if (c && c.state !== "ended") take(await api.get(`/calls/${c.callId}`));
      } catch {}
    },

    apply: take,

    reset() {
      acceptTried = null;
      dismissed = null;
      set({ call: null, incoming: null, outgoing: null, notice: null, states: {} });
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

realtime.on(Ev.callState, (e) => useCalls.getState().apply(e));

// Back online or back in the tab: ask where the call is (a missed event can't leave a screen stuck).
realtime.onConnectionChange((on) => {
  if (on) void useCalls.getState().reconcile();
});
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void useCalls.getState().reconcile();
  });
}

/** While a call is ringing or connecting, check every 10 s (in the browser only). */
if (typeof window !== "undefined") {
  setInterval(() => {
    const c = useCalls.getState().call;
    if (c && (c.state === "ringing" || c.state === "connecting")) void useCalls.getState().reconcile();
  }, 10_000);
}

// Your media is flowing in a friend call: tell the server (both up → live).
useMatch.subscribe((m) => {
  const c = useCalls.getState().call;
  if (!c || c.state !== "connecting" || !m.friendCall || !m.remoteStream || upSent.has(c.callId)) return;
  if (c.matchId && m.current?.id && m.current.id !== c.matchId) return;
  upSent.add(c.callId);
  api.post(`/calls/${c.callId}/up`).then((r) => useCalls.getState().apply(r), () => upSent.delete(c.callId));
});
