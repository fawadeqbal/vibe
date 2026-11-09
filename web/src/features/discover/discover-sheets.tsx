"use client";


import { GhostButton, GradientButton, TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CoinAmount } from "@/components/ui/money";
import { Headline } from "@/components/ui/typography";
import { useDiscover } from "@/stores/discover";
import { openSheet } from "@/stores/ui";


/** "Out of likes": wait for tomorrow, buy a few more, or go VIP. Resolves what they picked. */
export const openOutOfLikes = () => openSheet<"vip" | "buy">((close) => <OutOfLikes onPick={close} />);

function OutOfLikes({ onPick }: { onPick: (v?: "vip" | "buy") => void }) {
  const s = useDiscover((x) => x.status);
  const resets = s?.resetsAt ? comesBackIn(s.resetsAt) : "the morning";
  return (
    <div className="flex flex-col items-center px-6 pt-3 pb-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-pink/14 text-pink">
        <Icon name="favorite" variant="filled" size={30} />
      </span>
      <Headline as="h2" text="You're out of " accent="likes" size={26} className="mt-4" />
      <p className="type-body mt-2 max-w-[340px] text-[14px] leading-[1.5] text-text2">
        You used today&apos;s {s?.freeLikesPerDay ?? 30} free likes. They come back in {resets}. Passing is always free.
      </p>
      <GradientButton label="Get VIP — unlimited likes" icon="workspace_premium" tone="gold" className="mt-6" onClick={() => onPick("vip")} />
      <GhostButton
        label={`${s?.packSize ?? 30} more likes`}
        expand
        className="mt-2.5"
        trailing={<CoinAmount amount={s?.packCost ?? 20} size={13} />}
        onClick={() => onPick("buy")}
      />
      <TextButton className="mt-2 text-text2" onClick={() => onPick()}>
        Wait for tomorrow
      </TextButton>
    </div>
  );
}

/** Who shows up in your deck: the one filters sheet shared with random matches. */
export { openFiltersSheet as openDiscoverFilters } from "@/features/filters/filters-sheet";

export function comesBackIn(t: Date, now = Date.now()): string {
  const m = Math.max(1, Math.round((t.getTime() - now) / 60_000));
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}
