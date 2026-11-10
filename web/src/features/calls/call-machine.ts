import type { Profile } from "@/lib/models";

/**
 * Friend calls, the client side of the server's state machine (backend:
 * calls.service.ts; the design: "Calls: one state machine on the server").
 * The server owns every call and sends `call:state` with the full snapshot
 * on each move; this keeps the newest and works out what this device shows.
 * Pure, so every state is tested. (app: lib/models/call_machine.dart)
 */
export type CallMedia = "voice" | "video";
export type CallStatus = "ringing" | "connecting" | "live" | "ended";
export type CallEndReason = "unavailable" | "busy" | "cancelled" | "declined" | "no_answer" | "gone" | "failed" | "hung_up" | "dropped" | "turned_off";

export interface CallSnap {
  callId: string;
  state: CallStatus;
  reason: CallEndReason | null;
  version: number;
  media: CallMedia;
  from: Profile;
  to: Profile;
  reached: boolean;
  answeredBy: string | null;
  matchId: string | null;
  reply: string | null;
  expiresAt: Date;
}

/** Someone calling you. */
export interface IncomingCall {
  callId: string;
  from: Profile;
  expiresAt: Date;
  media: CallMedia;
}

/** Your call: "Calling…" / "Ringing…", or how it ended. */
export interface OutgoingCall {
  callId: string | null;
  to: Profile;
  media: CallMedia;
  status: "ringing" | "declined" | "no_answer" | "busy" | "unavailable" | "failed" | "turned_off" | "paused" | "error";
  reply: string | null;
  message: string | null;
  /** Their app is showing it: "Ringing…" (else "Calling…"). */
  reached?: boolean;
}

/** For the person called, after the ring: why it stopped (shown briefly, or with Call back). */
export interface CallNotice {
  callId: string;
  kind: "hung_up" | "elsewhere" | "over" | "failed";
  from: Profile;
  media: CallMedia;
}

export interface CallView {
  incoming: IncomingCall | null;
  outgoing: OutgoingCall | null;
  notice: CallNotice | null;
}

const STATUSES: CallStatus[] = ["ringing", "connecting", "live", "ended"];
const REASONS: CallEndReason[] = ["unavailable", "busy", "cancelled", "declined", "no_answer", "gone", "failed", "hung_up", "dropped", "turned_off"];

/** A `call:state` payload (or a REST reply) → a snapshot; null if it isn't one. */
export function parseSnap(m: Record<string, unknown>, profile: (m: Record<string, unknown>) => Profile): CallSnap | null {
  const state = STATUSES.find((s) => s === m.state);
  if (typeof m.callId !== "string" || !state || typeof m.from !== "object" || typeof m.to !== "object" || !m.from || !m.to) return null;
  return {
    callId: m.callId,
    state,
    reason: REASONS.find((r) => r === m.reason) ?? null,
    version: typeof m.version === "number" ? m.version : 0,
    media: m.media === "voice" ? "voice" : "video",
    from: profile(m.from as Record<string, unknown>),
    to: profile(m.to as Record<string, unknown>),
    reached: m.reached === true,
    answeredBy: typeof m.answeredBy === "string" ? m.answeredBy : null,
    matchId: typeof m.matchId === "string" ? m.matchId : null,
    reply: typeof m.reply === "string" ? m.reply : null,
    expiresAt: typeof m.expiresAt === "string" ? new Date(m.expiresAt) : new Date(),
  };
}

/** Take [next] over [cur]: another call, or a newer version of this one (late and repeated events are ignored). */
export function isNewer(cur: CallSnap | null, next: CallSnap): boolean {
  return !cur || cur.callId !== next.callId || next.version > cur.version;
}

/**
 * What this device shows for a snapshot: [me] is the signed-in user,
 * [device] this device's id, [acceptTried] whether this device pressed
 * Accept on this call.
 */
export function viewOf(c: CallSnap, me: string, device: string, acceptTried = false): CallView {
  const none: CallView = { incoming: null, outgoing: null, notice: null };
  if (c.from.id === me) {
    const out = (status: OutgoingCall["status"]): CallView => ({
      ...none,
      outgoing: { callId: c.callId, to: c.to, media: c.media, status, reply: c.reply, message: null, reached: c.reached },
    });
    if (c.state === "ringing") return out("ringing");
    if (c.state !== "ended") return none; // connecting / live: the call screen
    switch (c.reason) {
      case "declined":
      case "no_answer":
      case "busy":
      case "unavailable":
      case "failed":
      case "turned_off":
        return out(c.reason);
      case "gone":
        return out("unavailable");
      default:
        return none; // cancelled (you), hung_up / dropped (the call's own end)
    }
  }
  if (c.to.id !== me) return none;
  const notice = (kind: CallNotice["kind"]): CallView => ({ ...none, notice: { callId: c.callId, kind, from: c.from, media: c.media } });
  if (c.state === "ringing") return { ...none, incoming: { callId: c.callId, from: c.from, expiresAt: c.expiresAt, media: c.media } };
  if (c.state === "connecting" || c.state === "live") return c.answeredBy && c.answeredBy !== device && !acceptTried ? notice("elsewhere") : none;
  if (c.reason === "failed") return notice("failed");
  if (acceptTried && (c.reason === "cancelled" || c.reason === "no_answer" || c.reason === "turned_off")) return notice("over");
  if (c.reason === "cancelled") return notice("hung_up");
  return none;
}

/** Ended this way, the person called gets a missed call. */
export const missedFor = (r: CallEndReason | null) => r === "unavailable" || r === "no_answer" || r === "cancelled" || r === "gone";
