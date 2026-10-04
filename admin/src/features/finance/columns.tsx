"use client";

import { Coins, Gems, IdChip, Time, UserCell } from "@/components/common/bits";
import { StatusBadge } from "@/components/common/status";
import type { Column } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import type { Cashout, LedgerEntry, Purchase, Subscription } from "@/lib/api/types";
import { format } from "@/lib/format";

/**
 * Column sets shared by the finance screens and the user profile tabs —
 * a purchase row looks the same wherever it appears.
 */

const user = <T extends { user?: { id: string; name: string; avatarUrl: string } }>(): Column<T> => ({ id: "user", header: "User", cell: (r) => <UserCell user={r.user ?? null} size={26} />, className: "min-w-44" });

export const LEDGER_KIND_TONE: Record<string, "ok" | "bad" | "money" | "info" | "primary" | "neutral" | "warn" | "trust"> = {
  PURCHASE: "money",
  SPEND: "neutral",
  EARN: "ok",
  GIFT_SENT: "primary",
  GIFT_RECEIVED: "trust",
  CASHOUT: "info",
  CASHOUT_REVERSAL: "warn",
  VIP: "money",
  REFUND: "bad",
  ADJUSTMENT: "warn",
};

export function ledgerColumns(withUser: boolean): Column<LedgerEntry>[] {
  return [
    ...(withUser ? [user<LedgerEntry>()] : []),
    { id: "kind", header: "Type", cell: (e) => <Badge tone={LEDGER_KIND_TONE[e.kind]}>{format.enum(e.kind)}</Badge> },
    { id: "title", header: "Description", cell: (e) => <span className="text-text">{e.title}</span>, className: "min-w-48" },
    { id: "coins", header: "Coins", cell: (e) => (e.coins ? <Coins value={e.coins} signed /> : <span className="text-muted">—</span>), align: "right" },
    { id: "gems", header: "Gems", cell: (e) => (e.gems ? <Gems value={e.gems} signed /> : <span className="text-muted">—</span>), align: "right" },
    { id: "balance", header: "Balance after", cell: (e) => <span className="text-xs text-muted tabular">{format.number(e.balanceCoins)} c · {format.number(e.balanceGems)} g</span>, align: "right", className: "hidden lg:table-cell" },
    { id: "usd", header: "USD", cell: (e) => (e.usdCents ? format.cents(e.usdCents) : <span className="text-muted">—</span>), align: "right", className: "hidden md:table-cell" },
    { id: "at", header: "When", cell: (e) => <Time iso={e.createdAt} className="text-text-2" /> },
  ];
}

export const productLabel = (p: Pick<Purchase, "productType" | "productId">) =>
  p.productType === "COIN_PACK" ? `${format.enum(p.productId)} pack` : `VIP ${format.enum(p.productId.replace("vip_", ""))}`;

export function purchaseColumns(withUser: boolean): Column<Purchase>[] {
  return [
    ...(withUser ? [user<Purchase>()] : []),
    { id: "product", header: "Product", cell: (p) => <span className="font-medium text-text">{productLabel(p)}</span> },
    { id: "amount", header: "Amount", cell: (p) => <span className="tabular">{format.usd(p.usdCents / 100)}</span>, align: "right" },
    { id: "method", header: "Method", cell: (p) => <span className="text-text-2">{format.enum(p.method)}</span>, className: "hidden md:table-cell" },
    { id: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
    { id: "ref", header: "Reference", cell: (p) => (p.providerRef ? <IdChip id={p.providerRef} label="Reference" className="max-w-40" /> : <span className="text-muted">—</span>), className: "hidden xl:table-cell" },
    { id: "at", header: "Created", cell: (p) => <Time iso={p.createdAt} className="text-text-2" /> },
  ];
}

export function cashoutColumns(withUser: boolean): Column<Cashout>[] {
  return [
    ...(withUser ? [user<Cashout>()] : []),
    { id: "amount", header: "Amount", cell: (c) => <span className="font-medium tabular">{format.usd(c.usdCents / 100)}</span>, align: "right" },
    { id: "gems", header: "Gems", cell: (c) => <Gems value={c.gems} />, align: "right", className: "hidden sm:table-cell" },
    { id: "to", header: "To", cell: (c) => <span className="text-text-2">{format.enum(c.method)} <span className="font-mono text-xs">{c.accountMasked}</span></span>, className: "hidden md:table-cell" },
    { id: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
    { id: "note", header: "Note", cell: (c) => <span className="text-xs text-muted">{c.failureReason ?? c.providerRef ?? ""}</span>, className: "hidden xl:table-cell max-w-56 truncate" },
    { id: "at", header: "Requested", cell: (c) => <Time iso={c.createdAt} className="text-text-2" /> },
  ];
}

export function subscriptionColumns(): Column<Subscription>[] {
  return [
    user<Subscription>(),
    { id: "plan", header: "Plan", cell: (s) => (s.planId === "staff_grant" ? <Badge tone="primary">Given by staff</Badge> : <span className="font-medium">{format.enum(s.planId.replace("vip_", ""))}</span>) },
    { id: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
    { id: "started", header: "Started", cell: (s) => <Time iso={s.startedAt} mode="date" className="text-text-2" />, className: "hidden md:table-cell" },
    { id: "ends", header: "Period ends", cell: (s) => <Time iso={s.currentPeriodEnd} mode="date" className="text-text-2" /> },
    { id: "trial", header: "Trial", cell: (s) => (s.trialEndsAt ? <Time iso={s.trialEndsAt} mode="date" /> : <span className="text-muted">—</span>), className: "hidden lg:table-cell" },
  ];
}
