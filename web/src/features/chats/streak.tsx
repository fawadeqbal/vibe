"use client";

import { useCallback } from "react";

import { confirm, useNeedCoins } from "@/components/shared/dialogs";
import { StreakChip } from "@/components/shared/streak-chip";
import { GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CoinAmount } from "@/components/ui/money";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { errorMessage } from "@/lib/api/errors";
import { alpha, color } from "@/lib/colors";
import { streakDays, streakStatus, streakTone } from "@/lib/engagement";
import type { Friend } from "@/lib/models";
import { useCatalog } from "@/stores/catalog";
import { useSocial } from "@/stores/social";
import { openSheet, toast } from "@/stores/ui";

/** "Restore 🔥 12": asks with the price, then restores (or offers coins). */
export function useRestoreStreak() {
  const needCoins = useNeedCoins();
  return useCallback(
    async (f: Friend) => {
      const s = f.streak;
      const cost = s.restoreCost;
      const ok = await confirm({
        title: `Restore your ${s.lostCount}-day streak?`,
        body: cost > 0 ? `It ended yesterday. Bring it back with ${f.profile.name} for ${cost} coins — then talk today to keep it going.` : `It ended yesterday. Free with VIP — then talk with ${f.profile.name} today to keep it going.`,
        ok: cost > 0 ? `Restore · ${cost}` : "Restore",
        cancel: "Not now",
        okTone: "gold",
      });
      if (!ok) return;
      try {
        if (await useSocial.getState().restoreStreak(f.profile.id)) toast(`🔥 ${streakDays(s.lostCount)} with ${f.profile.name} is back`);
        else await needCoins(`Restoring a streak costs ${cost} coins.`);
      } catch (e) {
        toast(errorMessage(e), { error: true });
      }
    },
    [needCoins],
  );
}

/** The flame chip's explainer (chat header): the rule, today's state, best, restore. */
export const openStreakSheet = (friendId: string, onRestore: (f: Friend) => void) => openSheet<void>((close) => <StreakSheet friendId={friendId} onRestore={onRestore} onDone={() => close()} />);

function StreakSheet({ friendId, onRestore, onDone }: { friendId: string; onRestore: (f: Friend) => void; onDone: () => void }) {
  const f = useSocial((s) => s.all.find((x) => x.profile.id === friendId));
  const weekly = useCatalog((s) => s.economy.streakWeeklyCoins);
  if (!f) return null;
  const s = f.streak;
  const tone = streakTone(s);
  const flame = tone === "atRisk" ? "warn" : tone === "none" ? "muted" : "flame";
  const name = f.profile.name;
  return (
    <div className="flex flex-col px-5 pt-2.5 pb-5">
      <div className="flex items-center">
        <span className="flex size-12 items-center justify-center rounded-[16px]" style={{ backgroundColor: alpha(flame, 0.14) }}>
          <Icon name="local_fire_department" size={28} style={{ color: color(flame) }} />
        </span>
        <div className="ml-3.5 min-w-0 flex-1">
          <h2 className="type-title-lg text-[22px]">{s.count > 0 ? streakDays(s.count) : s.restorable ? "Streak lost" : "No streak yet"}</h2>
          <p className="type-body mt-0.5 text-[13px] text-text2">{streakStatus(s, name)}</p>
        </div>
      </div>
      <p className="type-body mt-4 text-[14px] leading-[1.5] text-text2">
        Message each other every day to keep it going — a call of a minute or more counts too. Every 7th day you both get {weekly} coins.
      </p>
      <GroupCard className="mt-4" dividerInset={16}>
        <GroupRow bare icon={s.mineToday ? "check_circle" : "radio_button_unchecked"} iconColor={s.mineToday ? "ok" : "muted"} title="You today" subtitle={s.mineToday ? "Done" : "Send a message"} />
        <GroupRow bare icon={s.theirsToday ? "check_circle" : "radio_button_unchecked"} iconColor={s.theirsToday ? "ok" : "muted"} title={`${name} today`} subtitle={s.theirsToday ? "Done" : "Not yet"} />
        <GroupRow bare icon="emoji_events" iconVariant="outlined" iconColor="text2" title="Best" trailing={<span className="type-number text-[15px] text-text">{streakDays(Math.max(s.best, s.count))}</span>} />
      </GroupCard>
      {s.restorable ? (
        <div className="mt-4">
          <GradientButton
            tone="gold"
            label={`Restore 🔥 ${s.lostCount}`}
            trailing={s.restoreCost > 0 ? <CoinAmount amount={s.restoreCost} size={13} className="text-on-gold" /> : <span className="type-label text-[13px]">Free</span>}
            onClick={() => {
              onDone();
              onRestore(f);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/** The flame in a chat's header: tap for the explainer (and the restore offer once it broke). */
export function StreakHeaderChip({ f }: { f: Friend }) {
  const restore = useRestoreStreak();
  const open = () => void openStreakSheet(f.profile.id, (x) => void restore(x));
  if (f.streak.count > 0) return <StreakChip streak={f.streak} onClick={open} className="ml-2" />;
  if (!f.streak.restorable) return null;
  return (
    <button type="button" onClick={open} aria-label={`Streak lost. Restore ${f.streak.lostCount} days`} className="ml-2 flex h-[22px] shrink-0 items-center rounded-[11px] bg-gold/12 pr-2 pl-1.5 transition-[filter] hover:brightness-125">
      <Icon name="local_fire_department" size={14} className="text-muted" />
      <span className="type-label ml-0.5 text-[11px] text-gold">Restore</span>
    </button>
  );
}
