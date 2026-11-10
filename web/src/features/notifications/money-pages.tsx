"use client";

import { useRouter } from "next/navigation";

import { GhostButton, GradientButton } from "@/components/ui/button";
import { CoinIcon, GemIcon } from "@/components/ui/money";
import { date, pkr, thousands, time, usd } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/models";
import { type Cashout, parseCashout, parsePurchase } from "@/lib/payments";
import { asMap } from "@/lib/api/mappers";
import { cn } from "@/lib/cn";
import { useCatalog } from "@/stores/catalog";
import { api } from "@/stores/services";

import {
  CopyText,
  DetailActions,
  DetailError,
  DetailGone,
  DetailHero,
  DetailLoading,
  DetailPage,
  KeyValues,
  SectionLabel,
  StatusTag,
  useDetail,
} from "./detail-kit";

const stamp = (d: Date | null) => (d ? `${date(d)}, ${time(d)}` : "—");
const money = (currency: string, amount: number) => (currency === "PKR" ? pkr(amount) : usd(amount));

/** A payment's receipt: what you bought, what you paid, with what, and its reference. */
export function PaymentReceipt({ id }: { id: string }) {
  const router = useRouter();
  const packs = useCatalog((s) => s.packs);
  const plans = useCatalog((s) => s.plans);
  const { data: p, gone, error } = useDetail(async () => parsePurchase(asMap(await api.get(`/payments/purchases/${encodeURIComponent(id)}`))), [id]);

  if (!p) return <DetailPage title="Payment">{gone ? <DetailGone what="payment" /> : error ? <DetailError /> : <DetailLoading />}</DetailPage>;

  const pack = p.productType === "coinPack" ? packs.find((x) => x.id === p.productId) : null;
  const plan = p.productType === "vipPlan" ? plans.find((x) => x.id === p.productId) : null;
  const item = pack ? `${pack.name} · ${thousands(pack.coins)} coins` : plan ? `VIP · ${plan.label}` : p.productType === "vipPlan" ? "VIP" : "Coins";
  const ok = p.state === "succeeded";
  const failed = p.state === "failed" || p.state === "expired";
  const hero = ok
    ? {
        icon: "check_circle",
        tone: "ok" as const,
        title: "Payment received",
        sub: `${stamp(p.completedAt ?? p.createdAt)} · ${plan || p.productType === "vipPlan" ? "your VIP is on" : "your coins are in your wallet"}`,
      }
    : failed
      ? { icon: "error_outline", tone: "bad" as const, title: "Payment not completed", sub: `${stamp(p.createdAt)} · nothing was charged` }
      : p.state === "refunded"
        ? { icon: "replay", tone: "warn" as const, title: "Payment refunded", sub: stamp(p.completedAt ?? p.createdAt) }
        : { icon: "schedule", tone: "info" as const, title: "Payment in progress", sub: "We’ll tell you as soon as it goes through." };

  return (
    <DetailPage
      title="Payment"
      footer={
        <DetailActions>
          {failed ? (
            <>
              <GradientButton label="Try again" icon="replay" onClick={() => router.push(p.productType === "vipPlan" ? "/vip" : "/store")} />
              <GhostButton label="Pay another way" icon="credit_card" height={48} expand onClick={() => router.push("/store")} />
            </>
          ) : (
            <>
              <GradientButton label="Open wallet" icon="account_balance_wallet" onClick={() => router.push("/wallet")} />
              <GhostButton label="Get help with this payment" icon="support_agent" height={48} expand onClick={() => router.push("/me/help")} />
            </>
          )}
        </DetailActions>
      }
    >
      <DetailHero icon={hero.icon} tone={hero.tone} title={hero.title} sub={hero.sub} variant={failed ? "outlined" : undefined} />
      {ok && pack ? (
        <div className="my-4 flex items-center justify-center gap-2">
          <CoinIcon size={30} />
          <span className="type-number text-[38px] leading-none font-extrabold tracking-[-1.2px] text-gold">+{thousands(pack.coins)}</span>
          <span className="type-body text-[16px] font-semibold text-text2">coins</span>
        </div>
      ) : (
        <div className="h-4" />
      )}
      {failed && p.failureReason ? (
        <p className="type-body mb-3.5 rounded-[18px] border border-bad/22 bg-bad/8 px-4 py-3.5 text-[13.5px] leading-[1.5]">{p.failureReason}</p>
      ) : null}
      <KeyValues
        rows={[
          [p.productType === "vipPlan" ? "Plan" : "Pack", item],
          [ok ? "Paid" : "Amount", money(p.currency, p.amount)],
          ...(p.method ? ([["With", paymentMethodLabel[p.method]]] as [string, string][]) : []),
          [
            "Status",
            <StatusTag
              key="s"
              text={ok ? "Completed" : failed ? "Not completed" : p.state === "refunded" ? "Refunded" : "In progress"}
              tone={ok ? "ok" : failed ? "bad" : p.state === "refunded" ? "warn" : "info"}
              icon={ok ? "check" : undefined}
            />,
          ],
          ["Reference", <CopyText key="r" text={p.receipt ?? p.id} />],
          ["Date", stamp(p.completedAt ?? p.createdAt)],
        ]}
      />
    </DetailPage>
  );
}

