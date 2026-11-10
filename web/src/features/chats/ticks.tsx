import { cn } from "@/lib/cn";

import type { MessageStatus } from "./message-status";

const LABEL: Record<MessageStatus, string> = { sending: "Sending", sent: "Sent", delivered: "Delivered", seen: "Seen", failed: "Not sent" };

/**
 * The status of your message as ticks: a clock while sending, one grey tick
 * (sent), two grey ticks (delivered), two teal ticks (seen), a red ! (not
 * sent). `onMine`: drawn inside your violet bubble (lighter grey).
 */
export function Ticks({ status, onMine = false, className }: { status: MessageStatus; onMine?: boolean; className?: string }) {
  const grey = onMine ? "text-white/65" : "text-muted";
  const color = status === "seen" ? (onMine ? "text-[#99f6e4]" : "text-trust") : status === "failed" ? (onMine ? "text-[#fecdd3]" : "text-bad") : grey;
  return (
    <svg role="img" aria-label={LABEL[status]} width={status === "sent" || status === "sending" || status === "failed" ? 14 : 17} height="14" viewBox={status === "delivered" || status === "seen" ? "0 0 26 20" : "0 0 20 20"} className={cn("shrink-0", color, className)}>
      {status === "sending" ? (
        <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="10" cy="10" r="7.2" />
          <path d="M10 6v4.2l2.6 1.6" />
        </g>
      ) : status === "failed" ? (
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="10" cy="10" r="7.2" />
          <path d="M10 6.2v4.6M10 13.8h.01" />
        </g>
      ) : status === "sent" ? (
        <path d="M3.5 10.5l4 4L16.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M2 10.5l4 4L15 5.5M10.5 14l.5.5L20 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
