"use client";

import Link from "next/link";

import { TimeSeriesChart } from "@/components/charts/time-series";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { format } from "@/lib/format";

import { type AdsReport, Delta, KpiCard, pct, ratio, useInsights } from "./shared";

/** Ad earnings are fractions of a cent per view: show enough digits to see them. */
const tinyUsd = (n: number | null | undefined) => (n == null ? "—" : n >= 1 ? format.usd(n) : `$${n.toFixed(4)}`);
const PLATFORM: Record<string, string> = { web: "Website", android: "Android app", ios: "iPhone app", app: "App (older builds)" };

/** Finance → Store videos: started → watched → paid, coins given away, what the ad network says we earned. */
export function AdsInsights({ days }: { days: number }) {
  const window = Math.min(90, days);
  const q = useInsights<AdsReport>("ads", window);
  const r = q.data;
  return (
    <Card>
      <CardHeader
        title="Store videos"
        description={`"Watch a short video" in the Store, last ${window} days. Earnings are the ad network's own estimate per view; the payout in Monetag is final.`}
        actions={
          <Link href="/settings" className="text-xs font-medium text-primary hover:underline">
            Settings → Ads
          </Link>
        }
      />
      <CardBody className="space-y-4">
        {q.error ? (
          <p className="text-sm text-bad">Couldn&apos;t load these numbers.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <KpiCard
              label="Estimated earnings"
              loading={q.isLoading}
              value={tinyUsd(r?.estimatedUsd)}
              sub={r && (r.watched ? `${tinyUsd(r.estimatedUsd / r.watched)} per watched video` : "no videos watched yet")}
              delta={r && <Delta cur={r.estimatedUsd} prev={r.previousEstimatedUsd} label={`previous ${window} days`} />}
            />
            <KpiCard label="Videos watched" help="Confirmed by the ad network (postback)." loading={q.isLoading} value={format.number(r?.watched)} sub={r && `${format.number(r.people)} people`} />
            <KpiCard
              label="Finished"
              help="Watched to the end, out of every video started. Low = ads failing to load, ad blockers, or people closing early."
              loading={q.isLoading}
              value={pct(r && ratio(r.watched, r.started))}
              sub={r && `${format.number(r.started)} started`}
              status={!r || !r.started ? null : r.watched / r.started >= 0.6 ? "good" : r.watched / r.started >= 0.3 ? "warn" : "bad"}
            />
            <KpiCard label="Coins given" loading={q.isLoading} value={format.number(r?.coinsGiven)} sub={r && `${format.number(r.paid)} videos paid`} />
            <KpiCard
              label="Unpaid by the network"
              help="Views Monetag marked non_valued (fallback or suspicious traffic): no money for us. Settings → Ads decides whether they still give coins."
              loading={q.isLoading}
              value={pct(r && ratio(r.unpaidByNetwork, r.watched))}
              sub={r && `${format.number(r.unpaidByNetwork)} views`}
              status={!r || !r.watched ? null : r.unpaidByNetwork / r.watched <= 0.2 ? "good" : r.unpaidByNetwork / r.watched <= 0.5 ? "warn" : "bad"}
            />
          </div>
        )}
        <TimeSeriesChart
          kind="bar"
          data={r?.daily}
          loading={q.isLoading}
          height={180}
          series={[
            { key: "started", label: "Started", color: 3 },
            { key: "watched", label: "Watched", color: 1 },
          ]}
        />
        {r?.byPlatform.length ? (
          <ul className="grid gap-2 sm:grid-cols-3">
            {r.byPlatform.map((p) => (
              <li key={p.platform} className="rounded-lg border border-line px-3 py-2 text-sm">
                <p className="font-medium text-text">{PLATFORM[p.platform] ?? p.platform}</p>
                <p className="text-xs text-muted">
                  {format.number(p.paid)} paid of {format.number(p.started)} · {tinyUsd(p.estimatedUsd)}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </CardBody>
    </Card>
  );
}
