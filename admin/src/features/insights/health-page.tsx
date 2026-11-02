"use client";

import { AlertTriangle, ArrowRight, Info, Lightbulb, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { TimeSeriesChart } from "@/components/charts/time-series";
import { Time } from "@/components/common/bits";
import { ErrorState, PageHeader } from "@/components/common/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ClientSwitch, type ClientFilter, DaysSwitch, Delta, type HealthReport, KpiCard, pct, ratio, useInsights } from "./shared";

/** Up, flat or a little down = green; down 5–20% = amber; down more = red. */
const trend = (cur: number, prev: number): "good" | "warn" | "bad" | null => {
  if (!prev) return null;
  const c = (cur - prev) / prev;
  return c >= -0.05 ? "good" : c >= -0.2 ? "warn" : "bad";
};

/**
 * The Dashboard as one answer: is Vibe healthy? Five numbers against the
 * period before, what needs someone now, and what the numbers mean.
 */
export function HealthPage() {
  const [days, setDays] = React.useState(7);
  const [client, setClient] = React.useState<ClientFilter>("all");
  const q = useInsights<HealthReport>("health", days, client);
  const r = q.data;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const c = r?.current;
  const p = r?.previous;
  const vs = days === 1 ? "yesterday" : `previous ${days} days`;
  const d1 = c ? ratio(c.cameBack, c.cameBackEligible) : null;
  const d1Prev = p ? ratio(p.cameBack, p.cameBackEligible) : null;
  const firstShare = c ? ratio(c.goodFirstCall, c.signups) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description={
          r ? (
            <>
              Is Vibe healthy? {days === 1 ? "Today" : `Last ${days} days`} against the {vs} · updated <Time iso={r.generatedAt} />
            </>
          ) : (
            "Is Vibe healthy? Five numbers, what needs you, and what they mean."
          )
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ClientSwitch value={client} onChange={setClient} />
            <DaysSwitch value={days} onChange={setDays} />
          </div>
        }
      />

      {r?.attention.length ? (
        <div role="alert" className="rounded-xl border border-warn/40 bg-warn-soft/40 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text">
            <AlertTriangle className="size-4 text-warn" aria-hidden /> Needs someone
          </p>
          <ul className="flex flex-wrap gap-2">
            {r.attention.map((a) => (
              <li key={a.key}>
                <Link
                  href={a.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border bg-surface px-2.5 py-1.5 text-xs font-medium hover:border-line-strong",
                    a.tone === "bad" ? "border-bad/40 text-bad" : "border-line text-text",
                  )}
                >
                  {a.text} <ArrowRight className="size-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Good calls"
          help="Calls that lasted at least a minute: the conversations Vibe is for."
          loading={q.isLoading}
          value={format.number(c?.goodCalls)}
          sub="calls of 1 minute or more"
          status={c && p ? trend(c.goodCalls, p.goodCalls) : null}
          delta={c && p && <Delta cur={c.goodCalls} prev={p.goodCalls} label={vs} />}
        />
        <KpiCard
          label="Active people per day"
          help="People who used Vibe (or had a call) on a day, averaged over the days."
          loading={q.isLoading}
          value={format.number(c?.active)}
          sub={client === "all" ? "app and web" : client === "app" ? "in the app" : "on the web"}
          status={c && p ? trend(c.active, p.active) : null}
          delta={c && p && <Delta cur={c.active} prev={p.active} label={vs} />}
        />
        <KpiCard
          label="New people with a good first call"
          help="Of the people who signed up, how many had a call of a minute or more within 2 days."
          loading={q.isLoading}
          value={format.number(c?.goodFirstCall)}
          sub={c && `${pct(firstShare)} of ${format.number(c.signups)} sign-ups`}
          status={firstShare == null ? null : firstShare >= 0.5 ? "good" : firstShare >= 0.3 ? "warn" : "bad"}
          delta={c && p && <Delta cur={c.goodFirstCall} prev={p.goodFirstCall} label={vs} />}
        />
        <KpiCard
          label="Came back the next day"
          help="Of the new people whose next day has started, how many used Vibe again that day."
          loading={q.isLoading}
          value={pct(d1)}
          sub={c && (c.cameBackEligible ? `${format.number(c.cameBack)} of ${format.number(c.cameBackEligible)} new people` : "needs a full day first")}
          status={d1 == null ? null : d1 >= 0.3 ? "good" : d1 >= 0.15 ? "warn" : "bad"}
          delta={d1 != null && d1Prev != null && <Delta cur={Math.round(d1 * 1000)} prev={Math.round(d1Prev * 1000)} label={vs} />}
        />
        <KpiCard
          label="Revenue"
          loading={q.isLoading}
          value={format.usd(c?.revenueUsd)}
          sub="paid purchases"
          status={c && p ? trend(c.revenueUsd, p.revenueUsd) : null}
          delta={c && p && <Delta cur={c.revenueUsd} prev={p.revenueUsd} label={vs} />}
        />
      </div>

      <Card>
        <CardHeader title="What this means" description="Read from the numbers on this page, Matching and Growth. Updated every minute." />
        <CardBody>
          {q.isLoading ? (
            <p className="text-sm text-muted">Reading the numbers…</p>
          ) : r?.notes.length ? (
            <ul className="space-y-2">
              {r.notes.map((n) => {
                const Icon = n.tone === "good" ? ThumbsUp : n.tone === "bad" ? ThumbsDown : Lightbulb;
                return (
                  <li key={n.text} className="flex items-start gap-2.5 text-sm">
                    <Icon className={cn("mt-0.5 size-4 shrink-0", n.tone === "good" ? "text-ok" : n.tone === "bad" ? "text-bad" : "text-info")} aria-hidden />
                    <span>{n.text}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-text-2">
              <Info className="size-4 text-muted" aria-hidden /> Nothing stands out — the numbers are steady.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Good calls per day" />
          <CardBody>
            <TimeSeriesChart kind="bar" data={r?.daily} loading={q.isLoading} height={180} series={[{ key: "goodCalls", label: "Good calls", color: 1 }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Active people per day" />
          <CardBody>
            <TimeSeriesChart data={r?.daily} loading={q.isLoading} height={180} series={[{ key: "active", label: "Active people", color: 2 }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Sign-ups per day"
            actions={
              <Link href="/growth" className="text-xs font-medium text-primary hover:underline">
                Where they come from →
              </Link>
            }
          />
          <CardBody>
            <TimeSeriesChart kind="bar" data={r?.daily} loading={q.isLoading} height={180} series={[{ key: "signups", label: "Sign-ups", color: 3 }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Revenue per day"
            actions={
              <Link href="/finance" className="text-xs font-medium text-primary hover:underline">
                Money details →
              </Link>
            }
          />
          <CardBody>
            <TimeSeriesChart kind="bar" data={r?.daily} loading={q.isLoading} height={180} valueFormat={(n) => format.usd(n)} series={[{ key: "revenueUsd", label: "Revenue", color: 4 }]} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
