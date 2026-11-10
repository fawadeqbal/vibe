import { describe, expect, it } from "vitest";

import type { LastMessage } from "@/lib/models";

import { chatPreview } from "./chat-preview";

const at = new Date("2026-11-10T10:00:00Z");
const last = (x: Partial<LastMessage>): LastMessage => ({
  fromMe: false,
  kind: "text",
  delivered: false,
  read: false,
  unsent: false,
  event: null,
  seconds: null,
  ...x,
});
const p = (x: Partial<LastMessage> | null, text: string | null = "hey", seenAt?: Date) =>
  chatPreview({ last: x ? last(x) : null, lastMessage: text, lastMessageAt: at }, seenAt);

describe("chatPreview", () => {
  it("their text as is; yours with You: and a tick", () => {
    expect(p({})).toEqual({ text: "hey", icon: null, ticks: null, missed: false });
    expect(p({ fromMe: true })).toMatchObject({ text: "You: hey", ticks: "sent" });
    expect(p({ fromMe: true, delivered: true })).toMatchObject({ ticks: "delivered" });
    expect(p({ fromMe: true, read: true })).toMatchObject({ ticks: "seen" });
  });

  it("a live read receipt after it was sent turns it seen", () => {
    expect(p({ fromMe: true }, "hey", new Date("2026-11-10T10:00:05Z")).ticks).toBe("seen");
    expect(p({ fromMe: true }, "hey", new Date("2026-11-10T09:59:00Z")).ticks).toBe("sent");
  });

  it("photos, voice notes with their length, gifts", () => {
    expect(p({ kind: "photo" }, "")).toMatchObject({ text: "Photo", icon: "photo" });
    expect(p({ kind: "voice", seconds: 14, fromMe: true }, "")).toMatchObject({ text: "You: Voice message · 0:14", icon: "mic" });
    expect(p({ kind: "gift" }, "🌹 Rose")).toMatchObject({ text: "🌹 Rose", icon: "gift" });
  });

  it("their missed call is red; other call lines get a phone icon and no ticks", () => {
    expect(p({ kind: "system", event: "call_missed" }, "Missed video call")).toEqual({
      text: "Missed video call",
      icon: "call_missed",
      ticks: null,
      missed: true,
    });
    expect(p({ kind: "system", event: "call_ended", fromMe: true }, "Video call · 4:02")).toEqual({
      text: "Video call · 4:02",
      icon: "call",
      ticks: null,
      missed: false,
    });
  });

  it("unsent, and a chat with no messages yet", () => {
    expect(p({ unsent: true, fromMe: true }, "")).toMatchObject({ text: "You unsent a message", ticks: null });
    expect(p(null, null).text).toBe("Say hi 👋");
  });
});
