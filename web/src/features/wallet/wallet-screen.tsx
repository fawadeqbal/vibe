"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Screen } from "@/components/layout/screen";
import { CircleIconButton, GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/misc";
import { CoinIcon, GemIcon } from "@/components/ui/money";
import { AppBar } from "@/components/ui/page-header";
import { GroupCard, GroupRow, Panel } from "@/components/ui/panel";
import { PillTabs } from "@/components/ui/tabs";
import { SectionTitle } from "@/components/ui/typography";
import { useNow } from "@/hooks/use-now";
import { alpha, type Tone } from "@/lib/colors";
import { compact, date, figure, thousands, time, usdCompact } from "@/lib/format";
import { paymentMethodLabel, type Transaction, type TxKind } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { openSheet } from "@/stores/ui";
import { useWallet } from "@/stores/wallet";

import { GemGoalCard, WeeklyRecapCard } from "./goal-cards";

/**
 * Wallet: both balances on one card with Buy and Cash out, your gem goal,
 * last week, then the history by day (All · Coins · Gems); tap an item for
 * its details. (Design: Wallet.)
 */
export function WalletScreen() {
  const router = useRouter();
  const wallet = useWallet((s) => s.wallet);
  const tx = useWallet((s) => s.transactions);
  const usdPerGem = useCatalog((s) => s.economy.usdPerGem);
  const [tab, setTab] = useState<"all" | "coins" | "gems">("all");
  useNow(60_000);

  useEffect(() => {
    void useWallet.getState().refresh();
  }, []);

  const days = useMemo(() => byDay(tx.filter((t) => (tab === "coins" ? t.coins !== 0 : tab === "gems" ? t.gems !== 0 : true))), [tx, tab]);

  return (
    <Screen
      width="wide"
      header={
        <AppBar
          title="Wallet"
          onBack={() => router.back()}
          actions={<CircleIconButton icon="info" label="How coins and gems work" onClick={() => void openHowItWorks()} />}
        />
      }
      bodyClassName="pt-2"
    >
      <div className="lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="lg:sticky lg:top-2">
          <Panel>
            <div className="grid grid-cols-[1fr_1px_1fr] gap-3.5">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="type-label flex items-center gap-1.5 text-[12.5px] text-gold">
                  <CoinIcon size={16} />
                  Coins
                </span>
                <span className="type-number-lg text-[30px] leading-none text-text" title={`${thousands(wallet.coins)} coins`}>
                  {figure(wallet.coins)}
                </span>
                <span className="type-body text-[12px] leading-[1.4] text-text2">to spend on calls, gifts, filters</span>
              </div>
              <span className="bg-line-soft" />
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="type-label flex items-center gap-1.5 text-[12.5px] text-gem">
                  <GemIcon size={16} />
                  Gems
                </span>
                <span className="type-number-lg text-[30px] leading-none text-text" title={`${thousands(wallet.gems)} gems`}>
                  {figure(wallet.gems)}
                </span>
                <span className="type-body text-[12px] leading-[1.4] text-text2">≈ {usdCompact(wallet.gems * usdPerGem)} · from gifts</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <GradientButton tone="gold" label="Buy coins" icon="add_circle_outline" height={44} onClick={() => router.push("/store")} />
              <GradientButton tone="gem" label="Cash out" icon="payments" height={44} onClick={() => router.push("/wallet/cashout")} />
            </div>
          </Panel>
          <div className="mt-2.5">
            <GemGoalCard />
          </div>
          <WeeklyRecapCard />
        </div>

        <div>
          <SectionTitle text="History" top={26} bottom={10} />
          <PillTabs
            label="Show"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "all", label: "All" },
              { value: "coins", label: "Coins" },
              { value: "gems", label: "Gems" },
            ]}
          />
          {!days.length ? (
            <EmptyState icon="receipt_long" title="Nothing yet" body="Purchases, gifts, rewards and spends all show up here." />
          ) : (
            days.map(([label, items]) => (
              <section key={label} aria-label={label}>
                <p className="type-label mx-1 mt-[18px] mb-2 text-[12.5px] text-text2">{label}</p>
                <GroupCard>
                  {items.map((t) => (
                    <TxRow key={t.id} t={t} />
                  ))}
                </GroupCard>
              </section>
            ))
          )}
        </div>
      </div>
    </Screen>
  );
}

