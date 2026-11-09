"use client";

import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { errorMessage } from "@/lib/api/errors";
import { alpha } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { isProfileComplete } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { useSession } from "@/stores/session";
import { toast } from "@/stores/ui";
import { checkedInToday, nextCheckInDay, useWallet } from "@/stores/wallet";

import { useVideoCoins } from "./video-coins-card";

/** Store videos (VideoCoinsCard), daily check-in streak, invite (→ Invite friends), profile bonus. */
export function EarnSection() {
  const router = useRouter();
  const e = useCatalog((s) => s.economy);
  const day = useWallet(nextCheckInDay);
  const done = useWallet(checkedInToday);
  const bonusClaimed = useWallet((s) => s.wallet.profileBonusClaimed);
  const me = useSession((s) => s.me);
  const rewards = e.checkInRewards;
  const video = useVideoCoins();

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

  const profileBonus = () => {
    if (!me || !isProfileComplete(me)) return toast("Add a photo, a bio and 3 interests first", { error: true });
    return guard(async () => {
      const r = await useWallet.getState().claimProfileBonus();
      toast(r == null ? "Already claimed" : `+${r} coins`, { error: r == null });
    });
  };

  const today = rewards[day] ?? rewards[0];
  return (
    <GroupCard>
      {video.available ? (
        <GroupRow
          icon="play_circle"
          iconColor="pink-soft"
          iconBg={alpha("pink", 0.13)}
          title="Watch a short video"
          subtitle={video.limit ? "All done for today" : (video.note ?? `+${video.coins} coins · ${video.left} of ${video.perDay} left today`)}
          trailing={
            <ActionPill text={video.busy ? "…" : video.limit ? "Done" : video.phase === "noFill" ? "Retry" : "Watch"} off={video.limit || video.busy} />
          }
          onClick={video.limit || video.busy ? undefined : () => void video.watch()}
        />
      ) : null}
      <GroupRow
        icon="schedule"
        iconColor="pink-soft"
        iconBg={alpha("pink", 0.13)}
        title="Daily check-in"
        subtitle={done ? `Day ${day} of 7 · come back tomorrow` : `Day ${day + 1} of 7 · +${today} today`}
        trailing={done ? <Icon name="check_circle" size={22} className="text-ok" /> : <ActionPill text="Claim" />}
        onClick={done ? undefined : () => void checkIn()}
      />
      <GroupRow
        icon="redeem"
        iconColor="lavender"
        iconBg={alpha("violet", 0.16)}
        title="Invite a friend"
        subtitle={`You get ${e.inviteRewardCoins} when they get active`}
        trailing={<Reward text={`+${e.inviteRewardCoins}`} active />}
        onClick={() => router.push("/invite")}
      />
      <GroupRow
        icon="person"
        iconColor="lavender"
        iconBg={alpha("violet", 0.16)}
        title="Complete your profile"
        subtitle={bonusClaimed ? "Claimed" : me && isProfileComplete(me) ? "Ready to claim · once" : "Photo, bio and 3 interests"}
        trailing={bonusClaimed ? <Icon name="check_circle" size={22} className="text-ok" /> : <Reward text={`+${e.profileCompleteCoins}`} active />}
        onClick={bonusClaimed ? undefined : () => void profileBonus()}
      />
    </GroupCard>
  );
}

/** "Watch", "Claim": the pink pill on a free-coins row. */
function ActionPill({ text, off = false }: { text: string; off?: boolean }) {
  return (
    <span className={cn("type-label flex h-8 items-center rounded-full px-3.5 text-[13px] font-bold", off ? "bg-white/6 text-muted" : "bg-brand text-white")}>
      {text}
    </span>
  );
}

function Reward({ text, active }: { text: string; active: boolean }) {
  return (
    <span
      className={cn("type-number flex h-[26px] items-center rounded-[13px] px-2.5 text-[12.5px]", active ? "bg-gold/12 text-gold" : "bg-muted/12 text-muted")}
    >
      {text}
    </span>
  );
}
