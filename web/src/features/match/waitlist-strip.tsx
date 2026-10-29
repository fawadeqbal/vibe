"use client";

import { Glass } from "@/components/ui/glass";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { toast } from "@/stores/ui";
import { useWaitlist } from "@/stores/waitlist";
import { useWaves } from "@/stores/waves";

import type { Availability } from "./use-availability";

/**
 * Under the "who's online" line in the lobby, one of three things:
 * someone is looking right now (after you asked) → Start; you've asked →
 * "we'll tell you", with Cancel; nobody is searching → offer to be told.
 */
export function WaitlistStrip({ availability, onStart, className }: { availability: Availability | null; onStart: () => void; className?: string }) {
  const until = useWaitlist((s) => s.until);
  const lookingAt = useWaitlist((s) => s.someoneLookingAt);
  const who = useWaves((s) => s.lookingFrom);

  if (lookingAt)
    return (
      <div role="alert" className={cn("flex w-full justify-center", className)}>
        <span className="relative inline-flex max-w-full items-center gap-2 rounded-full border border-pink/50 bg-pink/18 py-1.5 pr-1.5 pl-3 backdrop-blur-[20px]">
          <span className="relative flex size-2.5 shrink-0">
            <span className="absolute inset-0 animate-ping rounded-full bg-pink-soft opacity-70" />
            <span className="relative size-2.5 rounded-full bg-pink" />
          </span>
          <span className="type-label truncate text-[13px] text-white">{who ? `${who.name.split(" ")[0]} is looking right now` : "Someone's looking right now"}</span>
          <button
            type="button"
            onClick={() => {
              dismissLooking();
              onStart();
            }}
            className="type-label h-8 shrink-0 rounded-full bg-white px-3.5 text-[13px] font-semibold text-bg transition-[filter] hover:brightness-90"
          >
            Start
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismissLooking}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10"
          >
            <Icon name="close" size={16} />
          </button>
        </span>
      </div>
    );

  if (until)
    return (
      <div className={cn("flex w-full justify-center", className)}>
        <Glass radius={18} className="inline-flex h-9 max-w-full items-center gap-2 py-0 pr-1.5 pl-3">
          <Icon name="notifications_active" size={16} className="text-pink-soft" />
          <span className="type-label truncate text-[12.5px] text-white/90">We&apos;ll tell you when someone&apos;s looking</span>
          <button
            type="button"
            onClick={() => void useWaitlist.getState().cancel()}
            className="type-label h-7 shrink-0 rounded-full px-2.5 text-[12px] text-white/70 hover:bg-white/10 hover:text-white"
          >
            Cancel
          </button>
        </Glass>
      </div>
    );

  if (!availability || availability.searching > 0) return null;
  return (
    <div className={cn("flex w-full justify-center", className)}>
      <button
        type="button"
        onClick={async () => {
          const ok = await useWaitlist.getState().notifyMe();
          toast(ok ? "We'll tell you when someone starts looking" : "Couldn't set that up. Try again.", { error: !ok });
        }}
        className="type-label inline-flex h-9 items-center gap-1.5 rounded-full border border-white/16 bg-white/6 px-3.5 text-[12.5px] text-white/90 transition-colors hover:bg-white/12"
      >
        <Icon name="notifications_none" size={16} className="text-pink-soft" />
        Nobody&apos;s searching · notify me when someone is
      </button>
    </div>
  );
}

/** Clears "someone's looking" (and who it was). */
export function dismissLooking() {
  useWaitlist.getState().dismiss();
  useWaves.getState().clearLooking();
}
