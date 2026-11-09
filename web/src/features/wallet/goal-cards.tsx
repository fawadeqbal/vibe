"use client";

import { useEffect, useState } from "react";

import { GradientButton, TextButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { GemIcon } from "@/components/ui/money";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";
import { SectionTitle } from "@/components/ui/typography";
import { parseGemGoal, recapHasNews, recapVisible } from "@/lib/engagement";
import { compact, figure, gemsAsUsd, thousands } from "@/lib/format";
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
  const cashoutMin = useCatalog.getState().economy.cashoutMinGems;
  return (
    <Panel className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-gem/13">
          <Icon name="flag" size={21} className="text-gem" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="type-title text-[15px] font-semibold" title={`${thousands(goal)} gems ≈ ${gemsAsUsd(goal, usdPerGem)}`}>
            Goal: {figure(goal)} gems
          </span>
          <span className="type-body text-[12px] text-text2">
            {reached ? "Reached 🎯 Cash out, or set a bigger one" : `${figure(goal - gems)} to go${goal >= cashoutMin ? " · enough to cash out" : ""}`}
          </span>
        </span>
        <button type="button" onClick={() => void openGoalSheet(goal)} className="type-label text-[13px] text-pink-soft hover:brightness-125">
          Change
        </button>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-[8px] bg-surface3"
        role="progressbar"
        aria-label="Toward your goal"
        aria-valuenow={Math.round(Math.min(1, gems / goal) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="bg-gem-grad h-full rounded-[8px] transition-[width] duration-300" style={{ width: `${Math.min(1, gems / goal) * 100}%` }} />
      </div>
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
          <button
            key={n}
            type="button"
            onClick={() => setText(String(n))}
            className="type-label flex h-8 items-center rounded-full border border-line bg-surface2 px-3 text-[12.5px] text-text2 hover:bg-surface3"
          >
            <GemIcon size={13} className="mr-1" />
            {compact(n)}
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
  const cells: [string, string][] = [
    [`+${compact(recap.gemsEarned)}`, "Gems"],
    [compact(recap.giftsReceived), "Gifts"],
    [compact(recap.matches), "Matches"],
    [compact(recap.likesReceived), "Likes"],
  ];
  return (
    <>
      <SectionTitle text="Last week" top={26} bottom={10} />
      <Panel className="px-2 py-3.5">
        <div className="grid grid-cols-4 text-center">
          {cells.map(([n, label]) => (
            <span key={label} className="flex flex-col gap-0.5">
              <b className="type-number text-[18px] tracking-[-0.02em]">{n}</b>
              <span className="type-body text-[11.5px] text-text2">{label}</span>
            </span>
          ))}
        </div>
      </Panel>
    </>
  );
}
