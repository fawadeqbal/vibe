"use client";

import { PaymentMethodIcon } from "@/components/shared/payment-method-icon";
import { Icon } from "@/components/ui/icon";
import { MenuButton } from "@/components/ui/menu";
import { Tag } from "@/components/ui/misc";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { paymentMethodLabel } from "@/lib/models";
import type { PayoutAccount } from "@/lib/payments";

/** Saved payout accounts as radio rows plus "Add…" (gem cash-outs and creator-partner payouts share it). */
export function PayoutAccountList({
  accounts,
  selected,
  onSelect,
  onAdd,
  onAction,
}: {
  accounts: PayoutAccount[];
  selected: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  /** Make default / remove (the cash-out screen); omit for a plain picker. */
  onAction?: (a: PayoutAccount, action: "default" | "remove") => void;
}) {
  return (
    <div role="radiogroup" aria-label="Pay to" className="flex flex-col gap-2">
      {accounts.map((a) => (
        <AccountRow key={a.id} a={a} on={a.id === selected} onSelect={() => onSelect(a.id)} onAction={onAction ? (act) => onAction(a, act) : undefined} />
      ))}
      <Panel onClick={accounts.length >= 5 ? undefined : onAdd} className="flex items-center px-4 py-3.5">
        <span className="flex size-10 items-center justify-center rounded-[12px] bg-gem/12">
          <Icon name="add" className="text-gem" />
        </span>
        <span className="type-title ml-3.5 flex-1 text-[14px] font-semibold">{accounts.length >= 5 ? "Up to 5 accounts — remove one to add another" : "Add JazzCash, Easypaisa or a bank account"}</span>
      </Panel>
    </div>
  );
}

function AccountRow({ a, on, onSelect, onAction }: { a: PayoutAccount; on: boolean; onSelect: () => void; onAction?: (action: "default" | "remove") => void }) {
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
      {onAction ? (
        <span onClick={(ev) => ev.stopPropagation()}>
          <MenuButton
            icon="more_vert"
            label="Account options"
            items={[...(a.isDefault ? [] : [{ label: "Use by default", onSelect: () => onAction("default") }]), { label: "Remove", onSelect: () => onAction("remove") }]}
          />
        </span>
      ) : (
        <span className="w-3" />
      )}
    </div>
  );
}
