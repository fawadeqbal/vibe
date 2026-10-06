"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Screen } from "@/components/layout/screen";
import { GradientButton } from "@/components/ui/button";
import { GradientFill } from "@/components/ui/gradient-fill";
import { Icon } from "@/components/ui/icon";
import { Tag } from "@/components/ui/misc";
import { CoinChip, CoinIcon, GemChip } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { SectionTitle } from "@/components/ui/typography";
import { thousands, usd } from "@/lib/format";
import { type CoinPack, usdPer100 } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { checkedInToday, isVip, nextCheckInDay, useWallet } from "@/stores/wallet";

import { EarnSection } from "./earn-section";

/**
 * VIP, coins to buy, and free coins to earn — in that order, because that is
 * the order of revenue. Best value leads as a hero card; the rest sit in a grid.
 */
export function StoreScreen() {
  const router = useRouter();
  const wallet = useWallet((s) => s.wallet);
  const done = useWallet(checkedInToday);
  const day = useWallet(nextCheckInDay);
  const packs = useCatalog((s) => s.packs);
  const vip = isVip(wallet);
  const hero = packs.find((p) => p.tag === "Best value") ?? packs[packs.length - 1];
  const rest = packs.filter((p) => p !== hero);
  const openWallet = () => router.push("/wallet");

  return (
    <Screen
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
      {hero ? <HeroPack pack={hero} /> : null}
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        {rest.map((p) => (
          <PackCard key={p.id} pack={p} />
        ))}
      </div>
      <SectionTitle text="Free coins" note={done ? "Done for today" : `Day ${day + 1} of 7`} />
      <EarnSection />
      <p className="type-body mt-[18px] text-center text-[11px] leading-[1.45] text-muted">Prices in USD; JazzCash, Easypaisa and bank charge the PKR equivalent.</p>
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
      <span className="absolute -top-[60px] -right-10 -z-10 size-[180px] rounded-full" style={{ background: "radial-gradient(closest-side, rgb(255 200 87 / .18), rgb(255 200 87 / 0) 70%)" }} />
      <span className="flex items-center p-[18px]">
        <span className="bg-gold-grad flex size-[52px] shrink-0 items-center justify-center rounded-[16px]">
          <Icon name="workspace_premium" size={28} className="text-on-gold-icon" />
        </span>
        <span className="ml-3.5 flex-1">
          <span className="type-title block text-[17px]">Go VIP</span>
          <span className="type-body mt-0.5 block text-[12.5px] text-text2">Free filters, no ads, {bonus} coins a month, see who liked you.</span>
        </span>
        <span className="ml-2 flex flex-col items-end">
          <span className="type-body text-[10.5px] leading-[1.2] text-muted">from</span>
          <span className="type-number text-[15px] text-gold">{usd(from)}</span>
        </span>
      </span>
    </Link>
  );
}

function HeroPack({ pack }: { pack: CoinPack }) {
  const router = useRouter();
  return (
    <div className="rounded-[24px] border-[1.5px] border-gold/55 bg-surface p-[18px]">
      <div className="flex items-start">
        <CoinIcon size={44} />
        <div className="ml-3.5 flex-1">
          <p className="type-number-lg text-[30px]">{thousands(pack.coins)}</p>
          <p className="type-body mt-0.5 text-[12.5px] text-text2">
            {pack.name} · {usd(usdPer100(pack))} per 100
          </p>
        </div>
        {pack.tag ? <Tag text={pack.tag} tone="gold" /> : null}
      </div>
      <div className="mt-4">
        <GradientButton label={usd(pack.usd)} height={46} tone="gold" onClick={() => router.push(buyHref(pack))} />
      </div>
    </div>
  );
}

function PackCard({ pack }: { pack: CoinPack }) {
  const tag = pack.bonusPercent > 0 ? <Tag text={`+${pack.bonusPercent}% bonus`} tone="ok" /> : pack.tag ? <Tag text={pack.tag} tone="pink" /> : null;
  return (
    <Link href={buyHref(pack)} className="flex flex-col rounded-[22px] border border-line bg-surface p-3.5 transition-[filter] hover:brightness-110 active:brightness-125">
      <span className="flex h-6 items-center">
        <CoinIcon size={22} />
        <span className="ml-2 flex min-w-0 flex-1 justify-end">{tag}</span>
      </span>
      <span className="type-number-lg mt-2.5 text-[22px]">{thousands(pack.coins)}</span>
      <span className="type-body mt-0.5 truncate text-[11.5px] text-muted">
        {pack.name} · {usd(usdPer100(pack))}/100
      </span>
      <span className="flex-1" />
      <span className="type-title mt-3 flex h-[38px] items-center justify-center rounded-[19px] bg-surface3 text-[14px] font-semibold">{usd(pack.usd)}</span>
    </Link>
  );
}
