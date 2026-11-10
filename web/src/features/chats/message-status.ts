import type { ChatMessage } from "@/lib/models";

/**
 * The ticks on your own messages, like WhatsApp:
 * sending (a clock) → sent (one grey tick: Vibe has it) → delivered (two grey
 * ticks: it reached their phone or an open tab) → seen (two teal ticks).
 * `failed`: it couldn't be sent (a red ! and "Tap to retry"). Null for theirs.
 */
export type MessageStatus = "sending" | "sent" | "delivered" | "seen" | "failed";

/** `seenAt` / `deliveredAt`: live receipts for the whole chat (everything sent up to then). */
export function messageStatus(
  m: Pick<ChatMessage, "fromMe" | "kind" | "pending" | "failed" | "unsent" | "at" | "readAt" | "deliveredAt">,
  seenAt?: Date | null,
  deliveredAt?: Date | null,
): MessageStatus | null {
  if (!m.fromMe || m.kind === "system" || m.unsent) return null;
  if (m.failed) return "failed";
  if (m.pending) return "sending";
  if (m.readAt || (seenAt && seenAt >= m.at)) return "seen";
  if (m.deliveredAt || (deliveredAt && deliveredAt >= m.at)) return "delivered";
  return "sent";
}

/** When it was sent, delivered and seen, for Hold › Info (null where it hasn't happened or isn't known). */
export function statusTimes(m: Pick<ChatMessage, "at" | "readAt" | "deliveredAt">, seenAt?: Date | null, deliveredAt?: Date | null) {
  const seen = m.readAt ?? (seenAt && seenAt >= m.at ? seenAt : null);
  const delivered = m.deliveredAt ?? (deliveredAt && deliveredAt >= m.at ? deliveredAt : null) ?? seen;
  return { sent: m.at, delivered, seen };
}
