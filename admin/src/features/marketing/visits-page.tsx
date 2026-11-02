"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Pager } from "@/components/common/pager";
import { ErrorState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/controls";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import type { MarketingVisitsPage } from "@/lib/api/types";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";

import { buttonLabel, DID_LABELS, placeLabel, sourceLabel, type VisitOutcome } from "./labels";
import { DaysSwitch, periodLabel, useDays } from "./shared";

const FILTERS: { key: VisitOutcome | "all"; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "signed_up", label: "Signed up" },
  { key: "clicked", label: "Clicked to the app" },
  { key: "reading", label: "Reading now" },
  { key: "left", label: "Left" },
];

const DEVICE = (v: { device: string; os: string; browser: string }) =>
  [v.device === "phone" ? "Phone" : v.device === "computer" ? "Computer" : v.device === "tablet" ? "Tablet" : v.device, v.os, v.browser].filter(Boolean).join(" · ");

/** Marketing site → See all visits: every visit in the period, newest first, filtered and a page at a time. */
export function MarketingVisitsPage() {
  const [days, setDays] = useDays();
  const [page, setPage] = React.useState(1);
  const [size, setSize] = React.useState(20);
  const [did, setDid] = React.useState<VisitOutcome | "all">("all");
  const [source, setSource] = React.useState("");
  const [text, setText] = React.useState("");
  const [search, setSearch] = React.useState("");

  // Search after a short pause in typing.
  React.useEffect(() => {
    const t = setTimeout(() => {
      setSearch(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [text]);

  const params = { days, page, pageSize: size, ...(did !== "all" ? { did } : {}), ...(source ? { source } : {}), ...(search ? { q: search } : {}) };
  const q = useQuery({
    queryKey: ["dashboard", "marketing", "visits", params],
    queryFn: ({ signal }) => api.get<MarketingVisitsPage>("admin/dashboard/marketing/visits", params, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const r = q.data;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <div className="space-y-4">
      <Link href={`/marketing?days=${days}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" />
        Marketing site
      </Link>
      <PageHeader
        title="All visits"
        description={`Every visit to the website in ${periodLabel(days)}, newest first.`}
        actions={
          <DaysSwitch
            value={days}
            onChange={(d) => {
              setPage(1);
              setDays(d);
            }}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-[1_1_240px] sm:max-w-sm">
          <Input leading={<Search className="size-4" />} value={text} onChange={(e) => setText(e.target.value)} placeholder="City, country code or page…" aria-label="Search visits" maxLength={80} />
        </div>
        <NativeSelect
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPage(1);
          }}
          className="w-44"
          aria-label="Channel"
        >
          <option value="">All channels</option>
          {(r?.sources ?? []).map((s) => (
            <option key={s} value={s}>
              {sourceLabel(s)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div role="group" aria-label="What they did" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const on = did === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setDid(f.key);
                setPage(1);
              }}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                on ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-text-2 hover:text-text",
              )}
            >
              {f.label}
              {r ? <span className="tabular-nums opacity-70">{format.number(r.counts[f.key])}</span> : null}
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        {!r ? (
          <CardBody>
            <Skeleton className="h-80" />
          </CardBody>
        ) : r.items.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">{r.total === 0 && did === "all" && !source && !search ? "No visits in this period." : "No visits match these filters."}</p>
        ) : (
          <Table className={cn(q.isFetching && "opacity-70 transition-opacity")}>
            <thead>
              <Tr>
                <Th className="hidden sm:table-cell">When</Th>
                <Th>Where</Th>
                <Th className="hidden md:table-cell">Channel</Th>
                <Th className="hidden md:table-cell">Landed on</Th>
                <Th className="hidden text-right lg:table-cell">Pages · time</Th>
                <Th className="text-right">What they did</Th>
              </Tr>
            </thead>
            <tbody>
              {r.items.map((v, i) => (
                <Tr key={`${v.startedAt}|${i}`}>
                  <Td className="hidden whitespace-nowrap text-text-2 sm:table-cell" title={new Date(v.at).toLocaleString()}>
                    {format.ago(v.at)}
                  </Td>
                  <Td>
                    <div className="font-medium">{placeLabel(v)}</div>
                    <div className="hidden text-xs text-muted sm:block">
                      {DEVICE(v)}
                      <span className="md:hidden"> · {sourceLabel(v.source)}</span>
                    </div>
                    {/* Phones: when and from where, under the place. */}
                    <div className="text-xs text-muted sm:hidden">
                      {format.ago(v.at)} · {sourceLabel(v.source)}
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <div>{sourceLabel(v.source)}</div>
                    {v.campaign ? <div className="text-xs text-muted">“{v.campaign}”</div> : null}
                  </Td>
                  <Td className="hidden max-w-56 truncate font-mono text-xs text-text-2 md:table-cell" title={v.path}>
                    {v.path}
                  </Td>
                  <Td className="hidden text-right whitespace-nowrap text-text-2 tabular-nums lg:table-cell">
                    {v.pages} · {v.seconds ? format.duration(v.seconds) : "—"}
                  </Td>
                  <Td className="text-right">
                    <Badge tone={DID_LABELS[v.did].tone} title={v.did === "clicked" && v.button ? buttonLabel(v.button) : undefined}>
                      {DID_LABELS[v.did].label}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {r && r.total > 0 ? (
          <Pager
            page={r.page}
            pageSize={r.pageSize}
            total={r.total}
            onPage={setPage}
            onPageSize={(n) => {
              setSize(n);
              setPage(1);
            }}
            sizes={[20, 50, 100]}
            noun="visits"
          />
        ) : null}
      </Card>
    </div>
  );
}
