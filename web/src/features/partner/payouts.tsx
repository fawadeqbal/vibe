"use client";

import { useEffect, useState } from "react";

import { GradientButton } from "@/components/ui/button";
import { EmptyState, Tag } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { type AffiliatePayout, type PayoutStatus, usdCents } from "@/lib/affiliate";
import { ApiError, errorMessage } from "@/lib/api/errors";
import type { Tone } from "@/lib/colors";
import { ago, pkr } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/models";
import { useAffiliate } from "@/stores/affiliate";
import { useCatalog } from "@/stores/catalog";
import { useSession } from "@/stores/session";
import { openSheet, toast } from "@/stores/ui";
import { useWallet } from "@/stores/wallet";

import { addPayoutAccount } from "@/features/wallet/payout-account-form";
import { PayoutAccountList } from "@/features/wallet/payout-account-list";

/** Pick a saved payout account (the same ones gem cash-outs use) and send the whole available balance. */
export const requestPartnerPayout = (availableUsdCents: number) => openSheet<AffiliatePayout>((close) => <PayoutSheet available={availableUsdCents} onDone={close} />);

function PayoutSheet({ available, onDone }: { available: number; onDone: (p: AffiliatePayout) => void }) {
  const accounts = useWallet((s) => s.payoutAccounts);
  const methods = useWallet((s) => s.payoutMethods);
  const loaded = useWallet((s) => s.payoutsLoaded);
  const pkrPerUsd = useCatalog((s) => s.economy.pkrPerUsd);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = selected ?? (accounts.find((a) => a.isDefault) ?? accounts[0])?.id ?? null;

  useEffect(() => {
    void useWallet
      .getState()
      .loadPayouts()
      .catch((e: unknown) => setError(errorMessage(e)));
  }, []);

  const add = async () => {
    const a = await addPayoutAccount({ methods, holderName: useSession.getState().me?.name ?? "", firstAccount: !accounts.length });
    if (a) setSelected(a.id);
  };

  const send = async () => {
    if (!chosen) return setError("Add an account to send the money to.");
    setBusy(true);
    setError(null);
    try {
      onDone(await useAffiliate.getState().requestPayout(chosen));
    } catch (e) {
      if (e instanceof ApiError && e.code === "AFFILIATE_BELOW_MINIMUM") setError(`The minimum is ${usdCents(Number(e.details.minimumUsdCents ?? 0))}.`);
      else if (e instanceof ApiError && e.code === "AFFILIATE_PAYOUT_OPEN") setError("You already have a payout on its way.");
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col px-5 pt-1 pb-5">
      <h2 className="type-title-lg text-[20px]">Cash out {usdCents(available)}</h2>
      <p className="type-body mt-1 text-[13px] text-text2">About {pkr((available / 100) * pkrPerUsd)} at today&apos;s rate. Paid within 3 business days.</p>
      <p className="type-overline mt-5 mb-2.5">Pay to</p>
      {!loaded ? (
        <div className="flex justify-center p-4">
          <Spinner size={24} stroke={3} className="text-gem" />
        </div>
      ) : (
        <PayoutAccountList accounts={accounts} selected={chosen} onSelect={setSelected} onAdd={() => void add()} />
      )}
      {error ? <p className="type-body mt-2.5 text-[13px] text-bad">{error}</p> : null}
      <div className="mt-4">
        <GradientButton tone="gold" label={`Cash out ${usdCents(available)}`} busy={busy} onClick={chosen ? () => void send() : undefined} />
      </div>
    </div>
  );
}

const TONE: Record<PayoutStatus, Tone> = { REQUESTED: "gold", PAID: "ok", REJECTED: "bad" };
const LABEL: Record<PayoutStatus, string> = { REQUESTED: "On its way", PAID: "Paid", REJECTED: "Returned" };

export function PayoutRow({ p }: { p: AffiliatePayout }) {
  return (
    <Panel className="flex items-center px-3.5 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="type-title block text-[15px]">
          {usdCents(p.usdCents)} <span className="type-body text-[12.5px] font-normal text-text2">· {pkr(p.amountPkr)}</span>
        </span>
        <span className="type-body block text-[11.5px] text-muted">
          {paymentMethodLabel[p.method]} {p.accountMasked} · {ago(p.createdAt)}
          {p.reference ? ` · ref ${p.reference}` : ""}
        </span>
        {p.status === "REJECTED" && p.failureReason ? <span className="type-body block text-[12px] text-bad">{p.failureReason}</span> : null}
      </span>
      <Tag text={LABEL[p.status]} tone={TONE[p.status]} />
    </Panel>
  );
}

export function PayoutList({ payouts }: { payouts: AffiliatePayout[] }) {
  if (!payouts.length) return <EmptyState className="py-4" icon="payments" iconVariant="outlined" title="No payouts " accent="yet" body="When commissions become available you can cash them out here." />;
  return (
    <div className="flex flex-col gap-1.5">
      {payouts.map((p) => (
        <PayoutRow key={p.id} p={p} />
      ))}
    </div>
  );
}

/** Shown after a request. */
export function payoutSentToast(p: AffiliatePayout) {
  toast(`${usdCents(p.usdCents)} on its way to ${paymentMethodLabel[p.method]} ${p.accountMasked}`);
}
