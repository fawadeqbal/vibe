"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { rewardedAds } from "@/components/shared/rewarded-ads";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { GroupCard, GroupRow, Panel } from "@/components/ui/panel";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/errors";
import { alpha } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { isProfileComplete } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { useSession } from "@/stores/session";
import { toast } from "@/stores/ui";
import { adsLeftToday, checkedInToday, isVip, nextCheckInDay, useWallet } from "@/stores/wallet";

const GOLD_ROW = { iconColor: "gold" as const, iconBg: alpha("gold", 0.12) };

/** Daily check-in streak, rewarded ad (mock in development, see rewarded-ads.tsx), invite (→ Invite friends), profile bonus. */
export function EarnSection() {
  const router = useRouter();
  const e = useCatalog((s) => s.economy);
  const day = useWallet(nextCheckInDay);
  const done = useWallet(checkedInToday);
  const bonusClaimed = useWallet((s) => s.wallet.profileBonusClaimed);
  const adsLeft = useWallet(adsLeftToday);
  const vip = useWallet((s) => isVip(s.wallet));
  const [adBusy, setAdBusy] = useState(false);
  const me = useSession((s) => s.me);
  const rewards = e.checkInRewards;

  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      toast(errorMessage(err), { error: true });
    }
  };

  const checkIn = () =>
    guard(async () => {
      const r = await useWallet.getState().checkIn();
      toast(r == null ? "Already checked in today" : `+${r} coins · see you tomorrow`, { error: r == null });
    });

  const watchAd = async () => {
    if (adsLeft <= 0) return toast("You have watched all of today's ads", { error: true });
    setAdBusy(true);
    const r = await rewardedAds.show();
    setAdBusy(false);
    if (r.outcome === "dismissed") return;
    if (r.outcome !== "rewarded") return toast(r.message ?? "No ad available right now. Try again in a minute.", { error: true });
    await guard(async () => {
      const coins = await useWallet.getState().rewardAd(r.token!);
      toast(coins == null ? "Daily ad limit reached" : `+${coins} coins`, { error: coins == null });
    });
  };

  const profileBonus = () => {
    if (!me || !isProfileComplete(me)) return toast("Add a photo, a bio and 3 interests first", { error: true });
    return guard(async () => {
      const r = await useWallet.getState().claimProfileBonus();
      toast(r == null ? "Already claimed" : `+${r} coins`, { error: r == null });
    });
  };

  return (
    <div>
      <Panel className="rounded-[24px] p-[18px]">
        <p className="type-title text-[15px] font-semibold">Daily check-in</p>
        <p className="type-body mt-0.5 text-[12px] text-muted">Miss a day and the streak starts over.</p>
        <div className="mt-4 flex justify-between">
          {rewards.map((r, i) => (
            <StreakDay key={i} index={i} reward={r} day={day} done={done} last={i === rewards.length - 1} />
          ))}
        </div>
        <div className="mt-4">
          {done ? <GhostButton label="Come back tomorrow" icon="check" height={48} expand /> : <GradientButton label={`Claim ${rewards[day] ?? rewards[0]} coins`} height={48} onClick={() => void checkIn()} />}
        </div>
      </Panel>
      <GroupCard className="mt-2.5">
        {rewardedAds.available ? (
          <GroupRow
            icon="play_circle"
            {...GOLD_ROW}
            title="Watch an ad"
            subtitle={vip ? "VIP has no ads — but you can still earn" : `${adsLeft} left today`}
            trailing={adBusy ? <Spinner size={18} stroke={2} /> : <Reward text={`+${e.rewardedAdCoins}`} active={adsLeft > 0} />}
            onClick={adBusy ? undefined : () => void watchAd()}
          />
        ) : null}
        <GroupRow icon="person_add" {...GOLD_ROW} title="Invite a friend" subtitle={`They get ${e.inviteeRewardCoins}, you get ${e.inviteRewardCoins} once they're active`} trailing={<Reward text={`+${e.inviteRewardCoins}`} active />} onClick={() => router.push("/invite")} />
        <GroupRow
          icon="badge"
          {...GOLD_ROW}
          title="Complete your profile"
          subtitle={bonusClaimed ? "Claimed" : me && isProfileComplete(me) ? "Ready to claim · once" : "Photo, bio, 3 interests · once"}
          trailing={bonusClaimed ? <Icon name="check_circle" size={22} className="text-ok" /> : <Reward text={`+${e.profileCompleteCoins}`} active />}
          onClick={bonusClaimed ? undefined : () => void profileBonus()}
        />
      </GroupCard>
    </div>
  );
}

function StreakDay({ index, reward, day, done, last }: { index: number; reward: number; day: number; done: boolean; last: boolean }) {
  const claimed = index < day || (index === day && done);
  const today = index === day && !done;
  return (
    <div className="flex flex-col items-center" aria-label={`Day ${index + 1}, ${reward} coins${claimed ? ", claimed" : today ? ", today" : ""}`}>
      {claimed ? (
        <span className="flex size-[38px] items-center justify-center rounded-full bg-gold/16">
          <Icon name="check" size={18} className="text-gold" />
        </span>
      ) : today ? (
        <span className="bg-brand flex size-[38px] rounded-full p-0.5">
          <span className="type-number flex flex-1 items-center justify-center rounded-full bg-surface text-[12px] text-gold">{reward}</span>
        </span>
      ) : (
        <span
          className={cn(
            "type-number flex size-[38px] items-center justify-center rounded-full text-[12px]",
            last ? "border border-gold/45 bg-gold/8 font-bold text-gold" : "bg-surface2 font-semibold text-muted",
          )}
        >
          {reward}
        </span>
      )}
      <span className={cn("type-label mt-1.5 text-[10.5px]", today ? "font-semibold text-text" : "font-normal text-muted")}>{today ? "Today" : claimed ? reward : `D${index + 1}`}</span>
    </div>
  );
}

function Reward({ text, active }: { text: string; active: boolean }) {
  return <span className={cn("type-number flex h-[26px] items-center rounded-[13px] px-2.5 text-[12.5px]", active ? "bg-gold/12 text-gold" : "bg-muted/12 text-muted")}>{text}</span>;
}
