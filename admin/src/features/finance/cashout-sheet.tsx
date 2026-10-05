"use client";

import Link from "next/link";
import * as React from "react";

import { Gems, IdChip, UserCell } from "@/components/common/bits";
import { DescriptionList } from "@/components/common/page";
import { StatusBadge } from "@/components/common/status";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import type { Cashout } from "@/lib/api/types";
import { format } from "@/lib/format";

import { ProviderStatusText } from "./columns";
import { ProviderTrail } from "./provider-trail";

type CashoutLike = Omit<Cashout, "user"> & { user?: { id: string; name: string; avatarUrl?: string } | null };

/** Cash-out details and its provider trail, in the right-hand panel. */
export function CashoutSheet({ cashout: c, onClose, footer }: { cashout: CashoutLike | null; onClose: () => void; footer?: React.ReactNode }) {
  return (
    <Dialog open={!!c} onOpenChange={(o) => !o && onClose()}>
      {c && (
        <SheetContent title={`Cash-out ${format.usd(c.usdCents / 100)}`} description={`${c.amountPkr != null ? `${format.pkr(c.amountPkr)} · ` : ""}${format.enum(c.method)} ${c.accountMasked}`} footer={footer}>
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <UserCell user={c.user ?? null} />
              <StatusBadge status={c.status} />
            </div>
            <DescriptionList
              items={[
                { label: "Cash-out id", value: <IdChip id={c.id} /> },
                { label: "Gems", value: <Gems value={c.gems} /> },
                { label: "Amount", value: `${format.usd(c.usdCents / 100)}${c.amountPkr != null ? ` · ${format.pkr(c.amountPkr)}` : ""}` },
                { label: "To", value: `${format.enum(c.method)} ${c.accountMasked}` },
                { label: "Provider status", value: c.providerStatus ? <ProviderStatusText value={c.providerStatus} className="text-text" /> : "—" },
                { label: "Provider reference", value: c.providerRef ? <IdChip id={c.providerRef} label="Reference" /> : "—" },
                { label: "Attempts", value: format.number(c.attempts), hidden: !c.attempts },
                {
                  label: "Bank batch",
                  value: c.batchId ? (
                    <Link href={`/finance/payout-batches/${c.batchId}`} className="text-primary hover:underline">
                      Open batch
                    </Link>
                  ) : (
                    "—"
                  ),
                  hidden: c.method !== "BANK",
                },
                { label: "Requested", value: format.dateTime(c.createdAt) },
                { label: "Processed", value: format.dateTime(c.processedAt) },
                { label: "Failure", value: c.failureReason ?? "—", hidden: !c.failureReason },
              ]}
            />
            <ProviderTrail kind="cashouts" id={c.id} />
          </div>
        </SheetContent>
      )}
    </Dialog>
  );
}
