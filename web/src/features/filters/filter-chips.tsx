"use client";

import { Icon } from "@/components/ui/icon";
import { COUNTRIES } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { ageLabel, useFilters, usesExtraFilters } from "@/stores/filters";

import { openFiltersSheet } from "./filters-sheet";

/**
 * The same chips on Home and Discover: who, age, where, verified, Filters.
 * Each opens the one filters sheet; Verified only switches right here (it's
 * free). A lock shows on gender/country while they're set but not open.
 */
export function FilterChips({ glass = false, className }: { glass?: boolean; className?: string }) {
  const f = useFilters((s) => s.filters);
  const unlocked = useFilters((s) => s.access.unlocked);
  const locked = usesExtraFilters(f) && !unlocked;
  const country = f.countryCode ? COUNTRIES.find((c) => c.code === f.countryCode) : null;
  return (
    <div className={cn("-mr-4 flex gap-2 overflow-x-auto pr-4 [scrollbar-width:none]", className)} role="group" aria-label="Filters">
      <Chip glass={glass} icon="people_alt" label={f.gender === "women" ? "Women" : f.gender === "men" ? "Men" : "Anyone"} on={f.gender !== "anyone"} locked={locked && f.gender !== "anyone"} caret onClick={openFiltersSheet} />
      <Chip glass={glass} icon="person" label={ageLabel(f) === "Any age" ? "18–99" : ageLabel(f)} on={f.minAge !== 18 || f.maxAge !== 99} caret onClick={openFiltersSheet} />
      <Chip glass={glass} icon="public" label={country ? country.name : "Anywhere"} on={!!country} locked={locked && !!country} caret onClick={openFiltersSheet} />
      <Chip glass={glass} icon="verified_user" label="Verified only" on={f.verifiedOnly} onClick={() => void useFilters.getState().save({ verifiedOnly: !f.verifiedOnly })} pressed={f.verifiedOnly} />
      <Chip glass={glass} icon="tune" label="Filters" onClick={openFiltersSheet} />
    </div>
  );
}

function Chip({ icon, label, on = false, locked = false, caret = false, glass, pressed, onClick }: { icon: string; label: string; on?: boolean; locked?: boolean; caret?: boolean; glass: boolean; pressed?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(
        "type-label flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-[13px] text-[13.5px] whitespace-nowrap transition-colors",
        on ? "border-pink/45 bg-pink/16 text-pink-soft" : glass ? "border-white/12 bg-bg2/50 text-text backdrop-blur-[16px]" : "border-white/12 bg-white/6 text-text hover:bg-white/9",
      )}
    >
      <Icon name={locked ? "lock" : icon} size={17} />
      <span>{label}</span>
      {caret ? <Icon name="expand_more" size={16} className="text-text2" /> : null}
    </button>
  );
}
