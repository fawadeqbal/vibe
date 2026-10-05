"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Screen } from "@/components/layout/screen";
import { PaymentMethodIcon } from "@/components/shared/payment-method-icon";
import { PulseRings } from "@/components/ui/brand";
import { GhostButton, GradientButton, TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tag } from "@/components/ui/misc";
import { CoinIcon } from "@/components/ui/money";
import { AppBar } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/ui/text-field";
import { SectionTitle } from "@/components/ui/typography";
import { CheckoutController } from "@/lib/checkout-controller";
import { cn } from "@/lib/cn";
import { coins as fmtCoins, date, thousands, time, usd } from "@/lib/format";
import { onPaymentReturn, openHostedPage } from "@/lib/hosted-payment";
import { paymentMethodHint, paymentMethodLabel, type CoinPack, type VipPlan } from "@/lib/models";
import { isLocalCurrency, type ProductKind } from "@/lib/payments";
import { useCatalog } from "@/stores/catalog";
import { toast } from "@/stores/ui";
import { onPurchaseUpdate, useWallet } from "@/stores/wallet";

export interface CheckoutParams {
  pack?: string;
  plan?: string;
  /** Back from a hosted page in this tab: resume this purchase. */
  purchase?: string;
  status?: string;
}

/**
 * One checkout for coin packs and VIP plans. The methods come from the
 * server; a {@link CheckoutController} runs the purchase and this screen
 * draws its stage: method → (wallet details) → approve in the wallet app /
 * hosted page / bank details → result.
 */
export function CheckoutScreen({ params }: { params: CheckoutParams }) {
  const router = useRouter();
  const packs = useCatalog((s) => s.packs);
  const plans = useCatalog((s) => s.plans);
  const pack = params.pack ? packs.find((p) => p.id === params.pack) : undefined;
  const plan = params.plan ? plans.find((p) => p.id === params.plan) : undefined;

  if (!pack && !plan) {
    return (
      <Screen header={<AppBar title="Checkout" onBack={() => router.push("/store")} />}>
        <p className="type-body py-10 text-center text-[14px] text-text2">That item isn&apos;t on sale any more.</p>
      </Screen>
    );
  }
  return <Checkout key={pack?.id ?? plan!.id} pack={pack} plan={plan} resume={params.purchase} resumeStatus={params.status} />;
}

