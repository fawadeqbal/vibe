"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Screen } from "@/components/layout/screen";
import { GradientButton } from "@/components/ui/button";
import { GradientFill } from "@/components/ui/gradient-fill";
import { Icon } from "@/components/ui/icon";
import { CoinChip, CoinIcon, GemChip } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { SectionTitle } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import { figure, usd } from "@/lib/format";
import { type CoinPack, usdPer100 } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { checkedInToday, isVip, nextCheckInDay, useWallet } from "@/stores/wallet";

import { EarnSection } from "./earn-section";

/**
 * VIP, coins to buy, and free coins to earn — in that order, because that is
 * the order of revenue. Packs sit in an even grid; best value is the gold
 * one. (Design: Store.)
 */
export function StoreScreen() {
  const router = useRouter();
  const wallet = useWallet((s) => s.wallet);
  const done = useWallet(checkedInToday);
  const day = useWallet(nextCheckInDay);
  const packs = useCatalog((s) => s.packs);
  const vip = isVip(wallet);
  const best = packs.find((p) => p.tag === "Best value") ?? null;
  const openWallet = () => router.push("/wallet");

  return (
    <Screen
      width="wide"
      header={
        <PageHeader
          title="Store"
          actions={
            <>
              <GemChip gems={wallet.gems} onClick={openWallet} />
              <CoinChip coins={wallet.coins} onClick={openWallet} showPlus={false} />
            </>
          }
        />
      }
    >
      {!vip ? <VipBanner /> : null}
      <SectionTitle text="Coins" note="Coins never expire" top={vip ? 4 : 28} />
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-3.5 pt-1 lg:grid-cols-4 lg:gap-x-3.5">
        {packs.map((p) => (
          <PackCard key={p.id} pack={p} best={p === best} />
        ))}
      </div>
      <SectionTitle text="Free coins" note={done ? "Done for today" : `Day ${day + 1} of 7`} />
      <EarnSection />
      <p className="type-body mt-[18px] text-center text-[11px] leading-[1.45] text-muted">Prices in USD. JazzCash, Easypaisa and bank pay the PKR amount.</p>
    </Screen>
  );
}

const buyHref = (p: CoinPack) => `/checkout?pack=${encodeURIComponent(p.id)}`;

function VipBanner() {
  const bonus = useCatalog((s) => s.economy.vipMonthlyBonusCoins);
  const from = useCatalog((s) => s.plans[0]?.usd ?? 0);
  return (
    <Link href="/vip" className="relative isolate block overflow-hidden rounded-[24px] border border-gold/30 transition-[filter] hover:brightness-110">
      <GradientFill gradient="vipCard" className="-z-10" />
      {/* Warm glow in the corner. */}
      <span
        className="absolute -top-[60px] -right-10 -z-10 size-[180px] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgb(255 200 87 / .18), rgb(255 200 87 / 0) 70%)" }}
      />
      <span className="flex items-center p-[18px]">
        <span className="bg-gold-grad flex size-[52px] shrink-0 items-center justify-center rounded-[16px]">
          <Icon name="workspace_premium" size={28} className="text-on-gold-icon" />
        </span>
        <span className="ml-3.5 flex-1">
          <span className="type-title block text-[17px]">Go VIP</span>
          <span className="type-body mt-0.5 block text-[12.5px] text-text2">Unlimited likes, free filters, no ads, {bonus} coins a month</span>
        </span>
        <span className="bg-gold-grad type-label ml-2 flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-bold text-on-gold">
          From {usd(from)}
        </span>
      </span>
    </Link>
  );
}

function PackCard({ pack, best }: { pack: CoinPack; best: boolean }) {
  const router = useRouter();
  const badge = pack.bonusPercent > 0 ? `+${pack.bonusPercent}% bonus` : pack.tag;
  return (
    <div className={cn("relative flex flex-col rounded-[22px] border bg-surface p-3.5 pt-4", best ? "border-[1.5px] border-gold/55" : "border-line")}>
      {badge ? (
        <span
          className={cn(
            "type-label absolute -top-2.5 left-3 rounded-full px-2 py-[3px] text-[11px] font-bold",
            best ? "bg-pink text-white" : "bg-pink text-white",
          )}
        >
          {badge}
        </span>
      ) : null}
      <span className="flex items-center gap-2">
        <CoinIcon size={22} />
        <span className="type-number-lg text-[24px]">{figure(pack.coins)}</span>
      </span>
      <span className="type-body mt-0.5 text-[12px] text-muted" title={`${pack.name} · ${usd(usdPer100(pack))} per 100`}>
        coins
      </span>
      <span className="min-h-3 flex-1" />
      {best ? (
        <GradientButton
          label={usd(pack.usd)}
          height={40}
          tone="gold"
          softGlow
          onClick={() => router.push(buyHref(pack))}
          aria-label={`Buy ${figure(pack.coins)} coins for ${usd(pack.usd)}`}
        />
      ) : (
        <Link
          href={buyHref(pack)}
          aria-label={`Buy ${figure(pack.coins)} coins for ${usd(pack.usd)}`}
          className="type-title flex h-10 items-center justify-center rounded-full bg-surface3 text-[14px] font-semibold transition-[filter] hover:brightness-125"
        >
          {usd(pack.usd)}
        </Link>
      )}
    </div>
  );
}
