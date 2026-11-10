"use client";

import { useRouter } from "next/navigation";

import { GroupCard, GroupRow } from "@/components/ui/panel";
import { alpha, type Tone } from "@/lib/colors";
import { compact, time, usdCompact } from "@/lib/format";
import { paymentMethodLabel, type Transaction, type TxKind } from "@/lib/models";

export const TX_LOOK: Record<TxKind, { icon: string; tone: Tone }> = {
  purchase: { icon: "shopping_bag", tone: "gold" },
  spend: { icon: "bolt", tone: "gold" },
  earn: { icon: "play_circle", tone: "pink-soft" },
  gift: { icon: "redeem", tone: "gem" },
  cashout: { icon: "payments", tone: "gem" },
  vip: { icon: "workspace_premium", tone: "gold" },
};

/** Where a history line opens: its receipt, its cash-out, or its own page (gifts, rewards, spends). */
export const txHref = (t: Transaction) =>
  t.purchaseId ? `/wallet/payments/${encodeURIComponent(t.purchaseId)}` : t.cashoutId ? `/wallet/cashouts/${encodeURIComponent(t.cashoutId)}` : `/wallet/history/${encodeURIComponent(t.id)}`;

/** "Today", "Yesterday", "Mon 2 Nov" — newest first. */
export function byDay(list: Transaction[]): [string, Transaction[]][] {
  const out = new Map<string, Transaction[]>();
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  for (const t of list) {
    const label = same(t.at, today)
      ? "Today"
      : same(t.at, yesterday)
        ? "Yesterday"
        : t.at.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
    out.set(label, [...(out.get(label) ?? []), t]);
  }
  return [...out.entries()];
}

/** The amount on the right: "+10" over "gems", green when it came in. */
export function Amount({ t }: { t: Transaction }) {
  const gems = t.coins === 0 && t.gems !== 0;
  const v = gems ? t.gems : t.coins;
  return (
    <span className="flex flex-col items-end">
      <span className={v > 0 ? "type-number text-[15px] text-ok" : "type-number text-[15px] text-text"}>
        {v > 0 ? "+" : "−"}
        {compact(Math.abs(v))}
      </span>
      <span className="type-body text-[11px] text-muted">{gems ? "gems" : "coins"}</span>
    </span>
  );
}

export function TxRow({ t }: { t: Transaction }) {
  const router = useRouter();
  const look = TX_LOOK[t.kind];
  const sub = [t.method ? paymentMethodLabel[t.method] : null, t.usd > 0 ? usdCompact(t.usd) : null, time(t.at)].filter(Boolean).join(" · ");
  return (
    <GroupRow
      icon={look.icon}
      iconColor={look.tone}
      iconBg={alpha(look.tone, 0.13)}
      title={t.title}
      subtitle={sub}
      trailing={t.coins !== 0 || t.gems !== 0 ? <Amount t={t} /> : undefined}
      onClick={() => router.push(txHref(t))}
    />
  );
}

/** History grouped by day. */
export function HistoryDays({ items }: { items: Transaction[] }) {
  return (
    <>
      {byDay(items).map(([label, rows]) => (
        <section key={label} aria-label={label}>
          <p className="type-label mx-1 mt-[18px] mb-2 text-[12.5px] text-text2">{label}</p>
          <GroupCard>
            {rows.map((t) => (
              <TxRow key={t.id} t={t} />
            ))}
          </GroupCard>
        </section>
      ))}
    </>
  );
}

/** Under a paged list: a spinner while the next page loads, "Try again" if it failed, nothing at the end. */
export function PageFooter({ loading, failed, retry, sentinel }: { loading: boolean; failed: boolean; retry: () => void; sentinel: (el: HTMLElement | null) => void }) {
  return (
    <div ref={sentinel} className="flex min-h-12 items-center justify-center py-3">
      {failed ? (
        <button type="button" onClick={retry} className="type-label text-[13px] text-pink-soft hover:text-pink">
          Couldn&apos;t load more · Try again
        </button>
      ) : loading ? (
        <span className="size-5 animate-spin rounded-full border-2 border-white/15 border-t-pink" aria-label="Loading" />
      ) : null}
    </div>
  );
}
