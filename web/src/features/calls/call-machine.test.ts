import { describe, expect, it } from "vitest";

import type { Profile } from "@/lib/models";

import { type CallSnap, isNewer, missedFor, parseSnap, viewOf } from "./call-machine";

const asad = { id: "a", name: "Asad Khan" } as Profile;
const sana = { id: "s", name: "Sana Malik" } as Profile;
const snap = (over: Partial<CallSnap> = {}): CallSnap => ({
  callId: "c1",
  state: "ringing",
  reason: null,
  version: 1,
  media: "video",
  from: asad,
  to: sana,
  reached: false,
  answeredBy: null,
  matchId: null,
  reply: null,
  expiresAt: new Date(0),
  ...over,
});

describe("call machine", () => {
  it("parses a server snapshot; anything else is not one", () => {
    const p = (m: Record<string, unknown>) => ({ id: String(m.id), name: String(m.name) }) as Profile;
    const c = parseSnap({ callId: "c1", state: "ended", reason: "declined", version: 4, media: "voice", from: asad, to: sana, reply: "later", answeredBy: null, expiresAt: "2026-01-01T00:00:00Z" }, p);
    expect(c).toMatchObject({ callId: "c1", state: "ended", reason: "declined", version: 4, media: "voice", reply: "later" });
    expect(parseSnap({ callId: "c1", state: "weird", from: asad, to: sana }, p)).toBeNull();
    expect(parseSnap({ state: "ringing" }, p)).toBeNull();
  });

  it("keeps the newest: older or repeated versions are ignored, another call always wins", () => {
    expect(isNewer(null, snap())).toBe(true);
    expect(isNewer(snap({ version: 3 }), snap({ version: 2 }))).toBe(false);
    expect(isNewer(snap({ version: 3 }), snap({ version: 3 }))).toBe(false);
    expect(isNewer(snap({ version: 3 }), snap({ version: 4 }))).toBe(true);
    expect(isNewer(snap({ version: 9 }), snap({ callId: "c2", version: 1 }))).toBe(true);
  });

  it("the caller: Calling… → Ringing… → the call screen; every ending has its own screen", () => {
    expect(viewOf(snap(), "a", "d").outgoing).toMatchObject({ status: "ringing", reached: false });
    expect(viewOf(snap({ reached: true }), "a", "d").outgoing).toMatchObject({ status: "ringing", reached: true });
    expect(viewOf(snap({ state: "connecting" }), "a", "d")).toEqual({ incoming: null, outgoing: null, notice: null });
    expect(viewOf(snap({ state: "live" }), "a", "d").outgoing).toBeNull();
    const ended = (reason: CallSnap["reason"]) => viewOf(snap({ state: "ended", reason, reply: "Call me in 10 min" }), "a", "d").outgoing;
    expect(ended("unavailable")).toMatchObject({ status: "unavailable" });
    expect(ended("gone")).toMatchObject({ status: "unavailable" });
    expect(ended("declined")).toMatchObject({ status: "declined", reply: "Call me in 10 min" });
    expect(ended("no_answer")).toMatchObject({ status: "no_answer" });
    expect(ended("busy")).toMatchObject({ status: "busy" });
    expect(ended("failed")).toMatchObject({ status: "failed" });
    expect(ended("turned_off")).toMatchObject({ status: "turned_off" });
    for (const r of ["cancelled", "hung_up", "dropped"] as const) expect(ended(r)).toBeNull();
  });

  it("the person called: the ring; then hung up, answered on another device, too late, couldn't connect", () => {
    expect(viewOf(snap(), "s", "phone").incoming).toMatchObject({ callId: "c1", from: asad, media: "video" });
    // This device answered: the call screen. Another one did: it closes.
    expect(viewOf(snap({ state: "connecting", answeredBy: "phone" }), "s", "phone").notice).toBeNull();
    expect(viewOf(snap({ state: "connecting", answeredBy: "laptop" }), "s", "phone").notice).toMatchObject({ kind: "elsewhere" });
    expect(viewOf(snap({ state: "live", answeredBy: "laptop" }), "s", "phone").notice).toMatchObject({ kind: "elsewhere" });
    const ended = (reason: CallSnap["reason"], tried = false) => viewOf(snap({ state: "ended", reason }), "s", "phone", tried);
    expect(ended("cancelled").notice).toMatchObject({ kind: "hung_up" });
    expect(ended("cancelled", true).notice).toMatchObject({ kind: "over" });
    expect(ended("no_answer", true).notice).toMatchObject({ kind: "over" });
    expect(ended("failed").notice).toMatchObject({ kind: "failed" });
    for (const r of ["no_answer", "declined", "gone", "unavailable", "hung_up", "dropped"] as const) expect(ended(r).notice).toBeNull();
    // Someone else's call: nothing.
    expect(viewOf(snap(), "x", "d")).toEqual({ incoming: null, outgoing: null, notice: null });
  });

  it("missed calls", () => {
    for (const r of ["unavailable", "no_answer", "cancelled", "gone"] as const) expect(missedFor(r)).toBe(true);
    for (const r of ["declined", "busy", "failed", "hung_up", null] as const) expect(missedFor(r)).toBe(false);
  });
});
