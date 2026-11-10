import { create } from "zustand";

import { newIdempotencyKey } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { applyGameAnswer, asList, asMap, callGame, date as mapDate, type Json, matchRecord, profile as mapProfile } from "@/lib/api/mappers";
import { Ev } from "@/lib/api/realtime";
import { AUDIO_MAX_BITRATE, browserWantsDataSaver, CAPTURE, tuneOpus, videoCeiling } from "@/lib/call-quality";
import { config } from "@/lib/config";
import type { CallGame, ChatMessage, GameId, Gift, MatchRecord, Profile, ReportReason } from "@/lib/models";
import { matchLengthSeconds } from "@/lib/models";
import { sameDay } from "@/lib/format";

import { useCatalog } from "./catalog";
import { api, realtime } from "./services";
import { useFilters } from "./filters";
import { useSession } from "./session";
import { useSocial } from "./social";

export type MatchStatus = "idle" | "searching" | "connected" | "ended";

/** Why the last match ended — drives the copy on the recap. */
export type EndReason = "skipped" | "partnerLeft" | "stopped" | "reported";

/** What `match:ended` adds for the recap: the mutual like and the reconnect price. */
/** A friend call that just ended: the "Call ended" screen. */
export interface FriendCallEnded {
  friendId: string;
  partner: Profile;
  voice: boolean;
  seconds: number;
  at: number;
}

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
  /** Gender or country filters are on but not open (no VIP, pass or Vibe Hour): offer the pass. */
  filtersLocked: boolean;
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
  /** This call is with a friend, started from a chat (no Next, no recap). */
  friendCall: boolean;
  /** A friend call just ended: go back to that chat. */
  friendCallEnded: FriendCallEnded | null;
  /** A friend call shrunk to the chat (the green bar and the small window). */
  minimized: boolean;
  /** "Blur me": they see you blurred. */
  blurMe: boolean;
  /** They turned on "Blur me": their video is shown blurred. */
  partnerBlur: boolean;
  /** A voice call with a friend: no camera until you both turn video on. */
  voiceCall: boolean;
  /** Turning video on in a voice call: you asked, they asked, or nothing. */
  videoAsk: "none" | "mine" | "theirs";
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
  /** What the partner told us: camera / mic on (both true until told otherwise). */
  partnerCamOn: boolean;
  partnerMicOn: boolean;
  /** Their video stopped arriving or the connection is wobbly ("video may freeze"). */
  weakSignal: boolean;
  /** A connection dropped and the call is waiting: ours (`me`) or theirs (`partner`). */
  reconnecting: "none" | "me" | "partner";
  /** Use less data on calls: smaller, slower video (remembered on this device). */
  dataSaver: boolean;
  setDataSaver: (on: boolean) => void;
  /** Only your last partner is waiting: who, and when you're put back together (null = never by itself). */
  rematchSoon: RematchSoon | null;
  cameraError: string | null;
  /** Why the camera didn't open: blocked by the person, no camera, another app has it, or not https. */
  cameraErrorKind: CameraErrorKind | null;
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
  /** "Like back" on the ended card: a like on the call that just ended. */
  likeLast: () => Promise<boolean>;
  /** "Send a gift" on the ended card, to the person you just left. False = could not pay (see needsCoins). */
  giftLast: (g: Gift) => Promise<boolean>;
  /** Call the last person again (paid). */
  reconnect: () => Promise<boolean>;
  dismissEnded: () => void;
  clearError: () => void;
  reset: () => void;
  /** In a voice call: ask to turn on video. */
  askVideo: () => Promise<void>;
  /** A video call with a friend → voice only, for both (no ask). */
  switchToVoice: () => Promise<void>;
  setMinimized: (v: boolean) => void;
  toggleBlurMe: () => void;
  /** Your camera while your video call rings on their side (the "Calling…" screen). */
  setCallPreview: (on: boolean) => void;
  /** Answer their ask to turn on video. */
  answerVideo: (yes: boolean) => Promise<void>;
}

