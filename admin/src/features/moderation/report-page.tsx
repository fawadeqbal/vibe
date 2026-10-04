"use client";

import { Ban, CheckCircle2, Lock, MessageSquareWarning, Video } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Time, UserCell } from "@/components/common/bits";
import { DescriptionList, EmptyState, ErrorState, PageHeader } from "@/components/common/page";
import { ReasonBadge, StatusBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Segmented, Skeleton } from "@/components/ui/controls";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { useCan } from "@/features/auth/session";
import { userKeys } from "@/features/users/api";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/api/client";
import type { ReportDetail } from "@/lib/api/types";
import { format } from "@/lib/format";
import { P } from "@/lib/permissions";
import { cn } from "@/lib/utils";

import { reportKeys, useReport } from "./api";

export function ReportPage({ id }: { id: string }) {
  const q = useReport(id);
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96" />;
  const r = q.data;

  return (
    <div>
      <PageHeader
        back={{ href: "/moderation", label: "Reports" }}
        title={
          <span className="flex items-center gap-2">
            Report about {r.reported.name || "a user"} <ReasonBadge reason={r.reason} />
          </span>
        }
        description={
          <>
            Filed <Time iso={r.createdAt} /> by {r.reporter.name || "someone"}
            {r.reviewedAt && (
              <>
                {" "}
                · reviewed <Time iso={r.reviewedAt} />
              </>
            )}
          </>
        }
        actions={<StatusBadge status={r.status} />}
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="What happened" />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs text-muted">Reported</p>
                  <UserCell user={r.reported} sub={r.reported.bannedUntil ? `Banned until ${format.dateTime(r.reported.bannedUntil)}` : `Joined ${format.date(r.reported.createdAt)}`} />
                </div>
                <div>
                  <p className="mb-1.5 text-xs text-muted">Reported by</p>
                  <UserCell user={r.reporter} sub={`Joined ${format.date(r.reporter.createdAt)}`} />
                </div>
              </div>
              <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-text">{r.note ? `“${r.note}”` : <span className="text-muted">No note — they picked “{format.enum(r.reason)}”.</span>}</div>
              {r.match ? (
                <DescriptionList
                  columns={3}
                  items={[
                    { label: "During a call", value: <span className="inline-flex items-center gap-1.5"><Video className="size-3.5 text-muted" /> <Time iso={r.match.startedAt} mode="dateTime" /></span> },
                    { label: "Call length", value: format.duration(r.match.seconds) },
                    { label: "Ended", value: r.match.endReason ? format.enum(r.match.endReason) : "—" },
                  ]}
                />
              ) : (
                <p className="text-xs text-muted">Reported outside a call (from a profile or chat).</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Chat between them" description="Friends' messages, most recent 50." actions={!r.canReadMessages ? <Lock className="size-4 text-muted" /> : undefined} />
            <CardBody>
              {!r.canReadMessages ? (
                <EmptyState icon={Lock} title="Reading chats needs the “Read chats” permission" className="py-8" />
              ) : !r.messages ? (
                <EmptyState title="They weren't friends" description="Video calls aren't recorded, so there is no transcript." className="py-8" />
              ) : !r.messages.length ? (
                <EmptyState title="No messages" className="py-8" />
              ) : (
                <ol className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {r.messages.map((m) => {
                    const fromReported = m.senderId === r.reported.id;
                    return (
                      <li key={m.id} className={cn("flex", fromReported ? "justify-start" : "justify-end")}>
                        <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm", fromReported ? "rounded-bl-sm bg-warn-soft text-text" : "rounded-br-sm bg-surface-2 text-text")}>
                          <p className="text-[11px] font-medium text-muted">{fromReported ? r.reported.name : r.reporter.name}</p>
                          <p className="whitespace-pre-wrap">{m.giftId ? `🎁 sent a ${m.giftId}` : m.text}</p>
                          <p className="mt-0.5 text-[10px] text-muted">{format.dateTime(m.createdAt)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Other reports about them" description={`${r.otherReports.length} shown · ${r.priorActioned} led to action before`} />
            <CardBody className="py-1">
              {!r.otherReports.length ? (
                <p className="py-4 text-sm text-muted">This is the only report.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {r.otherReports.map((o) => (
                    <li key={o.id}>
                      <Link href={`/moderation/${o.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                        <ReasonBadge reason={o.reason} />
                        <span className="min-w-0 flex-1 truncate text-sm text-text-2">{o.note ?? `by ${o.reporter.name}`}</span>
                        <StatusBadge status={o.status} />
                        <Time iso={o.createdAt} className="text-xs text-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5">
          <Decision report={r} />
          <Card>
            <CardBody>
              <Button asChild variant="secondary" className="w-full">
                <Link href={`/users/${r.reported.id}`}>Open {r.reported.name || "their"} profile</Link>
              </Button>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Decision({ report }: { report: ReportDetail }) {
  const can = useCan();
  const [action, setAction] = React.useState<"ban" | "warn" | "dismiss">("ban");
  const [hours, setHours] = React.useState(168);
  const [note, setNote] = React.useState("");
  const resolve = useAction(() => api.post<{ resolved: number }>(`admin/reports/${report.id}/resolve`, { action, hours: action === "ban" ? hours : undefined, note: action === "warn" ? note || undefined : undefined }), {
    success: (r) => (action === "dismiss" ? "Report dismissed" : `Done · ${r.resolved} report${r.resolved === 1 ? "" : "s"} closed`),
    invalidate: [reportKeys.all, userKeys.detail(report.reported.id)],
  });

  if (report.status !== "OPEN") {
    return (
      <Card>
        <CardBody className="flex items-center gap-3">
          <CheckCircle2 className="size-5 text-ok" />
          <p className="text-sm text-text">
            Resolved as <span className="font-medium">{format.enum(report.status).toLowerCase()}</span> <Time iso={report.reviewedAt} />.
          </p>
        </CardBody>
      </Card>
    );
  }
  if (!can(P.ModerationResolve)) return null;

  return (
    <Card>
      <CardHeader title="Decision" description="Warn and ban close every open report about this person." />
      <CardBody className="space-y-4">
        <Segmented
          value={action}
          onChange={setAction}
          className="w-full [&>button]:flex-1"
          options={[
            { value: "ban", label: "Ban" },
            { value: "warn", label: "Warn" },
            { value: "dismiss", label: "Dismiss" },
          ]}
        />
        {action === "ban" && (
          <Segmented value={hours} onChange={setHours} className="w-full [&>button]:flex-1" options={[{ value: 24, label: "1 day" }, { value: 168, label: "7 days" }, { value: 720, label: "30 days" }, { value: 87_600, label: "Forever" }]} />
        )}
        {action === "warn" && (
          <Field label="Message they'll see" optional>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={300} placeholder="People reported your behaviour. Please follow the community guidelines, or your account may be paused." />
          </Field>
        )}
        <p className="text-xs text-muted">
          {action === "ban"
            ? "They're disconnected at once and can't use Vibe until the ban ends."
            : action === "warn"
              ? "Shown in the app right away if they're online."
              : "Closes this report only. Nobody is told."}
        </p>
        <Button className="w-full" variant={action === "ban" ? "danger" : "primary"} loading={resolve.isPending} onClick={() => resolve.mutate()}>
          {action === "ban" ? <Ban /> : action === "warn" ? <MessageSquareWarning /> : <CheckCircle2 />}
          {action === "ban" ? `Ban ${({ 24: "for 1 day", 168: "for 7 days", 720: "for 30 days" } as Record<number, string>)[hours] ?? "permanently"}` : action === "warn" ? "Send warning" : "Dismiss report"}
        </Button>
      </CardBody>
    </Card>
  );
}
