"use client";

import Link from "next/link";

import { Time, UserCell } from "@/components/common/bits";
import { ErrorState } from "@/components/common/page";
import { StatusBadge } from "@/components/common/status";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/controls";
import { format } from "@/lib/format";

import { useUserReferrals } from "./api";
import { rejectReasonText, SOURCE_LABEL } from "./format";
import { useReferralColumns } from "./referrals-page";

/** User page → Referrals: who invited them, the people they invited, their partner account. */
export function UserReferralsTab({ userId }: { userId: string }) {
  const q = useUserReferrals(userId);
  const columns = useReferralColumns({ withInviter: false });
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-40" />;
  const { invitedBy, invited, affiliate } = q.data;
  const counts = invited.counts;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="mb-2 text-xs font-medium text-muted">Invited by</p>
          {invitedBy ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {invitedBy.affiliate ? (
                <Link href={`/affiliates/${invitedBy.affiliate.id}`} className="flex items-center gap-1.5 text-text hover:text-primary">
                  <Badge tone="money">Partner</Badge> {invitedBy.affiliate.displayName}
                </Link>
              ) : (
                <UserCell user={invitedBy.inviter} size={24} />
              )}
              <StatusBadge status={invitedBy.status} />
              <span className="text-xs text-muted">
                <span className="font-mono">{invitedBy.code}</span> · {SOURCE_LABEL[invitedBy.source] ?? invitedBy.source}
                {invitedBy.channel ? ` · ${invitedBy.channel}` : ""} · <Time iso={invitedBy.createdAt} />
              </span>
              {invitedBy.status === "REJECTED" && <span className="w-full text-xs text-muted">{rejectReasonText(invitedBy.rejectReason)}</span>}
            </div>
          ) : (
            <p className="text-sm text-muted">Nobody — they joined on their own</p>
          )}
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="mb-2 text-xs font-medium text-muted">Creator partner</p>
          {affiliate ? (
            <Link href={`/affiliates/${affiliate.id}`} className="flex items-center gap-2 text-sm text-text hover:text-primary">
              {affiliate.displayName} <span className="font-mono text-xs text-muted">{affiliate.code}</span> <StatusBadge status={affiliate.status} />
            </Link>
          ) : (
            <p className="text-sm text-muted">Not in the partner program</p>
          )}
        </div>
      </div>
      <p className="text-sm text-text-2">
        Invited {format.number(Object.values(counts).reduce((s, n) => s + (n ?? 0), 0))} people · {format.number(counts.REWARDED ?? 0)} rewarded · {format.number((counts.PENDING ?? 0) + (counts.QUALIFIED ?? 0))} on the way · {format.number(counts.REJECTED ?? 0)} rejected
      </p>
      <DataTable columns={columns} rows={invited.items} getRowId={(r) => r.id} empty={{ title: "They haven't invited anyone yet" }} />
    </div>
  );
}
