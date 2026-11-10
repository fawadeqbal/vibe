"use client";

import { Icon } from "@/components/ui/icon";
import { COUNTRIES } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { ageLabel, DEFAULT_FILTERS, type SharedFilters, useFilters, usesExtraFilters } from "@/stores/filters";

import { openFiltersSheet } from "./filters-sheet";

/** Anything changed from "everyone, any age, anywhere"? */
export const filtersSet = (f: SharedFilters) => f.gender !== "anyone" || f.minAge !== 18 || f.maxAge !== 99 || !!f.countryCode || f.verifiedOnly;

/**
 * The round Filters button (Discover header, Home's camera buttons). A pink
 * dot shows when something is set. Opens the one filters sheet.
 */
export function FilterButton({ glass = false, size = 40, className }: { glass?: boolean; size?: number; className?: string }) {
  const on = useFilters((s) => filtersSet(s.filters));
  return (
    <button
      type="button"
      onClick={openFiltersSheet}
      aria-label={on ? "Filters (some are on)" : "Filters"}
      title="Filters"
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full transition-[filter] hover:brightness-125",
        glass ? "border border-white/10 bg-bg2/50 backdrop-blur-[16px]" : "bg-white/8",
        on ? "text-pink-soft" : "text-text",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Icon name="tune" size={20} />
      {on ? <span aria-hidden className="absolute top-1.5 right-1.5 size-[9px] rounded-full border-2 border-bg bg-pink" /> : null}
    </button>
  );
}

/**
 * Only what you changed, as tags: tap × to drop one, Clear to drop all.
 * Nothing at all when every filter is at its default. A lock shows on
 * gender/country while they're set but not open (no pass, no VIP).
 */
export function FilterTags({ glass = false, className }: { glass?: boolean; className?: string }) {
  const f = useFilters((s) => s.filters);
  const unlocked = useFilters((s) => s.access.unlocked);
  if (!filtersSet(f)) return null;
  const locked = usesExtraFilters(f) && !unlocked;
  const save = (patch: Partial<SharedFilters>) => void useFilters.getState().save(patch);
  const country = f.countryCode ? COUNTRIES.find((c) => c.code === f.countryCode) : null;
  const tags: { key: string; label: string; locked?: boolean; drop: Partial<SharedFilters> }[] = [];
  if (f.gender !== "anyone") tags.push({ key: "gender", label: f.gender === "women" ? "Women" : "Men", locked, drop: { gender: "anyone" } });
  if (f.minAge !== 18 || f.maxAge !== 99) tags.push({ key: "age", label: ageLabel(f), drop: { minAge: 18, maxAge: 99 } });
  if (f.countryCode) tags.push({ key: "country", label: country?.name ?? f.countryCode, locked, drop: { countryCode: null } });
  if (f.verifiedOnly) tags.push({ key: "verified", label: "Verified", drop: { verifiedOnly: false } });
  return (
    <div className={cn("-mr-4 flex gap-1.5 overflow-x-auto pr-4 [scrollbar-width:none]", className)} role="group" aria-label="Filters that are on">
      {tags.map((t) => (
        <span
          key={t.key}
          className={cn(
            "flex h-8 shrink-0 items-center rounded-full border border-pink/40 bg-pink/16 text-[13px] font-semibold whitespace-nowrap text-pink-soft",
            glass && "backdrop-blur-[16px]",
          )}
        >
          <button type="button" onClick={openFiltersSheet} className="flex h-full items-center gap-1 pl-[11px]">
            {t.locked ? <Icon name="lock" size={14} label="Needs the filter pass" /> : null}
            <span className="max-w-[170px] truncate">{t.label}</span>
          </button>
          <button type="button" onClick={() => save(t.drop)} aria-label={`Remove ${t.label}`} className="flex h-full items-center pr-2 pl-1 hover:text-white">
            <Icon name="close" size={14} />
          </button>
        </span>
      ))}
      <button type="button" onClick={() => save(DEFAULT_FILTERS)} className="flex h-8 shrink-0 items-center px-2.5 text-[13px] font-semibold text-text2 hover:text-text">
        Clear
      </button>
    </div>
  );
}
