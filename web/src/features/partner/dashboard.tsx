"use client";

import { useState } from "react";

import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tag } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { SectionTitle } from "@/components/ui/typography";
import { type AffiliateOverview, type ChartMetric, type Commission, type CommissionStatus, payoutBlock, sourceLabel, STATS_RANGES, usdCents } from "@/lib/affiliate";
import type { Tone } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { ago, date, thousands } from "@/lib/format";
import { useAffiliate } from "@/stores/affiliate";

import { LinkBuilder } from "./link-builder";
import { PayoutList, payoutSentToast, requestPartnerPayout } from "./payouts";
import { StatsChart } from "./stats-chart";

const METRICS: { value: ChartMetric; label: string }[] = [
  { value: "clicks", label: "Clicks" },
  { value: "signups", label: "Sign-ups" },
  { value: "qualified", label: "Active users" },
  { value: "earnedUsdCents", label: "Earnings" },
];

/** ACTIVE (and SUSPENDED, read-only) partners: link, money, stats, commissions, payouts. */
export function PartnerDashboard({ ov }: { ov: AffiliateOverview }) {
  const a = ov.affiliate!;
  const b = ov.balance!;
  const active = ov.status === "ACTIVE";
  const block = payoutBlock(ov);
  const payouts = useAffiliate((s) => s.payouts);

  const cashOut = async () => {
    const p = await requestPartnerPayout(b.availableUsdCents);
    if (p) payoutSentToast(p);
  };

  return (
    <>
      {active ? (
        <>
          <SectionTitle text="Your link" top={22} />
          <LinkBuilder link={a.link} code={a.code} />
        </>
      ) : null}

      <SectionTitle text="Earnings" note="USD" top={26} />
      <div className="grid grid-cols-2 gap-2.5">
        <Money label="Available" cents={b.availableUsdCents} hint="Ready to cash out" strong />
        <Money label="Pending" cents={b.pendingUsdCents} hint={`Held ${a.holdDays} days`} />
        <Money label="Requested" cents={b.requestedUsdCents} hint="On its way to you" />
        <Money label="Paid" cents={b.paidUsdCents} hint="All time" />
      </div>
      <div className="mt-3">
        {block ? <GhostButton label="Cash out" icon="account_balance_wallet" expand disabled /> : <GradientButton tone="gold" label={`Cash out ${usdCents(b.availableUsdCents)}`} onClick={() => void cashOut()} />}
      </div>
      {block ? <p className="type-body mt-2 text-center text-[12px] text-muted">{block}</p> : null}

      <Stats />
      <Commissions />

      <SectionTitle text="Payouts" top={26} />
      <PayoutList payouts={payouts} />

      <SectionTitle text="Your terms" top={26} />
      <Panel className="p-0">
        <Term icon="percent" title={`${a.revSharePercent}% of what your users spend`} body={`For ${a.commissionMonths} months after they join. Store fees come off first for Google Play purchases.`} />
        <Term icon="how_to_reg" title={`${usdCents(a.cpaUsdCents)} per active user`} body="When someone you brought verifies and has their first calls." />
        <Term icon="schedule" title={`${a.holdDays}-day hold · ${usdCents(a.minPayoutUsdCents)} minimum`} body="Commissions wait out refunds, then become available." last />
      </Panel>
    </>
  );
}

function Money({ label, cents, hint, strong = false }: { label: string; cents: number; hint: string; strong?: boolean }) {
  return (
    <Panel className={cn("rounded-[20px] px-4 py-3.5", strong && "border-gold/30 bg-gold/6")}>
      <span className="type-body block text-[12px] text-muted">{label}</span>
      <span className={cn("type-number-lg mt-1 block truncate text-[22px]", strong ? "text-gold" : "text-text")}>{usdCents(cents)}</span>
      <span className="type-body mt-0.5 block text-[11px] text-muted">{hint}</span>
    </Panel>
  );
}

function Term({ icon, title, body, last = false }: { icon: string; title: string; body: string; last?: boolean }) {
  return (
    <div className={cn("flex items-start px-4 py-3.5", !last && "border-b border-line-soft")}>
      <Icon name={icon} size={20} className="mt-0.5 text-text2" />
      <span className="ml-3 min-w-0 flex-1">
        <span className="type-title block text-[14px] font-semibold">{title}</span>
        <span className="type-body mt-0.5 block text-[12px] text-text2">{body}</span>
      </span>
    </div>
  );
}

