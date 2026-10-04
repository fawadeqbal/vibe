"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowRight, Banknote, CreditCard, DollarSign, Flag, Gem, Sparkles, Timer, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Time } from "@/components/common/bits";
import { ErrorState, PageHeader } from "@/components/common/page";
import { StatCard } from "@/components/common/stat-card";
import { TimeSeriesChart } from "@/components/charts/time-series";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/controls";
import { useCan } from "@/features/auth/session";
import { api } from "@/lib/api/client";
import type { DashboardSummary, SeriesPoint } from "@/lib/api/types";
import { format } from "@/lib/format";
import { P } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const dashboardKeys = {
  summary: ["dashboard", "summary"] as const,
  series: (days: number) => ["dashboard", "series", days] as const,
};

export function DashboardPage() {
  const can = useCan();
  const [days, setDays] = React.useState(30);
  const summary = useQuery({ queryKey: dashboardKeys.summary, queryFn: ({ signal }) => api.get<DashboardSummary>("admin/dashboard/summary", undefined, signal), refetchInterval: 30_000 });
  const series = useQuery({ queryKey: dashboardKeys.series(days), queryFn: ({ signal }) => api.get<SeriesPoint[]>("admin/dashboard/series", { days }, signal) });
  const s = summary.data;
  const loading = summary.isLoading;

  if (summary.error) return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description={s ? <>Updated <Time iso={s.generatedAt} /> · live numbers are real-time</> : "How Vibe is doing right now."}
        actions={<Segmented value={days} onChange={setDays} options={[{ value: 7, label: "7 days" }, { value: 30, label: "30 days" }, { value: 90, label: "90 days" }]} />}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Online now"
          icon={Activity}
          tone="trust"
          loading={loading}
          value={format.number(s?.live.online)}
          hint={s && `${format.number(s.live.searching)} searching · ${format.number(s.live.calls)} in calls`}
          href={can(P.OpsLive) ? "/live" : undefined}
        />
        <StatCard label="New today" icon={UserPlus} tone="primary" loading={loading} value={format.number(s?.users.newToday)} hint={s && `${format.number(s.users.new7d)} in 7 days · ${format.compact(s.users.total)} total`} href="/users" />
        <StatCard label="Revenue today" icon={DollarSign} tone="money" loading={loading} value={format.usd(s?.revenue.todayUsd)} hint={s && `${format.usdRound(s.revenue.last30Usd)} in 30 days`} href={can(P.FinanceView) ? "/finance" : undefined} />
        <StatCard
          label="Open reports"
          icon={Flag}
          tone={s && s.queues.openReports > 0 ? "warn" : "neutral"}
          emphasis={!!s && s.queues.openReports > 0}
          loading={loading}
          value={format.number(s?.queues.openReports)}
          hint={s && `${format.number(s.queues.reportsToday)} new today`}
          href={can(P.ModerationView) ? "/moderation" : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Revenue" description={`Successful purchases per day, last ${days} days (USD)`} />
          <CardBody>
            <TimeSeriesChart data={series.data} loading={series.isLoading} kind="bar" series={[{ key: "revenueUsd", label: "Revenue", color: 1 }]} valueFormat={(n) => format.usd(n)} tickFormat={(n) => `$${format.compact(n)}`} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Growth" description={`Sign-ups and people who matched, per day`} />
          <CardBody>
            <TimeSeriesChart
              data={series.data}
              loading={series.isLoading}
              series={[
                { key: "matchers", label: "People who matched", color: 2 },
                { key: "signups", label: "Sign-ups", color: 1 },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Money · 30 days" />
          <CardBody className="space-y-0 divide-y divide-line py-1">
            <Metric icon={CreditCard} label="Paying people" value={format.number(s?.revenue.payers30)} sub={s && `ARPPU ${format.usd(s.revenue.arppuUsd)}`} />
            <Metric icon={Sparkles} label="VIP now" value={format.number(s?.revenue.vipActive)} sub={s && `${format.percent(s.revenue.vipShare)} of users`} />
            <Metric icon={Gem} label="Gifts sent" value={format.number(s?.gifts.last30Count)} sub={s && `${format.compact(s.gifts.last30Coins)} coins`} />
            <Metric icon={Banknote} label="Paid out" value={format.usd(s?.payouts.last30Usd)} sub={s && `${format.number(s.payouts.last30Count)} cash-outs`} />
            <Metric icon={DollarSign} label="Gems owed" value={format.usd(s?.liabilities.gemsUsd)} sub={s && `${format.compact(s.liabilities.gemsOutstanding)} gems unpaid`} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Matching · 7 days" />
          <CardBody className="space-y-0 divide-y divide-line py-1">
            <Metric icon={Users} label="Matches today" value={format.number(s?.matches.today)} sub={s && `${format.compact(s.matches.last7d)} in 7 days`} />
            <Metric icon={Timer} label="Average call" value={format.duration(s?.matches.avgSeconds)} />
            <Metric
              icon={AlertTriangle}
              label="Quick skips"
              value={format.percent(s?.matches.quickSkipRate)}
              sub="calls under 10 s"
              warn={!!s && s.matches.quickSkipRate > 0.6}
            />
            <Metric icon={Users} label="Active today" value={format.number(s?.users.activeToday)} sub={s && `${format.number(s.users.active7d)} in 7 days`} />
            <Metric icon={Flag} label="Banned now" value={format.number(s?.users.banned)} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Needs someone" description="Work queues across the team" />
          <CardBody className="space-y-2">
            <Queue href="/moderation" label="Reports to review" count={s?.queues.openReports} permission={can(P.ModerationView)} />
            <Queue href="/finance/cashouts?status=REVIEW" label="Cash-outs to approve" count={s?.queues.cashoutsReview} permission={can(P.FinanceView)} />
            <Queue href="/finance/cashouts?status=PROCESSING" label="Payouts stuck > 30 min" count={s?.queues.cashoutsStuck} permission={can(P.FinanceView)} danger />
            <Queue href="/finance/purchases?status=REQUIRES_ACTION" label="Payments waiting" count={s?.queues.pendingPurchases} permission={can(P.FinanceView)} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, sub, warn }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; sub?: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Icon className={cn("size-4 shrink-0 text-muted", warn && "text-warn")} />
      <span className="flex-1 text-sm text-text-2">{label}</span>
      <span className="text-right">
        <span className={cn("block text-sm font-semibold text-text tabular", warn && "text-warn")}>{value}</span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
    </div>
  );
}

function Queue({ href, label, count, permission, danger }: { href: string; label: string; count: number | undefined; permission: boolean; danger?: boolean }) {
  if (!permission) return null;
  const has = !!count && count > 0;
  return (
    <Link href={href} className={cn("flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-sm transition-colors hover:border-line-strong hover:bg-surface-2", has && (danger ? "border-bad/30 bg-bad-soft/40" : "border-warn/30 bg-warn-soft/40"))}>
      <span className="flex-1 text-text">{label}</span>
      <span className={cn("font-semibold tabular", has ? (danger ? "text-bad" : "text-warn") : "text-muted")}>{count ?? "—"}</span>
      <ArrowRight className="size-3.5 text-muted" />
    </Link>
  );
}
