"use client";

import { ArrowLeft, Search } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Pager } from "@/components/common/pager";
import { ErrorState, PageHeader } from "@/components/common/page";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import type { MarketingReport } from "@/lib/api/types";
import { format } from "@/lib/format";

import { buttonLabel, countryName, mediumLabel, sourceLabel } from "./labels";
import { type ListKind, LISTS } from "./lists";
import { byResult, ButtonRow, ChannelHead, ChannelRows, CountryRow, PageRow } from "./marketing-page";
import { DaysSwitch, periodLabel, share, useDays, useMarketing } from "./shared";

/** "See all" for one list on the Marketing site page: the whole list, searchable, a page at a time. */
export function MarketingListPage({ kind }: { kind: ListKind }) {
  const [days, setDays] = useDays();
  const q = useMarketing(days);
  const [text, setText] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [size, setSize] = React.useState(20);
  const r = q.data;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const meta = LISTS[kind];
  const find = text.trim().toLowerCase();
  const has = (...xs: (string | null | undefined)[]) => !find || xs.some((x) => x?.toLowerCase().includes(find));

  const rows: { key: string; node: React.ReactNode }[] = [];
  let table: React.ReactNode = null;
  let count = 0;
  if (r) {
    const start = (page - 1) * size;
    if (kind === "channels") {
      const all = [...r.sources].sort(byResult).filter((s) => has(sourceLabel(s.source), s.source, mediumLabel(s.medium)));
      count = all.length;
      table = (
        <Table>
          <ChannelHead />
          <tbody>
            <ChannelRows rows={all.slice(start, start + size)} r={r} />
          </tbody>
        </Table>
      );
    } else if (kind === "campaigns") {
      const all = r.campaigns.filter((c) => has(c.campaign, sourceLabel(c.source)));
      count = all.length;
      table = (
        <Table>
          <thead>
            <Tr>
              <Th>Campaign</Th>
              <Th>Channel</Th>
              <Th className="text-right">Visits</Th>
              <Th className="text-right">Clicked to the app</Th>
              <Th className="text-right">Sign-ups</Th>
              <Th className="text-right">Of visits</Th>
            </Tr>
          </thead>
          <tbody>
            {all.slice(start, start + size).map((c) => (
              <Tr key={`${c.campaign}|${c.source}|${c.medium}`}>
                <Td className="font-medium">{c.campaign}</Td>
                <Td className="text-text-2">
                  {sourceLabel(c.source)} · {mediumLabel(c.medium)}
                </Td>
                <Td className="text-right tabular-nums">{format.number(c.visits)}</Td>
                <Td className="text-right tabular-nums">{format.number(c.clicked)}</Td>
                <Td className="text-right font-semibold tabular-nums">{format.number(c.signups)}</Td>
                <Td className="text-right tabular-nums">{share(c.signups, c.visits)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      );
    } else if (kind === "pages") {
      const all = r.pages.filter((p) => has(p.path));
      count = all.length;
      all.slice(start, start + size).forEach((p) => rows.push({ key: p.path, node: <PageRow p={p} /> }));
    } else if (kind === "buttons") {
      const all = r.buttons.filter((b) => has(buttonLabel(b.button), b.button, b.target));
      const max = Math.max(1, ...r.buttons.map((b) => b.clicks));
      count = all.length;
      all.slice(start, start + size).forEach((b) => rows.push({ key: b.button, node: <ButtonRow b={b} max={max} /> }));
    } else {
      const all = r.countries.filter((c) => has(countryName(c.country), c.country, ...c.regions.map((g) => g.name), ...r.cities.filter((x) => x.country === c.country).map((x) => x.city)));
      count = all.length;
      all.slice(start, start + size).forEach((c) =>
        rows.push({
          key: c.country,
          node: (
            <CountryRow c={c} total={r.totals.visitors}>
              <CityLine cities={r.cities.filter((x) => (x.country ?? "Unknown") === c.country)} />
            </CountryRow>
          ),
        }),
      );
    }
  }

  return (
    <div className="space-y-4">
      <Link href={`/marketing?days=${days}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" />
        Marketing site
      </Link>
      <PageHeader
        title={meta.title}
        description={`${meta.description} ${periodLabel(days)[0].toUpperCase()}${periodLabel(days).slice(1)}.`}
        actions={<DaysSwitch value={days} onChange={(d) => (setPage(1), setDays(d))} />}
      />
      <div className="max-w-sm">
        <Input
          leading={<Search className="size-4" />}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPage(1);
          }}
          placeholder="Search…"
          aria-label="Search this list"
        />
      </div>
      <Card className="overflow-hidden">
        {!r ? (
          <CardBody>
            <Skeleton className="h-64" />
          </CardBody>
        ) : count === 0 ? (
          <p className="p-6 text-center text-sm text-muted">{find ? "Nothing matches that search." : "Nothing in this period."}</p>
        ) : table ? (
          table
        ) : (
          <CardBody>
            <ul className="grid gap-4">
              {rows.map((x) => (
                <React.Fragment key={x.key}>{x.node}</React.Fragment>
              ))}
            </ul>
          </CardBody>
        )}
        {r && count > 0 ? (
          <Pager
            page={page}
            pageSize={size}
            total={count}
            onPage={setPage}
            onPageSize={(n) => {
              setSize(n);
              setPage(1);
            }}
            noun={kind === "countries" ? "countries" : kind}
          />
        ) : null}
      </Card>
    </div>
  );
}

function CityLine({ cities }: { cities: MarketingReport["cities"] }) {
  if (!cities.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {cities.map((c) => (
        <span key={c.city} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px]">
          {c.city} {c.visitors}
        </span>
      ))}
    </div>
  );
}
