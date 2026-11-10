import type { Friend } from "@/lib/models";

/** The second line of a chat in the list: what the last message was, ready to draw. */
export interface ChatPreview {
  text: string;
  /** A small icon before the text. */
  icon: "photo" | "mic" | "gift" | "call" | "call_missed" | null;
  /** Your message: sent (one grey tick), delivered (two grey) or seen (two teal). */
  ticks: "sent" | "delivered" | "seen" | null;
  /** A missed call from them reads in red. */
  missed: boolean;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** `seenAt` / `deliveredAt`: live receipts for the chat (when they last read it, when it last reached them), for the ticks. */
export function chatPreview(f: Pick<Friend, "last" | "lastMessage" | "lastMessageAt">, seenAt?: Date, deliveredAt?: Date): ChatPreview {
  const l = f.last;
  const text = f.lastMessage ?? "";
  if (!l) return { text: text || "Say hi 👋", icon: null, ticks: null, missed: false };
  const you = l.fromMe ? "You: " : "";
  const after = (t?: Date) => !!t && !!f.lastMessageAt && t >= f.lastMessageAt;
  const ticks: ChatPreview["ticks"] =
    l.fromMe && !l.unsent && l.kind !== "system" ? (l.read || after(seenAt) ? "seen" : l.delivered || after(deliveredAt) ? "delivered" : "sent") : null;
  if (l.unsent) return { text: l.fromMe ? "You unsent a message" : "Message unsent", icon: null, ticks: null, missed: false };
  switch (l.kind) {
    case "photo":
      return { text: `${you}Photo`, icon: "photo", ticks, missed: false };
    case "voice":
      return { text: `${you}Voice message${l.seconds ? ` · ${clock(l.seconds)}` : ""}`, icon: "mic", ticks, missed: false };
    case "gift":
      return { text: `${you}${text || "Gift"}`, icon: "gift", ticks, missed: false };
    case "system": {
      const call = l.event?.startsWith("call_") ?? false;
      const missed = l.event === "call_missed" && !l.fromMe;
      return { text, icon: call ? (missed ? "call_missed" : "call") : null, ticks: null, missed };
    }
    default:
      return { text: `${you}${text}`, icon: null, ticks, missed: false };
  }
}
