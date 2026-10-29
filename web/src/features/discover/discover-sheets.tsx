"use client";

import { useState } from "react";

import { GhostButton, GradientButton, TextButton } from "@/components/ui/button";
import { ChoiceTile } from "@/components/ui/choice";
import { Icon } from "@/components/ui/icon";
import { CoinAmount } from "@/components/ui/money";
import { Switch } from "@/components/ui/switch";
import { Headline } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import { type DiscoverFilters, useDiscover, type WantedGender } from "@/stores/discover";
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

/** Who shows up in your deck. */
export const openDiscoverFilters = () => openSheet<void>((close) => <FiltersSheet onDone={() => close()} />);

const GENDERS: { value: WantedGender; label: string; icon: string }[] = [
  { value: "anyone", label: "Everyone", icon: "group" },
  { value: "women", label: "Women", icon: "female" },
  { value: "men", label: "Men", icon: "male" },
];

function FiltersSheet({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState<DiscoverFilters>(() => useDiscover.getState().filters);
  const status = useDiscover((s) => s.status);
  const ages = Array.from({ length: 82 }, (_, i) => i + 18);
  const apply = () => {
    useDiscover.getState().setFilters({ ...f, maxAge: Math.max(f.minAge, f.maxAge) });
    onDone();
  };
  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <Headline as="h2" text="Who do you want to " accent="see?" size={24} />
      <p className="type-body mt-1.5 text-[13px] text-text2">Filters in Discover are free for everyone.</p>

      <p className="type-overline mt-5 mb-2">Show me</p>
      <div className="flex gap-2">
        {GENDERS.map((g) => {
          const on = f.gender === g.value;
          return (
            <ChoiceTile key={g.value} selected={on} onClick={() => setF({ ...f, gender: g.value })} className="h-[64px] rounded-[18px]">
              <Icon name={g.icon} size={20} className={on ? "text-pink-soft" : "text-text2"} />
              <span className={cn("type-title mt-1 text-[14px] font-semibold", on ? "text-text" : "text-text2")}>{g.label}</span>
            </ChoiceTile>
          );
        })}
      </div>

      <p className="type-overline mt-5 mb-2">Age</p>
      <div className="flex items-center gap-3">
        <label className="flex flex-1 flex-col">
          <span className="type-label mb-1 text-[12px] text-muted">From</span>
          <select
            value={f.minAge}
            onChange={(e) => setF({ ...f, minAge: Number(e.target.value) })}
            className="type-body h-12 rounded-[14px] border border-line bg-surface2 px-3 text-[15px] text-text"
          >
            {ages.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col">
          <span className="type-label mb-1 text-[12px] text-muted">To</span>
          <select
            value={f.maxAge}
            onChange={(e) => setF({ ...f, maxAge: Number(e.target.value) })}
            className="type-body h-12 rounded-[14px] border border-line bg-surface2 px-3 text-[15px] text-text"
          >
            {ages.map((a) => (
              <option key={a} value={a} disabled={a < f.minAge}>
                {a === 99 ? "99+" : a}
              </option>
            ))}
          </select>
        </label>
      </div>

      {status ? (
        <div className="mt-5 flex items-center gap-3 rounded-[18px] border border-line bg-surface2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="type-title text-[14px] font-semibold">Show me in Discover</p>
            <p className="type-body mt-0.5 text-[12.5px] text-muted">{!status.hasPhoto ? "Add a photo first — people without one aren't shown." : "Off: nobody new sees your card. Your matches stay."}</p>
          </div>
          <Switch checked={status.showInDiscover} label="Show me in Discover" onChange={(v) => void useDiscover.getState().setVisible(v)} />
        </div>
      ) : null}

      <GradientButton label="Show people" className="mt-6" onClick={apply} />
    </div>
  );
}

/** "3 hours", "40 minutes". */
export function comesBackIn(t: Date, now = Date.now()): string {
  const m = Math.max(1, Math.round((t.getTime() - now) / 60_000));
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}
