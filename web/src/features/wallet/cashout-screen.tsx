"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Screen } from "@/components/layout/screen";
import { confirm } from "@/components/shared/dialogs";
import { startSelfieVerification } from "@/components/shared/selfie-verification";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState, Tag } from "@/components/ui/misc";
import { GemIcon } from "@/components/ui/money";
import { AppBar } from "@/components/ui/page-header";
import { GroupCard, GroupRow, Panel } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { SectionTitle } from "@/components/ui/typography";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { alpha, type Tone } from "@/lib/colors";
import { date, figure, gemsAsUsd, thousands, usd } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/models";
import { type Cashout, cashoutStatusLabel, type PayoutAccount } from "@/lib/payments";
import { useCatalog } from "@/stores/catalog";
import { useSession } from "@/stores/session";
import { toast } from "@/stores/ui";
import { canCashOut, useWallet } from "@/stores/wallet";

import { addPayoutAccount } from "./payout-account-form";
import { PayoutAccountList } from "./payout-account-list";

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
      const ok = await confirm({
        title: "Remove this account?",
        body: `${paymentMethodLabel[a.method]} ${a.accountMasked} will no longer receive cash-outs.`,
        ok: "Remove",
        cancel: "Keep",
        okTone: "bad",
      });
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
          {money(done)} to your {paymentMethodLabel[done.method]} {done.accountMasked}.{" "}
          {done.status === "review" ? "Larger cash-outs get a quick check first; " : ""}Payouts land within 3 business days. We will notify you.
        </p>
        <div className="min-h-8 flex-1" />
        <GradientButton label="Done" tone="gem" onClick={() => router.push("/wallet")} />
      </Screen>
    );
  }

  return (
    <Screen
      width="sm"
      header={<AppBar title="Cash out gems" onBack={() => router.back()} />}
      bodyClassName="pt-2"
      footer={
        <div className="border-t border-line-soft bg-bg px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-[560px]">
            <GradientButton
              label={can ? `Cash out ${figure(gems)} gems` : "Not enough gems yet"}
              tone="gem"
              height={52}
              busy={busy}
              onClick={can && selected ? () => void submit() : undefined}
            />
            <p className="type-body mt-2 text-center text-[12px] text-muted">
              {can ? "Paid within 3 business days. A selfie check above the monthly limit." : `Available once you reach ${thousands(e.cashoutMinGems)} gems`}
            </p>
          </div>
        </div>
      }
    >
      <Panel>
        <div className="flex flex-col gap-1.5">
          <span className="type-label flex items-center gap-1.5 text-[12.5px] text-gem">
            <GemIcon size={16} />
            {can ? "You can cash out" : "Your gems"}
          </span>
          <span className="type-number-lg text-[30px] leading-none" title={`${thousands(gems)} gems`}>
            {figure(gems)}
          </span>
          <span className="type-body text-[12px] text-text2">
            gems ≈ {gemsAsUsd(gems, e.usdPerGem)} · Rs {thousands(estimatePkr)}
          </span>
        </div>
        <div
          className="mt-3.5 h-2 overflow-hidden rounded-[8px] bg-surface3"
          role="progressbar"
          aria-label="Toward the smallest cash-out"
          aria-valuenow={Math.round(Math.min(1, gems / e.cashoutMinGems) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="bg-gem-grad h-full rounded-[8px]" style={{ width: `${Math.min(1, gems / e.cashoutMinGems) * 100}%` }} />
        </div>
        <p className="type-body mt-2 text-[12px] text-text2">
          {can
            ? "You're over the minimum. Pick where to send it."
            : `The smallest cash-out is ${thousands(e.cashoutMinGems)} gems. ${thousands(e.cashoutMinGems - gems)} to go.`}
        </p>
      </Panel>

      <SectionTitle text="Pay to" action="Add" onAction={() => void add()} bottom={10} />
      {loading && !w.payoutsLoaded ? (
        <div className="flex justify-center p-5">
          <Spinner className="text-gem" />
        </div>
      ) : loadError && !w.payoutsLoaded ? (
        <EmptyState icon="cloud_off" title="Couldn't load your accounts" body={loadError} action={<GhostButton label="Try again" onClick={load} />} />
      ) : (
        <PayoutAccountList
          accounts={w.payoutAccounts}
          selected={selected}
          onSelect={setSelected}
          onAdd={() => void add()}
          onAction={(a, act) => void accountAction(a, act)}
        />
      )}

      {w.cashouts.length ? (
        <>
          <SectionTitle text="Cash-outs" bottom={10} />
          <GroupCard>
            {w.cashouts.map((c) => (
              <CashoutRow key={c.id} c={c} money={money(c)} />
            ))}
          </GroupCard>
        </>
      ) : null}

      <SectionTitle text="How gems work" bottom={10} />
      <GroupCard>
        <GroupRow icon="redeem" iconColor="gem" iconBg={alpha("gem", 0.13)} title="People send you gifts" subtitle="On calls and in chats" />
        <GroupRow
          icon="percent"
          iconColor="gem"
          iconBg={alpha("gem", 0.13)}
          title={`You keep ${e.giftGemShare === 0.5 ? "half" : `${Math.round(e.giftGemShare * 100)}%`} of a gift as gems`}
          subtitle={`1 gem = ${usd(e.usdPerGem)}, paid in rupees at the day's rate`}
        />
        <GroupRow
          icon="schedule"
          iconColor="gem"
          iconBg={alpha("gem", 0.13)}
          title="Paid within 3 business days"
          subtitle="Bigger amounts get a quick check first"
        />
      </GroupCard>
    </Screen>
  );
}

const STATUS_TONE: Record<Cashout["status"], Tone> = { paid: "ok", rejected: "bad", review: "warn", requested: "gem", processing: "gem" };

function CashoutRow({ c, money }: { c: Cashout; money: string }) {
  return (
    <GroupRow
      icon="payments"
      iconColor="gem"
      iconBg={alpha("gem", 0.13)}
      title={`${money} to ${paymentMethodLabel[c.method]}`}
      subtitle={
        <>
          {c.createdAt ? `${date(c.createdAt)} · ` : ""}
          {thousands(c.gems)} gems · {c.accountMasked}
          {c.status === "rejected" && c.failureReason ? <span className="block text-bad">{c.failureReason}</span> : null}
        </>
      }
      trailing={<Tag text={cashoutStatusLabel[c.status]} tone={STATUS_TONE[c.status]} />}
    />
  );
}
