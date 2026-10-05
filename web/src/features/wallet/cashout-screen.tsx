"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Screen } from "@/components/layout/screen";
import { confirm } from "@/components/shared/dialogs";
import { PaymentMethodIcon } from "@/components/shared/payment-method-icon";
import { startSelfieVerification } from "@/components/shared/selfie-verification";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { MenuButton } from "@/components/ui/menu";
import { EmptyState, ProgressBar, Tag } from "@/components/ui/misc";
import { AppBar } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { SectionTitle } from "@/components/ui/typography";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type { Tone } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { ago, gemsAsUsd, thousands, usd } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/models";
import { type Cashout, cashoutStatusLabel, type PayoutAccount } from "@/lib/payments";
import { useCatalog } from "@/stores/catalog";
import { useSession } from "@/stores/session";
import { toast } from "@/stores/ui";
import { canCashOut, useWallet } from "@/stores/wallet";

import { addPayoutAccount } from "./payout-account-form";

/** Gems → money: saved payout accounts, the request, and its history. Status changes arrive live. */
export function CashoutScreen() {
  const router = useRouter();
  const w = useWallet();
  const e = useCatalog((s) => s.economy);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [done, setDone] = useState<Cashout | null>(null);
  const gems = w.wallet.gems;
  const can = canCashOut(w);
  const estimatePkr = Math.floor(gems * e.usdPerGem * e.pkrPerUsd);
  const defaultId = () => {
    const accounts = useWallet.getState().payoutAccounts;
    return (accounts.find((a) => a.isDefault) ?? accounts[0])?.id ?? null;
  };

  const fetchPayouts = () =>
    useWallet
      .getState()
      .loadPayouts()
      .catch((err: unknown) => setLoadError(errorMessage(err)))
      .finally(() => {
        setLoading(false);
        setSelected((s) => s ?? defaultId());
      });

  const load = () => {
    setLoading(true);
    setLoadError(null);
    void fetchPayouts();
  };

  useEffect(() => {
    void fetchPayouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    const a = await addPayoutAccount({ methods: w.payoutMethods, holderName: useSession.getState().me?.name ?? "", firstAccount: !w.payoutAccounts.length });
    if (a) setSelected(a.id);
  };

  const accountAction = async (a: PayoutAccount, action: "default" | "remove") => {
    try {
      if (action === "default") return await useWallet.getState().makeDefaultPayoutAccount(a.id);
      const ok = await confirm({ title: "Remove this account?", body: `${paymentMethodLabel[a.method]} ${a.accountMasked} will no longer receive cash-outs.`, ok: "Remove", cancel: "Keep", okTone: "bad" });
      if (!ok) return;
      await useWallet.getState().removePayoutAccount(a.id);
      if (selected === a.id) setSelected(defaultId());
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  };

  const submit = async () => {
    if (!selected) return toast("Add an account to send the money to", { error: true });
    setBusy(true);
    try {
      setDone(await useWallet.getState().requestCashout({ gems, payoutAccountId: selected }));
    } catch (err) {
      if (err instanceof ApiError && err.code === "KYC_REQUIRED") {
        const limit = err.details.limitUsd;
        const go = await confirm({
          title: "Verify to cash out more",
          body: `${err.message}\n\nA quick selfie check${typeof limit === "number" ? ` lifts the $${limit.toFixed(0)} monthly limit` : ""}. It takes a minute.`,
          ok: "Verify now",
          cancel: "Not now",
        });
        if (go) await startSelfieVerification();
      } else toast(errorMessage(err), { error: true });
    } finally {
      setBusy(false);
    }
  };

  const money = (c: Cashout) => (c.amountPkr != null ? `Rs ${thousands(c.amountPkr)}` : usd(c.usd));

  if (done) {
    return (
      <Screen width="sm" header={<AppBar title="Cash out gems" onBack={() => router.back()} />} bodyClassName="flex min-h-full flex-col p-6">
        <div className="flex-1" />
        <span className="bg-gem-grad mx-auto flex size-24 items-center justify-center rounded-full">
          <Icon name="check" size={52} className="text-on-gem" />
        </span>
        <h2 className="type-display mt-5 text-center text-[28px]">{done.status === "review" ? "Request received" : "On its way"}</h2>
        <p className="type-body mt-2 text-center text-[15px] text-text2">
          {money(done)} to your {paymentMethodLabel[done.method]} {done.accountMasked}. {done.status === "review" ? "Larger cash-outs get a quick check first; " : ""}Payouts land within 3 business days. We will notify you.
        </p>
        <div className="min-h-8 flex-1" />
        <GradientButton label="Done" tone="gem" onClick={() => router.push("/wallet")} />
      </Screen>
    );
  }

  return (
    <Screen width="sm" header={<AppBar title="Cash out gems" onBack={() => router.back()} />} bodyClassName="pt-2">
      <Panel gradient="walletGems" className="border-gem/30">
        <p className="type-label text-[12px] text-text2">Available</p>
        <p className="mt-1 flex items-baseline">
          <span className="type-number-lg text-[30px] text-gem">{thousands(gems)}</span>
          <span className="type-body ml-2 text-[14px] text-text2">
            gems ≈ Rs {thousands(estimatePkr)} ({gemsAsUsd(gems, e.usdPerGem)})
          </span>
        </p>
        <div className="mt-2.5">
          <ProgressBar value={gems / e.cashoutMinGems} />
        </div>
        <p className="type-body mt-1.5 text-[12px] text-text2">
          {can
            ? "You can cash out."
            : `${thousands(e.cashoutMinGems - gems)} more gems to reach the ${thousands(e.cashoutMinGems)} minimum (${gemsAsUsd(e.cashoutMinGems, e.usdPerGem)}).`}
        </p>
      </Panel>

      <SectionTitle text="Pay to" />
      {loading && !w.payoutsLoaded ? (
        <div className="flex justify-center p-5">
          <Spinner className="text-gem" />
        </div>
      ) : loadError && !w.payoutsLoaded ? (
        <EmptyState icon="cloud_off" title="Couldn't load your accounts" body={loadError} action={<GhostButton label="Try again" onClick={load} />} />
      ) : (
        <div className="flex flex-col gap-2">
          {w.payoutAccounts.map((a) => (
            <AccountRow key={a.id} a={a} on={a.id === selected} onSelect={() => setSelected(a.id)} onAction={(act) => void accountAction(a, act)} />
          ))}
          <Panel onClick={w.payoutAccounts.length >= 5 ? undefined : () => void add()} className="flex items-center px-4 py-3.5">
            <span className="flex size-10 items-center justify-center rounded-[12px] bg-gem/12">
              <Icon name="add" className="text-gem" />
            </span>
            <span className="type-title ml-3.5 flex-1 text-[14px] font-semibold">
              {w.payoutAccounts.length >= 5 ? "Up to 5 accounts — remove one to add another" : "Add JazzCash, Easypaisa or a bank account"}
            </span>
          </Panel>
        </div>
      )}

      <div className="mt-5">
        <GradientButton label={can ? `Cash out ${thousands(gems)} gems` : "Not enough gems yet"} tone="gem" busy={busy} onClick={can && selected ? () => void submit() : undefined} />
      </div>
      <p className="type-body mt-2 text-center text-[11.5px] text-muted">Paid within 3 business days. Identity check (selfie) above the monthly limit.</p>

      {w.cashouts.length ? (
        <>
          <SectionTitle text="Your cash-outs" />
          <div className="flex flex-col gap-1.5">
            {w.cashouts.map((c) => (
              <CashoutRow key={c.id} c={c} money={money(c)} />
            ))}
          </div>
        </>
      ) : null}

      <SectionTitle text="How gems work" />
      <Panel>
        {[
          "Someone sends you a gift during a match or chat.",
          `You keep ${Math.round(e.giftGemShare * 100)}% of its coin value as gems.`,
          `1 gem = ${usd(e.usdPerGem)}, paid in rupees at the day's rate. Cash out from ${thousands(e.cashoutMinGems)} gems.`,
        ].map((t) => (
          <p key={t} className="mb-1.5 flex items-start last:mb-0">
            <span className="mt-1.5 size-[5px] shrink-0 rounded-full bg-gem" />
            <span className="type-body ml-2.5 text-[13px] text-text2">{t}</span>
          </p>
        ))}
      </Panel>
    </Screen>
  );
}

function AccountRow({ a, on, onSelect, onAction }: { a: PayoutAccount; on: boolean; onSelect: () => void; onAction: (action: "default" | "remove") => void }) {
  return (
    <div
      role="radio"
      aria-checked={on}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && onSelect()}
      className={cn("flex cursor-pointer items-center rounded-[18px] border py-3 pr-1 pl-4 transition-colors", on ? "border-[1.5px] border-gem bg-gem/8" : "border-line bg-surface")}
    >
      <PaymentMethodIcon method={a.method} size={40} iconSize={20} />
      <span className="ml-3 min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="type-title truncate text-[14px] font-semibold">
            {a.method === "bank" ? (a.bankName ?? "Bank") : paymentMethodLabel[a.method]} · {a.accountMasked}
          </span>
          {a.isDefault ? <Tag text="Default" tone="gem" /> : null}
        </span>
        <span className="type-body block text-[12px] text-text2">{a.holderName}</span>
      </span>
      <span onClick={(ev) => ev.stopPropagation()}>
        <MenuButton
          icon="more_vert"
          label="Account options"
          items={[...(a.isDefault ? [] : [{ label: "Use by default", onSelect: () => onAction("default") }]), { label: "Remove", onSelect: () => onAction("remove") }]}
        />
      </span>
    </div>
  );
}

const STATUS_TONE: Record<Cashout["status"], Tone> = { paid: "ok", rejected: "bad", review: "warn", requested: "gem", processing: "gem" };

function CashoutRow({ c, money }: { c: Cashout; money: string }) {
  return (
    <Panel className="flex items-center px-3.5 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="type-title block text-[15px]">{money}</span>
        <span className="type-body block text-[11.5px] text-muted">
          {thousands(c.gems)} gems · {paymentMethodLabel[c.method]} {c.accountMasked}
          {c.createdAt ? ` · ${ago(c.createdAt)}` : ""}
        </span>
        {c.status === "rejected" && c.failureReason ? <span className="type-body block text-[12px] text-bad">{c.failureReason}</span> : null}
      </span>
      <Tag text={cashoutStatusLabel[c.status]} tone={STATUS_TONE[c.status]} />
    </Panel>
  );
}
