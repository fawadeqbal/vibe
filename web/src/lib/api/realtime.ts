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
  catalogUpdated: "catalog:updated",
} as const;

export type EventData = Record<string, unknown>;
type Handler = (data: EventData) => void;

/**
 * One Socket.IO connection for the whole app. Authenticates with the current
 * access token on every (re)connect, fans server pushes out to subscribers
 * and turns acked emits into promises that reject with {@link ApiError}.
 */
export class RealtimeClient {
  private socket: Socket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private connectionWaiters = new Set<() => void>();
  connected = false;

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
      auth: (cb) => cb({ token: this.api.accessToken }),
    });
    s.on("connect", () => this.setConnected(true));
    s.on("disconnect", () => this.setConnected(false));
    s.on("connect_error", async (err) => {
      // Expired token: refresh; the next reconnect attempt sends the new one.
      if (/TOKEN_EXPIRED|UNAUTHENTICATED/.test(String(err?.message ?? err))) await this.api.refreshSession();
    });
    s.onAny((event: string, data: unknown) => {
      if (!data || typeof data !== "object") return;
      this.handlers.get(event)?.forEach((h) => h(data as EventData));
    });
    this.socket = s;
    s.connect();
  }

  disconnect() {
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
    this.connected = v;
    if (v) [...this.connectionWaiters].forEach((w) => w());
  }
}
