"use client";

import { Glass } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/cn";
import { clock12, vibeHourPhase } from "@/lib/engagement";
import { useEngagement } from "@/stores/engagement";
import { toast } from "@/stores/ui";

/** "in 3 h 20 min", "in 12 min". */
export function untilLabel(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `in ${h} h ${rest} min` : `in ${h} h`;
}

/** Turns "Remind me" on/off with a toast saying what happens next. */
export async function toggleVibeHourReminder(on: boolean, startsAt: Date | null) {
  const ok = await useEngagement.getState().setVibeHourReminder(on);
  if (!ok) return toast("Couldn't save that. Try again.", { error: true });
  toast(on ? `We'll remind you before ${startsAt ? clock12(startsAt) : "Vibe Hour"}` : "Vibe Hour reminder off");
}

/**
 * Outside Vibe Hour, says when everyone's on and offers to remind you, so a
 * quiet moment ends with a reason to come back. Hidden while it's live (the
 * live banner takes over) or when Vibe Hour is switched off.
 */
export function VibeHourInvite({ className, compact = false }: { className?: string; compact?: boolean }) {
  const v = useEngagement((s) => s.vibeHour);
  const remind = useEngagement((s) => s.vibeHourReminder);
  const now = useNow(30_000, !!v?.startsAt);
  const p = vibeHourPhase(v, now);
  if (!v?.startsAt || p.phase === "live") return null;
  const startsAt = v.startsAt;
  const when = untilLabel(startsAt.getTime() - now);

  const bell = (
    <button
      type="button"
      aria-pressed={remind}
      onClick={() => void toggleVibeHourReminder(!remind, startsAt)}
      className={cn(
        "type-label flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold transition-colors",
        remind ? "bg-pink/18 text-pink-soft hover:bg-pink/26" : "bg-white text-bg hover:brightness-90",
      )}
    >
      <Icon name={remind ? "notifications_active" : "notifications_none"} size={15} />
      {remind ? "Reminder on" : "Remind me"}
    </button>
  );

  if (compact)
    return (
      <Glass radius={20} className={cn("inline-flex h-10 max-w-full items-center gap-2 border-white/14 py-0 pr-1 pl-3", className)}>
        <Icon name="whatshot" size={16} className="shrink-0 text-pink-soft" />
        <span className="type-label truncate text-[12.5px] text-white/90">
          Everyone&apos;s on at {clock12(startsAt)}
        </span>
        {bell}
      </Glass>
    );

  return (
    <section aria-label="Vibe Hour" className={cn("rounded-[18px] border border-pink/25 bg-pink/8 p-3.5", className)}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-pink/16">
          <Icon name="whatshot" size={22} className="text-pink-soft" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="type-title block text-[14px] font-semibold">
            Vibe Hour · {clock12(startsAt)} <span className="type-body text-[12.5px] font-normal text-text2">{when}</span>
          </span>
          <span className="type-body block text-[12px] leading-[1.4] text-text2">When most people are on. Free filters, double XP.</span>
        </span>
        {bell}
      </div>
    </section>
  );
}
