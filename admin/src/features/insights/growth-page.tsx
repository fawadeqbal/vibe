"use client";

import Link from "next/link";
import * as React from "react";

import { TimeSeriesChart } from "@/components/charts/time-series";
import { Time } from "@/components/common/bits";
import { ErrorState, PageHeader } from "@/components/common/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ClientSwitch, type ClientFilter, DaysSwitch, type GrowthReport, pct, ratio, type SourceRow, sourceLabel, useInsights } from "./shared";

type Step = {
  key: string;
  label: string;
  help: string;
  value: (r: SourceRow) => number;
  of?: (r: SourceRow) => number;
};

/** Every step against sign-ups (retention against those old enough). */
const STEPS: Step[] = [
  {
    key: "signups",
    label: "Signed up",
    help: "New accounts",
    value: (r) => r.signups,
  },
  {
    key: "setUp",
    label: "Set up profile",
    help: "Name, age and photo done",
    value: (r) => r.setUp,
  },
  {
    key: "firstCall",
    label: "Had a call",
    help: "Any call, ever",
    value: (r) => r.firstCall,
  },
  {
    key: "goodFirstCall",
    label: "Good first call",
    help: "A call of 1 minute or more within 2 days",
    value: (r) => r.goodFirstCall,
  },
  {
    key: "cameBack",
    label: "Came back next day",
    help: "Of those whose next day has started",
    value: (r) => r.cameBack,
    of: (r) => r.cameBackEligible,
  },
  {
    key: "week",
    label: "Still here a week later",
    help: "Used Vibe on days 7–13, of those at least a week old",
    value: (r) => r.week,
    of: (r) => r.weekEligible,
  },
  { key: "paid", label: "Paid", help: "Made a purchase", value: (r) => r.paid },
];

const shareOf = (s: Step, r: SourceRow) => ratio(s.value(r), s.of ? s.of(r) : r.signups);

/** A rate cell coloured against everyone's rate: clearly better green, clearly worse red. */
function RateCell({ v, avg, n }: { v: number | null; avg: number | null; n: number }) {
  const tone = v == null || avg == null || avg <= 0 || n < 5 ? "" : v >= avg * 1.2 ? "text-ok font-semibold" : v <= avg * 0.8 ? "text-bad" : "";
  return <Td className={cn("text-right tabular-nums", tone)}>{pct(v)}</Td>;
}

/** App and web side by side; accounts from before we recorded where they were made only when there are any. */
function signupSeries(client: ClientFilter, r: GrowthReport | undefined) {
  const app = { key: "app" as const, label: "App", color: 1 as const };
  const web = { key: "web" as const, label: "Web", color: 3 as const };
  if (client === "app") return [app];
  if (client === "web") return [web];
  return r?.daily.some((d) => d.other > 0) ? [app, web, { key: "other" as const, label: "Not recorded", color: 5 as const }] : [app, web];
}

