"use client";

import { Ban, CheckCircle2, Copy, Mail, MailX, MessageSquare, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Time, UserCell } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { DescriptionList, ErrorState, PageHeader } from "@/components/common/page";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { FilterBar } from "@/components/data-table/filters";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Segmented, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/api/client";
import type { Campaign, Delivery } from "@/lib/api/types";
import { format } from "@/lib/format";

import { messagingKeys, useCampaign, useDeliveries, useMessagePreview } from "./api";
import { EmailPreview, InAppPreview } from "./email-preview";
import { Channels, Progress, audienceLabel } from "./messages-page";

export function MessageDetail({ id }: { id: string }) {
  const q = useCampaign(id);
  const confirm = useConfirm();
  const cancel = useAction(() => api.post(`admin/messages/${id}/cancel`), {
    success: "Stopped",
    invalidate: [messagingKeys.campaign(id), ["messaging", "campaigns"]],
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const c = q.data;
  if (!c)
    return (
      <div className="space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-28" />
        <Skeleton className="h-96" />
      </div>
    );
  const running = c.status === "QUEUED" || c.status === "SENDING";

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/messages", label: "Messages" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.name} <StatusBadge status={c.status} />
          </span>
        }
        description={
          <>
            Created by {c.createdBy} <Time iso={c.createdAt} />
            {c.finishedAt && (
              <>
                {" "}
                · finished <Time iso={c.finishedAt} />
              </>
            )}
          </>
        }
        actions={
          <>
            <Button asChild>
              <Link href={`/messages/new?copy=${c.id}`}>
                <Copy /> Send again
              </Link>
            </Button>
            {running && (
              <Button
                variant="danger"
                loading={cancel.isPending}
                onClick={() =>
                  void confirm({
                    title: "Stop sending?",
                    description: `${format.number(c.processed)} of ${format.number(c.total)} people already have it. Nobody else will get it.`,
                    confirmLabel: "Stop",
                    tone: "danger",
                    action: () => cancel.mutateAsync(),
                  })
                }
              >
                <Ban /> Stop
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Progress c={c} className="[&>span:first-child]:w-56" />
          <Channels c={c} />
          <span className="text-sm text-text-2">To: {audienceLabel(c)}</span>
          {c.lastError && <span className="text-sm text-bad">{c.lastError}</span>}
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="People" icon={Users} value={format.number(c.total)} hint={`${format.number(c.processed)} done`} />
        <StatCard label="In-app delivered" icon={MessageSquare} tone="primary" value={c.sendInApp ? format.number(c.inAppSent) : "—"} hint={c.sendInApp ? "in their Vibe inbox" : "not sent in-app"} />
        <StatCard
          label="E-mails sent"
          icon={Mail}
          tone="trust"
          value={c.sendEmail ? format.number(c.emailSent) : "—"}
          hint={c.sendEmail ? (c.emailFailed ? `${format.number(c.emailFailed)} failed` : "none failed") : "not sent by e-mail"}
        />
        <StatCard label="Not e-mailed" icon={MailX} tone={c.emailSkipped ? "warn" : "neutral"} value={c.sendEmail ? format.number(c.emailSkipped) : "—"} hint="no address or turned off updates" />
      </div>

      <Tabs defaultValue="people">
        <TabsList>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="content">What was sent</TabsTrigger>
        </TabsList>
        <div className="pt-4">
          <TabsContent value="people">
            <DeliveriesTable c={c} />
          </TabsContent>
          <TabsContent value="content">
            <SentContent c={c} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function DeliveriesTable({ c }: { c: Campaign }) {
  const [status, setStatus] = React.useState("");
  const list = useDeliveries(c.id, { status });
  const columns: Column<Delivery>[] = [
    {
      id: "user",
      header: "Person",
      cell: (d) => <UserCell user={d.user} size={28} sub={d.email ?? undefined} />,
      className: "min-w-52",
    },
    {
      id: "status",
      header: c.sendEmail ? "E-mail" : "Status",
      cell: (d) => <StatusBadge status={d.status} />,
    },
    {
      id: "why",
      header: "Note",
      cell: (d) => <span className="text-sm text-text-2">{d.error ?? <span className="text-muted">—</span>}</span>,
      className: "max-w-80 truncate",
    },
    {
      id: "at",
      header: "When",
      cell: (d) => <Time iso={d.createdAt} className="text-text-2" />,
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={list.rows}
      getRowId={(d) => d.id}
      loading={list.isLoading}
      error={list.error}
      onRetry={list.refetch}
      hasMore={list.hasNextPage}
      loadingMore={list.isFetchingNextPage}
      onLoadMore={list.fetchNextPage}
      empty={{
        icon: CheckCircle2,
        title: status ? "Nobody here" : c.status === "QUEUED" ? "Starting soon" : "Nobody reached yet",
      }}
      toolbar={
        <FilterBar>
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: "", label: "Everyone" },
              { value: "SENT", label: "Sent" },
              { value: "FAILED", label: "Failed" },
              { value: "SKIPPED", label: "Not e-mailed" },
            ]}
          />
        </FilterBar>
      }
    />
  );
}

function SentContent({ c }: { c: Campaign }) {
  const preview = useMessagePreview(
    {
      subject: c.subject,
      preheader: c.preheader,
      heading: c.heading,
      body: c.body,
      buttonLabel: c.buttonLabel,
      buttonUrl: c.buttonUrl,
      footer: c.footer,
    },
    c.picked?.[0]?.id,
  );
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      {c.sendEmail ? <EmailPreview rendered={preview.data?.email} loading={preview.isFetching} preheader={c.preheader} /> : <Card className="p-6 text-sm text-muted">Not sent by e-mail.</Card>}
      <div className="space-y-4">
        {c.sendInApp && <InAppPreview message={preview.data?.inApp} />}
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DescriptionList
              columns={1}
              items={[
                {
                  label: "Template",
                  value: c.templateKey ?? "Written from scratch",
                },
                {
                  label: "Important",
                  value: c.important ? "Yes — sent even to people who turned off e-mail updates" : "No",
                },
                {
                  label: "Filters",
                  value: c.segment ? segmentSummary(c.segment) : "—",
                  hidden: c.audience !== "SEGMENT",
                },
                {
                  label: "Started",
                  value: <Time iso={c.startedAt} mode="dateTime" />,
                },
              ]}
            />
            {!!c.picked?.length && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-muted">
                  Picked people
                  {c.picked.length > 20 ? ` (first 20 of ${format.number(c.picked.length)})` : ""}
                </p>
                {c.picked.slice(0, 20).map((p) => (
                  <UserCell key={p.id} user={p} size={24} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export function segmentSummary(s: NonNullable<Campaign["segment"]>): string {
  const parts: string[] = [];
  if (s.vip !== undefined) parts.push(s.vip ? "VIP" : "Not VIP");
  if (s.gender) parts.push(format.enum(s.gender));
  if (s.verified !== undefined) parts.push(s.verified ? "Verified" : "Not verified");
  if (s.countries?.length) parts.push(s.countries.join(", "));
  if (s.activeWithinDays) parts.push(`Active in last ${s.activeWithinDays} days`);
  if (s.joinedAfter) parts.push(`Joined after ${format.date(s.joinedAfter)}`);
  if (s.joinedBefore) parts.push(`Joined before ${format.date(s.joinedBefore)}`);
  return parts.join(" · ") || "Everyone";
}
