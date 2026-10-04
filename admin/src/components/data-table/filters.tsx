"use client";

import { ChevronDown, Search, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useDebounced } from "@/hooks/use-url-state";
import { cn } from "@/lib/utils";

/** The strip above a table: search on the left, filter chips, extras on the right. */
export function FilterBar({ children, end, className }: { children: React.ReactNode; end?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5", className)}>
      {children}
      {end && <div className="ml-auto flex items-center gap-2">{end}</div>}
    </div>
  );
}

/** Search box that updates its owner 300 ms after typing stops. */
export function SearchInput({ value, onChange, placeholder = "Search…", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [text, setText] = React.useState(value);
  const debounced = useDebounced(text, 300);
  const last = React.useRef(value);
  React.useEffect(() => {
    if (debounced !== last.current) {
      last.current = debounced;
      onChange(debounced);
    }
  }, [debounced, onChange]);
  React.useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value);
    }
  }, [value]);
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Input leading={<Search />} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="h-8 pr-7" aria-label={placeholder} />
      {text && (
        <button type="button" onClick={() => setText("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-text" aria-label="Clear search">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
}

const chip = (active: boolean) =>
  cn("h-8 gap-1 border-dashed px-2.5 text-xs font-medium", active && "border-solid border-primary/40 bg-primary-soft text-primary hover:bg-primary-soft");

/** Single-choice filter as a chip with a menu ("Status: Open ▾"). */
export function FilterSelect({ label, value, options, onChange, allLabel = "All" }: { label: string; value: string; options: Option[]; onChange: (v: string) => void; allLabel?: string }) {
  const current = options.find((o) => o.value === value);
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="sm" className={chip(!!current)}>
          {label}
          {current && <span className="font-semibold">: {current.label}</span>}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </MenuTrigger>
      <MenuContent align="start">
        <MenuItem onSelect={() => onChange("")}>{allLabel}</MenuItem>
        <MenuSeparator />
        {options.map((o) => (
          <MenuCheckboxItem key={o.value} checked={o.value === value} onCheckedChange={() => onChange(o.value)}>
            {o.label}
          </MenuCheckboxItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

/** Multi-choice filter chip ("Reason: Spam, Scam ▾"). */
export function FilterMulti({ label, value, options, onChange }: { label: string; value: string[]; options: Option[]; onChange: (v: string[]) => void }) {
  const picked = options.filter((o) => value.includes(o.value));
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="sm" className={chip(picked.length > 0)}>
          {label}
          {picked.length > 0 && <span className="font-semibold">: {picked.length > 2 ? `${picked.length} selected` : picked.map((p) => p.label).join(", ")}</span>}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </MenuTrigger>
      <MenuContent align="start">
        <MenuLabel>{label}</MenuLabel>
        {options.map((o) => (
          <MenuCheckboxItem
            key={o.value}
            checked={value.includes(o.value)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(c) => onChange(c ? [...value, o.value] : value.filter((v) => v !== o.value))}
          >
            {o.label}
          </MenuCheckboxItem>
        ))}
        {value.length > 0 && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={() => onChange([])}>Clear</MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

/** Yes/No/Any filter for booleans ("Verified: Yes"). */
export function FilterBool({ label, value, onChange, yes = "Yes", no = "No" }: { label: string; value: string; onChange: (v: string) => void; yes?: string; no?: string }) {
  return <FilterSelect label={label} value={value} onChange={onChange} allLabel="Any" options={[{ value: "true", label: yes }, { value: "false", label: no }]} />;
}

/** From/to dates as plain date inputs (ISO strings out). */
export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (v: { from: string; to: string }) => void }) {
  const day = (iso: string) => (iso ? iso.slice(0, 10) : "");
  return (
    <div className="flex items-center gap-1 text-xs text-muted">
      <input type="date" aria-label="From date" value={day(from)} onChange={(e) => onChange({ from: e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : "", to })} className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-text" />
      <span>–</span>
      <input type="date" aria-label="To date" value={day(to)} onChange={(e) => onChange({ from, to: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : "" })} className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-text" />
    </div>
  );
}

export function ResetFilters({ show, onReset }: { show: boolean; onReset: () => void }) {
  if (!show) return null;
  return (
    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onReset}>
      <X className="size-3.5" />
      Reset
    </Button>
  );
}

/** Sticky bar shown when rows are selected. */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <div className="flex items-center gap-2 border-b border-line bg-primary-soft/60 px-4 py-2 text-sm">
      <span className="font-medium text-text tabular">{count} selected</span>
      <Button size="xs" variant="ghost" onClick={onClear}>
        Clear
      </Button>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}
