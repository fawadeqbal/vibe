"use client";

import { Info, Lock } from "lucide-react";

import { Coins } from "@/components/common/bits";
import { ErrorState, PageHeader } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/controls";
import { useCan } from "@/features/auth/session";
import { format } from "@/lib/format";
import { P } from "@/lib/permissions";

import { useEconomy } from "./api";
import { usd } from "./format";
import { ListCard, type ListColumn } from "./list-card";
import { RulesCard } from "./rules-card";

const PACK_COLUMNS: ListColumn[] = [
  { key: "id", label: "Id", kind: "id", className: "w-32" },
  { key: "name", label: "Pack", kind: "text", maxLength: 30, show: (r) => <>{String(r.name)} {r.tag ? <Badge tone="primary">{String(r.tag)}</Badge> : null}</> },
  { key: "coins", label: "Coins", kind: "int", min: 1, max: 1_000_000, align: "right", show: (r) => <Coins value={Number(r.coins)} /> },
  { key: "bonusPercent", label: "Bonus %", kind: "int", min: 0, max: 500, align: "right", show: (r) => (Number(r.bonusPercent) > 0 ? <span className="text-ok">+{String(r.bonusPercent)}%</span> : "—") },
  { key: "usdCents", label: "Price", kind: "usd", min: 1, max: 1_000_000, align: "right", show: (r) => usd(Number(r.usdCents)) },
  { key: "tag", label: "Tag", kind: "text", optional: true, maxLength: 24, editOnly: true },
];

const PLAN_COLUMNS: ListColumn[] = [
  { key: "id", label: "Id", kind: "id", className: "w-32" },
  { key: "label", label: "Plan", kind: "text", maxLength: 30, show: (r) => <>{String(r.label)} {r.highlighted ? <Badge tone="money">Featured</Badge> : null}</> },
  { key: "days", label: "Days", kind: "int", min: 1, max: 3660, align: "right" },
  { key: "trialDays", label: "Trial days", kind: "int", min: 0, max: 30, align: "right", show: (r) => (Number(r.trialDays) ? String(r.trialDays) : "—") },
  { key: "savePercent", label: "Save %", kind: "int", min: 0, max: 95, align: "right", show: (r) => (Number(r.savePercent) ? `${String(r.savePercent)}%` : "—") },
  { key: "usdCents", label: "Price", kind: "usd", min: 1, max: 1_000_000, align: "right", show: (r) => usd(Number(r.usdCents)) },
  { key: "highlighted", label: "Featured", kind: "flag", editOnly: true, className: "w-20 text-center" },
];

const GIFT_COLUMNS: ListColumn[] = [
  { key: "emoji", label: "", kind: "emoji", maxLength: 8, className: "w-12 text-lg" },
  { key: "name", label: "Gift", kind: "text", maxLength: 24 },
  { key: "id", label: "Id", kind: "id", className: "w-28" },
  { key: "coins", label: "Costs", kind: "int", min: 1, max: 100_000, align: "right", show: (r) => <Coins value={Number(r.coins)} /> },
];

/**
 * Prices, packs, plans, gifts and rules. Everything is read-only until you
 * press a section's pencil (needs "Edit prices and rules"); a save applies
 * at once to every app and the next charge.
 */
export function EconomyPage() {
  const q = useEconomy();
  const can = useCan();
  const canEdit = can(P.OpsEconomy);
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const e = q.data;
  const reload = () => void q.refetch();
  const share = Number(e?.economy.giftGemShare ?? 0.5);

  return (
    <div>
      <PageHeader title="Economy" description="Prices, rewards and rules the server charges and pays by. Press a section's pencil to change it." />
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-info/30 bg-info-soft px-4 py-3 text-sm text-text-2">
        {canEdit ? <Info className="mt-0.5 size-4 shrink-0 text-info" /> : <Lock className="mt-0.5 size-4 shrink-0 text-info" />}
        <span>
          {canEdit ? (
            <>
              Saving applies at once: every open app updates its store and prices, and the next charge or reward uses the new values. Purchases already started keep the price they were sold at. Google Play and App Store prices are set in their own consoles — keep them in step, and keep pack and plan ids equal to the store product ids. Every change is in the audit log.
            </>
          ) : (
            <>You can look but not change these. Ask an owner for the &ldquo;Edit prices and rules&rdquo; permission.</>
          )}
        </span>
      </div>
      {!e ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <section aria-label="Store" className="grid items-start gap-5 xl:grid-cols-2">
            <ListCard
              section="packs"
              title="Coin packs"
              noun="pack"
              description="What people can buy. The bonus is added on top of the coins."
              rows={e.packs}
              defaults={e.defaults.packs}
              meta={e.sections.packs}
              columns={PACK_COLUMNS}
              blank={{ id: "", name: "", coins: "", usdCents: "", bonusPercent: 0, tag: "" }}
              derived={{ label: "Total", value: (r) => (Number.isFinite(Number(r.coins)) && r.coins !== undefined ? format.number(Number(r.coins) + Math.round((Number(r.coins) * Number(r.bonusPercent ?? 0)) / 100)) : "—") }}
              canEdit={canEdit}
              onReload={reload}
            />
            <ListCard
              section="plans"
              title="VIP plans"
              noun="plan"
              description="Subscription lengths and prices. A trial is given once per person, on the featured plan."
              rows={e.plans}
              defaults={e.defaults.plans}
              meta={e.sections.plans}
              columns={PLAN_COLUMNS}
              blank={{ id: "", label: "", days: "", usdCents: "", savePercent: 0, trialDays: 0, highlighted: false }}
              canEdit={canEdit}
              onReload={reload}
            />
            <ListCard
              section="gifts"
              title="Gifts"
              noun="gift"
              description={`Sent during calls and in chat. The receiver keeps ${format.percent(share)} as gems (change it under Gifts, gems and cash-outs).`}
              rows={e.gifts}
              defaults={e.defaults.gifts}
              meta={e.sections.gifts}
              columns={GIFT_COLUMNS}
              blank={{ id: "", name: "", emoji: "", coins: "" }}
              derived={{ label: "Receiver gets", value: (r) => (r.coins !== undefined && Number.isFinite(Number(r.coins)) ? `${format.number(Math.round(Number(r.coins) * share))} gems` : "—") }}
              canEdit={canEdit}
              onReload={reload}
            />
          </section>
          <section aria-label="Rules" className="grid items-start gap-5 xl:grid-cols-2">
            {e.groups.map((g) => (
              <RulesCard key={g.key} group={g} economy={e} canEdit={canEdit} onReload={reload} />
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
