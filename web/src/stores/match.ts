import { create } from "zustand";

import { newIdempotencyKey } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { applyGameAnswer, asList, asMap, callGame, date as mapDate, type Json, matchRecord, profile as mapProfile } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import { config } from "@/lib/config";
import type { CallGame, ChatMessage, GameId, Gift, MatchFilters, MatchRecord, Profile, ReportReason } from "@/lib/models";
import { matchLengthSeconds } from "@/lib/models";
import { sameDay } from "@/lib/format";

import { useCatalog } from "./catalog";
import { api, realtime } from "./services";
import { useSession } from "./session";
import { useSocial } from "./social";

export type MatchStatus = "idle" | "searching" | "connected" | "ended";

/** Why the last match ended — drives the copy on the recap. */
export type EndReason = "skipped" | "partnerLeft" | "stopped" | "reported";

/** What `match:ended` adds for the recap: the mutual like and the reconnect price. */
export interface EndedInfo {
  mutualLike: boolean;
  /** Coins once the free window (if any) is over. */
  reconnectCost: number;
  /** Reconnect is free until then (dropped call or mutual like). */
  freeReconnectUntil: Date | null;
}

/**
 * The match loop: idle → searching → connected → (next) → searching …
 * The Vibe matching socket pairs you with a real person; chat, likes, gifts
 * and friend requests go through the server; video flows peer-to-peer over
 * WebRTC, signalled through the same socket. When the partner has no camera
 * stream (e.g. a dev bot), the stage falls back to their photo. Mirror of the
 * Flutter `RemoteMatchProvider`.
 */
interface MatchState {
  status: MatchStatus;
  filters: MatchFilters;
  partner: Profile | null;
  lastPartner: Profile | null;
  current: MatchRecord | null;
  /** Oldest first. */
  history: MatchRecord[];
  endReason: EndReason | null;
  chat: ChatMessage[];
  likedPartner: boolean;
  partnerLikedMe: boolean;
  partnerAskedToBeFriends: boolean;
  /** Both liked each other in this call ("It's a vibe!"). */
  mutual: boolean;
  /** The icebreaker on screen, if any. */
  game: CallGame | null;
  /** The last `match:ended` extras (recap). */
  ended: EndedInfo | null;
  elapsed: number;
  cooldownUntil: number | null;
  blurred: boolean;
  autoBlur: boolean;
  lastError: string | null;
  /** The last failure was "not enough coins" (screens offer the store). */
  needsCoins: boolean;

  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  frontCamera: boolean;
  cameraError: string | null;
  /** You asked for the lobby preview (it may be paused while the page is hidden). */
  previewOn: boolean;
  /** The camera is open or opening. */
  cameraActive: boolean;

  load: () => Promise<void>;
  ensureCamera: () => Promise<void>;
  releaseCamera: () => void;
  /** "Tap to preview" in the lobby. */
  startPreview: () => void;
  stopPreview: () => void;
  /** Any touch / key on the match screen: keeps the preview from timing out. */
  touchPreview: () => void;
  /** The match screen is mounted (you're on /match). */
  setLobbyVisible: (visible: boolean) => void;
  /** The browser tab is hidden / the window minimised / the phone locked. */
  setPageHidden: (hidden: boolean) => void;
  toggleMic: () => void;
  toggleCam: () => void;
  switchCamera: () => Promise<void>;
  setAutoBlur: (v: boolean) => void;
  setFilters: (f: MatchFilters) => void;
  /** False — and idle — when the filters can't be paid for. */
  start: () => Promise<boolean>;
  /** Skip to the next person (the server enforces the skip cooldown). */
  next: (payToBypass?: boolean) => Promise<boolean>;
  stop: () => void;
  like: () => void;
  /** Icebreakers: start a game, the next prompt, answer (0/1, or nothing for an open question), close. Reject with ApiError. */
  startGame: (game: GameId) => Promise<void>;
  nextGame: () => Promise<void>;
  answerGame: (choice?: 0 | 1) => Promise<void>;
  closeGame: () => Promise<void>;
  sendMessage: (text: string) => void;
  sendGift: (g: Gift) => Promise<boolean>;
  /** False when it could not be paid for. */
  addFriend: () => Promise<boolean>;
  report: (reason: ReportReason, opts: { note?: string; block: boolean }) => Promise<void>;
  /** Report the person from the call that just ended (the recap's link). */
  reportLast: (reason: ReportReason, opts: { note?: string; block: boolean }) => Promise<void>;
  blockPartner: () => Promise<void>;
  /** Call the last person again (paid). */
  reconnect: () => Promise<boolean>;
  dismissEnded: () => void;
  clearError: () => void;
  reset: () => void;
}