function Checkout({ pack, plan, resume, resumeStatus }: { pack?: CoinPack; plan?: VipPlan; resume?: string; resumeStatus?: string }) {
  const router = useRouter();
  const walletCoins = useWallet((s) => s.wallet.coins);
  const e = useCatalog((s) => s.economy);
  const kind: ProductKind = pack ? "coinPack" : "vipPlan";
  const price = pack?.usd ?? plan!.usd;
  const title = pack ? `${fmtCoins(pack.coins)} coins` : `VIP ${plan!.label.toLowerCase()}`;

  const c = useMemo(() => {
    const w = useWallet.getState();
    // Hosted pages come back to /payment-return. The API only accepts https://
    // return URLs, so plain-http development falls back to polling.
    const returnUrl =
      window.location.protocol === "https:"
        ? `${window.location.origin}/payment-return?${pack ? `pack=${encodeURIComponent(pack.id)}` : `plan=${encodeURIComponent(plan!.id)}`}`
        : undefined;
    return new CheckoutController(
      {
        paymentOptions: w.paymentOptions,
        createPurchase: w.createPurchase,
        purchase: w.purchase,
        confirmPurchase: w.confirmPurchase,
        checkPurchase: w.checkPurchase,
        cancelPurchase: w.cancelPurchase,
        sendBankReference: w.sendBankReference,
        onPurchaseUpdate,
      },
      kind,
      pack?.id ?? plan!.id,
      price,
      { returnUrl, fallbackPkrPerUsd: e.pkrPerUsd },
    );
    // One controller per product; prices are read once like a real receipt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const s = useSyncExternalStore(c.subscribe, c.snapshot, c.snapshot);
  const [phone, setPhone] = useState("");
  const [cnic, setCnic] = useState("");
  const [otp, setOtp] = useState("");
  const [bankRef, setBankRef] = useState("");
  const openedFor = useRef<string | null>(null);

  useEffect(() => {
    if (resume) void c.resume(resume, resumeStatus);
    else void c.load();
    const offReturn = onPaymentReturn((r) => void c.onReturn(r));
    const onVis = () => c.setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      offReturn();
      document.removeEventListener("visibilitychange", onVis);
      c.dispose();
    };
  }, [c, resume, resumeStatus]);

  const openHosted = () => {
    const a = s.purchase?.action;
    if (!a?.url) return;
    if (!openHostedPage(a)) toast("Finish the payment on the page that opened.");
  };

  // Entering the hosted-page step opens the page once per purchase.
  useEffect(() => {
    if (s.stage === "redirect" && s.purchase && openedFor.current !== s.purchase.id) {
      openedFor.current = s.purchase.id;
      openHosted();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.stage, s.purchase?.id]);

  const canLeave = s.stage !== "processing" && !s.busy;
  const priceText = (() => {
    const p = c.price;
    return p.currency === "PKR" ? `Rs ${thousands(Math.round(p.amount))}` : usd(p.amount);
  })();
  const local = c.price.currency === "PKR";

  const summary = (
    <Panel gradient={pack ? undefined : "vipCard"} className="flex items-center border-gold/30">
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-[14px]", pack ? "bg-gold/12" : "bg-gold-grad")}>
        {pack ? <CoinIcon size={26} /> : <Icon name="workspace_premium" size={26} className="text-on-gold-icon" />}
      </span>
      <span className="ml-3.5 min-w-0 flex-1">
        <span className="type-title block text-[16px]">{title}</span>
        <span className="type-body block text-[12px] text-text2">{pack ? (pack.bonusPercent > 0 ? `+${pack.bonusPercent}% bonus coins` : pack.name) : "Renews automatically. Cancel any time."}</span>
      </span>
      <span className="flex flex-col items-end">
        <span className="type-number text-[18px]">{priceText}</span>
        <span className="type-body text-[11px] text-text2">{local ? usd(price) : `≈ Rs ${thousands(Math.round(price * c.usdToPkr))}`}</span>
      </span>
    </Panel>
  );

  const errorLine = s.error ? <p className="type-body mt-3 text-[13px] text-bad">{s.error}</p> : null;
  const methodHeader = s.method ? (
    <div className="mt-[18px] flex items-center">
      <PaymentMethodIcon method={s.method.method} />
      <span className="type-title ml-3 flex-1 text-[17px]">{s.method.label}</span>
    </div>
  ) : null;

  let body: ReactNode;
  switch (s.stage) {
    case "loading":
      body = (
        <Center>
          <Spinner className="text-gold" />
        </Center>
      );
      break;

    case "methods":
      body = (
        <>
          {summary}
          <SectionTitle text="Pay with" top={26} />
          <div className="flex flex-col gap-2">
            {(s.options?.methods ?? []).map((o) => (
              <Panel key={o.method} onClick={() => void c.choose(o)} className="flex items-center px-4 py-3.5">
                <PaymentMethodIcon method={o.method} />
                <span className="ml-3.5 min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="type-title truncate text-[15px] font-semibold">{o.label || paymentMethodLabel[o.method]}</span>
                    {!o.live ? <Tag text="Test" tone="warn" /> : null}
                  </span>
                  <span className="type-body block text-[12px] text-text2">
                    {paymentMethodHint[o.method]}
                    {isLocalCurrency(o) ? ` Rs ${thousands(Math.round(price * c.usdToPkr))}` : ""}
                  </span>
                </span>
                <Icon name="chevron_right" className="text-muted" />
              </Panel>
            ))}
          </div>
          <p className="type-body mt-4 text-center text-[11px] text-muted">Payments are processed by the Vibe server; nothing is charged until you confirm.</p>
        </>
      );
      break;

    case "details": {
      const m = s.method!;
      const needsCnic = m.needs.includes("cnicLast6");
      body = (
        <>
          {summary}
          {methodHeader}
          <p className="type-label mt-4 text-[13px] text-text2">{m.label} number</p>
          <TextField className="mt-2" type="tel" inputMode="tel" autoComplete="tel" placeholder="03xx xxxxxxx" value={phone} onChange={(ev) => setPhone(ev.target.value)} aria-label={`${m.label} number`} />
          {needsCnic ? (
            <>
              <p className="type-label mt-3.5 text-[13px] text-text2">Last 6 digits of your CNIC</p>
              <TextField className="mt-2" inputMode="numeric" maxLength={6} placeholder="123456" value={cnic} onChange={(ev) => setCnic(ev.target.value.replace(/\D/g, "").slice(0, 6))} aria-label="Last 6 digits of your CNIC" />
              <p className="type-body mt-1 text-[11px] text-muted">JazzCash asks for these to send the payment request to your phone.</p>
            </>
          ) : null}
          {errorLine}
          <div className="mt-[22px]">
            <GradientButton label={`Pay ${priceText}`} busy={s.busy} onClick={() => void c.submitDetails(phone, cnic)} />
          </div>
          <div className="mt-2 flex flex-col items-center">
            {m.method === "jazzCash" ? (
              <TextButton className="text-[13px] text-text2" onClick={() => void c.payOnProviderPage()}>
                Pay on the JazzCash page instead
              </TextButton>
            ) : null}
            <TextButton className="text-[13px] text-text2" onClick={c.chooseAnother}>
              Choose another method
            </TextButton>
          </div>
        </>
      );
      break;
    }

    case "processing":
      body = (
        <Center>
          <PulseRings size={160} color="var(--color-gold)">
            <Spinner className="text-gold" />
          </PulseRings>
          <p className="type-title mt-2 text-[17px]">Talking to {s.method?.label ?? "the payment provider"}…</p>
          <p className="type-body mt-1 text-[13px] text-text2">Do not close this page.</p>
        </Center>
      );
      break;

    case "otp":
      body = (
        <>
          {summary}
          {methodHeader}
          <p className="type-label mt-4 text-[13px] text-text2">Enter the code sent to your phone</p>
          <TextField className="mt-2" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="4-digit code" value={otp} onChange={(ev) => setOtp(ev.target.value.replace(/\D/g, "").slice(0, 6))} aria-label="Code" />
          {s.purchase?.action?.instructions ? <p className="type-body mt-1 text-[11px] text-muted">{s.purchase.action.instructions}</p> : null}
          {errorLine}
          <div className="mt-[22px]">
            <GradientButton label={`Confirm ${priceText}`} busy={s.busy} onClick={() => void c.confirmOtp(otp)} />
          </div>
          <div className="mt-2 flex justify-center">
            <TextButton className="text-[13px] text-text2" onClick={s.busy ? undefined : () => void c.cancel()}>
              Cancel payment
            </TextButton>
          </div>
        </>
      );
      break;

    case "approveInApp": {
      const label = s.method?.label ?? "wallet";
      body = (
        <>
          {summary}
          <div className="mt-7 flex justify-center">
            <PulseRings size={150} color="var(--color-gold)">
              <span className="flex size-16 items-center justify-center rounded-full bg-gold/15">
                <Icon name="phone_iphone" size={32} className="text-gold" />
              </span>
            </PulseRings>
          </div>
          <h2 className="type-display mt-2 text-center text-[24px]">Approve in your {label} app</h2>
          <p className="type-body mt-2 text-center text-[14px] leading-[1.45] text-text2">{s.purchase?.action?.instructions ?? `Open the ${label} app and approve the payment request.`}</p>
          {s.purchase?.expiresAt ? <p className="type-body mt-2 text-center text-[12px] text-muted">Expires at {time(s.purchase.expiresAt)}</p> : null}
          <p className="mt-2.5 flex items-center justify-center">
            <Spinner size={12} stroke={1.6} className="text-muted" />
            <span className="type-body ml-2 text-[12px] text-muted">Checking automatically</span>
          </p>
          {errorLine}
          <div className="mt-[26px] flex flex-col gap-2">
            {s.purchase ? <GradientButton label="I've approved" busy={s.busy} onClick={() => void c.checkNow()} /> : null}
            <GhostButton label="Cancel payment" expand onClick={s.busy ? undefined : () => void c.cancel()} />
          </div>
        </>
      );
      break;
    }

    case "redirect":
      body = (
        <>
          {summary}
          <div className="mt-7 flex justify-center">
            <Icon name="open_in_browser" size={56} className="text-violet" />
          </div>
          <h2 className="type-display mt-3 text-center text-[24px]">Finish on the secure page</h2>
          <p className="type-body mt-2 text-center text-[14px] leading-[1.45] text-text2">
            {s.purchase?.action?.instructions ?? "Complete the payment on the page that opened. You will come back here automatically."}
          </p>
          {errorLine}
          <div className="mt-[26px] flex flex-col gap-2">
            <GradientButton label="Open payment page" icon="lock" onClick={openHosted} />
            <GhostButton label="I've paid" expand onClick={s.busy ? undefined : () => void c.checkNow()} />
          </div>
          <div className="mt-2 flex justify-center">
            <TextButton className="text-[13px] text-text2" onClick={s.busy ? undefined : () => void c.cancel()}>
              Cancel payment
            </TextButton>
          </div>
        </>
      );
      break;

    case "bankTransfer": {
      const b = s.purchase?.action?.bank ?? null;
      const row = (k: string, v: string, copy = true) => (
        <div className="flex items-center py-1.5">
          <span className="type-body w-[92px] shrink-0 text-[13px] text-text2">{k}</span>
          <span className="type-body flex-1 text-[14px] font-semibold break-all select-all">{v}</span>
          {copy ? (
            <button
              type="button"
              aria-label={`Copy ${k}`}
              title={`Copy ${k}`}
              className="flex size-8 items-center justify-center rounded-full text-text2 hover:bg-white/6"
              onClick={() => {
                void navigator.clipboard?.writeText(v);
                toast(`${k} copied`);
              }}
            >
              <Icon name="copy" size={18} />
            </button>
          ) : null}
        </div>
      );
      body = (
        <>
          {summary}
          <SectionTitle text="Transfer to" top={22} />
          <Panel>
            {b ? (
              <>
                {row("Bank", b.bankName, false)}
                {row("Title", b.accountTitle)}
                {row("IBAN", b.iban)}
                {row("Reference", b.reference)}
                {row("Amount", b.amount)}
              </>
            ) : (
              <p className="type-body text-[14px] text-text2">{s.purchase?.action?.instructions ?? ""}</p>
            )}
          </Panel>
          {b ? <p className="type-body mt-2.5 text-[12.5px] text-text2">Write the reference {b.reference} in the transfer note so we can match it.</p> : null}
          <SectionTitle text="Already sent it?" top={22} />
          {s.bankReferenceSent ? (
            <p className="flex items-center">
              <Icon name="check_circle" size={18} className="text-ok" />
              <span className="type-body ml-2 text-[13px] text-text2">Thanks — we will match it with your transfer.</span>
            </p>
          ) : (
            <>
              <TextField placeholder="Your bank's transaction reference (optional)" value={bankRef} onChange={(ev) => setBankRef(ev.target.value)} aria-label="Bank reference" />
              <div className="mt-2.5">
                <GhostButton label="Send reference" expand onClick={s.busy ? undefined : () => void c.sendBankReference(bankRef)} />
              </div>
            </>
          )}
          {errorLine}
          <p className="mt-[18px] flex items-center">
            <Icon name="notifications_active" size={16} className="text-gold" />
            <span className="type-body ml-2 text-[12.5px] text-text2">We&apos;ll notify you when the money arrives — usually within a working day.</span>
          </p>
          <div className="mt-5">
            <GradientButton label="Done" onClick={() => router.push(pack ? "/store" : "/vip")} />
          </div>
          <div className="mt-1 flex justify-center">
            <TextButton className="text-[13px] text-text2" onClick={s.busy ? undefined : () => void c.cancel()}>
              Cancel this transfer
            </TextButton>
          </div>
        </>
      );
      break;
    }

    case "succeeded": {
      const p = s.purchase;
      body = (
        <Result
          icon={pack ? "check" : "workspace_premium"}
          iconClass="bg-gold-grad text-on-gold-icon shadow-[0_0_47.2px_rgb(255_200_87/.4)]"
          title={pack ? "Coins added" : "You are VIP"}
          text={pack ? `Your balance is now ${fmtCoins(walletCoins)} coins.` : `Filters are free, ads are gone, and ${e.vipMonthlyBonusCoins} bonus coins just landed.`}
          extra={
            <Panel className="mt-6">
              <Kv k="Item" v={title} />
              <Kv k="Paid" v={`${priceText} · ${s.method?.label ?? (p?.method ? paymentMethodLabel[p.method] : "")}`} />
              <Kv k="Receipt" v={p?.receipt ?? "—"} />
              <Kv k="Date" v={date(p?.completedAt ?? new Date())} />
            </Panel>
          }
          actions={<GradientButton label="Done" onClick={() => router.push(pack ? "/store" : "/vip")} />}
        />
      );
      break;
    }

    case "failed":
    case "expired": {
      const expired = s.stage === "expired";
      body = (
        <Result
          icon={expired ? "timer_off" : "close"}
          iconClass={expired ? "bg-warn/18 text-warn" : "bg-bad/18 text-bad"}
          title={expired ? "Payment not completed" : "Payment did not go through"}
          titleSize={26}
          text={s.error ?? "Something went wrong."}
          extra={<p className="type-body mt-1.5 text-center text-[13px] text-muted">Nothing was charged.</p>}
          actions={
            <div className="flex flex-col gap-2">
              <GradientButton label="Try again" onClick={() => void c.retry()} />
              {(s.options?.methods.length ?? 0) > 1 ? <GhostButton label="Choose another method" expand onClick={c.chooseAnother} /> : null}
            </div>
          }
        />
      );
      break;
    }
  }

  const fill = s.stage === "loading" || s.stage === "processing" || s.stage === "succeeded" || s.stage === "failed" || s.stage === "expired";
  return (
    <Screen width="sm" header={<AppBar title="Checkout" onBack={canLeave ? () => router.back() : undefined} />} bodyClassName={cn("pt-2 pb-6", fill && "flex min-h-full flex-col")}>
      <div key={s.stage} className={cn(fill && "flex flex-1 flex-col")} style={{ animation: "vibe-fade-in 250ms ease-out" }}>
        {body}
      </div>
    </Screen>
  );
}

const Center = ({ children }: { children: ReactNode }) => <div className="flex flex-1 flex-col items-center justify-center py-16">{children}</div>;

function Result({ icon, iconClass, title, titleSize = 28, text, extra, actions }: { icon: string; iconClass: string; title: string; titleSize?: number; text: string; extra?: ReactNode; actions: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col px-1 pt-4">
      <div className="flex-1" />
      <span className={cn("mx-auto flex size-24 items-center justify-center rounded-full", iconClass)}>
        <Icon name={icon} size={52} />
      </span>
      <h2 className="type-display mt-5 text-center" style={{ fontSize: titleSize }}>
        {title}
      </h2>
      <p className="type-body mt-2 text-center text-[15px] text-text2">{text}</p>
      {extra}
      <div className="min-h-8 flex-1" />
      {actions}
    </div>
  );
}

const Kv = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-center py-[5px]">
    <span className="type-body text-[13px] text-text2">{k}</span>
    <span className="type-body ml-3 flex-1 truncate text-right text-[13px] font-semibold">{v}</span>
  </div>
);
