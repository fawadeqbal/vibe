import { io, type Socket } from "socket.io-client";

import { config } from "../config";
import type { ApiClient } from "./client";
import { ApiError } from "./errors";

/** Event names the server pushes (mirror of the backend's `ServerEvent`). */
export const Ev = {
  walletUpdated: "wallet:updated",
  paymentUpdated: "payment:updated",
  cashoutUpdated: "cashout:updated",
  accountBanned: "account:banned",
  /** This device was signed out from another device's Settings → Devices (or by the team). */
  sessionEnded: "session:ended",
  accountWarning: "account:warning",
  announcement: "system:announcement",
  matchSearching: "match:searching",
  matchFound: "match:found",
  matchEnded: "match:ended",
  matchChat: "match:chat",
  matchLiked: "match:liked",
  matchGift: "match:gift",
  matchFriendRequest: "match:friend-request",
  matchError: "match:error",
  matchMutual: "match:mutual",
  matchGame: "match:game",
  matchGameAnswer: "match:game-answer",
  matchGameClosed: "match:game-closed",
  /** You asked to be told when someone's looking (POST /match/notify-me), and someone is. One-shot. */
  matchSomeoneLooking: "match:someone-looking",
  /** Only your last partner is waiting: `{ partner: { id, name, avatarUrl }, at }`. */
  matchRematchSoon: "match:rematch-soon",
  /** Your partner's camera / mic: `{ matchId, camOn, micOn }`. */
  matchMedia: "match:media",
  matchPartnerConnection: "match:partner-connection",
  matchResumed: "match:resumed",
  /** A moderator answered your appeal: `{ status, note }`. */
  accountAppeal: "account:appeal",
  /** New people joined Discover (you asked): `{ count }`. */
  discoverNewPeople: "discover:new-people",
  /** Someone waved at you: `{ from, mutual }`. */
  waveNew: "wave:new",
  /** Someone you waved with started looking for a match: `{ from }`. */
  waveLooking: "wave:looking",
  /** You and someone liked each other in Discover: `{ friend }`. */
  discoverMatch: "discover:match",
  /** Someone liked you in Discover: `{ superLike, from, unseen }`. */
  discoverLiked: "discover:liked",
  /** Video calls in a chat changed: `{ friendId, mine, theirs, asked?, from? }`. */
  callConsent: "call:consent",
  /** A friend is calling you: `{ callId, from, expiresAt }`. */
  callIncoming: "call:incoming",
  /** Your call is ringing on their side: `{ callId, to, expiresAt }`. */
  callRinging: "call:ringing",
  /** A ringing call stopped: `{ callId, reason, reply?, from? }`. */
  callEnded: "call:ended",
  /** Your call is ringing on their phone (the app, or a push with Vibe closed): `{ callId }`. Until then: "Connecting". */
  callReached: "call:reached",
  /** Voice → video in a friend call: `{ matchId, state: "asked" | "on" | "declined", from? }`. */
  callVideo: "call:video",
  /** Your friend is typing: `{ friendId }`. */
  chatTyping: "chat:typing",
  /** A message changed (reaction, unsent): the message. */
  messageUpdated: "message:updated",
  /** Your friend read your messages: `{ friendId, at }`. */
  messagesRead: "message:read",
  /** Your messages reached your friend's phone or an open tab: `{ friendId, at }` (two grey ticks). */
  messagesDelivered: "message:delivered",
  rtcSignal: "rtc:signal",
  friendRequest: "social:friend-request",
  friendAccepted: "social:friend-accepted",
  friendRemoved: "social:friend-removed",
  followNew: "social:follow-new",
  followRequest: "social:follow-request",
  followAccepted: "social:follow-accepted",
  followRemoved: "social:follow-removed",
  message: "social:message",
  presence: "social:presence",
  streak: "social:streak",
  vibeHour: "engagement:vibe-hour",
  momentNew: "moments:new",
  levelUp: "progress:level-up",
  goalReached: "wallet:goal-reached",
  inboxMessage: "inbox:message",
  activityNew: "activity:new",
  notificationShow: "notification:show",
  activityRead: "activity:read",
  catalogUpdated: "catalog:updated",
  referralUpdated: "referral:updated",
  referralMilestone: "referral:milestone",
  affiliateUpdated: "affiliate:updated",
} as const;

export type EventData = Record<string, unknown>;
type Handler = (data: EventData) => void;

/** No mouse, keys or scrolling for this long: the tab is open but nobody is looking. */
const IDLE_MS = 2 * 60_000;

/**
 * One Socket.IO connection for the whole app. Authenticates with the current
 * access token on every (re)connect, fans server pushes out to subscribers
 * and turns acked emits into promises that reject with {@link ApiError}.
 */
export class RealtimeClient {
  private socket: Socket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private connectionWaiters = new Set<() => void>();
  private connectionListeners = new Set<(connected: boolean) => void>();
  connected = false;
  /** What the server last heard: someone is using this tab (it skips phone pushes while any device is in use). */
  private active = true;
  private busy = false;
  private lastInput = Date.now();
  private stopTracking: (() => void) | null = null;

  /** Called whenever the socket goes up or down (a call shows "Reconnecting…"). Returns the unsubscribe function. */
  onConnectionChange(fn: (connected: boolean) => void): () => void {
    this.connectionListeners.add(fn);
    return () => this.connectionListeners.delete(fn);
  }

  constructor(
    private readonly api: ApiClient,
    private readonly url = config.socketUrl,
  ) {}

