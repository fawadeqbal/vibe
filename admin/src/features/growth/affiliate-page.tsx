"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ExternalLink, Pause, Pencil, Play, ShieldCheck, Unlock, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { CopyButton, IdChip, Time, UserCell } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { DescriptionList, ErrorState, PageHeader } from "@/components/common/page";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status";
import { TimeSeriesChart } from "@/components/charts/time-series";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Segmented, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useCan } from "@/features/auth/session";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/api/client";
import type { AffiliateCommission, AffiliateDetail, AffiliatePayout } from "@/lib/api/types";
import { format } from "@/lib/format";
import { P } from "@/lib/permissions";

import { growthKeys, useAffiliate, useAffiliateStats } from "./api";
import { channelText, CODE_RE, flagTone, parseOptionalCents, parseOptionalInt, rejectReasonText, termsText } from "./format";

export function AffiliatePage({ id }: { id: string }) {
  const q = useAffiliate(id);
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96" />;
  return <AffiliateView a={q.data} />;
}

function AffiliateView({ a }: { a: AffiliateDetail }) {
  const can = useCan();
  const manage = can(P.Affiliates);
  const [terms, setTerms] = React.useState<"approve" | "edit" | null>(null);
  const actions = useAffiliateActions(a);
  const held = a.commissions.some((c) => c.status === "HELD");

  return (
    <div>
      <PageHeader
        back={{ href: "/affiliates", label: "Affiliates" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {a.displayName}
            <StatusBadge status={a.status} />
            {a.customTerms && <Badge tone="money">Custom terms</Badge>}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-text">{a.code}</span>
            <span>·</span>
            <a href={a.link} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              {a.link.replace(/^https:\/\//, "")}
            </a>
            <CopyButton value={a.link} label="Link copied" title="Copy link" />
          </span>
        }
        actions={
          manage && (
            <>
              {(a.status === "PENDING" || a.status === "REJECTED") && (
                <Button variant="trust" size="sm" onClick={() => setTerms("approve")}>
                  <Check /> Approve
                </Button>
              )}
              {a.status === "PENDING" && (
                <Button variant="danger-ghost" size="sm" onClick={actions.reject}>
                  <X /> Reject
                </Button>
              )}
              {a.status === "ACTIVE" && (
                <Button variant="danger-ghost" size="sm" onClick={actions.suspend}>
                  <Pause /> Suspend
                </Button>
              )}
              {a.status === "SUSPENDED" && (
                <Button variant="trust" size="sm" onClick={actions.reactivate}>
                  <Play /> Reactivate
                </Button>
              )}
              {(a.status === "ACTIVE" || a.status === "SUSPENDED") && (
                <Button size="sm" onClick={() => setTerms("edit")}>
                  <Pencil /> Edit terms
                </Button>
              )}
              {held && a.status === "ACTIVE" && (
                <Button size="sm" onClick={actions.releaseHeld}>
                  <Unlock /> Release held
                </Button>
              )}
            </>
          )
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Pending" tone="neutral" value={format.cents(a.balance.pendingUsdCents)} hint="In the hold period" />
            <StatCard label="Available" tone="money" value={<span className={a.balance.availableUsdCents < 0 ? "text-bad" : undefined}>{format.cents(a.balance.availableUsdCents)}</span>} hint="Can be withdrawn" />
            <StatCard label="Payout requested" tone="info" value={format.cents(a.balance.requestedUsdCents)} hint="Waiting for staff" />
            <StatCard label="Paid out" tone="trust" value={format.cents(a.balance.paidUsdCents)} hint="All time" />
          </div>
          <StatsCard a={a} />
          <Tabs defaultValue="referred">
            <TabsList>
              <TabsTrigger value="referred" count={a.referred.length}>
                Referred people
              </TabsTrigger>
              <TabsTrigger value="commissions" count={a.commissions.length}>
                Commissions
              </TabsTrigger>
              <TabsTrigger value="payouts" count={a.payouts.length}>
                Payouts
              </TabsTrigger>
            </TabsList>
            <div className="pt-4">
              <TabsContent value="referred">
                <DataTable columns={referredColumns} rows={a.referred} getRowId={(r) => r.id} empty={{ title: "Nobody has joined with this code yet" }} />
              </TabsContent>
              <TabsContent value="commissions">
                <DataTable columns={commissionColumns} rows={a.commissions} getRowId={(c) => c.id} empty={{ title: "No commissions yet" }} />
              </TabsContent>
              <TabsContent value="payouts">
                <DataTable columns={payoutColumns} rows={a.payouts} getRowId={(p) => p.id} empty={{ title: "No payouts yet" }} />
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <aside className="space-y-5">
          <FlagsCard a={a} />
          <Card>
            <CardHeader title="Partner" />
            <CardBody className="space-y-4">
              <UserCell user={a.user} />
              <DescriptionList
                columns={1}
                items={[
                  { label: "Terms", value: termsText(a) },
                  { label: "Defaults", value: termsText(a.defaults), hidden: !a.customTerms },
                  { label: "Applied", value: <Time iso={a.appliedAt} mode="dateTime" /> },
                  { label: "Decided", value: a.decidedAt ? <>{format.dateTime(a.decidedAt)}{a.decidedBy ? ` by ${a.decidedBy}` : ""}</> : "—" },
                  { label: "Reason given", value: a.decisionReason ?? "—", hidden: !a.decisionReason },
                  { label: "Partner id", value: <IdChip id={a.id} label="Partner id" /> },
                ]}
              />
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted">Channels</p>
                <ul className="space-y-1">
                  {a.channels.map((c, i) => (
                    <li key={i}>
                      <a href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-text hover:text-primary">
                        {channelText(c)} <ExternalLink className="size-3 text-muted" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              {a.note && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted">Their message</p>
                  <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap text-text-2">{a.note}</p>
                </div>
              )}
            </CardBody>
          </Card>
          <StaffNoteCard a={a} canEdit={manage} />
        </aside>
      </div>
      {terms && <TermsDialog a={a} mode={terms} onClose={() => setTerms(null)} />}
    </div>
  );
}

function StatsCard({ a }: { a: AffiliateDetail }) {
  const [days, setDays] = React.useState(30);
  const q = useAffiliateStats(a.id, days, a.stats);
  const s = q.data;
  const t = s?.totals;
  return (
    <Card>
      <CardHeader title="Performance" description="Link visits, sign-ups, active users and earnings" actions={<Segmented value={days} onChange={setDays} options={[{ value: 7, label: "7 d" }, { value: 30, label: "30 d" }, { value: 90, label: "90 d" }]} />} />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-sm md:grid-cols-6">
          {[
            ["Visits", format.number(t?.clicks)],
            ["Sign-ups", format.number(t?.signups)],
            ["Active", format.number(t?.qualified)],
            ["Paying", format.number(t?.payingUsers)],
            ["Revenue", format.cents(t?.revenueUsdCents)],
            ["Earned", format.cents(t?.earnedUsdCents)],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-muted">{label}</p>
              <p className="font-semibold text-text tabular">{value}</p>
            </div>
          ))}
        </div>
        <TimeSeriesChart
          data={s?.daily}
          loading={q.isLoading}
          height={180}
          series={[
            { key: "clicks", label: "Visits", color: 3 },
            { key: "signups", label: "Sign-ups", color: 1 },
            { key: "qualified", label: "Active", color: 2 },
          ]}
        />
        {!!s?.byChannel.length && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-medium">Channel</th>
                <th className="py-1 text-right font-medium">Visits</th>
                <th className="py-1 text-right font-medium">Sign-ups</th>
                <th className="py-1 text-right font-medium">Active</th>
                <th className="py-1 text-right font-medium">Earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.byChannel.map((c) => (
                <tr key={c.channel}>
                  <td className="py-1.5 text-text">{c.channel}</td>
                  <td className="py-1.5 text-right tabular">{format.number(c.clicks)}</td>
                  <td className="py-1.5 text-right tabular">{format.number(c.signups)}</td>
                  <td className="py-1.5 text-right tabular">{format.number(c.qualified)}</td>
                  <td className="py-1.5 text-right tabular">{format.cents(c.earnedUsdCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}

function FlagsCard({ a }: { a: AffiliateDetail }) {
  return (
    <Card>
      <CardHeader title="Fraud signals" description={a.flags.some((f) => f.level === "severe") ? "Severe signals hold new commissions until you release them." : undefined} />
      <CardBody>
        {a.flags.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-text-2">
            <ShieldCheck className="size-4 text-trust" /> Nothing unusual
          </p>
        ) : (
          <ul className="space-y-2">
            {a.flags.map((f) => (
              <li key={f.key} className="flex items-start gap-2 text-sm">
                <AlertTriangle className={f.level === "severe" ? "mt-0.5 size-4 shrink-0 text-bad" : "mt-0.5 size-4 shrink-0 text-warn"} />
                <span className="text-text">
                  {f.message} <Badge tone={flagTone(f)}>{f.level}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function StaffNoteCard({ a, canEdit }: { a: AffiliateDetail; canEdit: boolean }) {
  const [text, setText] = React.useState(a.staffNote ?? "");
  const save = useAction(() => api.patch(`admin/affiliates/${a.id}`, { staffNote: text.trim() || null }), { success: "Note saved", invalidate: [growthKeys.affiliate(a.id)] });
  return (
    <Card>
      <CardHeader title="Staff note" description="Only staff see this." />
      <CardBody className="space-y-2">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} readOnly={!canEdit} placeholder={canEdit ? "e.g. Agreed 30% on a call, 5 Oct" : "No note"} aria-label="Staff note" />
        {canEdit && (
          <Button size="sm" loading={save.isPending} disabled={text === (a.staffNote ?? "")} onClick={() => save.mutate()}>
            Save note
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

function useAffiliateActions(a: AffiliateDetail) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: growthKeys.all }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
  const post = (path: string, success: string) => async (body: object) => {
    await api.post(`admin/affiliates/${a.id}/${path}`, body);
    toast.success(success);
    await refresh();
  };
  return {
    reject: () =>
      void confirm({
        title: `Reject ${a.displayName}?`,
        description: "They see the reason on their partner page and can't apply again.",
        confirmLabel: "Reject",
        tone: "danger",
        reason: { label: "Reason (the applicant sees this)", placeholder: "e.g. Audience mostly outside Pakistan", required: true, minLength: 3 },
        action: ({ reason }) => post("reject", "Application rejected")({ reason }),
      }),
    suspend: () =>
      void confirm({
        title: `Suspend ${a.displayName}?`,
        description: "Their link keeps working, but new commissions are held and they can't request payouts until you reactivate them.",
        confirmLabel: "Suspend",
        tone: "danger",
        reason: { label: "Reason (the partner sees this)", placeholder: "e.g. Checking unusual sign-ups", required: true, minLength: 3 },
        action: ({ reason }) => post("suspend", "Partner suspended")({ reason }),
      }),
    reactivate: () =>
      void confirm({
        title: `Reactivate ${a.displayName}?`,
        description: "Held commissions go back to their normal hold and payouts are allowed again.",
        confirmLabel: "Reactivate",
        action: () => post("reactivate", "Partner reactivated")({}),
      }),
    releaseHeld: () =>
      void confirm({
        title: "Release held commissions?",
        description: "Commissions held by fraud signals continue their normal hold and then become available.",
        confirmLabel: "Release",
        action: () => post("release-held", "Held commissions released")({}),
      }),
  };
}

/** Approve (code + own terms) or edit terms later. Empty = the economy default. */
function TermsDialog({ a, mode, onClose }: { a: AffiliateDetail; mode: "approve" | "edit"; onClose: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = React.useState(a.code);
  const [name, setName] = React.useState(a.displayName);
  const [share, setShare] = React.useState(a.customTerms && a.revSharePercent !== a.defaults.revSharePercent ? String(a.revSharePercent) : "");
  const [cpa, setCpa] = React.useState(a.customTerms && a.cpaUsdCents !== a.defaults.cpaUsdCents ? String(a.cpaUsdCents / 100) : "");
  const [busy, setBusy] = React.useState(false);
  const shareP = parseOptionalInt(share, 0, 80);
  const cpaP = parseOptionalCents(cpa, 10_000);
  const codeErr = CODE_RE.test(code.trim()) ? undefined : "3–20 letters, digits or _";
  const nameErr = name.trim().length >= 2 && name.trim().length <= 40 ? undefined : "2–40 characters";
  const invalid = !!codeErr || !!nameErr || "error" in shareP || "error" in cpaP;

  const submit = async () => {
    if (invalid) return;
    setBusy(true);
    const body = {
      ...(code.trim().toUpperCase() !== a.code ? { code: code.trim() } : {}),
      ...(mode === "edit" && name.trim() !== a.displayName ? { displayName: name.trim() } : {}),
      revSharePercent: (shareP as { value: number | null }).value,
      cpaUsdCents: (cpaP as { value: number | null }).value,
    };
    try {
      if (mode === "approve") await api.post(`admin/affiliates/${a.id}/approve`, body);
      else await api.patch(`admin/affiliates/${a.id}`, body);
      toast.success(mode === "approve" ? `${a.displayName} is a partner now` : "Terms saved");
      await Promise.all([qc.invalidateQueries({ queryKey: growthKeys.all }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title={mode === "approve" ? `Approve ${a.displayName}` : "Edit partner terms"}
        description={mode === "approve" ? "Their code starts working right away. Leave a term empty to use the default from Economy → Creator partners." : "Changes apply to commissions from now on. Changing the code breaks links already shared."}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant={mode === "approve" ? "trust" : "primary"} loading={busy} disabled={invalid} onClick={() => void submit()}>
              {mode === "approve" ? "Approve" : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Code" error={codeErr} hint="Their link is vibe.fawadiqbal.dev/i/CODE">
            <Input value={code} onChange={(e) => setCode(e.target.value)} className="font-mono uppercase" />
          </Field>
          {mode === "edit" && (
            <Field label="Display name" error={nameErr}>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Share of purchases" error={"error" in shareP ? shareP.error : undefined} hint={`Default ${a.defaults.revSharePercent}%`}>
              <Input value={share} onChange={(e) => setShare(e.target.value)} inputMode="numeric" placeholder={`${a.defaults.revSharePercent}`} />
            </Field>
            <Field label="Per active user ($)" error={"error" in cpaP ? cpaP.error : undefined} hint={`Default ${format.cents(a.defaults.cpaUsdCents)}`}>
              <Input value={cpa} onChange={(e) => setCpa(e.target.value)} inputMode="decimal" placeholder={(a.defaults.cpaUsdCents / 100).toFixed(2)} />
            </Field>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const referredColumns: Column<AffiliateDetail["referred"][number]>[] = [
  { id: "user", header: "Person", cell: (r) => <UserCell user={r.invitee} size={24} />, className: "min-w-40" },
  { id: "channel", header: "Channel", cell: (r) => <span className="text-text-2">{r.channel ?? "direct"}</span>, className: "hidden md:table-cell" },
  {
    id: "status",
    header: "Status",
    cell: (r) => (
      <span className="block">
        <StatusBadge status={r.status} />
        {r.status === "REJECTED" && <span className="block text-xs text-muted">{rejectReasonText(r.rejectReason)}</span>}
        {r.status === "PENDING" && <span className="block text-xs text-muted">{r.invitee.verified ? "Verified ✓" : "Not verified"} · {r.invitee.goodCallsCount} calls</span>}
      </span>
    ),
  },
  { id: "at", header: "Joined", cell: (r) => <Time iso={r.createdAt} className="text-text-2" /> },
];

const commissionColumns: Column<AffiliateCommission>[] = [
  { id: "kind", header: "Type", cell: (c) => <Badge tone={c.kind === "CPA" ? "trust" : "money"}>{c.adjustment ? "Refund taken back" : c.kind === "CPA" ? "Active user" : "Purchase share"}</Badge> },
  { id: "user", header: "From", cell: (c) => <UserCell user={c.user} size={22} />, className: "hidden md:table-cell" },
  { id: "amount", header: "Amount", cell: (c) => <span className={c.usdCents < 0 ? "text-bad tabular" : "font-medium text-money tabular"}>{format.cents(c.usdCents)}</span>, align: "right" },
  { id: "base", header: "Of", cell: (c) => (c.kind === "REVSHARE" ? <span className="text-xs text-muted tabular">{format.cents(c.baseUsdCents)}</span> : <span className="text-muted">—</span>), align: "right", className: "hidden lg:table-cell" },
  { id: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
  { id: "available", header: "Available", cell: (c) => <Time iso={c.availableAt} className="text-text-2" />, className: "hidden sm:table-cell" },
  { id: "at", header: "Earned", cell: (c) => <Time iso={c.createdAt} className="text-text-2" /> },
];

export const payoutColumns: Column<AffiliatePayout>[] = [
  {
    id: "amount",
    header: "Amount",
    cell: (p) => (
      <span className="block whitespace-nowrap">
        <span className="font-medium text-money tabular">{format.cents(p.usdCents)}</span>
        <span className="block text-xs text-muted tabular">{format.pkr(p.amountPkr)}</span>
      </span>
    ),
  },
  { id: "to", header: "To", cell: (p) => <span className="text-text-2">{format.enum(p.method)} {p.accountMasked}</span> },
  {
    id: "status",
    header: "Status",
    cell: (p) => (
      <span className="block">
        <StatusBadge status={p.status} />
        {p.reference && <span className="block font-mono text-xs text-muted">{p.reference}</span>}
        {p.failureReason && <span className="block text-xs text-muted">{p.failureReason}</span>}
      </span>
    ),
  },
  { id: "at", header: "Requested", cell: (p) => <Time iso={p.createdAt} className="text-text-2" /> },
];
