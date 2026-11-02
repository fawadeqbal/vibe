"use client";

import * as React from "react";

import { ShareBars } from "@/components/charts/time-series";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { productLabel } from "@/features/finance/columns";
import { format } from "@/lib/format";

import { ClientSwitch, type ClientFilter, Delta, KpiCard, type MoneyReport, pct, useInsights } from "./shared";

/** Money → Revenue: who pays, how much, how soon, and what sells. */
export function MoneyInsights({ days }: { days: number }) {
  const window = Math.min(90, days);
  const [client, setClient] = React.useState<ClientFilter>("all");
  const q = useInsights<MoneyReport>("money", window, client);
  const r = q.data;
  const total = r?.products.reduce((n, p) => n + p.revenueUsd, 0) ?? 0;
  return (
    <Card>
      <CardHeader
        title="Who pays"
        description={`People who paid in the last ${window} days, against everyone active then.${days > 90 ? " (Up to 90 days.)" : ""}`}
        actions={<ClientSwitch value={client} onChange={setClient} />}
      />
      <CardBody className="space-y-4">
        {q.error ? (
          <p className="text-sm text-bad">Couldn&apos;t load these numbers.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <KpiCard
              label="People who pay"
              help="Paying people as a share of everyone who used Vibe in the period."
              loading={q.isLoading}
              value={pct(r?.payingShare)}
              sub={r && `${format.number(r.payers)} of ${format.number(r.activePeople)} active people`}
              status={r?.payingShare == null ? null : r.payingShare >= 0.03 ? "good" : r.payingShare >= 0.01 ? "warn" : "bad"}
            />
            <KpiCard label="Spend per paying person" loading={q.isLoading} value={format.usd(r?.arppuUsd)} sub={r && `${format.number(r.purchases)} purchases`} />
            <KpiCard label="Revenue" loading={q.isLoading} value={format.usd(r?.revenueUsd)} delta={r && <Delta cur={r.revenueUsd} prev={r.previousRevenueUsd} label={`previous ${window} days`} />} />
            <KpiCard
              label="First-time payers"
              help="People whose very first purchase was in this period, and how many days after signing up (median)."
              loading={q.isLoading}
              value={format.number(r?.firstTimePayers)}
              sub={r && (r.medianDaysToFirstPurchase == null ? "no first purchases yet" : `${r.medianDaysToFirstPurchase} days after sign-up (median)`)}
            />
            <KpiCard
              label="Bought again"
              help="Paying people who made two or more purchases in the period."
              loading={q.isLoading}
              value={pct(r && r.payers ? r.repeatPayers / r.payers : null)}
              sub={r && `${format.number(r.repeatPayers)} people`}
            />
          </div>
        )}
        {r?.products.length ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted">What sells (share of revenue)</p>
            <ShareBars
              items={r.products.map((p) => ({
                label: productLabel({
                  productType: p.type as "COIN_PACK" | "VIP_PLAN",
                  productId: p.productId,
                }),
                value: total ? p.revenueUsd / total : 0,
                sub: `${format.usd(p.revenueUsd)} · ${format.number(p.purchases)} sold`,
              }))}
              valueFormat={(n) => format.percent(n)}
            />
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
