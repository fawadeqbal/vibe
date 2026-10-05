"use client";

import { useState } from "react";

import { GradientButton } from "@/components/ui/button";
import { ChoiceTile } from "@/components/ui/choice";
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { type PaymentMethod, paymentMethodLabel } from "@/lib/models";
import type { NewPayoutAccount, PayoutAccount } from "@/lib/payments";
import { normaliseAccount, payoutAccountErrors } from "@/lib/pk-validation";
import { openSheet } from "@/stores/ui";
import { useWallet } from "@/stores/wallet";

/** Opens the form; resolves with the saved account. */
export const addPayoutAccount = (opts: { methods: PaymentMethod[]; holderName: string; firstAccount: boolean }) =>
  openSheet<PayoutAccount>((close) => <PayoutAccountForm {...opts} onSaved={close} />);

/**
 * Add a JazzCash / Easypaisa number or a bank IBAN for cash-outs. Checks the
 * same rules as the server before sending; server messages (duplicates,
 * limits) show under the button.
 */
function PayoutAccountForm({ methods, holderName, firstAccount, onSaved }: { methods: PaymentMethod[]; holderName: string; firstAccount: boolean; onSaved: (a: PayoutAccount) => void }) {
  const [method, setMethod] = useState<PaymentMethod>(methods[0] ?? "jazzCash");
  const [account, setAccount] = useState("");
  const [holder, setHolder] = useState(holderName);
  const [bank, setBank] = useState("");
  const [makeDefault, setMakeDefault] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isBank = method === "bank";

  const save = async () => {
    const errs = payoutAccountErrors({ method, account, holderName: holder, bankName: isBank ? bank : undefined });
    setErrors(errs);
    setServerError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const input: NewPayoutAccount = { method, account: normaliseAccount(method, account), holderName: holder.trim(), bankName: isBank ? bank.trim() : undefined, makeDefault: firstAccount || makeDefault };
      onSaved(await useWallet.getState().addPayoutAccount(input));
    } catch (e) {
      setServerError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col px-5 pt-1 pb-4">
      <h2 className="type-title text-[19px]">Add a payout account</h2>
      <p className="type-body mt-1 text-[13px] text-text2">Where your cash-outs go. Only you see the full number.</p>
      <div className="mt-4 flex gap-2">
        {methods.map((m) => (
          <ChoiceTile
            key={m}
            tone="gem"
            selected={method === m}
            onClick={() => {
              setMethod(m);
              setErrors({});
            }}
            className="h-11 rounded-[14px]"
          >
            <span className={cn("type-title text-[13px] font-semibold", method === m ? "text-gem" : "text-text2")}>{m === "bank" ? "Bank" : paymentMethodLabel[m]}</span>
          </ChoiceTile>
        ))}
      </div>
      <TextField
        className="mt-3.5"
        inputMode={isBank ? "text" : "tel"}
        autoCapitalize={isBank ? "characters" : "none"}
        placeholder={isBank ? "IBAN, e.g. PK36SCBL0000001123456702" : `${paymentMethodLabel[method]} number, 03xx xxxxxxx`}
        value={account}
        onChange={(e) => setAccount(e.target.value)}
        error={errors.account}
        aria-label="Account"
      />
      <TextField className="mt-2.5" autoCapitalize="words" placeholder="Name on the account" value={holder} onChange={(e) => setHolder(e.target.value)} error={errors.holderName} aria-label="Name on the account" />
      {isBank ? <TextField className="mt-2.5" autoCapitalize="words" placeholder="Bank name, e.g. Meezan Bank" value={bank} onChange={(e) => setBank(e.target.value)} error={errors.bankName} aria-label="Bank name" /> : null}
      {!firstAccount ? (
        <label className="mt-2 flex h-12 cursor-pointer items-center gap-4">
          <span className={cn("flex size-[18px] items-center justify-center rounded-[2px] border-2", makeDefault ? "border-gem bg-gem" : "border-text2")}>
            {makeDefault ? <Icon name="check" size={14} className="text-bg" /> : null}
          </span>
          <input type="checkbox" className="sr-only" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
          <span className="type-body text-[14px]">Use for my next cash-outs</span>
        </label>
      ) : null}
      {serverError ? <p className="type-body mt-1.5 text-[13px] text-bad">{serverError}</p> : null}
      <div className="mt-3.5">
        <GradientButton label="Save account" tone="gem" busy={busy} onClick={() => void save()} />
      </div>
    </div>
  );
}
