"use client";

import { useRouter } from "next/navigation";

import { GhostButton, GradientButton } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { asMap, transactionDetail } from "@/lib/api/mappers";
import { alpha, color } from "@/lib/colors";
import { date, thousands, time, usdCompact } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/models";
import { api } from "@/stores/services";

import { CopyText, DetailActions, DetailError, DetailGone, DetailLoading, DetailPage, KeyValues, SectionLabel, useDetail } from "../notifications/detail-kit";
import { TX_LOOK } from "./history";

/**
 * One history line that isn't a purchase or a cash-out (those open their
 * receipt and status pages): a gift with who it was with, a reward, a spend.
 */
export function TransactionScreen({ id }: { id: string }) {
  const router = useRouter();
  const { data: t, gone, error } = useDetail(async () => transactionDetail(asMap(await api.get(`/wallet/transactions/${encodeURIComponent(id)}`))), [id]);
  if (!t) return <DetailPage title="Details">{gone ? <DetailGone what="item" /> : error ? <DetailError /> : <DetailLoading />}</DetailPage>;
  const look = TX_LOOK[t.kind];
  const gems = t.coins === 0 && t.gems !== 0;
  const v = gems ? t.gems : t.coins;
  const person = t.gift?.person ?? null;
  const rows: [string, React.ReactNode][] = [
    ["When", `${date(t.at)}, ${time(t.at)}`],
    ...(t.method ? [["Paid with", paymentMethodLabel[t.method]] as [string, React.ReactNode]] : []),
    ...(t.usd > 0 ? [["Amount", usdCompact(t.usd)] as [string, React.ReactNode]] : []),
    ["Coins after", thousands(t.balanceCoins)],
    ["Gems after", thousands(t.balanceGems)],
    ["Reference", <CopyText key="ref" text={t.receipt && !t.giftTransferId ? t.receipt : t.id.slice(-8).toUpperCase()} />],
  ];
  return (
    <DetailPage
      title={t.gift ? "Gift" : "Details"}
      footer={
        <DetailActions>
          {person ? <GradientButton label={`Message ${person.name.split(" ")[0]}`} icon="chat_bubble" onClick={() => router.push(`/chats/${person.id}`)} /> : null}
          <GhostButton label="Something wrong? Get help" icon="support_agent" height={48} expand onClick={() => router.push("/me/help")} />
        </DetailActions>
      }
    >
      <div className="flex flex-col items-center px-5 pt-4 text-center">
        <span className="grid size-[76px] place-items-center rounded-full text-[38px]" style={{ backgroundColor: alpha(look.tone, 0.15), boxShadow: `0 0 0 8px ${alpha(look.tone, 0.06)}` }}>
          {t.gift ? <span aria-hidden>{t.gift.emoji}</span> : <Icon name={look.icon} size={36} style={{ color: color(look.tone) }} />}
        </span>
        <span className="type-number mt-4 text-[40px] leading-none font-extrabold tracking-[-1.4px]">
          {v > 0 ? "+" : v < 0 ? "−" : ""}
          {thousands(Math.abs(v))} <span className="type-body text-[16px] font-normal text-text2">{gems ? "gems" : "coins"}</span>
        </span>
        <span className="type-body mt-2 text-[14px] text-text2">{t.title}</span>
      </div>
      {t.gift ? (
        <>
          <SectionLabel text={t.gift.sent ? "Sent to" : "From"} />
          {person ? (
            <button
              type="button"
              onClick={() => router.push(`/u/${person.id}`)}
              className="flex w-full items-center gap-3 rounded-[22px] border border-line bg-surface px-4 py-3 text-left transition-colors hover:bg-white/4"
            >
              <Avatar url={person.avatarUrl} name={person.name} size={44} />
              <span className="min-w-0 flex-1">
                <span className="type-title block truncate text-[15px]">{person.name}</span>
                <span className="type-body block text-[12.5px] text-text2">
                  {t.gift.name} · {thousands(t.gift.coins)} coins{t.gift.sent ? "" : ` · you got ${thousands(t.gift.gems)} gems`}
                </span>
              </span>
              <Icon name="chevron_right" className="text-muted" />
            </button>
          ) : (
            <p className="type-body rounded-[22px] border border-line bg-surface px-4 py-3.5 text-[13.5px] text-text2">This account isn&apos;t on Vibe any more.</p>
          )}
        </>
      ) : null}
      <SectionLabel text="Details" />
      <KeyValues rows={rows} />
    </DetailPage>
  );
}