// ── connection state that never renders ───────────────────────────────────
let matchId: string | null = null;
let lastMatchId: string | null = null;
let pc: RTCPeerConnection | null = null;
let peerStarting: Promise<void> | null = null;
let pendingIce: RTCIceCandidateInit[] = [];
let remoteDescriptionSet = false;
let iceServers: RTCIceServer[] | null = null;
let iceFetchedAt = 0;
let iceReuseMs = 30 * 60_000;
let cameraOpening: Promise<void> | null = null;
let cameraGen = 0;
let openingGen = -1;
let lobbyVisible = false;
let pageHidden = false;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let hiddenTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Battery: the camera is only open while it is actually used.
 *  • searching / in a call → on;
 *  • the lobby → off until "Tap to preview", and only while /match is open,
 *    the tab is visible and there was a touch in the last PREVIEW_IDLE_MS;
 *  • another page, a hidden tab, a minimised window, a locked phone → off
 *    (tracks stopped, so the browser's camera light goes out);
 *  • a search / call that ends → off again.
 * A hidden tab leaves a search at once and ends a call after HIDDEN_GRACE_MS
 * (your video pauses meanwhile).
 */
export const PREVIEW_IDLE_MS = 60_000;
export const HIDDEN_GRACE_MS = 30_000;
let ticker: ReturnType<typeof setInterval> | undefined;
let blurTimer: ReturnType<typeof setTimeout> | undefined;

const REASONS: Record<ReportReason, string> = { nudity: "NUDITY", harassment: "HARASSMENT", underage: "UNDERAGE", spam: "SPAM", scam: "SCAM", other: "OTHER" };

const DEFAULT_FILTERS: MatchFilters = { gender: "anyone", countryCode: null, safeMode: false };

export const useMatch = create<MatchState>()((set, get) => {
  const fail = (e: ApiError) => {
    set((s) => ({
      needsCoins: e.isInsufficientCoins,
      lastError: e.isInsufficientCoins ? "Not enough coins for these filters." : e.message,
      status: s.status === "searching" ? "idle" : s.status,
    }));
  };

  const applyTracks = () => {
    const { localStream, micOn, camOn } = get();
    localStream?.getAudioTracks().forEach((t) => (t.enabled = micOn));
    // Paused while the tab is hidden: the partner sees "camera off", not a frozen frame.
    localStream?.getVideoTracks().forEach((t) => (t.enabled = camOn && !pageHidden));
  };

  const openCamera = async (gen: number) => {
    if (gen !== cameraGen || get().localStream) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { facingMode: get().frontCamera ? "user" : "environment", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
      });
      if (gen !== cameraGen) {
        // Released while it was opening (left the page, hid the tab…).
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      set({ localStream: stream, cameraError: null });
      applyTracks();
    } catch (e) {
      if (gen === cameraGen) set({ cameraError: `Camera unavailable: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const isLive = () => {
    const st = get().status;
    return st === "searching" || st === "connected";
  };

  /** Whether the camera should be open right now (see the rules above). */
  const cameraWanted = () => isLive() || (get().previewOn && lobbyVisible && !pageHidden);

  const syncCamera = () => {
    if (cameraWanted()) void get().ensureCamera();
    else if (get().cameraActive) get().releaseCamera();
  };

  const armIdle = () => {
    clearTimeout(idleTimer);
    if (!get().previewOn) return;
    idleTimer = setTimeout(() => {
      if (isLive()) return;
      set({ previewOn: false });
      syncCamera();
    }, PREVIEW_IDLE_MS);
  };

  return {
    status: "idle",
    filters: DEFAULT_FILTERS,
    partner: null,
    lastPartner: null,
    current: null,
    history: [],
    endReason: null,
    chat: [],
    likedPartner: false,
    partnerLikedMe: false,
    partnerAskedToBeFriends: false,
    mutual: false,
    game: null,
    ended: null,
    elapsed: 0,
    cooldownUntil: null,
    blurred: false,
    autoBlur: true,
    lastError: null,
    needsCoins: false,
    localStream: null,
    remoteStream: null,
    micOn: true,
    camOn: true,
    frontCamera: true,
    cameraError: null,
    previewOn: false,
    cameraActive: false,

    async load() {
      if (!api.hasSession) return;
      try {
        const page = asMap(await api.get("/me/matches", { limit: 50 }));
        const history = asList(page.items)
          .map((e) => matchRecord(asMap(e)))
          .filter((r): r is MatchRecord => r != null)
          .reverse();
        set({ history });
      } catch {}
    },

    /**
     * Opens the camera once. The lobby, `start()` and the peer setup all ask
     * for it, often at the same moment: they share the one in-flight request.
     */
    ensureCamera() {
      if (get().localStream || typeof navigator === "undefined" || !navigator.mediaDevices) return Promise.resolve();
      const inFlight = cameraOpening;
      if (inFlight && openingGen === cameraGen) return inFlight;
      // An open cancelled by releaseCamera() finishes (and is stopped) first:
      // never two getUserMedia calls at once.
      const gen = (openingGen = cameraGen);
      const opening: Promise<void> = (inFlight ?? Promise.resolve())
        .then(() => openCamera(gen))
        .finally(() => {
          if (cameraOpening === opening) {
            cameraOpening = null;
            set({ cameraActive: !!get().localStream });
          }
        });
      cameraOpening = opening;
      set({ cameraActive: true });
      return opening;
    },

    releaseCamera() {
      cameraGen++;
      get().localStream?.getTracks().forEach((t) => t.stop());
      set({ localStream: null, cameraActive: cameraOpening != null });
    },

    startPreview() {
      set({ previewOn: true, camOn: true, cameraError: null });
      armIdle();
      syncCamera();
    },

    stopPreview() {
      clearTimeout(idleTimer);
      set({ previewOn: false });
      syncCamera();
    },

    touchPreview() {
      if (get().previewOn && lobbyVisible && !isLive()) armIdle();
    },

    setLobbyVisible(visible) {
      if (visible === lobbyVisible) return;
      lobbyVisible = visible;
      if (visible) armIdle();
      else clearTimeout(idleTimer);
      syncCamera();
    },

    setPageHidden(hidden) {
      if (hidden === pageHidden) return;
      pageHidden = hidden;
      clearTimeout(hiddenTimer);
      if (hidden) {
        // Coming back should not silently switch the camera on again.
        clearTimeout(idleTimer);
        set({ previewOn: false });
        const st = get().status;
        if (st === "searching") get().stop(); // nobody is watching: don't get matched
        else if (st === "connected")
          hiddenTimer = setTimeout(() => {
            if (pageHidden && get().status === "connected") get().stop();
          }, HIDDEN_GRACE_MS);
      }
      applyTracks();
      syncCamera();
    },

    toggleMic() {
      set((s) => ({ micOn: !s.micOn }));
      applyTracks();
    },

    toggleCam() {
      set((s) => ({ camOn: !s.camOn }));
      applyTracks();
    },

    async switchCamera() {
      const old = get().localStream;
      if (!old) return;
      const front = !get().frontCamera;
      try {
        const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: front ? "user" : "environment" } });
        const track = fresh.getVideoTracks()[0];
        if (!track) return;
        // Swap the video track in place so a live call keeps going.
        const sender = pc?.getSenders().find((s) => s.track?.kind === "video");
        await sender?.replaceTrack(track);
        old.getVideoTracks().forEach((t) => {
          t.stop();
          old.removeTrack(t);
        });
        old.addTrack(track);
        track.enabled = get().camOn;
        set({ frontCamera: front, localStream: new MediaStream(old.getTracks()) });
      } catch {
        // Only one camera: nothing to switch to.
      }
    },

    setAutoBlur: (v) => set({ autoBlur: v }),
    setFilters: (f) => set({ filters: f }),

    async start() {
      const s = get();
      if (s.status === "searching" || s.status === "connected") return true;
      set({ needsCoins: false, lastError: null, endReason: null, status: "searching" });
      void get().ensureCamera();
      try {
        const f = get().filters;
        await realtime.request("match:join", {
          gender: f.gender === "women" ? "WOMEN" : f.gender === "men" ? "MEN" : "ANYONE",
          countryCode: f.countryCode,
          safeMode: f.safeMode,
          autoBlur: get().autoBlur,
        });
        return true;
      } catch (e) {
        fail(e instanceof ApiError ? e : ApiError.network(e));
        return false;
      }
    },

    async next(payToBypass = false) {
      if (get().status !== "connected") return get().start();
      try {
        set({ needsCoins: false });
        await realtime.request("match:next", { payToBypass });
        set((s) => ({ cooldownUntil: null, status: s.status !== "connected" ? s.status : "searching" }));
        return true;
      } catch (e) {
        const err = e instanceof ApiError ? e : ApiError.network(e);
        if (err.code === "SKIP_COOLDOWN") {
          const secs = typeof err.details.seconds === "number" ? err.details.seconds : 10;
          set({ cooldownUntil: Date.now() + secs * 1000 });
          return false;
        }
        fail(err);
        return false;
      }
    },

    stop() {
      const st = get().status;
      if (st === "connected") realtime.request("match:end").catch(() => {});
      else if (st === "searching") {
        realtime.request("match:leave").catch(() => {});
        set({ status: "idle" });
      }
    },

    like() {
      const s = get();
      if (s.status !== "connected" || s.likedPartner) return;
      set({ likedPartner: true, current: s.current ? { ...s.current, liked: true } : null });
      const id = matchId;
      realtime
        .request<Json | null>("match:like")
        .then((r) => {
          if (asMap(r).mutual === true && id === matchId) setMutual();
        })
        .catch(() => {});
    },

    async startGame(game) {
      if (get().status !== "connected") return;
      applyGame(await realtime.request<Json>("match:game", { action: "start", game }));
    },

    async nextGame() {
      if (get().status !== "connected" || !get().game) return;
      applyGame(await realtime.request<Json>("match:game", { action: "next" }));
    },

    async answerGame(choice) {
      const g = get().game;
      if (get().status !== "connected" || !g || g.mine != null) return;
      set({ game: { ...g, mine: choice ?? -1 } });
      try {
        const r = await realtime.request<Json>("match:game", { action: "answer", round: g.round, ...(choice != null ? { choice } : {}) });
        const now = get().game;
        if (now) set({ game: applyGameAnswer(now, r) });
      } catch (e) {
        const now = get().game;
        if (now?.round === g.round) set({ game: { ...now, mine: null } });
        throw e;
      }
    },

    async closeGame() {
      if (!get().game) return;
      set({ game: null });
      await realtime.request("match:game", { action: "close" }).catch(() => {});
    },

    sendMessage(text) {
      const t = text.trim();
      if (get().status !== "connected" || !t) return;
      set((s) => ({ chat: [...s.chat, { id: `mm${Date.now()}`, fromMe: true, text: t, at: new Date() }] }));
      realtime.request("match:chat", { text: t }).catch(() => {});
    },

    async sendGift(g) {
      if (get().status !== "connected") return false;
      try {
        await realtime.request("match:gift", { giftId: g.id, idempotencyKey: newIdempotencyKey() });
      } catch (e) {
        if (e instanceof ApiError && e.isInsufficientCoins) {
          set({ needsCoins: true });
          return false;
        }
        set({ lastError: e instanceof ApiError ? e.message : "Could not send the gift" });
        return false;
      }
      set((s) => ({
        chat: [...s.chat, { id: `mg${Date.now()}`, fromMe: true, text: `Sent a ${g.name}`, at: new Date(), gift: g }],
        current: s.current ? { ...s.current, giftsSent: s.current.giftsSent + 1, coinsSpent: s.current.coinsSpent + g.coins } : null,
      }));
      return true;
    },

    async addFriend() {
      if (get().status !== "connected") return false;
      try {
        await realtime.request("match:friend");
        await useSocial.getState().load();
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.isInsufficientCoins) return false;
        set({ lastError: e instanceof ApiError ? e.message : "Could not send the request" });
        return true;
      }
    },

    async report(reason, { note, block }) {
      if (get().status !== "connected") return;
      await realtime.request("match:report", { reason: REASONS[reason], ...(note ? { note } : {}), block });
      if (block) void useSocial.getState().load();
    },

    async reportLast(reason, { note, block }) {
      const p = get().lastPartner;
      if (!p) return;
      await api.post("/reports", { userId: p.id, reason: REASONS[reason], ...(lastMatchId ? { matchId: lastMatchId } : {}), ...(note ? { note } : {}), block });
      set({ endReason: "reported" });
      if (block) void useSocial.getState().load();
    },

    async blockPartner() {
      const p = get().partner;
      if (p) await useSocial.getState().block(p); // the server ends the call and tells us
    },

    async reconnect() {
      const s = get();
      if (!s.lastPartner || s.status === "connected") return false;
      set({ needsCoins: false });
      void get().ensureCamera();
      try {
        await realtime.request("match:reconnect");
        return true;
      } catch (e) {
        const err = e instanceof ApiError ? e : ApiError.network(e);
        set({ needsCoins: err.isInsufficientCoins, lastError: err.isInsufficientCoins ? null : err.message });
        if (get().status !== "searching" && get().status !== "connected" && !get().previewOn) get().releaseCamera(); // didn't happen
        return false;
      }
    },

    dismissEnded() {
      if (get().status === "ended") set({ status: "idle", partner: null });
    },

    clearError: () => set({ lastError: null, needsCoins: false }),

    reset() {
      clearInterval(ticker);
      clearTimeout(blurTimer);
      clearTimeout(idleTimer);
      clearTimeout(hiddenTimer);
      void closePeer();
      matchId = null;
      lastMatchId = null;
      get().releaseCamera();
      set({ status: "idle", partner: null, lastPartner: null, current: null, history: [], chat: [], endReason: null, ended: null, game: null, mutual: false, lastError: null, needsCoins: false, previewOn: false });
    },
  };
});

// Every status change re-checks the camera. Leaving a search or a call turns
// the preview off, so the camera closes when the match is over.
useMatch.subscribe((s, prev) => {
  if (s.status === prev.status) return;
  const wasLive = prev.status === "searching" || prev.status === "connected";
  const live = s.status === "searching" || s.status === "connected";
  if (wasLive && !live) {
    clearTimeout(hiddenTimer);
    if (s.previewOn) useMatch.setState({ previewOn: false });
  }
  const st = useMatch.getState();
  if (live || (st.previewOn && lobbyVisible && !pageHidden)) void st.ensureCamera();
  else if (st.cameraActive) st.releaseCamera();
});

// The tab / window / phone screen: the camera never runs where nobody can see it.
if (typeof document !== "undefined") {
  const onVisibility = () => useMatch.getState().setPageHidden(document.visibilityState === "hidden");
  document.addEventListener("visibilitychange", onVisibility);
  // Closing the tab or the page going into the back/forward cache.
  window.addEventListener("pagehide", () => {
    useMatch.getState().setPageHidden(true);
    useMatch.getState().releaseCamera();
  });
  window.addEventListener("pageshow", onVisibility);
  onVisibility();
}

// ── derived values ─────────────────────────────────────────────────────────

export const mutualLike = (s: Pick<MatchState, "likedPartner" | "partnerLikedMe">) => s.likedPartner && s.partnerLikedMe;

/** Seconds left of the skip cooldown, 0 when none. */
export function cooldownSeconds(s: Pick<MatchState, "cooldownUntil">, now = Date.now()): number {
  if (!s.cooldownUntil) return 0;
  const left = Math.floor((s.cooldownUntil - now) / 1000);
  return left >= 0 ? left + 1 : 0;
}

export const matchesToday = (s: Pick<MatchState, "history">) => s.history.filter((r) => sameDay(r.startedAt, new Date())).length;

export function averageLength(s: Pick<MatchState, "history">): number {
  const done = s.history.filter((r) => r.endedAt != null);
  if (!done.length) return 0;
  return Math.floor(done.reduce((a, r) => a + matchLengthSeconds(r), 0) / done.length);
}

export function skipRate(s: Pick<MatchState, "history">): number {
  if (!s.history.length) return 0;
  return s.history.filter((r) => r.endedAt != null && matchLengthSeconds(r) < 10).length / s.history.length;
}

// ── server events ──────────────────────────────────────────────────────────

const set = useMatch.setState;
const get = useMatch.getState;

realtime.on(Ev.matchSearching, () => set({ status: "searching" }));

realtime.on(Ev.matchFound, (e) => {
  const p = mapProfile(asMap(e.partner));
  matchId = String(e.matchId);
  const blur = e.blur === true;
  set({
    partner: p,
    chat: [],
    likedPartner: false,
    partnerLikedMe: false,
    partnerAskedToBeFriends: false,
    mutual: false,
    game: null,
    ended: null,
    elapsed: 0,
    remoteStream: null,
    current: { id: matchId, partner: p, startedAt: new Date(), endedAt: null, liked: false, likedMe: false, giftsSent: 0, giftsReceived: 0, coinsSpent: typeof e.coinsSpent === "number" ? e.coinsSpent : 0 },
    blurred: blur,
    status: "connected",
    lastError: null,
  });
  clearTimeout(blurTimer);
  if (blur) blurTimer = setTimeout(() => set({ blurred: false }), 3000);
  clearInterval(ticker);
  ticker = setInterval(() => set((s) => ({ elapsed: s.elapsed + 1 })), 1000);
  // ICE from the partner can arrive while the peer is still being set up; it
  // waits in pendingIce, so only clear it when a new match begins.
  pendingIce = [];
  const starting = startPeer(e.role === "caller");
  peerStarting = starting;
  void starting.finally(() => {
    if (peerStarting === starting) peerStarting = null;
  });
});

realtime.on(Ev.matchChat, (e) => {
  if (e.matchId !== matchId) return;
  set((s) => ({ chat: [...s.chat, { id: `pm${Date.now()}`, fromMe: false, text: typeof e.text === "string" ? e.text : "", at: new Date() }] }));
});

realtime.on(Ev.matchLiked, (e) => {
  if (e.matchId !== matchId) return;
  set((s) => ({ partnerLikedMe: true, current: s.current ? { ...s.current, likedMe: true } : null }));
});

realtime.on(Ev.matchGift, (e) => {
  if (e.matchId !== matchId || e.fromMe === true) return;
  const g = useCatalog.getState().gift(asMap(e.gift).id);
  if (!g) return;
  const bonusGems = typeof e.bonusGems === "number" ? e.bonusGems : 0;
  set((s) => ({
    chat: [...s.chat, { id: `pg${Date.now()}`, fromMe: false, text: `Sent you a ${g.name}`, at: new Date(), gift: g, bonusGems }],
    current: s.current ? { ...s.current, giftsReceived: s.current.giftsReceived + 1 } : null,
  }));
});

/** Both liked each other: once per call, from the like ack or `match:mutual`, whichever comes first. */
function setMutual() {
  if (get().mutual) return;
  set((s) => ({ mutual: true, likedPartner: true, partnerLikedMe: true, current: s.current ? { ...s.current, liked: true, likedMe: true } : null }));
}

realtime.on(Ev.matchMutual, (e) => {
  if (e.matchId === matchId) setMutual();
});

/** A new prompt (start/next, by either of you). Ack and event carry the same round: the first one wins. */
function applyGame(e: Json) {
  if (e.matchId !== matchId || get().status !== "connected") return;
  const g = callGame(e);
  if (!g) return;
  const cur = get().game;
  if (cur && cur.round === g.round) return;
  set({ game: g });
}

realtime.on(Ev.matchGame, applyGame);

realtime.on(Ev.matchGameAnswer, (e) => {
  const g = get().game;
  if (e.matchId !== matchId || !g) return;
  set({ game: applyGameAnswer(g, e) });
});

realtime.on(Ev.matchGameClosed, (e) => {
  if (e.matchId === matchId) set({ game: null });
});

realtime.on(Ev.matchFriendRequest, () => set({ partnerAskedToBeFriends: true }));

realtime.on(Ev.matchError, (e) =>
  failFromEvent(new ApiError(typeof e.code === "string" ? e.code : "INTERNAL", typeof e.message === "string" ? e.message : "Could not start the match")),
);

realtime.on(Ev.accountBanned, () => failFromEvent(new ApiError("ACCOUNT_BANNED", "Your account is paused after reports. Try again later.")));

function failFromEvent(e: ApiError) {
  set((s) => ({
    needsCoins: e.isInsufficientCoins,
    lastError: e.isInsufficientCoins ? "Not enough coins for these filters." : e.message,
    status: s.status === "searching" ? "idle" : s.status,
  }));
}

realtime.on(Ev.matchEnded, (e) => {
  if (e.matchId !== matchId) return;
  clearInterval(ticker);
  clearTimeout(blurTimer);
  peerStarting = null;
  pendingIce = [];
  void closePeer();
  const s = get();
  const byMe = e.byMe === true;
  const reason = typeof e.reason === "string" ? e.reason : null;
  const base: MatchRecord = s.current ?? { id: matchId!, partner: s.partner!, startedAt: new Date(), endedAt: null, liked: false, likedMe: false, giftsSent: 0, giftsReceived: 0, coinsSpent: 0 };
  const rec: MatchRecord = {
    ...base,
    endedAt: new Date(),
    liked: typeof e.liked === "boolean" ? e.liked : base.liked,
    likedMe: typeof e.likedMe === "boolean" ? e.likedMe : base.likedMe,
    giftsReceived: typeof e.giftsReceived === "number" ? e.giftsReceived : base.giftsReceived,
  };
  const ended: EndedInfo = {
    mutualLike: e.mutualLike === true || (rec.liked && rec.likedMe),
    reconnectCost: typeof e.reconnectCost === "number" ? e.reconnectCost : useCatalog.getState().economy.reconnectCost,
    freeReconnectUntil: mapDate(e.freeReconnectUntil),
  };
  lastMatchId = matchId;
  matchId = null;
  const endReason: EndReason =
    reason === "skipped" ? "skipped" : reason === "stopped" || reason === "disconnected" ? "stopped" : reason === "reported" || reason === "blocked" || reason === "banned" ? "reported" : "partnerLeft";
  // Skipping puts you straight back in the queue; anything else ends here.
  const keepGoing = byMe && reason === "skipped";
  set({ history: [...s.history, rec], current: null, lastPartner: s.partner, endReason, ended, game: null, mutual: false, status: keepGoing ? "searching" : "ended", blurred: false });
  // Not going on: the status change closes the camera (see useMatch.subscribe).
  void useSession.getState().refreshMe();
});

realtime.on(Ev.rtcSignal, (e) => void onSignal(e));

// ── WebRTC ─────────────────────────────────────────────────────────────────

/**
 * STUN + TURN with a short-lived TURN login. Reused for up to 30 minutes and
 * never past half its lifetime, so a call can't outlive its cached login.
 */
async function ice(): Promise<RTCIceServer[]> {
  if (iceServers && Date.now() - iceFetchedAt < iceReuseMs) return iceServers;
  try {
    const r = asMap(await api.get("/rtc/ice-servers"));
    iceServers = asList(r.iceServers).map((x) => asMap(x) as unknown as RTCIceServer);
    iceFetchedAt = Date.now();
    const ttl = typeof r.ttlSeconds === "number" ? r.ttlSeconds : null;
    iceReuseMs = ttl == null ? 30 * 60_000 : Math.min(30 * 60, Math.floor(ttl / 2)) * 1000;
  } catch {
    iceServers ??= [{ urls: ["stun:stun.l.google.com:19302"] }];
  }
  return iceServers;
}

async function startPeer(caller: boolean) {
  const id = matchId;
  await closePeer();
  await get().ensureCamera();
  const local = get().localStream;
  if (!local) return;
  const servers = await ice();
  // The match may have ended (or a new one begun) during the awaits above.
  if (matchId !== id || id == null) return;
  const peer = new RTCPeerConnection({ iceServers: servers, ...(config.forceRelay ? { iceTransportPolicy: "relay" as const } : {}) });
  if (matchId !== id || pc) {
    peer.close();
    return;
  }
  pc = peer;
  local.getTracks().forEach((t) => peer.addTrack(t, local));
  peer.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    realtime.request("rtc:signal", { type: "ice", data: ev.candidate.toJSON() as unknown as Json }).catch(() => {});
  };
  peer.ontrack = (ev) => {
    if (pc !== peer) return;
    const stream = ev.streams[0] ?? new MediaStream([ev.track]);
    set({ remoteStream: stream });
  };
  peer.onconnectionstatechange = () => {
    if (pc !== peer) return;
    // "disconnected" is usually a short blip that recovers on its own: keep
    // the video up and only fall back to the photo on "failed".
    if (peer.connectionState === "failed" || peer.connectionState === "closed") set({ remoteStream: null });
  };
  if (caller) {
    const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await peer.setLocalDescription(offer);
    await realtime.request("rtc:signal", { type: "offer", data: { sdp: offer.sdp, type: offer.type } }).catch(() => {});
  }
}

async function onSignal(e: Json) {
  if (e.matchId !== matchId) return;
  const data = asMap(e.data);
  try {
    switch (e.type) {
      case "offer": {
        // Usually the peer from match:found is still being set up: wait for it.
        if (!pc) await (peerStarting ?? startPeer(false));
        const peer = pc;
        if (!peer) return;
        await peer.setRemoteDescription({ sdp: String(data.sdp ?? ""), type: "offer" });
        await flushIce();
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await realtime.request("rtc:signal", { type: "answer", data: { sdp: answer.sdp, type: answer.type } });
        break;
      }
      case "answer":
        await pc?.setRemoteDescription({ sdp: String(data.sdp ?? ""), type: "answer" });
        await flushIce();
        break;
      case "ice": {
        const c: RTCIceCandidateInit = {
          candidate: typeof data.candidate === "string" ? data.candidate : undefined,
          sdpMid: typeof data.sdpMid === "string" ? data.sdpMid : null,
          sdpMLineIndex: typeof data.sdpMLineIndex === "number" ? data.sdpMLineIndex : null,
        };
        if (remoteDescriptionSet && pc) await pc.addIceCandidate(c);
        else pendingIce.push(c);
        break;
      }
      case "hangup":
        await closePeer();
        break;
    }
  } catch (err) {
    console.warn(`rtc signal ${String(e.type)} failed`, err);
  }
}

async function flushIce() {
  remoteDescriptionSet = true;
  for (const c of pendingIce) await pc?.addIceCandidate(c);
  pendingIce = [];
}

async function closePeer() {
  const peer = pc;
  pc = null;
  remoteDescriptionSet = false;
  set({ remoteStream: null });
  peer?.close();
}
