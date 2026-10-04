"use client";

import { AlertCircle, Banknote, DollarSign, Undo2 } from "lucide-react";
import * as React from "react";

import { ErrorState, PageHeader } from "@/components/common/page";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status";
import { ShareBars } from "@/components/charts/time-series";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Segmented, Skeleton } from "@/components/ui/controls";
import { format } from "@/lib/format";

import { useFinanceSummary } from "./api";
import { productLabel } from "./columns";

export function FinancePage() {
  const [days, setDays] = React.useState(30);
  const q = useFinanceSummary(days);
  const s = q.data;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Revenue"
        description="Money in, refunds and money owed to people cashing out. Cached for 5 minutes."
        actions={<Segmented value={days} onChange={setDays} options={[{ value: 7, label: "7 days" }, { value: 30, label: "30 days" }, { value: 90, label: "90 days" }, { value: 365, label: "1 year" }]} />}
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Gross revenue" icon={DollarSign} tone="money" loading={q.isLoading} value={format.usd(s?.grossUsd)} />
        <StatCard label="Refunded" icon={Undo2} tone="info" loading={q.isLoading} value={format.usd(s?.refundsUsd)} hint={s && `${s.refundsCount} purchases`} href="/finance/purchases?status=REFUNDED" />
        <StatCard label="Failed payments" icon={AlertCircle} tone="bad" loading={q.isLoading} value={format.number(s?.failedCount)} href="/finance/purchases?status=FAILED" />
        <StatCard
          label="Owed to cash-outs"
          icon={Banknote}
          tone="warn"
          emphasis={!!s && s.payoutsPendingCount > 0}
          loading={q.isLoading}
          value={format.usd(s?.payoutsPendingUsd)}
          hint={s && `${s.payoutsPendingCount} waiting`}
          href="/finance/cashouts"
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="By payment method" />
          <CardBody>{!s ? <Skeleton className="h-40" /> : <ShareBars valueFormat={format.usd} items={s.byMethod.map((m) => ({ label: format.enum(m.method), value: m.usd, sub: `${m.count}×` }))} />}</CardBody>
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
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
