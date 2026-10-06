"use client";

import { Banknote, DollarSign, Info, Scale, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { ErrorState, PageHeader } from "@/components/common/page";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status";
import { ShareBars, TimeSeriesChart } from "@/components/charts/time-series";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Segmented, Skeleton, Tooltip } from "@/components/ui/controls";
import type { FinanceDay, FinanceSummary } from "@/lib/api/types";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useFinanceSummary } from "./api";
import { productLabel } from "./columns";

/** A cost shown as a deduction: "−$12.00" (a negative cost reads "+$12.00"). */
const minus = (n: number) => (n === 0 ? format.usd(0) : `${n > 0 ? "−" : "+"}${format.usd(Math.abs(n))}`);
/** Money that can go either way: "+$12.00" / "−$12.00". */
const signed = (n: number) => (n === 0 ? format.usd(0) : `${n > 0 ? "+" : "−"}${format.usd(Math.abs(n))}`);
const axisUsd = (n: number) => `${n < 0 ? "−" : ""}$${format.compact(Math.abs(n))}`;
const pct = (n: number | null | undefined) => (n == null ? "—" : format.percent(n));

export function FinancePage() {
  const [days, setDays] = React.useState(30);
  const q = useFinanceSummary(days);
  const s = q.data;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const loss = !!s && s.profitUsd < 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Revenue and profit"
        description="Money in, what the stores keep, what we pay creators and partners, and whether we are in profit. Business days (Pakistan time), cached for 5 minutes."
        actions={<Segmented value={days} onChange={setDays} options={[{ value: 7, label: "7 days" }, { value: 30, label: "30 days" }, { value: 90, label: "90 days" }, { value: 365, label: "1 year" }]} />}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Gross sales" icon={DollarSign} tone="money" loading={q.isLoading} value={format.usd(s?.grossUsd)} hint={s && `${format.number(s.salesCount)} payments`} href="/finance/purchases" />
        <StatCard label="Net revenue" icon={Wallet} tone="info" loading={q.isLoading} value={format.usd(s?.netUsd)} hint="After refunds and store fees" />
        <StatCard
          label="Paid out"
          icon={Banknote}
          tone="warn"
          loading={q.isLoading}
          value={format.usd(s ? s.creatorPaidUsd + s.partnerPaidUsd : undefined)}
          hint={s && `Creators ${format.usd(s.creatorPaidUsd)} · partners ${format.usd(s.partnerPaidUsd)}`}
        />
        <StatCard
          label={loss ? "Loss" : "Profit"}
          icon={loss ? TrendingDown : TrendingUp}
          tone={loss ? "bad" : "ok"}
          emphasis={loss}
          loading={q.isLoading}
          value={<span className={cn(s && (loss ? "text-bad" : "text-ok"))}>{s ? signed(s.profitUsd) : "—"}</span>}
          hint={s && (s.margin == null ? "No sales in this period" : `${pct(s.margin)} of gross sales`)}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Profit and loss" description={s ? `Last ${days} days, since ${new Date(s.from).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : undefined} />
          <CardBody className="py-2">{!s ? <Skeleton className="my-2 h-72" /> : <Statement s={s} />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Still owed" description="Right now, whatever the period" />
          <CardBody className="py-2">{!s ? <Skeleton className="my-2 h-56" /> : <Owed s={s} />}</CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Money in and out per day" description="Net revenue against creator and partner payouts" />
          <CardBody>
            <TimeSeriesChart<FinanceDay>
              kind="bar"
              loading={q.isLoading}
              data={s?.series}
              valueFormat={format.usd}
              tickFormat={axisUsd}
              series={[
                { key: "netUsd", label: "Net revenue", color: 1 },
                { key: "paidOutUsd", label: "Paid out", color: 2 },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Running profit" description="Profit added up day by day; below zero means we are in loss for the period" />
          <CardBody>
            <TimeSeriesChart<FinanceDay> loading={q.isLoading} data={s?.series} valueFormat={signed} tickFormat={axisUsd} series={[{ key: "cumulativeProfitUsd", label: "Profit so far", color: 3 }]} />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="By payment method" description="Gross sales, fee rate" actions={<Link href="/economy" className="text-xs text-primary hover:underline">Fee rates</Link>} />
          <CardBody>
            {!s ? (
              <Skeleton className="h-40" />
            ) : (
              <ShareBars valueFormat={format.usd} items={s.byMethod.map((m) => ({ label: format.enum(m.method), value: m.usd, sub: `${m.count}× · fee ${pct(m.feeRate)}` }))} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="By product" />
          <CardBody>{!s ? <Skeleton className="h-40" /> : <ShareBars valueFormat={format.usd} items={s.byProduct.map((p) => ({ label: productLabel({ productType: p.productType as "COIN_PACK", productId: p.productId }), value: p.usd, sub: `${p.count}×` }))} />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Cash-outs requested" />
          <CardBody className="py-1">
            {!s ? (
              <Skeleton className="my-3 h-40" />
            ) : !s.payouts.length ? (
              <p className="py-6 text-center text-sm text-muted">No cash-outs in this period</p>
            ) : (
              <ul className="divide-y divide-line">
                {s.payouts.map((p) => (
                  <li key={p.status} className="flex items-center justify-between py-2.5 text-sm">
                    <StatusBadge status={p.status} />
                    <span className="text-text tabular">
                      {format.usd(p.usd)} <span className="text-xs text-muted">· {p.count}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {s && s.failedCount > 0 && (
              <Link href="/finance/purchases?status=FAILED" className="block border-t border-line py-2.5 text-xs text-muted hover:text-text">
                {format.number(s.failedCount)} failed payments in this period →
              </Link>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip content={<span className="block max-w-64">{children}</span>}>
      <Info className="ml-1 inline size-3.5 cursor-help align-[-2px] text-muted" aria-hidden />
    </Tooltip>
  );
}

function Line({ label, sub, value, kind = "minus", href, hint }: { label: React.ReactNode; sub?: React.ReactNode; value: string; kind?: "plus" | "minus" | "total" | "profit" | "loss"; href?: string; hint?: React.ReactNode }) {
  const strong = kind === "total" || kind === "profit" || kind === "loss";
  const name = href ? (
    <Link href={href} className="hover:underline">
      {label}
    </Link>
  ) : (
    label
  );
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-2 text-sm", strong && "border-t border-line font-semibold")}>
      <span className={cn("min-w-0", strong ? "text-text" : "text-text-2")}>
        {name}
        {hint && <Hint>{hint}</Hint>}
        {sub && <span className="ml-1.5 text-xs font-normal text-muted">{sub}</span>}
      </span>
      <span className={cn("shrink-0 tabular", kind === "profit" ? "text-ok" : kind === "loss" ? "text-bad" : kind === "minus" ? "text-text-2" : "text-text")}>{value}</span>
    </div>
  );
}

function Statement({ s }: { s: FinanceSummary }) {
  const rates = `Google Play and App Store ${pct(s.feeRates.store)}, JazzCash and Easypaisa ${pct(s.feeRates.wallet)}, cards ${pct(s.feeRates.card)}, bank ${pct(s.feeRates.bank)}. Change them under Economy → Fees we pay. Refunded sales get their fee back.`;
  const result = (n: number) => (n < 0 ? "loss" : "profit");
  return (
    <div>
      <Line kind="plus" label="Gross sales" sub={`${format.number(s.salesCount)} payments`} value={format.usd(s.grossUsd)} href="/finance/purchases" />
      <Line label="Refunds" sub={s.refundsCount ? `${s.refundsCount}` : undefined} value={minus(s.refundsUsd)} href="/finance/purchases?status=REFUNDED" />
      <Line label="Store and payment fees" sub="estimated" hint={rates} value={minus(s.feesUsd)} />
      <Line kind="total" label="Net revenue" value={format.usd(s.netUsd)} />
      <Line label="Creator cash-outs paid" sub={s.creatorPaidCount ? `${s.creatorPaidCount}` : undefined} hint="Gems turned into money and sent to people who received gifts." value={minus(s.creatorPaidUsd)} href="/finance/cashouts?status=PAID" />
      <Line label="Partner payouts paid" sub={s.partnerPaidCount ? `${s.partnerPaidCount}` : undefined} hint="Commission paid to creator partners (affiliates) for the people they brought in." value={minus(s.partnerPaidUsd)} href="/affiliate-payouts?status=PAID" />
      <Line kind={result(s.profitUsd)} label={s.profitUsd < 0 ? "Loss (cash)" : "Profit (cash)"} sub={s.margin == null ? undefined : `${pct(s.margin)} of gross`} value={signed(s.profitUsd)} />

      <p className="mt-4 mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
        <Scale className="size-3.5" /> Counting what was earned in this period, paid or not
        <Hint>Payouts lag behind sales: creators cash out when they reach the minimum, and partners after a hold. This view charges each period with what people earned in it, so it shows whether the business makes money, not just whether cash went out yet.</Hint>
      </p>
      <Line kind="total" label="Net revenue" value={format.usd(s.netUsd)} />
      <Line label="Gems given to creators" sub={`${format.number(s.earned.creatorGems)} gems at today's value`} hint="Gems received from gifts and bonuses. Each can become a cash-out." value={minus(s.earned.creatorUsd)} />
      <Line label="Partner commissions earned" hint="Commission created in this period, minus commission taken back for refunds." value={minus(s.earned.partnerUsd)} href="/affiliates" />
      <Line kind={result(s.earned.profitUsd)} label={s.earned.profitUsd < 0 ? "Loss after everything earned" : "Profit after everything earned"} sub={s.earned.margin == null ? undefined : `${pct(s.earned.margin)} of gross`} value={signed(s.earned.profitUsd)} />
    </div>
  );
}

function Owed({ s }: { s: FinanceSummary }) {
  const o = s.owed;
  return (
    <div>
      <Line kind="plus" label="Cash-outs waiting" sub={`${o.cashoutsCount}`} value={format.usd(o.cashoutsUsd)} href="/finance/cashouts" />
      <Line kind="plus" label="Partner balances" sub={o.partnerPayoutsRequested ? `${o.partnerPayoutsRequested} payout requested` : undefined} hint="Partner commission not paid yet: on hold, available, or in a payout request." value={format.usd(o.partnersUsd)} href="/affiliate-payouts" />
      <Line kind="plus" label="Gems people hold" sub={`${format.compact(o.gems)} gems · ${format.number(o.gemsHolders)} people`} hint="What every gem balance would cost if all of it were cashed out. Small balances under the cash-out minimum may never be." value={format.usd(o.gemsUsd)} />
      <Line kind="total" label="Total we could owe" value={format.usd(o.totalUsd)} />
    </div>
  );
}
