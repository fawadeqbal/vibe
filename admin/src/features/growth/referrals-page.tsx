"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Gift, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Coins, Time, UserCell } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { PageHeader } from "@/components/common/page";
import { StatusBadge } from "@/components/common/status";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { FilterBar, FilterSelect, ResetFilters, SearchInput } from "@/components/data-table/filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/controls";
import { useCan } from "@/features/auth/session";
import { useAction } from "@/hooks/use-action";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api/client";
import type { ReferralRow } from "@/lib/api/types";
import { P } from "@/lib/permissions";

import { growthKeys, useReferrals } from "./api";
import { progressText, rejectReasonText, SOURCE_LABEL } from "./format";

const TABS = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "REWARDED", label: "Rewarded" },
  { value: "REJECTED", label: "Rejected" },
];
const DEFAULTS = { status: "ALL", q: "", kind: "" };

/** Who brought whom: user invites and partner sign-ups, with fraud rejections and staff overrides. */
export function ReferralsPage() {
  const [f, setF, reset] = useUrlState(DEFAULTS);
  const list = useReferrals({ status: f.status === "ALL" ? undefined : f.status, q: f.q, kind: f.kind || undefined });
  const columns = useReferralColumns({ withInviter: true });
  return (
    <div>
      <PageHeader
        title="Referrals"
        description="Everyone who joined with an invite or a partner code. They become active (verified + real calls), wait out a short hold, then both sides get coins. Fraud checks reject same-device sign-ups at once; you can approve one anyway."
      />
      <Tabs value={f.status} onValueChange={(status) => setF({ status })}>
        <TabsList className="mb-4">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DataTable
        columns={columns}
        rows={list.rows}
        getRowId={(r) => r.id}
        loading={list.isLoading}
        error={list.error}
        onRetry={list.refetch}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={list.fetchNextPage}
        empty={{ icon: Gift, title: f.status === "REJECTED" ? "No rejected referrals" : "No referrals yet" }}
        toolbar={
          <FilterBar>
            <SearchInput value={f.q} onChange={(q) => setF({ q })} placeholder="Code, name, e-mail or id" />
            <FilterSelect
              label="From"
              value={f.kind}
              onChange={(kind) => setF({ kind })}
              options={[
                { value: "user", label: "Friends (users)" },
                { value: "affiliate", label: "Partners" },
              ]}
            />
            <ResetFilters show={!!(f.q || f.kind)} onReset={() => reset()} />
          </FilterBar>
        }
      />
    </div>
  );
}

/** Referral columns, shared with the user page's Referrals tab. */
export function useReferralColumns({ withInviter }: { withInviter: boolean }): Column<ReferralRow>[] {
  const can = useCan();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const approve = useAction((r: ReferralRow) => api.post(`admin/referrals/${r.id}/approve`), { success: "Approved — checked again", invalidate: [growthKeys.all] });
  return [
    { id: "invitee", header: "New user", cell: (r) => <UserCell user={r.invitee} size={26} sub={r.invitee.status === "DELETED" ? "Deleted" : undefined} />, className: "min-w-44" },
    ...(withInviter
      ? [
          {
            id: "from",
            header: "Invited by",
            cell: (r: ReferralRow) =>
              r.affiliate ? (
                <Link href={`/affiliates/${r.affiliate.id}`} className="flex items-center gap-1.5 text-sm text-text hover:text-primary" onClick={(e) => e.stopPropagation()}>
                  <Badge tone="money">Partner</Badge> {r.affiliate.displayName}
                </Link>
              ) : (
                <UserCell user={r.inviter} size={22} />
              ),
            className: "min-w-40",
          },
        ]
      : []),
    {
      id: "code",
      header: "Code",
      cell: (r) => (
        <span className="block leading-tight">
          <span className="font-mono text-xs text-text">{r.code}</span>
          <span className="block text-xs text-muted">
            {SOURCE_LABEL[r.source] ?? r.source}
            {r.channel ? ` · ${r.channel}` : ""}
          </span>
        </span>
      ),
      className: "hidden md:table-cell",
    },
    { id: "progress", header: "Progress", cell: (r) => <span className="text-xs text-text-2">{r.status === "PENDING" ? progressText(r.steps) : r.status === "REWARDED" ? <Coins value={r.inviterCoins + r.inviteeCoins} /> : "—"}</span>, className: "hidden lg:table-cell" },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <span className="block">
          <StatusBadge status={r.status} />
          {r.status === "REJECTED" && <span className="mt-0.5 block max-w-56 truncate text-xs text-muted" title={rejectReasonText(r.rejectReason)}>{rejectReasonText(r.rejectReason)}</span>}
        </span>
      ),
    },
    { id: "device", header: "Device", cell: (r) => <span className="font-mono text-xs text-muted">{r.device ?? "—"}</span>, className: "hidden xl:table-cell" },
    { id: "at", header: "Joined", cell: (r) => <Time iso={r.createdAt} className="text-text-2" /> },
    ...(can(P.Referrals)
      ? [
          {
            id: "actions",
            header: "",
            align: "right" as const,
            cell: (r: ReferralRow) => (
              <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                {r.status === "REJECTED" && (
                  <Button size="xs" variant="trust" loading={approve.isPending && approve.variables?.id === r.id} onClick={() => approve.mutate(r)}>
                    <Check /> Approve anyway
                  </Button>
                )}
                {(r.status === "PENDING" || r.status === "QUALIFIED") && (
                  <Button
                    size="xs"
                    variant="danger-ghost"
                    aria-label="Reject"
                    onClick={() =>
                      void confirm({
                        title: `Reject ${r.invitee.name || "this"} referral?`,
                        description: r.affiliate ? "Nobody gets coins for it, and anything the partner earned from this person is taken back." : "Nobody gets coins for it.",
                        confirmLabel: "Reject",
                        tone: "danger",
                        reason: { label: "Reason (kept in the audit log)", placeholder: "e.g. Same person, second account", required: true, minLength: 3 },
                        action: async ({ reason }) => {
                          await api.post(`admin/referrals/${r.id}/reject`, { reason });
                          toast.success("Referral rejected");
                          await qc.invalidateQueries({ queryKey: growthKeys.all });
                        },
                      })
                    }
                  >
                    <X /> Reject
                  </Button>
                )}
              </span>
            ),
          },
        ]
      : []),
  ];
}
