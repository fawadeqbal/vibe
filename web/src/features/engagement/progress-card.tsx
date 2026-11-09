"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { BadgeRow, LevelRing } from "@/components/shared/level-chip";
import { openShareCard } from "@/components/shared/share-card";
import { CircleIconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/misc";
import { GroupCard, GroupRow, Panel } from "@/components/ui/panel";
import { SectionTitle } from "@/components/ui/typography";
import { levelFraction, xpToNext } from "@/lib/engagement";
import { alpha, type Tone } from "@/lib/colors";
import { compact } from "@/lib/format";
import type { Badge } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { useEngagement } from "@/stores/engagement";
import { openSheet } from "@/stores/ui";

/**
 * Me → Progress: your level (ring + bar), XP to the next one, the badges
 * you earned ("See all" for the rest), and the way to this week's top.
 */
export function ProgressCard() {
  const router = useRouter();
  const progress = useEngagement((s) => s.progress);
  const level = useEngagement((s) => s.level);
  useEffect(() => {
    void useEngagement.getState().loadProgress();
  }, []);
  const p = progress ?? level;
  if (!p) return null;
  const earned = progress?.badges.filter((b) => b.earned) ?? [];
  const next = progress?.badges.filter((b) => !b.earned).sort((a, b) => b.progress / b.target - a.progress / a.target)[0];

  return (
    <>
      <SectionTitle text="Progress" top={26} action={progress ? "All badges" : undefined} onAction={() => progress && void openBadgesSheet(progress.badges)} />
      <Panel className="p-0">
        <div className="flex items-center px-4 pt-4">
          <LevelRing level={p.level} fraction={levelFraction(p)} />
          <div className="ml-4 min-w-0 flex-1">
            <p className="type-title text-[16px]">Level {p.level}</p>
            <p className="type-body mt-0.5 text-[12.5px] text-text2">
              {compact(xpToNext(p))} XP to Level {p.level + 1}
              {progress ? ` · ${compact(progress.weekXp)} this week` : ""}
            </p>
            <div className="mt-2.5">
              <ProgressBar value={levelFraction(p)} tone="violet" />
            </div>
          </div>
          <CircleIconButton
            icon="ios_share"
            label="Share my level"
            iconSize={18}
            size={36}
            className="ml-3 self-start bg-surface2"
            onClick={() => void openShareCard({ kind: "level", level: p.level })}
          />
        </div>
        <div className="px-4 pt-4 pb-4">
          {earned.length ? (
            <BadgeRow ids={earned.map((b) => b.id)} max={7} />
          ) : next ? (
            <p className="type-body text-[12.5px] text-text2">
              Next badge:{" "}
              <span className="text-text">
                {next.emoji} {next.name}
              </span>{" "}
              · {next.progress}/{next.target}
            </p>
          ) : null}
        </div>
        <div className="h-px bg-line-soft" />
        <button
          type="button"
          onClick={() => router.push("/leaderboard")}
          className="flex w-full items-center px-4 py-3.5 text-left transition-colors hover:bg-white/3"
        >
          <Icon name="emoji_events" size={20} className="text-text2" />
          <span className="type-title ml-3 flex-1 text-[14.5px] font-semibold">This week&apos;s top</span>
          <span className="type-body mr-1 text-[12px] text-muted">Resets Monday</span>
          <Icon name="chevron_right" className="text-muted" />
        </button>
      </Panel>
    </>
  );
}

/** Every badge: earned ones lit, the rest with how far along you are. */
export const openBadgesSheet = (badges: Badge[]) => openSheet<void>(() => <BadgesSheet badges={badges} />);

function BadgesSheet({ badges }: { badges: Badge[] }) {
  const earned = badges.filter((b) => b.earned).length;
  return (
    <div className="px-5 pt-2.5 pb-5">
      <h2 className="type-title-lg text-[20px]">Badges</h2>
      <p className="type-body mt-1 text-[13px] text-text2">
        {earned} of {badges.length} earned. Everyone who meets you sees the ones you have.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {badges.map((b) => (
          <div key={b.id} className="flex items-center rounded-[18px] border border-line-soft bg-surface2 px-3.5 py-3">
            <span
              className={`flex size-11 shrink-0 items-center justify-center rounded-[14px] text-[22px] ${b.earned ? "bg-violet/18" : "bg-white/5 opacity-45 grayscale"}`}
              aria-hidden
            >
              {b.emoji}
            </span>
            <span className="ml-3 min-w-0 flex-1">
              <span className="flex items-center">
                <span className={`type-title flex-1 text-[14.5px] font-semibold ${b.earned ? "text-text" : "text-text2"}`}>{b.name}</span>
                {b.earned ? (
                  <Icon name="check_circle" size={18} className="text-ok" label="Earned" />
                ) : (
                  <span className="type-number text-[12px] text-muted">{`${compact(b.progress)}/${compact(b.target)}`}</span>
                )}
              </span>
              {!b.earned ? (
                <span className="mt-1.5 block">
                  <ProgressBar value={b.progress / b.target} tone="violet" />
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Badges as a grid of round tiles (the first eight); earned ones lit. (Design: Progress & badges.) */
export function BadgeGrid() {
  const progress = useEngagement((s) => s.progress);
  if (!progress?.badges.length) return null;
  const badges = [...progress.badges].sort((a, b) => Number(b.earned) - Number(a.earned)).slice(0, 8);
  const earned = progress.badges.filter((b) => b.earned).length;
  return (
    <>
      <SectionTitle
        text={`Badges · ${earned} of ${progress.badges.length}`}
        top={26}
        bottom={10}
        action="All badges"
        onAction={() => void openBadgesSheet(progress.badges)}
      />
      <Panel className="grid grid-cols-4 gap-y-4 px-2 py-4">
        {badges.map((b) => (
          <span key={b.id} className="flex flex-col items-center gap-1.5 text-center" title={b.earned ? b.name : `${b.name} · ${b.progress}/${b.target}`}>
            <span
              className={`flex size-[54px] items-center justify-center rounded-full text-[24px] ${b.earned ? "bg-violet/18" : "bg-white/5 opacity-45 grayscale"}`}
              aria-hidden
            >
              {b.emoji}
            </span>
            <span className={`type-label text-[12px] ${b.earned ? "text-text" : "text-muted"}`}>{b.name}</span>
          </span>
        ))}
      </Panel>
    </>
  );
}

/** Where XP comes from, with the live numbers. */
export function HowToEarnXp() {
  const e = useCatalog((s) => s.economy);
  const rows: [string, Tone, string, string][] = [
    ["videocam", "pink", "Good calls", `Calls that last over a minute · +${e.xpPerGoodCall} XP`],
    ["favorite", "pink", "Likes you get", `+${e.xpPerLikeReceived} XP each`],
    ["redeem", "gold", "Gifts", `Gifts you receive · +${e.xpPerGiftReceived} XP`],
    ["local_fire_department", "pink-soft", "Streaks", `Talk with a friend every day · +${e.xpPerStreakDay} XP`],
  ];
  return (
    <>
      <SectionTitle text="How to earn XP" top={26} bottom={10} />
      <GroupCard>
        {rows.map(([icon, tone, title, sub]) => (
          <GroupRow key={title} icon={icon} iconColor={tone} iconBg={alpha(tone, 0.13)} title={title} subtitle={sub} />
        ))}
      </GroupCard>
    </>
  );
}
