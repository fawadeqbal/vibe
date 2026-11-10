import { describe, expect, it } from "vitest";

import { messageStatus, statusTimes } from "./message-status";

const at = new Date("2026-11-10T21:40:00Z");
const later = new Date("2026-11-10T21:42:00Z");
const earlier = new Date("2026-11-10T21:00:00Z");
const m = (x: object = {}) => ({ fromMe: true, kind: "text" as const, at, readAt: null, deliveredAt: null, ...x });

describe("messageStatus", () => {
  it("sending → sent → delivered → seen; failed; none for theirs, system lines and unsent", () => {
    expect(messageStatus(m({ pending: true }))).toBe("sending");
    expect(messageStatus(m())).toBe("sent");
    expect(messageStatus(m({ deliveredAt: at }))).toBe("delivered");
    expect(messageStatus(m({ deliveredAt: at, readAt: later }))).toBe("seen");
    expect(messageStatus(m({ failed: true }))).toBe("failed");
    expect(messageStatus(m({ fromMe: false }))).toBeNull();
    expect(messageStatus(m({ kind: "system" }))).toBeNull();
    expect(messageStatus(m({ unsent: true }))).toBeNull();
  });

  it("live receipts count for everything sent before them, not after", () => {
    expect(messageStatus(m(), null, later)).toBe("delivered");
    expect(messageStatus(m(), later)).toBe("seen");
    expect(messageStatus(m(), earlier, earlier)).toBe("sent");
  });
});

describe("statusTimes", () => {
  it("seen implies delivered; unknowns are null", () => {
    expect(statusTimes(m({ readAt: later }))).toEqual({ sent: at, delivered: later, seen: later });
    expect(statusTimes(m({ deliveredAt: at }))).toEqual({ sent: at, delivered: at, seen: null });
    expect(statusTimes(m(), null, later)).toEqual({ sent: at, delivered: later, seen: null });
  });
});