/** Which sources bring people who stay and pay — per source, from visit to paying, and weekly retention. */
export function GrowthPage() {
  const [days, setDays] = React.useState(30);
  const [client, setClient] = React.useState<ClientFilter>("all");
  const q = useInsights<GrowthReport>("growth", days, client);
  const r = q.data;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const t = r?.total;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Growth"
        description={
          r ? (
            <>
              Which sources bring people who stay and pay · people who signed up in the last {days} days · updated <Time iso={r.generatedAt} />
            </>
          ) : (
            "Which sources bring people who stay and pay."
          )
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ClientSwitch value={client} onChange={setClient} />
            <DaysSwitch value={days} onChange={setDays} today={false} />
          </div>
        }
      />

      <Card>
        <CardHeader
          title={r ? `Sign-ups per day · ${format.number(r.total.signups)} in ${days} days` : "Sign-ups per day"}
          description={client === "all" ? "Where each new account was made: the Android app or the web." : `Only accounts made on the ${client === "app" ? "app" : "web"}.`}
        />
        <CardBody>
          <TimeSeriesChart data={r?.daily} loading={q.isLoading} height={220} series={signupSeries(client, r)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="From sign-up to paying" description="Each step as a share of sign-ups. The biggest drop is where to work next." />
        <CardBody>
          {t ? (
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
              {STEPS.map((s, i) => {
                const share = i === 0 ? 1 : shareOf(s, t);
                return (
                  <li key={s.key} className="rounded-lg border border-line bg-surface-2 p-3" title={s.help}>
                    <p className="text-xs text-muted">{s.label}</p>
                    <p className="mt-0.5 text-xl font-semibold tabular-nums">{format.number(s.value(t))}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                      <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.round((share ?? 0) * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-text-2 tabular-nums">{i === 0 ? "everyone" : pct(share)}</p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="h-28 animate-pulse rounded-lg bg-surface-2" />
          )}
          {t ? (
            <p className="mt-3 text-xs text-muted">
              Before sign-up: {format.number(t.visitors)} website visitors and {format.number(t.downloads)} Android downloads from the website.{" "}
              <Link href="/marketing" className="text-primary hover:underline">
                Website details →
              </Link>
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="By source"
          description="Where people came from: an invite, a creator partner, or the website visit (TikTok, Google…). Green = clearly better than average, red = clearly worse (sources with 5+ people)."
        />
        <CardBody className="overflow-x-auto p-0">
          <Table>
            <thead>
              <Tr>
                <Th>Source</Th>
                <Th className="text-right">Visitors</Th>
                <Th className="text-right">Downloads</Th>
                {STEPS.map((s) => (
                  <Th key={s.key} className="text-right" title={s.help}>
                    {s.label}
                  </Th>
                ))}
              </Tr>
            </thead>
            <tbody>
              {(r?.sources ?? []).map((row) => (
                <Tr key={row.source}>
                  <Td className="font-medium">{sourceLabel(row.source)}</Td>
                  <Td className="text-right tabular-nums">{format.number(row.visitors)}</Td>
                  <Td className="text-right tabular-nums">{format.number(row.downloads)}</Td>
                  {STEPS.map((s, i) =>
                    i === 0 ? (
                      <Td key={s.key} className="text-right font-semibold tabular-nums">
                        {format.number(row.signups)}
                      </Td>
                    ) : (
                      <RateCell key={s.key} v={shareOf(s, row)} avg={t ? shareOf(s, t) : null} n={s.of ? s.of(row) : row.signups} />
                    ),
                  )}
                </Tr>
              ))}
              {t ? (
                <Tr className="bg-surface-2/60">
                  <Td className="font-semibold">All</Td>
                  <Td className="text-right tabular-nums">{format.number(t.visitors)}</Td>
                  <Td className="text-right tabular-nums">{format.number(t.downloads)}</Td>
                  {STEPS.map((s, i) => (
                    <Td key={s.key} className="text-right font-semibold tabular-nums">
                      {i === 0 ? format.number(t.signups) : pct(shareOf(s, t))}
                    </Td>
                  ))}
                </Tr>
              ) : null}
            </tbody>
          </Table>
          {r && !r.sources.length ? <p className="p-4 text-sm text-muted">No sign-ups in this period yet.</p> : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Do people stay?"
          description="People grouped by the week they signed up: the share who used Vibe again 1 day, 1 week and 1 month later. Use it to see whether a release or a campaign helped."
        />
        <CardBody className="overflow-x-auto p-0">
          <Table>
            <thead>
              <Tr>
                <Th>Signed up the week of</Th>
                <Th className="text-right">People</Th>
                <Th className="text-right">Next day</Th>
                <Th className="text-right">Week later</Th>
                <Th className="text-right">Month later</Th>
              </Tr>
            </thead>
            <tbody>
              {(r?.cohorts ?? []).map((c) => (
                <Tr key={c.week}>
                  <Td>{format.date(c.week)}</Td>
                  <Td className="text-right tabular-nums">{format.number(c.signups)}</Td>
                  {[c.d1, c.d7, c.d30].map((v, i) => (
                    <Td key={i} className="text-right tabular-nums">
                      {v == null ? (
                        <span className="text-muted">too new</span>
                      ) : (
                        <span
                          className="inline-block min-w-12 rounded px-1.5 py-0.5"
                          style={{
                            background: `color-mix(in oklab, var(--chart-2) ${Math.round(v * 100)}%, transparent)`,
                          }}
                        >
                          {pct(v)}
                        </span>
                      )}
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </Table>
          {r && !r.cohorts.length ? <p className="p-4 text-sm text-muted">No sign-ups in the last 8 weeks.</p> : null}
        </CardBody>
      </Card>
    </div>
  );
}