  /** Subscribe to a server event. Returns the unsubscribe function. */
  on(event: string, handler: Handler): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler);
    return () => set.delete(handler);
  }

  connect() {
    if (this.socket) return;
    const s = io(this.url, {
      transports: ["websocket"],
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      // `client`: browsers can't set headers on a WebSocket, so say which Vibe this is here (admin → who is on the web).
      // `active`: whether someone is using this tab, so a tab left open doesn't hold back phone pushes.
      auth: (cb) => cb({ token: this.api.accessToken, client: "web", active: this.computeActive() }),
    });
    s.on("connect", () => this.setConnected(true));
    s.on("disconnect", () => this.setConnected(false));
    s.on("connect_error", async (err) => {
      const reason = String(err?.message ?? err);
      // Not offered in this country: stop trying (the app shows the region screen).
      if (reason === "REGION_UNAVAILABLE") {
        this.api.onRegionBlocked?.("");
        return this.disconnect();
      }
      // Expired token: refresh; the next reconnect attempt sends the new one.
      if (/TOKEN_EXPIRED|UNAUTHENTICATED/.test(reason)) await this.api.refreshSession();
    });
    s.onAny((event: string, data: unknown) => {
      if (!data || typeof data !== "object") return;
      this.handlers.get(event)?.forEach((h) => h(data as EventData));
    });
    this.socket = s;
    this.trackActivity();
    this.watchWake();
    s.connect();
  }

  private stopWake: (() => void) | null = null;
  private lastCheck = 0;

  /**
   * Back from a locked phone, a hidden tab or no network: the browser may have
   * paused the page and its connection died without anyone noticing (it would
   * take up to 40 s, then a back-off). Check at once with a ping and, if it
   * doesn't answer within a few seconds, reconnect now — so you show as
   * "Active now" again straight away and nothing is missed.
   */
  private watchWake() {
    if (this.stopWake || typeof window === "undefined") return;
    const wake = () => {
      if (document.visibilityState === "visible") this.checkAlive();
    };
    const online = () => this.checkAlive(true);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", online);
    this.stopWake = () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", online);
      this.stopWake = null;
    };
  }

  /** Reconnects now if the connection is down or doesn't answer a ping. */
  checkAlive(force = false) {
    const s = this.socket;
    if (!s) return;
    const now = Date.now();
    if (!force && now - this.lastCheck < 3000) return;
    this.lastCheck = now;
    if (!s.connected) {
      s.connect(); // skip the back-off wait
      return;
    }
    s.timeout(4000).emit("presence:ping", {}, (err: Error | null) => {
      if (!err || this.socket !== s) return;
      // No answer: the line is dead even though it looks open. Start a fresh one.
      s.disconnect();
      s.connect();
    });
  }

  /** On a live call: in use even without mouse or keys. */
  setBusy(busy: boolean) {
    this.busy = busy;
    this.reportActive();
  }

  private computeActive(): boolean {
    if (typeof document === "undefined") return true;
    if (this.busy) return true;
    return document.visibilityState === "visible" && document.hasFocus() && Date.now() - this.lastInput < IDLE_MS;
  }

  private reportActive() {
    const next = this.computeActive();
    if (next === this.active) return;
    this.active = next;
    if (this.socket?.connected) this.socket.emit("presence:active", { active: next });
  }

  /**
   * Tells the server when this tab is in use: visible, focused and touched
   * in the last two minutes. Otherwise the person gets phone pushes even
   * with Vibe open on a computer they walked away from.
   */
  private trackActivity() {
    if (this.stopTracking || typeof window === "undefined") return;
    let last = 0;
    const input = () => {
      const now = Date.now();
      this.lastInput = now;
      // Moving the mouse fires a lot; only re-check now and then (or when it changes the answer).
      if (!this.active || now - last > 10_000) {
        last = now;
        this.reportActive();
      }
    };
    const check = () => this.reportActive();
    const inputs = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;
    for (const e of inputs) window.addEventListener(e, input, { passive: true, capture: true });
    window.addEventListener("focus", input);
    window.addEventListener("blur", check);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 30_000);
    this.stopTracking = () => {
      for (const e of inputs) window.removeEventListener(e, input, { capture: true });
      window.removeEventListener("focus", input);
      window.removeEventListener("blur", check);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
      this.stopTracking = null;
    };
  }

  disconnect() {
    this.stopTracking?.();
    this.stopWake?.();
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.setConnected(false);
  }

  /** Sends and waits for the server's `{ ok, data | error }` ack. */
  async request<T = unknown>(event: string, payload: EventData = {}): Promise<T> {
    const s = this.socket;
    if (!s) throw ApiError.network("not connected");
    if (!s.connected) await this.waitForConnection(8000);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(ApiError.network(`no reply to ${event}`)), 12_000);
      s.emit(event, payload, (res: unknown) => {
        clearTimeout(timer);
        const r = res as { ok?: boolean; data?: T; error?: unknown } | null;
        if (r?.ok === true) resolve(r.data as T);
        else if (r && typeof r.error === "object") reject(ApiError.fromBody(0, r));
        else reject(new ApiError("INTERNAL", "Unexpected reply"));
      });
    });
  }

  private waitForConnection(ms: number) {
    return new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        this.connectionWaiters.delete(done);
        resolve();
      };
      const timer = setTimeout(() => {
        this.connectionWaiters.delete(done);
        reject(ApiError.network("socket offline"));
      }, ms);
      this.connectionWaiters.add(done);
    });
  }

  private setConnected(v: boolean) {
    const changed = this.connected !== v;
    this.connected = v;
    if (v) [...this.connectionWaiters].forEach((w) => w());
    // The handshake carried the state at connect time; it may have changed while connecting.
    if (v) {
      this.active = this.computeActive();
      this.socket?.emit("presence:active", { active: this.active });
    }
    if (changed) this.connectionListeners.forEach((l) => l(v));
  }
}
