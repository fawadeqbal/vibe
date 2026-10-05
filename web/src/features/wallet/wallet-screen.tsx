"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Screen } from "@/components/layout/screen";
import { GhostButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/misc";
import { CoinIcon, GemIcon } from "@/components/ui/money";
import { AppBar } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { SectionTitle } from "@/components/ui/typography";
import { useNow } from "@/hooks/use-now";
import { alpha, color, type Tone } from "@/lib/colors";
import { ago, gemsAsUsd, thousands, usd } from "@/lib/format";
import { paymentMethodLabel, type Transaction, type TxKind } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { useWallet } from "@/stores/wallet";

/** Balances, the ledger, and cashing gems out. */
export function WalletScreen() {
  const router = useRouter();
  const wallet = useWallet((s) => s.wallet);
  const tx = useWallet((s) => s.transactions);
  const usdPerGem = useCatalog((s) => s.economy.usdPerGem);
  useNow(60_000);

  useEffect(() => {
    void useWallet.getState().refresh();
  }, []);

  return (
    <Screen width="sm" header={<AppBar title="Wallet" onBack={() => router.back()} />} bodyClassName="pt-2">
      <div className="flex items-center gap-2.5">
        <Panel gradient="walletCoins" className="flex-1 border-gold/30">
          <p className="flex items-center">
            <CoinIcon size={16} />
            <span className="type-label ml-1.5 text-[12px] text-text2">Coins</span>
          </p>
          <p className="type-number-lg mt-2 text-[28px] text-gold">{thousands(wallet.coins)}</p>
          <div className="mt-2.5">
            <GhostButton label="Buy" height={36} onClick={() => router.push("/store")} />
          </div>
        </Panel>
        <Panel gradient="walletGems" className="flex-1 border-gem/30">
          <p className="flex items-center">
            <GemIcon size={16} />
            <span className="type-label ml-1.5 text-[12px] text-text2">Gems</span>
          </p>
          <p className="type-number-lg mt-2 text-[28px] text-gem">{thousands(wallet.gems)}</p>
          <p className="type-body text-[11px] text-text2">≈ {gemsAsUsd(wallet.gems, usdPerGem)}</p>
          <div className="mt-1">
            <GhostButton label="Cash out" height={36} onClick={() => router.push("/wallet/cashout")} />
          </div>
        </Panel>
      </div>
      <SectionTitle text="History" top={26} />
      {!tx.length ? (
        <EmptyState icon="receipt_long" title="Nothing yet" body="Purchases, gifts, rewards and spends all show up here." />
      ) : (
        <div className="flex flex-col gap-1.5">
          {tx.map((t) => (
            <TxRow key={t.id} t={t} />
          ))}
        </div>
      )}
    </Screen>
  );
}

const TX_LOOK: Record<TxKind, { icon: string; tone: Tone }> = {
  purchase: { icon: "shopping_bag", tone: "gold" },
  spend: { icon: "remove_circle_outline", tone: "text2" },
  earn: { icon: "add_circle_outline", tone: "ok" },
  gift: { icon: "card_giftcard", tone: "pink" },
  cashout: { icon: "account_balance", tone: "gem" },
  vip: { icon: "workspace_premium", tone: "gold" },
};

function TxRow({ t }: { t: Transaction }) {
  const look = TX_LOOK[t.kind];
  return (
    <Panel className="flex items-center px-3.5 py-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px]" style={{ backgroundColor: alpha(look.tone, 0.14) }}>
        <Icon name={look.icon} size={18} style={{ color: color(look.tone) }} />
      </span>
      <span className="ml-3 min-w-0 flex-1">
        <span className="type-body block text-[14px] font-semibold">{t.title}</span>
        <span className="type-body block text-[11px] text-muted">
          {ago(t.at)}
          {t.method ? ` · ${paymentMethodLabel[t.method]}` : ""}
          {t.receipt ? ` · ${t.receipt}` : ""}
        </span>
      </span>
      <span className="flex flex-col items-end">
        {t.coins !== 0 ? <span className={t.coins > 0 ? "type-title text-[14px] text-ok" : "type-title text-[14px] text-text"}>{`${t.coins > 0 ? "+" : ""}${thousands(t.coins)}`}</span> : null}
        {t.gems !== 0 ? <span className="type-label text-[12px] text-gem">{`${t.gems > 0 ? "+" : ""}${thousands(t.gems)} gems`}</span> : null}
        {t.usd > 0 ? <span className="type-body text-[11px] text-muted">{usd(t.usd)}</span> : null}
      </span>
    </Panel>
  );
}