function Stats() {
  const range = useAffiliate((s) => s.range);
  const stats = useAffiliate((s) => s.stats[s.range]);
  const [metric, setMetric] = useState<ChartMetric>("clicks");
  const label = METRICS.find((m) => m.value === metric)!.label;
  return (
    <>
      <div className="flex items-center pt-[26px] pb-3">
        <h2 className="type-overline flex-1">Stats</h2>
        <div className="flex gap-1" role="radiogroup" aria-label="Period">
          {STATS_RANGES.map((r) => (
            <Chip key={r} on={r === range} onClick={() => useAffiliate.getState().setRange(r)}>
              {r} days
            </Chip>
          ))}
        </div>
      </div>
      <Panel className="px-4 pt-4 pb-3">
        {!stats ? (
          <div className="flex h-[260px] items-center justify-center">
            <Spinner size={24} stroke={3} className="text-text2" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-y-3">
              <Figure label="Clicks" value={thousands(stats.totals.clicks)} />
              <Figure label="Sign-ups" value={thousands(stats.totals.signups)} />
              <Figure label="Active users" value={thousands(stats.totals.qualified)} />
              <Figure label="Paying users" value={thousands(stats.totals.payingUsers)} />
              <Figure label="Their purchases" value={usdCents(stats.totals.revenueUsdCents)} />
              <Figure label="You earned" value={usdCents(stats.totals.earnedUsdCents)} gold />
            </div>
            <div className="no-scrollbar -mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4" role="radiogroup" aria-label="Chart">
              {METRICS.map((m) => (
                <Chip key={m.value} on={m.value === metric} onClick={() => setMetric(m.value)}>
                  {m.label}
                </Chip>
              ))}
            </div>
            <div className="mt-3">
              <StatsChart daily={stats.daily} metric={metric} days={stats.days} label={label} />
            </div>
          </>
        )}
      </Panel>
      {stats && stats.byChannel.length ? (
        <>
          <SectionTitle text="By channel" top={22} />
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full min-w-[360px] text-left">
              <thead>
                <tr className="type-overline text-[10px]">
                  <th className="px-4 py-2.5 font-semibold">Channel</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Clicks</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Sign-ups</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Active</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Earned</th>
                </tr>
              </thead>
              <tbody>
                {stats.byChannel.map((c) => (
                  <tr key={c.channel} className="type-body border-t border-line-soft text-[13px]">
                    <th scope="row" className="px-4 py-2.5 font-medium text-text">
                      {sourceLabel(c.channel)}
                    </th>
                    <td className="type-number px-2 py-2.5 text-right font-medium text-text2">{thousands(c.clicks)}</td>
                    <td className="type-number px-2 py-2.5 text-right font-medium text-text2">{thousands(c.signups)}</td>
                    <td className="type-number px-2 py-2.5 text-right font-medium text-text2">{thousands(c.qualified)}</td>
                    <td className="type-number px-4 py-2.5 text-right text-gold">{usdCents(c.earnedUsdCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}

function Figure({ label, value, gold = false }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="min-w-0">
      <span className={cn("type-number-lg block truncate text-[18px]", gold ? "text-gold" : "text-text")}>{value}</span>
      <span className="type-body block text-[11px] text-muted">{label}</span>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className={cn("type-label h-7 shrink-0 rounded-full px-2.5 text-[12px] transition-colors", on ? "bg-white/12 text-text" : "text-muted hover:text-text2")}>
      {children}
    </button>
  );
}

const STATUS: Record<CommissionStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "muted" },
  AVAILABLE: { label: "Available", tone: "gold" },
  PAID: { label: "Paid", tone: "ok" },
  REVERSED: { label: "Reversed", tone: "bad" },
  HELD: { label: "Held", tone: "warn" },
};

function Commissions() {
  const items = useAffiliate((s) => s.commissions);
  const loaded = useAffiliate((s) => s.commissionsLoaded);
  const cursor = useAffiliate((s) => s.commissionsCursor);
  const more = useAffiliate((s) => s.loadingMore);
  return (
    <>
      <SectionTitle text="Commissions" top={26} />
      {!loaded ? (
        <div className="flex justify-center p-4">
          <Spinner size={22} stroke={3} className="text-text2" />
        </div>
      ) : !items.length ? (
        <p className="type-body px-0.5 py-2 text-[13px] text-text2">Nothing yet. You earn when people who joined with your link become active and when they buy.</p>
      ) : (
        <div className="rounded-card border border-line bg-surface">
          {items.map((c, i) => (
            <CommissionRow key={c.id} c={c} last={i === items.length - 1} />
          ))}
        </div>
      )}
      {cursor ? (
        <div className="mt-2.5 flex justify-center">
          <GhostButton label={more ? "Loading…" : "Show more"} height={40} onClick={more ? undefined : () => void useAffiliate.getState().loadCommissions(true)} />
        </div>
      ) : null}
    </>
  );
}

function CommissionRow({ c, last }: { c: Commission; last: boolean }) {
  const s = STATUS[c.status];
  const what = c.adjustment ? "Refund adjustment" : c.kind === "CPA" ? "Active user bonus" : `${usdCents(c.baseUsdCents)} purchase`;
  return (
    <div className={cn("flex items-center px-4 py-3", !last && "border-b border-line-soft")}>
      <span className="min-w-0 flex-1">
        <span className="type-title block truncate text-[14px] font-semibold">
          {c.userName} · <span className="font-normal text-text2">{what}</span>
        </span>
        <span className="type-body block text-[11.5px] text-muted">
          {ago(c.createdAt)}
          {c.status === "PENDING" && c.availableAt ? ` · available ${date(c.availableAt)}` : ""}
        </span>
      </span>
      <span className={cn("type-number mr-2.5 text-[14px]", c.usdCents < 0 || c.status === "REVERSED" ? "text-bad" : "text-gold")}>{usdCents(c.usdCents)}</span>
      <Tag text={s.label} tone={s.tone} />
    </div>
  );
}
