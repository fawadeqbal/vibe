"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Screen } from "@/components/layout/screen";
import { CircleIconButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/misc";
import { CoinIcon, GemIcon } from "@/components/ui/money";
import { AppBar } from "@/components/ui/page-header";
import { GroupCard, GroupRow, Panel } from "@/components/ui/panel";
import { SectionTitle } from "@/components/ui/typography";
import { useNow } from "@/hooks/use-now";
import { alpha } from "@/lib/colors";
import { figure, thousands, usdCompact } from "@/lib/format";
import { useCatalog } from "@/stores/catalog";
import { openSheet } from "@/stores/ui";
import { useWallet } from "@/stores/wallet";

import { GemGoalCard, WeeklyRecapCard } from "./goal-cards";
import { HistoryDays } from "./history";

/** History shows this many here, then See all. */
const PREVIEW = 5;

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
  useNow(60_000);

  useEffect(() => {
    void useWallet.getState().refresh();
  }, []);

  // The latest few here; See all opens every one, a page at a time (with All · Coins · Gems).
  const latest = tx.slice(0, PREVIEW);

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
          <SectionTitle text="History" action={tx.length ? "See all" : undefined} onAction={() => router.push("/wallet/history")} top={26} bottom={2} />
          {!latest.length ? (
            <EmptyState icon="receipt_long" title="Nothing yet" body="Purchases, gifts, rewards and spends all show up here." />
          ) : (
            <HistoryDays items={latest} />
          )}
          {tx.length > PREVIEW ? (
            <button
              type="button"
              onClick={() => router.push("/wallet/history")}
              className="type-label mt-3 flex h-11 w-full items-center justify-center gap-1 rounded-full border border-line bg-surface text-[13.5px] font-semibold text-text transition-colors hover:bg-surface2"
            >
              See all history
              <Icon name="chevron_right" size={18} className="text-muted" />
            </button>
          ) : null}
        </div>
      </div>
    </Screen>
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
