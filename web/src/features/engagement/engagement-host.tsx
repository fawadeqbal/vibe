"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { LevelRing } from "@/components/shared/level-chip";
import { GhostButton, GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Headline } from "@/components/ui/typography";
import { useEngagement } from "@/stores/engagement";
import { useMatch } from "@/stores/match";
import { openDialog, openSheet } from "@/stores/ui";
import { useWellbeing } from "@/stores/wellbeing";

/**
 * Pop-ups that can come from anywhere in the app: the level-up celebration
 * (`progress:level-up`) and the break reminder. Mounted once with the tabs.
 */
export function EngagementHost() {
  const router = useRouter();
  const path = usePathname();
  const levelUp = useEngagement((s) => s.levelUp);
  const breakDue = useWellbeing((s) => s.due);
  const pathRef = useRef(path);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  useEffect(() => {
    if (levelUp == null) return;
    useEngagement.getState().clearLevelUp();
    void openDialog<boolean>((close) => <LevelUp level={levelUp} onClose={close} />).then((more) => {
      if (more) router.push("/me");
    });
  }, [levelUp, router]);

  useEffect(() => {
    if (!breakDue) return;
    const minutes = useWellbeing.getState().dueMinutes;
    useWellbeing.setState({ due: false }); // shown once; answering resets the count
    void openSheet<boolean>((close) => <BreakReminder minutes={minutes} onClose={close} />).then((takeBreak) => {
      useWellbeing.getState().dismiss();
      if (!takeBreak) return;
      // Straight back to the lobby (no recap) once the call has ended.
      if (useMatch.getState().status === "connected") {
        const unsub = useMatch.subscribe((s) => {
          if (s.status === "connected") return;
          unsub();
          if (s.status === "ended") useMatch.getState().dismissEnded();
        });
        setTimeout(unsub, 15_000);
      }
      useMatch.getState().stop();
      if (pathRef.current !== "/match") router.push("/match");
    });
  }, [breakDue, router]);

  return null;
}

function LevelUp({ level, onClose }: { level: number; onClose: (more?: boolean) => void }) {
  return (
    <div className="flex max-w-[340px] flex-col items-center px-6 pt-7 pb-6 text-center">
      <span style={{ animation: "vibe-pop 420ms var(--ease-spring) both" }}>
        <LevelRing level={level} fraction={1} size={96} />
      </span>
      <Headline as="h2" text="Level " accent={`${level}!`} size={30} align="center" className="mt-4" />
      <p className="type-body mt-2 text-[14px] leading-[1.5] text-text2">Good calls, likes, gifts and streaks got you here. New badges are waiting.</p>
      <div className="mt-5 flex w-full flex-col gap-2">
        <GradientButton label="Nice!" height={48} onClick={() => onClose(false)} />
        <GhostButton label="See my progress" expand height={44} onClick={() => onClose(true)} />
      </div>
    </div>
  );
}

function BreakReminder({ minutes, onClose }: { minutes: number; onClose: (takeBreak?: boolean) => void }) {
  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <span className="flex size-12 items-center justify-center rounded-[16px] bg-trust/12">
        <Icon name="self_improvement" size={28} className="text-trust" />
      </span>
      <Headline as="h2" text="Time for a " accent="break?" size={26} className="mt-4" />
      <p className="type-body mt-2 text-[14px] leading-[1.5] text-text2">
        You&apos;ve been vibing for {minutes} minutes. Stretch, drink some water — the people will still be here.
      </p>
      <div className="mt-5 flex gap-2.5">
        <GhostButton label="Keep going" expand className="flex-1" onClick={() => onClose(false)} />
        <div className="flex-1">
          <GradientButton tone="gem" label="Take a break" height={52} onClick={() => onClose(true)} />
        </div>
      </div>
    </div>
  );
}