export interface RematchSoon {
  partner: { id: string; name: string; avatarUrl: string };
  at: Date | null;
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
/** Your video call is ringing on their side: the camera may open for the "Calling…" screen. */
let callPreview = false;
let pageHidden = false;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let hiddenTimer: ReturnType<typeof setTimeout> | undefined;

/** Camera capture for calls: 640×480 at 24 fps (call-quality.ts); the encoder sends less on a weak line. */
const captureSize = { width: { ideal: CAPTURE.width }, height: { ideal: CAPTURE.height }, frameRate: { ideal: CAPTURE.frameRate, max: CAPTURE.frameRate } };
const DATA_SAVER_KEY = "vibe.dataSaver";
/** Data saver as set on this device, else on when the browser says data is precious. */
function readDataSaver(): boolean {
  try {
    const v = window.localStorage.getItem(DATA_SAVER_KEY);
    if (v != null) return v === "1";
  } catch {}
  return browserWantsDataSaver();
}
/** We made the offer in this call: ICE restarts start on our side. */
let isCaller = false;
let lastRestartAt = 0;
let restartTimer: ReturnType<typeof setTimeout> | undefined;

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
/** What we last told this partner (camera, mic), so each change is sent once. */
let toldMedia = "on:on";
let statsTimer: ReturnType<typeof setInterval> | undefined;
let blurTimer: ReturnType<typeof setTimeout> | undefined;

const REASONS: Record<ReportReason, string> = { nudity: "NUDITY", harassment: "HARASSMENT", underage: "UNDERAGE", spam: "SPAM", scam: "SCAM", other: "OTHER" };

export const useMatch = create<MatchState>()((set, get) => {
  const fail = (e: ApiError) => {
    if (e.code === "ACCOUNT_BANNED" && typeof e.details.until === "string") useSession.setState({ pausedUntil: new Date(e.details.until) });
    set((s) => ({
      filtersLocked: e.code === "FILTERS_LOCKED",
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
    tellMedia();
  };

  const openCamera = async (gen: number) => {
    if (gen !== cameraGen || get().localStream) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        // A voice call never opens the camera (until both turn video on).
        video: get().voiceCall ? false : { facingMode: get().frontCamera ? "user" : "environment", ...captureSize },
      });
      if (gen !== cameraGen) {
        // Released while it was opening (left the page, hid the tab…).
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      set({ localStream: stream, cameraError: null, cameraErrorKind: null });
      applyTracks();
    } catch (e) {
      if (gen === cameraGen) set({ cameraError: `Camera unavailable: ${e instanceof Error ? e.message : String(e)}`, cameraErrorKind: cameraErrorKind(e) });
    }
  };

  const isLive = () => {
    const st = get().status;
    return st === "searching" || st === "connected";
  };

  /** Whether the camera should be open right now (see the rules above). */
  const cameraWanted = () => isLive() || callPreview || (get().previewOn && lobbyVisible && !pageHidden);

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
    filtersLocked: false,
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
    friendCall: false,
    friendCallEnded: null,
    minimized: false,
    blurMe: false,
    partnerBlur: false,
    voiceCall: false,
    videoAsk: "none",
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
    partnerCamOn: true,
    partnerMicOn: true,
    weakSignal: false,
    reconnecting: "none",
    dataSaver: readDataSaver(),
    rematchSoon: null,
    cameraError: null,
    cameraErrorKind: null,
    previewOn: false,
    cameraActive: false,

    setDataSaver(on) {
      set({ dataSaver: on });
      try {
        window.localStorage.setItem(DATA_SAVER_KEY, on ? "1" : "0");
      } catch {}
      if (pc) void capVideo(pc);
    },

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
      if (get().localStream || typeof navigator === "undefined") return Promise.resolve();
      if (!navigator.mediaDevices) {
        // Browsers only allow cameras on https (or localhost).
        set({ cameraError: "Camera unavailable: this page isn't secure", cameraErrorKind: "insecure" });
        return Promise.resolve();
      }
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
      set({ previewOn: true, camOn: true, cameraError: null, cameraErrorKind: null });
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
        const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: front ? "user" : "environment", ...captureSize } });
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

