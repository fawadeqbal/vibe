import { Badge, type Tone } from "@/components/ui/badge";
import { format } from "@/lib/format";

/**
 * Every status enum in the API → a badge colour, in one table, so the same
 * status looks the same on every screen.
 */
const TONE: Record<string, Tone> = {
  // purchases
  PENDING: "neutral",
  REQUIRES_ACTION: "warn",
  SUCCEEDED: "ok",
  FAILED: "bad",
  REFUNDED: "info",
  // cash-outs
  REVIEW: "warn",
  REQUESTED: "neutral",
  PROCESSING: "info",
  PAID: "ok",
  REJECTED: "bad",
  // subscriptions
  TRIALING: "trust",
  ACTIVE: "ok",
  CANCELED: "warn",
  EXPIRED: "neutral",
  // reports
  OPEN: "warn",
  ACTIONED: "bad",
  DISMISSED: "neutral",
  // staff / users
  DISABLED: "neutral",
  DELETED: "neutral",
  // announcements
  DRAFT: "neutral",
  LIVE: "ok",
  ARCHIVED: "neutral",
  // messages
  QUEUED: "neutral",
  SENDING: "info",
  SENT: "ok",
  SKIPPED: "neutral",
};

const LABEL: Record<string, string> = {
  REQUIRES_ACTION: "Needs action",
  REVIEW: "Needs review",
  ACTIONED: "Actioned",
  TRIALING: "Trial",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={TONE[status] ?? "neutral"} dot className={className}>
      {LABEL[status] ?? format.enum(status)}
    </Badge>
  );
}

const REASON_TONE: Record<string, Tone> = { NUDITY: "bad", UNDERAGE: "bad", HARASSMENT: "warn", SCAM: "warn", SPAM: "neutral", OTHER: "neutral" };

export function ReasonBadge({ reason, count }: { reason: string; count?: number }) {
  return (
    <Badge tone={REASON_TONE[reason] ?? "neutral"}>
      {format.enum(reason)}
      {count !== undefined && count > 1 && <span className="opacity-70">×{count}</span>}
    </Badge>
  );
}
