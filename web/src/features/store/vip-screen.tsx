"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Screen } from "@/components/layout/screen";
import { FaceStack } from "@/components/ui/avatar";
import { CircleIconButton, GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { RadioDot, Tag } from "@/components/ui/misc";
import { Headline, SectionTitle } from "@/components/ui/typography";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { plural, until, usd } from "@/lib/format";
import { periodWord, type Profile, type VipPlan } from "@/lib/models";
import { managedByStore, type VipStatus } from "@/lib/payments";
import { useCatalog } from "@/stores/catalog";
import { useSocial } from "@/stores/social";
import { toast } from "@/stores/ui";
import { isVip, useWallet } from "@/stores/wallet";

/**
 * The subscription page. "Who liked you" leads as the hook, benefits are a
 * grid, plans are radio rows with the trial stated plainly, and the CTA sticks
 * to the bottom with a no-charge-today reassurance.
 */
export function VipScreen() {
  const router = useRouter();
  const wallet = useWallet((s) => s.wallet);
  const vip = isVip(wallet);
  const plans = useCatalog((s) => s.plans);
  const bonus = useCatalog((s) => s.economy.vipMonthlyBonusCoins);
  const liked = useSocial((s) => s.likedYou);
  const likedCount = useSocial((s) => s.likedYouCount);
  // Kept by id: the plan list can change live when staff edit prices.
  const [planId, setPlanId] = useState<string | null>(null);
  const [status, setStatus] = useState<VipStatus | null>(null);
  const plan = plans.find((p) => p.id === planId) ?? plans.find((p) => p.highlighted) ?? plans[0];
  const storeManaged = managedByStore(status);
  const storeName = status?.method === "appStore" ? "App Store" : "Google Play";

  useEffect(() => {
    if (!vip) return;
    useWallet
      .getState()
      .vipStatus()
      .then(setStatus)
      .catch(() => {});
  }, [vip]);

  const cancel = async () => {
    if (storeManaged && status?.manageUrl) return void window.open(status.manageUrl, "_blank", "noopener");
    try {
      await useWallet.getState().cancelVip();
      toast("VIP renewal cancelled");
    } catch (e) {
      // Billed by Google Play / the App Store: cancel there.
      const url = e instanceof ApiError ? e.details.manageUrl : undefined;
      if (typeof url === "string") return void window.open(url, "_blank", "noopener");
      toast(errorMessage(e), { error: true });
    }
  };

  const perks: [string, string, string][] = [
    ["tune", "Unlimited filters", "Gender and country cost nothing."],
    ["block", "No ads", "Never watch one again."],
    ["favorite", "See who liked you", "Reconnect with people who wanted more."],
    ["bolt", "Priority matching", "First in the queue, every time."],
    ["monetization_on", `${bonus} coins a month`, "Landed the day you subscribe."],
    ["verified", "VIP badge", "Shown on the match screen."],
  ];

  return (
    <Screen
      width="sm"
      background={
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
          style={{ background: "radial-gradient(circle min(113vw, 462px) at 50% 0, rgb(255 200 87 / .17) 0%, rgb(11 10 16 / 0) 70%)" }}
          aria-hidden
        />
      }
      bodyClassName="pt-2.5 pb-[220px]"
      footer={
        <div
          className="px-5 pt-10 pb-[calc(16px+env(safe-area-inset-bottom))]"
          style={{ backgroundImage: "linear-gradient(to top, var(--color-bg) 72%, rgb(11 10 16 / 0) 100%)" }}
        >
          {!vip && plan ? (
            <p className="flex items-center justify-center">
              <Icon name="check_circle" size={16} className="text-trust" />
              <span className="type-label ml-1.5 text-[12.5px] font-medium text-text">{plan.trialDays > 0 ? "Nothing charged today · cancel any time" : "Cancel any time"}</span>
            </p>
          ) : null}
          <div className="mt-3">
            {vip ? (
              <GhostButton
                label={storeManaged ? `Manage in ${storeName}` : "Cancel VIP"}
                icon={storeManaged ? "open_in_new" : undefined}
                expand
                className={storeManaged ? "text-text" : "text-bad"}
                onClick={() => void cancel()}
              />
            ) : plan ? (
              <GradientButton
                label={plan.trialDays > 0 ? `Start ${plan.trialDays}-day free trial` : `Subscribe · ${usd(plan.usd)}`}
                tone="amber"
                onClick={() => router.push(`/checkout?plan=${encodeURIComponent(plan.id)}`)}
              />
            ) : null}
          </div>
          <p className="type-body mt-2.5 text-center text-[11px] leading-[1.45] text-muted">
            {vip
              ? storeManaged
                ? `Billed by ${storeName}: renew or cancel it there.`
                : "Your plan stays active until the end of the period."
              : plan
                ? `${plan.trialDays > 0 ? "Then " : ""}${usd(plan.usd)}/${periodWord(plan)}, renewing until cancelled. Cancel any time. Prices in USD.`
                : ""}
          </p>
        </div>
      }
    >
      <CircleIconButton icon="arrow_back" label="Back" onClick={() => router.back()} />
      <div className="mt-1.5 flex justify-center">
        <span className="bg-gold-grad flex size-16 items-center justify-center rounded-[20px] shadow-[0_14px_42.6px_rgb(240_160_32/.3)]">
          <Icon name="workspace_premium" size={36} className="text-on-gold-icon" />
        </span>
      </div>
      <Headline text="Vibe " accent="VIP" size={36} accentColor="gold" align="center" className="mt-4" />
      <p className={cn("type-body mt-2 text-center text-[15px]", vip ? "text-gold" : "text-text2")}>{vip ? `Active · ${until(wallet.vipUntil!)}` : "Everything the free app holds back."}</p>
      <div className="h-[22px]" />
      {likedCount > 0 ? <LikedCard liked={liked} count={likedCount} vip={vip} /> : null}

      <SectionTitle text="What you get" top={26} />
      <div className="grid grid-cols-2 gap-2.5">
        {perks.map(([icon, title, sub]) => (
          <div key={title} className="glass relative rounded-[18px] p-3.5">
            <Icon name={icon} size={20} className="text-gold" />
            <p className="type-title mt-2.5 text-[13.5px] font-semibold">{title}</p>
            <p className="type-body mt-0.5 text-[11.5px] text-text2">{sub}</p>
          </div>
        ))}
      </div>

      <SectionTitle text="Choose a plan" top={26} />
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Plan">
        {plans.map((p) => (
          <PlanRow key={p.id} plan={p} on={p.id === plan?.id} onClick={() => setPlanId(p.id)} />
        ))}
      </div>
    </Screen>
  );
}

function LikedCard({ liked, count, vip }: { liked: Profile[]; count: number; vip: boolean }) {
  return (
    <div className="glass relative flex items-center rounded-[22px] border border-gold/22 px-4 py-3.5">
      <FaceStack urls={liked.slice(0, 4).map((p) => p.avatarUrl)} size={38} overlap={12} blur={vip ? 0 : 3} />
      <div className="ml-3.5 min-w-0 flex-1">
        <p className="type-title text-[15px] font-semibold">
          {count} {plural(count, "person", "people")} liked you
        </p>
        <p className="type-body truncate text-[12px] text-text2">{vip ? liked.slice(0, 3).map((p) => p.name).join(", ") : "This week. VIP shows who."}</p>
      </div>
      <Icon name={vip ? "lock_open" : "lock"} size={20} className="text-gold" />
    </div>
  );
}

function PlanRow({ plan, on, onClick }: { plan: VipPlan; on: boolean; onClick: () => void }) {
  const perWeek = plan.usd / (plan.days / 7);
  const tag = plan.trialDays > 0 ? <Tag text={`${plan.trialDays} days free`} tone="trust" /> : plan.savePercent > 0 ? <Tag text={`Save ${plan.savePercent}%`} tone="ok" /> : null;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={`${plan.label}, ${usd(plan.usd)}`}
      onClick={onClick}
      className={cn("glass relative flex items-center rounded-[18px] border px-4 py-3.5 text-left transition-colors duration-150", on ? "border-[1.5px] border-gold bg-gold/8" : "border-transparent hover:bg-surface2")}
    >
      <RadioDot on={on} tone="gold" />
      <span className="ml-3 flex-1">
        <span className="flex items-center gap-2">
          <span className="type-title text-[15px] font-semibold">{plan.label}</span>
          {tag}
        </span>
        <span className={cn("type-body mt-px block text-[12px]", on ? "text-text2" : "text-muted")}>
          {usd(perWeek)}/wk{plan.highlighted ? " · most popular" : ""}
        </span>
      </span>
      <span className="type-number text-[16px]">{usd(plan.usd)}</span>
    </button>
  );
}