type Step = { title: string; sub: string; done: boolean };

function steps(c: Cashout): Step[] {
  const to = `${c.method === "bank" ? "your bank" : paymentMethodLabel[c.method]} ${c.accountMasked}`.trim();
  const out: Step[] = [{ title: "Requested", sub: stamp(c.createdAt), done: true }];
  if (c.status === "review") out.push({ title: "Being checked", sub: "Big cash-outs get a quick look first, usually within a day.", done: false });
  else out.push({ title: "Approved", sub: c.status === "requested" ? "Starting now" : "Done", done: c.status !== "requested" });
  out.push({
    title: `Sent to ${to}`,
    sub: c.status === "paid" ? `${stamp(c.processedAt)} · usually arrives within an hour` : "Next",
    done: c.status === "paid",
  });
  return out;
}

/** A cash-out: how much, where to, and where it is now. */
export function CashoutStatusView({ id }: { id: string }) {
  const router = useRouter();
  const { data: c, gone, error } = useDetail(async () => parseCashout(asMap(await api.get(`/wallet/cashouts/${encodeURIComponent(id)}`))), [id]);
  if (!c) return <DetailPage title="Cash-out">{gone ? <DetailGone what="cash-out" /> : error ? <DetailError /> : <DetailLoading />}</DetailPage>;
  const returned = c.status === "rejected";
  const amount = c.amountPkr != null ? pkr(c.amountPkr) : usd(c.usd);
  const tag = returned ? (
    <StatusTag text="Returned" tone="warn" />
  ) : c.status === "paid" ? (
    <StatusTag text="Sent" tone="ok" icon="check" />
  ) : (
    <StatusTag text="On its way" tone="info" icon="schedule" />
  );
  return (
    <DetailPage
      title="Cash-out"
      footer={
        <DetailActions>
          <GradientButton label="Open wallet" icon="account_balance_wallet" onClick={() => router.push("/wallet")} />
          <GhostButton
            label={c.status === "paid" ? "Money didn’t arrive? Get help" : "Get help"}
            icon="support_agent"
            height={48}
            expand
            onClick={() => router.push("/me/help")}
          />
        </DetailActions>
      }
    >
      <div className="flex flex-col items-center px-5 pt-4 text-center">
        {tag}
        <span className="type-number mt-3 text-[40px] leading-none font-extrabold tracking-[-1.4px]">{amount}</span>
        <span className="type-body mt-2 inline-flex items-center gap-1 text-[13.5px] text-text2">
          from <GemIcon size={14} /> <b className="font-bold text-gem">{thousands(c.gems)} gems</b>
          {c.accountMasked ? ` · to ${paymentMethodLabel[c.method]} ${c.accountMasked}` : ""}
        </span>
      </div>
      {returned ? (
        <p className="type-body mt-5 rounded-[18px] border border-warn/25 bg-warn/8 px-4 py-3.5 text-[13.5px] leading-[1.5]">
          <b className="font-bold">Your {thousands(c.gems)} gems are back in your wallet.</b> {c.failureReason ?? "The payout didn’t go through."}
        </p>
      ) : (
        <ol className="mt-5 rounded-[22px] border border-line bg-surface px-[18px] pt-[18px]">
          {steps(c).map((s, i, all) => (
            <li key={s.title} className="flex gap-3.5">
              <span className="flex flex-col items-center">
                <span
                  className={cn(
                    "grid size-[26px] place-items-center rounded-full border-2",
                    s.done ? "border-ok bg-ok/16 text-ok" : "border-white/20 bg-white/6",
                  )}
                >
                  {s.done ? (
                    <span aria-hidden className="text-[13px] font-bold">
                      ✓
                    </span>
                  ) : null}
                </span>
                {i < all.length - 1 ? <span className={cn("min-h-[26px] w-0.5 flex-1", s.done ? "bg-ok/50" : "bg-white/10")} /> : null}
              </span>
              <span className="pt-0.5 pb-[18px]">
                <span className={cn("type-title block text-[14.5px]", !s.done && "text-text2")}>{s.title}</span>
                <span className="type-body mt-0.5 block text-[12.5px] text-text2">{s.sub}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <SectionLabel text="Details" />
      <KeyValues
        rows={[
          ["Gems", thousands(c.gems)],
          ["Amount", amount],
          ["Reference", <CopyText key="r" text={c.id} />],
          ["Requested", stamp(c.createdAt)],
        ]}
      />
    </DetailPage>
  );
}
