"use client";

import { Command } from "cmdk";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover as P } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

import { controlClass } from "./input";

export interface PickOption {
  value: string;
  label: string;
  /** What the search matches besides the label (a country's name without its flag). */
  textValue?: string;
  /** A quiet number on the right (e.g. how many users). */
  count?: number;
}

/** Lists longer than this get a search box (filters switch to this picker). */
export const SEARCH_FROM = 10;

/**
 * A searchable list in a popover: type to narrow it, ↑ ↓ and Enter to pick,
 * long lists scroll inside (never taller than the screen). `multi` keeps it
 * open and toggles; otherwise picking closes it. The trigger is yours.
 */
export function SearchPicker({
  trigger,
  options,
  selected,
  onPick,
  multi = false,
  label,
  placeholder = "Search…",
  head,
  foot,
  align = "start",
}: {
  trigger: React.ReactNode;
  options: PickOption[];
  selected: string[];
  onPick: (value: string) => void;
  multi?: boolean;
  label: string;
  placeholder?: string;
  /** Rows above the options ("All"), shown when not searching. */
  head?: { label: string; onSelect: () => void }[];
  /** Rows under the options ("Clear"). */
  foot?: { label: string; onSelect: () => void }[];
  align?: "start" | "end";
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const row = "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text outline-none select-none data-[selected=true]:bg-surface-2";
  return (
    <P.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="z-50 flex max-h-[min(var(--radix-popover-content-available-height),26rem)] w-[var(--radix-popover-trigger-width)] min-w-64 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-pop data-[state=open]:animate-in"
        >
          <Command label={label} loop className="flex min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-2.5">
              <Search className="size-4 shrink-0 text-muted" />
              <Command.Input value={q} onValueChange={setQ} placeholder={placeholder} className="h-9 min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted" />
            </div>
            <Command.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
              <Command.Empty className="px-2 py-6 text-center text-sm text-muted">Nothing matches “{q.trim()}”</Command.Empty>
              {!q && head?.map((h) => (
                <Command.Item
                  key={`head-${h.label}`}
                  value={`__head ${h.label}`}
                  onSelect={() => {
                    h.onSelect();
                    if (!multi) setOpen(false);
                  }}
                  className={row}
                >
                  {h.label}
                </Command.Item>
              ))}
              {options.map((o) => {
                const on = selected.includes(o.value);
                return (
                  <Command.Item
                    key={o.value}
                    value={`${o.value} ${o.textValue ?? o.label}`}
                    keywords={[o.label]}
                    onSelect={() => {
                      onPick(o.value);
                      if (!multi) setOpen(false);
                    }}
                    className={row}
                  >
                    <Check className={cn("size-4 shrink-0", on ? "text-primary" : "invisible")} />
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.count != null && <span className="ml-3 text-xs text-muted tabular">{o.count.toLocaleString("en-US")}</span>}
                  </Command.Item>
                );
              })}
              {!q && foot?.map((f) => (
                <Command.Item key={`foot-${f.label}`} value={`__foot ${f.label}`} onSelect={f.onSelect} className={cn(row, "border-t border-line")}>
                  {f.label}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

/** A form field that picks one option from a long list (a user's country). */
export function SearchSelect({ value, onChange, options, label, placeholder = "Choose…" }: { value: string; onChange: (v: string) => void; options: PickOption[]; label: string; placeholder?: string }) {
  const current = options.find((o) => o.value === value);
  return (
    <SearchPicker
      label={label}
      options={options}
      selected={value ? [value] : []}
      onPick={onChange}
      placeholder={`Search ${label.toLowerCase()}…`}
      trigger={
        <button type="button" aria-label={label} className={cn(controlClass, "flex h-9 items-center justify-between gap-2 text-left")}>
          <span className={cn("truncate", !current && "text-muted")}>{current?.label ?? placeholder}</span>
          <ChevronDown className="size-4 shrink-0 text-muted" />
        </button>
      }
    />
  );
}