    async start() {
      const s = get();
      if (s.status === "searching" || s.status === "connected") return true;
      set({ needsCoins: false, filtersLocked: false, lastError: null, endReason: null, status: "searching" });
      void get().ensureCamera();
      try {
        // The same filters as Discover (stores/filters.ts).
        const f = useFilters.getState().filters;
        await realtime.request("match:join", {
          gender: f.gender === "women" ? "WOMEN" : f.gender === "men" ? "MEN" : "ANYONE",
          countryCode: f.countryCode,
          safeMode: f.verifiedOnly,
          autoBlur: get().autoBlur,
          minAge: f.minAge,
          maxAge: f.maxAge,
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
      set({ rematchSoon: null });
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
      const id = `mm${Date.now()}`;
      set((s) => ({ chat: [...s.chat, { id, fromMe: true, text: t, at: new Date() }] }));
      // The server hides contact details ("****"): show what was actually sent.
      realtime
        .request("match:chat", { text: t })
        .then((r) => {
          const sent = asMap(r);
          if (typeof sent.text !== "string" || (sent.text === t && sent.hidden !== true)) return;
          set((s) => ({ chat: s.chat.map((c) => (c.id === id ? { ...c, text: sent.text as string, hidden: sent.hidden === true } : c)) }));
        })
        .catch(() => {});
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

    async likeLast() {
      const s = get();
      const last = s.history.at(-1);
      if (!s.lastPartner || !last || last.liked) return true;
      patchLast({ liked: true });
      try {
        const r = await api.post<Json>("/match/last/like");
        if (asMap(r).mutual === true) {
          patchLast({ likedMe: true });
          set((st) => ({ ended: st.ended ? { ...st.ended, mutualLike: true } : st.ended }));
        }
        return true;
      } catch (e) {
        patchLast({ liked: false });
        set({ lastError: e instanceof ApiError ? e.message : "Could not send the like" });
        return false;
      }
    },

    async giftLast(g) {
      if (!get().lastPartner) return false;
      set({ needsCoins: false, lastError: null });
      try {
        await api.post("/match/last/gift", { giftId: g.id }, { "Idempotency-Key": newIdempotencyKey() });
      } catch (e) {
        if (e instanceof ApiError && e.isInsufficientCoins) set({ needsCoins: true });
        else set({ lastError: e instanceof ApiError ? e.message : "Could not send the gift" });
        return false;
      }
      const last = get().history.at(-1);
      if (last) patchLast({ giftsSent: last.giftsSent + 1, coinsSpent: last.coinsSpent + g.coins });
      return true;
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

    async switchToVoice() {
      const id = matchId;
      if (!id || get().voiceCall || !get().friendCall) return;
      turnOffVideo();
      await api.post(`/calls/live/${id}/video`, { action: "off" }).catch(() => {});
    },

    setMinimized: (v) => set({ minimized: v }),

    toggleBlurMe() {
      set((s) => ({ blurMe: !s.blurMe }));
      tellMedia();
    },

    setCallPreview(on) {
      if (on === callPreview) return;
      callPreview = on;
      if (on) set({ camOn: true });
      syncCamera();
    },

    async askVideo() {
      const id = matchId;
      if (!id || !get().voiceCall) return;
      set({ videoAsk: "mine" });
      try {
        await api.post(`/calls/live/${id}/video`, { action: "ask" });
      } catch (e) {
        set({ videoAsk: "none", lastError: e instanceof Error ? e.message : "Couldn't ask for video." });
      }
    },

    async answerVideo(yes) {
      const id = matchId;
      set({ videoAsk: "none" });
      if (!id) return;
      await api.post(`/calls/live/${id}/video`, { action: yes ? "yes" : "no" }).catch(() => {});
    },

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

export type CameraErrorKind = "blocked" | "missing" | "busy" | "insecure" | "other";

/** Sorts a getUserMedia failure into something we can explain. */
export function cameraErrorKind(e: unknown): CameraErrorKind {
  const name = e instanceof Error || (typeof e === "object" && e && "name" in e) ? String((e as { name?: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "blocked";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "missing";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  if (name === "SecurityError") return "insecure";
  return "other";
}

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
    friendCall: e.friendCall === true,
    friendCallEnded: null,
    minimized: false,
    blurMe: false,
    partnerBlur: false,
    voiceCall: e.friendCall === true && e.audioOnly === true,
    videoAsk: "none",
    partnerCamOn: true,
    partnerMicOn: true,
    weakSignal: false,
    reconnecting: "none",
    rematchSoon: null,
  });
  lastRestartAt = 0;
  toldMedia = "on:on:";
  tellMedia();
  watchSignal();
  // A voice call starts with the microphone only: drop a camera the lobby had open.
  if (get().voiceCall && get().localStream?.getVideoTracks().length) get().releaseCamera();
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
  // They liked you back after the call: the ended card shows it.
  if (e.matchId === lastMatchId && e.matchId !== matchId) return patchLast({ likedMe: true });
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
/** Update the call that just ended (the last history record). */
function patchLast(patch: Partial<MatchRecord>) {
  set((s) => (s.history.length ? { history: [...s.history.slice(0, -1), { ...s.history[s.history.length - 1], ...patch }] } : {}));
}

function setMutual() {
  if (get().mutual) return;
  set((s) => ({ mutual: true, likedPartner: true, partnerLikedMe: true, current: s.current ? { ...s.current, liked: true, likedMe: true } : null }));
}

realtime.on(Ev.matchMutual, (e) => {
  if (e.matchId === lastMatchId && e.matchId !== matchId) {
    patchLast({ liked: true, likedMe: true });
    set((s) => ({ ended: s.ended ? { ...s.ended, mutualLike: true } : s.ended }));
    return;
  }
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

realtime.on(Ev.accountBanned, (e) => {
  const until = mapDate(e.until);
  if (until) useSession.setState({ pausedUntil: until });
  failFromEvent(new ApiError("ACCOUNT_BANNED", "Your account is paused after reports. Try again later."));
});

realtime.on(Ev.accountAppeal, (e) => {
  // The live banner (notification:show) says how it went.
  if (e.status === "ACCEPTED") useSession.setState({ pausedUntil: null });
  void useSession.getState().refreshMe();
});

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
  clearInterval(statsTimer);
  clearTimeout(restartTimer);
  set({ weakSignal: false, reconnecting: "none" });
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
  if (s.friendCall) {
    // A call with a friend: no recap, back to your chat with them.
    set({
      current: null,
      partner: null,
      game: null,
      mutual: false,
      status: "idle",
      blurred: false,
      friendCall: false,
      voiceCall: false,
      videoAsk: "none",
      minimized: false,
      blurMe: false,
      partnerBlur: false,
      friendCallEnded: s.partner ? { friendId: s.partner.id, partner: s.partner, voice: s.voiceCall, seconds: matchLengthSeconds(rec), at: Date.now() } : null,
    });
    return;
  }
  // Skipping puts you straight back in the queue; anything else ends here.
  const keepGoing = byMe && reason === "skipped";
  set({ history: [...s.history, rec], current: null, lastPartner: s.partner, endReason, ended, game: null, mutual: false, status: keepGoing ? "searching" : "ended", blurred: false });
  // Not going on: the status change closes the camera (see useMatch.subscribe).
  void useSession.getState().refreshMe();
});

realtime.on(Ev.rtcSignal, (e) => void onSignal(e));

// Their connection dropped: the call waits for them (the server gives them a grace period).
realtime.on(Ev.matchPartnerConnection, (e) => {
  if (e.matchId !== matchId) return;
  set({ reconnecting: e.state === "lost" ? "partner" : "none" });
});

// We're back and the call is still on. Say we're still in it (or the server ends it), then repair the media path if it broke meanwhile.
realtime.on(Ev.matchResumed, (e) => {
  if (e.matchId !== matchId) return;
  realtime.request("match:resume", { matchId: e.matchId }).catch(() => {});
  set({ reconnecting: "none" });
  if (pc && pc.connectionState !== "connected") {
    lastRestartAt = 0;
    restartConnection();
  }
});

// Our own socket dropped mid-call: say so; the voice and video often keep going meanwhile.
realtime.onConnectionChange((up) => {
  if (get().status !== "connected") return;
  if (!up) set({ reconnecting: "me" });
  else if (get().reconnecting === "me") set({ reconnecting: "none" });
});

realtime.on(Ev.matchMedia, (e) => {
  if (e.matchId !== matchId) return;
  set({ partnerCamOn: e.camOn !== false, partnerMicOn: e.micOn !== false, partnerBlur: e.blur === true });
});

realtime.on(Ev.matchRematchSoon, (e) => {
  if (get().status !== "searching") return;
  const p = asMap(e.partner);
  set({ rematchSoon: { partner: { id: String(p.id ?? ""), name: typeof p.name === "string" ? p.name : "", avatarUrl: typeof p.avatarUrl === "string" ? p.avatarUrl : "" }, at: mapDate(e.at) } });
});

/** Tell the partner when our camera or mic goes on or off (a hidden tab counts as camera off). */
function tellMedia() {
  const s = useMatch.getState();
  if (s.status !== "connected" || !matchId) return;
  const camOn = s.camOn && !pageHidden && !s.voiceCall;
  const key = `${camOn ? "on" : "off"}:${s.micOn ? "on" : "off"}:${s.blurMe ? "blur" : ""}`;
  if (key === toldMedia) return;
  toldMedia = key;
  realtime.request("match:media", { camOn, micOn: s.micOn, ...(s.blurMe ? { blur: true } : {}) }).catch(() => {});
}

/** Their video should keep moving: no new frames for ~4 s (while their camera is on) means a weak connection. */
function watchSignal() {
  clearInterval(statsTimer);
  let lastFrames = -1;
  let stalls = 0;
  statsTimer = setInterval(async () => {
    const s = useMatch.getState();
    if (s.status !== "connected") return clearInterval(statsTimer);
    const peer = pc;
    if (!peer) return;
    // Lost the path (network switch, long stall): find a new one without ending the call.
    if (peer.connectionState === "failed" || peer.connectionState === "disconnected") restartConnection();
    let frames = -1;
    try {
      (await peer.getStats()).forEach((r: { type?: string; kind?: string; framesDecoded?: number }) => {
        if (r.type === "inbound-rtp" && r.kind === "video" && typeof r.framesDecoded === "number") frames = r.framesDecoded;
      });
    } catch {
      return;
    }
    const stuck = !!s.remoteStream && frames >= 0 && frames === lastFrames && s.partnerCamOn && !s.voiceCall;
    lastFrames = frames;
    stalls = stuck ? stalls + 1 : 0;
    // Only a real stall (about 6 s with no new frame) gets a note; short blips pass quietly.
    const weak = stalls >= 3 || peer.connectionState === "disconnected";
    if (weak !== s.weakSignal) set({ weakSignal: weak });
  }, 2000);
}

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
  // Voice calls keep a video line ready (no camera yet) so video can be turned on without renegotiating.
  if (get().voiceCall && caller) peer.addTransceiver("video", { direction: "sendrecv" });
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
    const st = peer.connectionState;
    clearTimeout(restartTimer);
    if (st === "connected") {
      // (Re)connected: voice first, and video at what the line can carry.
      void tuneVoice(peer);
      void capVideo(peer);
      if (get().weakSignal) set({ weakSignal: false });
    } else if (st === "failed") restartConnection();
    // "disconnected" is usually a short blip that recovers on its own; if not, restart.
    else if (st === "disconnected") restartTimer = setTimeout(() => pc === peer && peer.connectionState !== "connected" && restartConnection(), 3000);
    // Keep the last frame up through a restart; the photo comes back only when the call is over.
    else if (st === "closed") set({ remoteStream: null });
  };
  isCaller = caller;
  if (caller) {
    const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    const sdp = tuneOpus(offer.sdp ?? "");
    await peer.setLocalDescription({ type: "offer", sdp });
    await realtime.request("rtc:signal", { type: "offer", data: { sdp, type: "offer" } }).catch(() => {});
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
        // Answer the reserved video line as send-and-receive too (voice calls).
        for (const t of peer.getTransceivers()) if (t.receiver.track.kind === "video" && !t.sender.track) t.direction = "sendrecv";
        const answer = await peer.createAnswer();
        const sdp = tuneOpus(answer.sdp ?? "");
        await peer.setLocalDescription({ type: "answer", sdp });
        await realtime.request("rtc:signal", { type: "answer", data: { sdp, type: "answer" } });
        break;
      }
      case "restart":
        // The other side lost the connection: offer a fresh path now.
        if (isCaller) {
          lastRestartAt = 0;
          restartConnection();
        }
        break;
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

/** Voice only from now on (either side switched): stop the camera, keep the call. */
function turnOffVideo() {
  if (get().voiceCall) return;
  const local = get().localStream;
  local?.getVideoTracks().forEach((t) => {
    t.stop();
    local.removeTrack(t);
  });
  const t = pc?.getTransceivers().find((x) => x.receiver.track.kind === "video");
  void t?.sender.replaceTrack(null);
  set({ voiceCall: true, videoAsk: "none", localStream: local ? new MediaStream(local.getTracks()) : null });
  tellMedia();
}

/** Both said yes: open the camera and send it on the reserved video line. */
async function turnOnVideo() {
  if (!get().voiceCall) return;
  set({ voiceCall: false, videoAsk: "none", camOn: true });
  tellMedia();
  try {
    const cam = await navigator.mediaDevices.getUserMedia({ video: { facingMode: get().frontCamera ? "user" : "environment", ...captureSize } });
    const track = cam.getVideoTracks()[0];
    const local = get().localStream;
    if (!track) return;
    if (local) {
      local.addTrack(track);
      set({ localStream: new MediaStream(local.getTracks()) });
    } else set({ localStream: cam });
    const t = pc?.getTransceivers().find((x) => x.receiver.track.kind === "video");
    await t?.sender.replaceTrack(track);
  } catch (e) {
    set({ cameraError: `Camera unavailable: ${e instanceof Error ? e.message : String(e)}` });
  }
}

realtime.on(Ev.callVideo, (e) => {
  if (e.matchId !== matchId) return;
  if (e.state === "asked") set({ videoAsk: "theirs" });
  else if (e.state === "on") void turnOnVideo();
  else if (e.state === "declined") set({ videoAsk: "none", lastError: "They'd rather stay on voice for now." });
  else if (e.state === "off") turnOffVideo();
});

/**
 * A new network path without ending the call (ICE restart): the caller sends
 * a fresh offer, the callee asks the caller for one. At most every 6 s.
 */
function restartConnection() {
  const peer = pc;
  if (!peer || !matchId || Date.now() - lastRestartAt < 6000) return;
  lastRestartAt = Date.now();
  if (!isCaller) {
    realtime.request("rtc:signal", { type: "restart" }).catch(() => {});
    return;
  }
  void (async () => {
    try {
      const offer = await peer.createOffer({ iceRestart: true });
      if (pc !== peer) return;
      const sdp = tuneOpus(offer.sdp ?? "");
      await peer.setLocalDescription({ type: "offer", sdp });
      await realtime.request("rtc:signal", { type: "offer", data: { sdp, type: "offer" } });
    } catch (err) {
      console.warn("ice restart failed", err);
    }
  })();
}

/** Voice goes first on a crowded line: capped at what Opus needs, sent at high priority. */
async function tuneVoice(peer: RTCPeerConnection) {
  for (const sender of peer.getSenders()) {
    if (sender.track?.kind !== "audio") continue;
    try {
      const p = sender.getParameters();
      if (!p.encodings?.length) continue;
      p.encodings[0].maxBitrate = AUDIO_MAX_BITRATE;
      p.encodings[0].priority = "high";
      p.encodings[0].networkPriority = "high";
      await sender.setParameters(p);
    } catch {}
  }
}

/**
 * Video keeps flowing, like WhatsApp: only a ceiling (lower with Data
 * saver). Below it, WebRTC's own congestion control lowers resolution and
 * frame rate on a weak line and raises them again when it recovers.
 */
async function capVideo(peer: RTCPeerConnection) {
  const sender = peer.getTransceivers().find((t) => t.receiver.track.kind === "video")?.sender;
  if (!sender) return;
  try {
    const p = sender.getParameters();
    const e = p.encodings?.[0];
    if (!e) return;
    e.active = true;
    e.maxBitrate = videoCeiling(get().dataSaver);
    delete e.maxFramerate;
    e.scaleResolutionDownBy = 1;
    await sender.setParameters(p);
  } catch {}
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