/** "Today", "Yesterday", "Mon 2 Nov" — newest first. */
function byDay(list: Transaction[]): [string, Transaction[]][] {
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

const TX_LOOK: Record<TxKind, { icon: string; tone: Tone }> = {
  purchase: { icon: "shopping_bag", tone: "gold" },
  spend: { icon: "bolt", tone: "gold" },
  earn: { icon: "play_circle", tone: "pink-soft" },
  gift: { icon: "redeem", tone: "gem" },
  cashout: { icon: "payments", tone: "gem" },
  vip: { icon: "workspace_premium", tone: "gold" },
};

/** The amount on the right: "+10" over "gems", green when it came in. */
function Amount({ t }: { t: Transaction }) {
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

function TxRow({ t }: { t: Transaction }) {
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
      onClick={() => void openTx(t, () => router.push("/me/help"))}
    />
  );
}

/** One item: the amount big, when, how it was paid, and its reference. */
const openTx = (t: Transaction, onHelp: () => void) =>
  openSheet<void>((close) => {
    const look = TX_LOOK[t.kind];
    const gems = t.coins === 0 && t.gems !== 0;
    const v = gems ? t.gems : t.coins;
    return (
      <div className="flex flex-col px-5 pt-1 pb-5">
        <div className="flex flex-col items-center pt-1.5 pb-4 text-center">
          <span className="flex size-14 items-center justify-center rounded-[18px]" style={{ backgroundColor: alpha(look.tone, 0.13) }}>
            <Icon name={look.icon} size={30} style={{ color: `var(--color-${look.tone})` }} />
          </span>
          <span className="type-number-lg mt-3 text-[34px]">
            {v > 0 ? "+" : v < 0 ? "−" : ""}
            {thousands(Math.abs(v))} <span className="type-body text-[16px] text-text2">{gems ? "gems" : "coins"}</span>
          </span>
          <span className="type-body text-[14px] text-text2">{t.title}</span>
        </div>
        <GroupCard dividerInset={16}>
          <Fact label="When" value={`${date(t.at)}, ${time(t.at)}`} />
          {t.method ? <Fact label="Paid with" value={paymentMethodLabel[t.method]} /> : null}
          {t.usd > 0 ? <Fact label="Amount" value={usdCompact(t.usd)} /> : null}
          <Fact label="Reference" value={t.receipt ?? t.id.slice(-8).toUpperCase()} mono />
        </GroupCard>
        <div className="mt-3.5">
          <GhostButton
            label="Something wrong? Get help"
            icon="support_agent"
            height={46}
            onClick={() => {
              close();
              onHelp();
            }}
          />
        </div>
      </div>
    );
  });

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-[13px]">
      <span className="type-title text-[15px] font-semibold">{label}</span>
      <span className={mono ? "font-mono text-[13px] text-text2" : "type-body text-[14px] text-text2"}>{value}</span>
    </div>
  );
}

/** ⓘ: what coins and gems are, in four lines. */
const openHowItWorks = () =>
  openSheet<void>(() => (
    <div className="flex flex-col px-5 pt-1 pb-6">
      <h2 className="type-title mb-3 text-[18px]">Coins and gems</h2>
      <GroupCard>
        <GroupRow
          icon="monetization_on"
          iconColor="gold"
          iconBg={alpha("gold", 0.13)}
          title="Coins are for spending"
          subtitle="Gifts, filters, boosts and Super Likes. They never expire."
        />
        <GroupRow
          icon="diamond"
          iconColor="gem"
          iconBg={alpha("gem", 0.13)}
          title="Gems are what you earn"
          subtitle="People send you gifts; you keep half their value as gems."
        />
        <GroupRow
          icon="payments"
          iconColor="gem"
          iconBg={alpha("gem", 0.13)}
          title="Cash gems out"
          subtitle="Paid in rupees to JazzCash, Easypaisa or a bank."
        />
      </GroupCard>
    </div>
  ));
