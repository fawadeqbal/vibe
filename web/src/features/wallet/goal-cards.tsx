"use client";

import { useEffect, useState } from "react";

import { CircleIconButton, GradientButton, TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/misc";
import { GemIcon } from "@/components/ui/money";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";
import { Headline } from "@/components/ui/typography";
import { parseGemGoal, recapHasNews, recapVisible } from "@/lib/engagement";
import { gemsAsUsd, thousands } from "@/lib/format";
import { useCatalog } from "@/stores/catalog";
import { useEngagement } from "@/stores/engagement";
import { openSheet, toast } from "@/stores/ui";
import { useWallet } from "@/stores/wallet";

/** Gems toward your goal and what that is worth; "Set a goal" when there is none. */
export function GemGoalCard() {
  const gems = useWallet((s) => s.wallet.gems);
  const goal = useWallet((s) => s.wallet.gemGoal);
  const usdPerGem = useCatalog((s) => s.economy.usdPerGem);

  if (!goal)
    return (
      <Panel onClick={() => void openGoalSheet(null)} className="flex items-center px-4 py-3.5" ariaLabel="Set a gem goal">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-gem/12">
          <Icon name="flag" size={22} className="text-gem" />
        </span>
        <span className="ml-3.5 flex-1">
          <span className="type-title block text-[15px] font-semibold">Set a gem goal</span>
          <span className="type-body block text-[12px] text-text2">Save toward a cash-out and watch it fill up.</span>
        </span>
        <Icon name="chevron_right" className="text-muted" />
      </Panel>
    );

  const reached = gems >= goal;
  return (
    <Panel gradient="walletGems" className="border-gem/30">
      <div className="flex items-center">
        <Icon name="flag" size={18} className="text-gem" />
        <span className="type-label ml-1.5 flex-1 text-[12px] text-text2">Gem goal</span>
        <CircleIconButton icon="edit" label="Change goal" size={32} iconSize={17} className="bg-white/6" onClick={() => void openGoalSheet(goal)} />
      </div>
      <p className="mt-1.5 flex items-baseline">
        <span className="type-number-lg text-[22px] text-gem">{thousands(Math.min(gems, goal))}</span>
        <span className="type-body ml-1 text-[13px] text-text2">/ {thousands(goal)} gems</span>
        <span className="flex-1" />
        <span className="type-body text-[12px] text-text2">≈ {gemsAsUsd(goal, usdPerGem)}</span>
      </p>
      <div className="mt-2.5">
        <ProgressBar value={gems / goal} tone="gem" />
      </div>
      <p className="type-body mt-2 text-[12px] text-text2">{reached ? "Goal reached 🎯 Cash out, or set a bigger one." : `${thousands(goal - gems)} gems to go`}</p>
    </Panel>
  );
}

const openGoalSheet = (current: number | null) => openSheet<void>((close) => <GoalSheet current={current} onDone={() => close()} />);

function GoalSheet({ current, onDone }: { current: number | null; onDone: () => void }) {
  const cashoutMin = useCatalog((s) => s.economy.cashoutMinGems);
  const usdPerGem = useCatalog((s) => s.economy.usdPerGem);
  const [text, setText] = useState(current ? String(current) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const presets = [...new Set([1000, cashoutMin, 10_000, 50_000])].sort((a, b) => a - b);
  const parsed = parseGemGoal(text);

  const save = async (goal: number | null) => {
    setBusy(true);
    const ok = await useWallet.getState().setGemGoal(goal);
    setBusy(false);
    if (!ok) return setError("Couldn't save that, try again.");
    toast(goal ? `Goal set: ${thousands(goal)} gems` : "Goal removed");
    onDone();
  };

  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <h2 className="type-title-lg text-[20px]">{current ? "Change your goal" : "Set a gem goal"}</h2>
      <p className="type-body mt-1 text-[13px] text-text2">Gems come from gifts. We&apos;ll tell you when you get there.</p>
      <TextField
        className="mt-4"
        inputMode="numeric"
        prefixIcon="diamond"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        placeholder="e.g. 5,000"
        aria-label="Gem goal"
        error={error}
      />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {presets.map((n) => (
          <button key={n} type="button" onClick={() => setText(String(n))} className="type-label flex h-8 items-center rounded-full border border-line bg-surface2 px-3 text-[12.5px] text-text2 hover:bg-surface3">
            <GemIcon size={13} className="mr-1" />
            {thousands(n)}
          </button>
        ))}
      </div>
      {"goal" in parsed ? <p className="type-body mt-3 text-[12.5px] text-text2">Worth about {gemsAsUsd(parsed.goal, usdPerGem)} when you cash out.</p> : null}
      <div className="mt-4">
        <GradientButton tone="gem" label="Save goal" busy={busy} onClick={() => ("goal" in parsed ? void save(parsed.goal) : setError(parsed.error))} />
      </div>
      {current ? (
        <TextButton className="mt-2 self-center text-text2" onClick={() => void save(null)}>
          Remove goal
        </TextButton>
      ) : null}
    </div>
  );
}

/** "Your week on Vibe" — Monday to Wednesday, when last week had anything to show. */
export function WeeklyRecapCard() {
  const recap = useEngagement((s) => s.recap);
  const [visible] = useState(() => recapVisible());
  useEffect(() => {
    if (visible) void useEngagement.getState().loadRecap();
  }, [visible]);
  if (!visible || !recap || !recapHasNews(recap)) return null;
  const cells: [string, number, string][] = [
    ["diamond", recap.gemsEarned, "Gems earned"],
    ["redeem", recap.giftsReceived, "Gifts"],
    ["favorite", recap.likesReceived, "Likes"],
    ["person_add", recap.newFollowers, "New followers"],
    ["videocam", recap.matches, "Matches"],
    ["local_fire_department", recap.bestStreak, "Best streak"],
  ];
  return (
    <Panel>
      <Headline as="h2" text="Your week on " accent="Vibe" size={20} />
      <p className="type-body mt-0.5 text-[12px] text-muted">Last Monday to Sunday</p>
      <div className="mt-3.5 grid grid-cols-3 gap-y-3.5">
        {cells.map(([icon, n, label]) => (
          <div key={label} className="flex flex-col items-center">
            <span className="flex items-center">
              <Icon name={icon} size={15} className={icon === "diamond" ? "text-gem" : icon === "local_fire_department" ? "text-flame" : "text-text2"} />
              <span className="type-number ml-1 text-[17px]">{thousands(n)}</span>
            </span>
            <span className="type-body mt-0.5 text-[11px] text-muted">{label}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
