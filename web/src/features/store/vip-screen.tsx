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
import type { Economy } from "@/lib/catalog";
import { periodWord, type VipPlan } from "@/lib/models";
import { managedByStore, type VipStatus } from "@/lib/payments";
import { useCatalog } from "@/stores/catalog";
import { useDiscover } from "@/stores/discover";
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
  const videoLiked = useSocial((s) => s.likedYou);
  const videoLikedCount = useSocial((s) => s.likedYouCount);
  const discoverLiked = useDiscover((s) => s.likedYou);
  const discoverCount = useDiscover((s) => s.status?.likedYou.count ?? 0);
  const e = useCatalog((s) => s.economy);
  // Discover likes are the ones you can answer; fall back to likes from video calls.
  const useDiscoverLikes = discoverCount >= videoLikedCount && discoverCount > 0;
  const likedCount = useDiscoverLikes ? discoverCount : videoLikedCount;
  const likedUrls = useDiscoverLikes
    ? discoverLiked?.unlocked
      ? discoverLiked.people.map((p) => p.profile.avatarUrl)
      : (discoverLiked?.previews ?? [])
    : videoLiked.map((p) => p.avatarUrl);
  const likedNames = useDiscoverLikes ? (discoverLiked?.people ?? []).map((p) => p.profile.name) : videoLiked.map((p) => p.name);
  // Kept by id: the plan list can change live when staff edit prices.
  const [planId, setPlanId] = useState<string | null>(null);
  const [status, setStatus] = useState<VipStatus | null>(null);
  const plan = plans.find((p) => p.id === planId) ?? plans.find((p) => p.highlighted) ?? plans[0];
  const storeManaged = managedByStore(status);
  const storeName = status?.method === "appStore" ? "App Store" : "Google Play";

  useEffect(() => {
    void useDiscover.getState().loadStatus();
    void useDiscover.getState().loadLikedYou();
  }, []);

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

  const groups = vipPerkGroups(e, bonus);
  const compare = vipComparison(e, bonus);

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
              <span className="type-label ml-1.5 text-[12.5px] font-medium text-text">
                {plan.trialDays > 0 ? "Nothing charged today · cancel any time" : "Cancel any time"}
              </span>
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
      <p className={cn("type-body mt-2 text-center text-[15px]", vip ? "text-gold" : "text-text2")}>
        {vip ? `Active · ${until(wallet.vipUntil!)}` : "Meet more people, faster: unlimited likes, see who liked you, free filters."}
      </p>
      <div className="h-[22px]" />
      {likedCount > 0 ? (
        <LikedCard
          urls={likedUrls}
          names={likedNames}
          count={likedCount}
          vip={vip}
          onOpen={useDiscoverLikes ? () => router.push("/discover/liked-you") : undefined}
        />
      ) : null}

      <SectionTitle text="What you get" top={26} />
      <div className="flex flex-col gap-2.5">
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title} className="rounded-[20px] border border-white/7 bg-surface px-4 pt-3.5 pb-2">
            <p className={cn("type-label flex items-center gap-1.5 text-[12.5px] font-bold", g.color)}>
              <Icon name={g.icon} size={16} /> {g.title}
            </p>
            <ul className="mt-1.5">
              {g.items.map(([title, sub]) => (
                <li key={title} className="flex gap-3 py-2">
                  <Icon name="check_circle" variant="filled" size={18} className={cn("mt-px shrink-0", g.color)} />
                  <span className="min-w-0">
                    <span className="type-title block text-[14px] font-semibold">{title}</span>
                    {sub ? <span className="type-body block text-[12px] leading-[1.4] text-text2">{sub}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <SectionTitle text="Free vs VIP" top={26} />
      <table className="w-full overflow-hidden rounded-[20px] border border-white/7 bg-surface text-[13px]">
        <thead>
          <tr>
            <th scope="col" className="sr-only">
              Feature
            </th>
            <th scope="col" className="type-label w-[84px] px-2 py-2.5 text-center text-[12px] font-semibold text-muted">
              Free
            </th>
            <th scope="col" className="type-label w-[84px] px-2 py-2.5 text-center text-[12px] font-bold text-gold">
              VIP
            </th>
          </tr>
        </thead>
        <tbody>
          {compare.map(([k, free, vipV]) => (
            <tr key={k} className="border-t border-white/6">
              <th scope="row" className="type-body px-4 py-2.5 text-left font-medium text-text">
                {k}
              </th>
              <td className="type-body px-2 py-2.5 text-center text-muted">{free}</td>
              <td className="type-body px-2 py-2.5 text-center font-semibold text-gold">{vipV}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="type-body mt-2.5 text-[11.5px] leading-[1.45] text-muted">Video calls in chat are the same for everyone: both people have to allow them.</p>

      <SectionTitle text="Choose a plan" top={26} />
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Plan">
        {plans.map((p) => (
          <PlanRow key={p.id} plan={p} on={p.id === plan?.id} onClick={() => setPlanId(p.id)} />
        ))}
      </div>
    </Screen>
  );
}

function LikedCard({ urls, names, count, vip, onOpen }: { urls: string[]; names: string[]; count: number; vip: boolean; onOpen?: () => void }) {
  const body = (
    <>
      <FaceStack urls={urls.slice(0, 4)} size={38} overlap={12} blur={vip ? 0 : 3} />
      <div className="ml-3.5 min-w-0 flex-1 text-left">
        <p className="type-title text-[15px] font-semibold">
          {count} {plural(count, "person", "people")} liked you
        </p>
        <p className="type-body truncate text-[12px] text-text2">
          {vip ? names.slice(0, 3).join(", ") : "VIP shows who they are. Like back and it's a match."}
        </p>
      </div>
      <Icon name={onOpen ? "chevron_right" : vip ? "lock_open" : "lock"} size={20} className="text-gold" />
    </>
  );
  const cls = "flex w-full items-center rounded-[22px] border border-gold/22 bg-surface px-4 py-3.5";
  return onOpen ? (
    <button type="button" onClick={onOpen} className={cn(cls, "hover:bg-surface2")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

type PerkGroup = { title: string; icon: string; color: string; items: [string, string][] };

/** What VIP adds, grouped the way people use the app. Numbers come from the live catalog. */
export function vipPerkGroups(e: Economy, bonus: number): PerkGroup[] {
  const supers = e.discoverVipFreeSuperLikes;
  const discover: [string, string][] = [
    ["Unlimited likes", `Free accounts get ${e.discoverFreeLikesPerDay} a day.`],
    ["See who liked you", "Their faces, not a blur. Like back and it's a match."],
    ...(supers > 0 ? ([[`${supers} free Super Like${supers === 1 ? "" : "s"} a day`, "They see you first, with a star."]] as [string, string][]) : []),
    ["Free Undo", "Bring back someone you passed by mistake."],
    ...(e.discoverPremiumFilters
      ? ([["Every Discover filter", `Gender, country, online now, verified. Others pay ${e.discoverFilterPassCost} coins for ${e.discoverFilterPassHours} hours.`]] as [string, string][])
      : []),
  ];
  return [
    ...(e.discoverEnabled ? [{ title: "Discover", icon: "style", color: "text-pink-soft", items: discover }] : []),
    {
      title: "Video Match",
      icon: "videocam",
      color: "text-lavender",
      items: [
        ["Free gender and country filters", "No coins per match."],
        ["Priority in the queue", "Paired a little sooner when it's busy."],
      ],
    },
    {
      title: "Extras",
      icon: "workspace_premium",
      color: "text-gold",
      items: [
        [`${bonus} coins every month`, "Added the day you subscribe, then every month."],
        ["No ads", ""],
        ["Gold VIP badge", "On your profile and in calls."],
      ],
    },
  ];
}

/** The Free vs VIP table. */
export function vipComparison(e: Economy, bonus: number): [string, string, string][] {
  return [
    ...(e.discoverEnabled
      ? ([
          ["Likes a day", String(e.discoverFreeLikesPerDay), "Unlimited"],
          ["See who liked you", "Blurred", "Yes"],
          [
            "Super Likes",
            `${e.discoverSuperLikeCost} coins`,
            e.discoverVipFreeSuperLikes > 0 ? `${e.discoverVipFreeSuperLikes} free/day` : `${e.discoverSuperLikeCost} coins`,
          ],
          ["Undo a pass", `${e.discoverUndoCost} coins`, "Free"],
          ...(e.discoverPremiumFilters ? ([["Discover filters", `Age · ${e.discoverFilterPassCost} coins/${e.discoverFilterPassHours}h`, "All"]] as [string, string, string][]) : []),
        ] as [string, string, string][])
      : []),
    ["Match filters", `${Math.min(e.genderFilterCost, e.regionFilterCost)}+ coins`, "Free"],
    ["Coins each month", "—", String(bonus)],
    ["Ads", "Yes", "None"],
  ];
}

function PlanRow({ plan, on, onClick }: { plan: VipPlan; on: boolean; onClick: () => void }) {
  const perWeek = plan.usd / (plan.days / 7);
  const tag =
    plan.trialDays > 0 ? (
      <Tag text={`${plan.trialDays} days free`} tone="trust" />
    ) : plan.savePercent > 0 ? (
      <Tag text={`Save ${plan.savePercent}%`} tone="ok" />
    ) : null;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={`${plan.label}, ${usd(plan.usd)}`}
      onClick={onClick}
      className={cn(
        "flex items-center rounded-[18px] border px-4 py-3.5 text-left transition-colors duration-150",
        on ? "border-[1.5px] border-gold bg-gold/8" : "border-line bg-surface hover:bg-surface2",
      )}
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
