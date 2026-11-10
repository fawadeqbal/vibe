"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/cn";
import { fold } from "@/lib/countries";

import { Icon } from "./icon";

export interface DropdownOption {
  value: string;
  label: string;
  /** Before the label: a flag, an emoji, or an icon. */
  leading?: ReactNode;
  /** Small text on the right ("You", a count). */
  hint?: string;
  /** Other words that find it in the search ("UAE Dubai"). */
  keywords?: string;
}

/** Lists longer than this get a search box. */
const SEARCH_FROM = 8;

/**
 * The app's dropdown: a field-like button that opens a list of options. It is
 * used for every dropdown in the app, so they all look and behave the same:
 *
 * - long lists scroll inside the panel (never taller than the screen) and get
 *   a search box (more than 8 options); the search also matches `keywords`
 *   and ignores accents ("cote" finds Côte d’Ivoire)
 * - `suggested` values sit on top (your country) when not searching
 * - keyboard: ↑ ↓ Home End to move, Enter to pick, Esc to close; without a
 *   search box, typing a letter jumps to it
 * - on a phone it opens as a sheet from the bottom; on a desktop, a panel
 *   under (or above) the button
 *
 * `trigger` replaces the button's content for custom rows (a filter row).
 */
export function Dropdown({
  value,
  onChange,
  options,
  label,
  placeholder = "Choose…",
  searchPlaceholder = "Search",
  searchable,
  suggested = [],
  suggestedLabel = "Suggested",
  icon,
  size = "field",
  className,
  triggerClassName,
  trigger,
  disabled = false,
}: {
  value: string | null;
  onChange: (v: string) => void;
  options: DropdownOption[];
  /** What it picks (screen readers, and the sheet's title on a phone). */
  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Force the search box on or off (default: on for long lists). */
  searchable?: boolean;
  suggested?: string[];
  suggestedLabel?: string;
  /** An icon at the start of the button. */
  icon?: string;
  /** field: a form field (48px); compact: a filter control (44px). */
  size?: "field" | "compact";
  className?: string;
  triggerClassName?: string;
  trigger?: (selected: DropdownOption | null, open: boolean) => ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  const close = (focusBack = true) => {
    setOpen(false);
    if (focusBack) button.current?.focus();
  };

  return (
    <div className={cn("relative", className)}>
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        onClick={() => setOpen((x) => !x)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          trigger
            ? "w-full text-left"
            : cn(
                "flex w-full items-center gap-2.5 border border-line text-left text-text transition-[border-color] outline-none focus-visible:border-violet disabled:opacity-50",
                size === "field" ? "h-12 rounded-[18px] bg-surface2 pr-3 pl-3.5" : "h-11 rounded-[14px] bg-white/4 pr-3 pl-3.5",
                open && "border-violet",
              ),
          triggerClassName,
        )}
      >
        {trigger ? (
          trigger(selected, open)
        ) : (
          <>
            {icon ? <Icon name={icon} size={18} className="shrink-0 text-text2" /> : null}
            {selected?.leading ? <span className="shrink-0 text-[17px] leading-none">{selected.leading}</span> : null}
            <span className={cn("min-w-0 flex-1 truncate", size === "field" ? "type-body text-[15px]" : "type-label text-[14px]", !selected && "text-muted")}>
              {selected?.label ?? placeholder}
            </span>
            <Icon name="expand_more" size={20} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
          </>
        )}
      </button>
      {open ? (
        <Panel
          id={id}
          anchor={button}
          label={label}
          options={options}
          value={value}
          suggested={suggested}
          suggestedLabel={suggestedLabel}
          searchable={searchable ?? options.length > SEARCH_FROM}
          searchPlaceholder={searchPlaceholder}
          onPick={(v) => {
            onChange(v);
            close();
          }}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

function Panel({
  id,
  anchor,
  label,
  options,
  value,
  suggested,
  suggestedLabel,
  searchable,
  searchPlaceholder,
  onPick,
  onClose,
}: {
  id: string;
  anchor: React.RefObject<HTMLButtonElement | null>;
  label: string;
  options: DropdownOption[];
  value: string | null;
  suggested: string[];
  suggestedLabel: string;
  searchable: boolean;
  searchPlaceholder: string;
  onPick: (v: string) => void;
  onClose: (focusBack?: boolean) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [sheet] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);

  // What's shown: the suggestions first (when not searching), then everything that matches.
  const rows = useMemo(() => {
    const needle = fold(q.trim());
    if (needle) return { top: [], rest: options.filter((o) => fold(`${o.label} ${o.keywords ?? ""}`).includes(needle)) };
    const top = suggested.map((v) => options.find((o) => o.value === v)).filter((o): o is DropdownOption => !!o);
    return { top, rest: options };
  }, [q, options, suggested]);
  const flat = useMemo(() => [...rows.top, ...rows.rest], [rows]);
  const [active, setActive] = useState(() => Math.max(0, flat.findIndex((o) => o.value === value)));
  const activeIndex = Math.min(active, Math.max(0, flat.length - 1));

  // Where: a sheet from the bottom on a phone; under the button (or above, when there's more room) on a desktop.
  useLayoutEffect(() => {
    if (sheet) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const vh = window.innerHeight;
      const width = Math.max(r.width, 280);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      const below = vh - r.bottom - 12;
      const above = r.top - 12;
      if (below >= 260 || below >= above) setPos({ left, width, top: r.bottom + 6, maxHeight: Math.min(420, below) });
      else setPos({ left, width, bottom: vh - r.top + 6, maxHeight: Math.min(420, above) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, sheet]);

  // Focus the search (or the list); scroll the picked one into view.
  // (On a desktop, once the panel is placed: a hidden element can't take focus.)
  const placed = sheet || !!pos;
  useEffect(() => {
    if (placed) (searchable ? search.current : list.current)?.focus({ preventScroll: true });
  }, [searchable, placed]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, rows]);

  // Click outside closes.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose(false);
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [anchor, onClose]);

  const typed = useRef({ text: "", at: 0 });
  const onKey = (e: KeyboardEvent) => {
    const last = flat.length - 1;
    if (e.key === "ArrowDown") setActive(Math.min(last, activeIndex + 1));
    else if (e.key === "ArrowUp") setActive(Math.max(0, activeIndex - 1));
    else if (e.key === "Home" && !searchable) setActive(0);
    else if (e.key === "End" && !searchable) setActive(last);
    else if (e.key === "PageDown") setActive(Math.min(last, activeIndex + 8));
    else if (e.key === "PageUp") setActive(Math.max(0, activeIndex - 8));
    else if (e.key === "Enter") {
      if (flat[activeIndex]) onPick(flat[activeIndex].value);
    } else if (e.key === "Escape") onClose();
    else if (e.key === "Tab") return onClose(false);
    else if (!searchable && e.key.length === 1 && /\S/.test(e.key)) {
      // Type-ahead: letters typed close together find the first label that starts with them.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + fold(e.key), at: now };
      const i = flat.findIndex((o) => fold(o.label).startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    } else return;
    e.preventDefault();
  };

  const option = (o: DropdownOption, i: number) => {
    const on = o.value === value;
    return (
      <li
        key={`${i < rows.top.length ? "s" : "a"}-${o.value}`}
        id={`${id}-o${i}`}
        data-i={i}
        role="option"
        aria-selected={on}
        onPointerMove={() => setActive(i)}
        onClick={() => onPick(o.value)}
        className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2", i === activeIndex && "bg-white/7")}
      >
        {o.leading != null ? <span className="w-6 shrink-0 text-center text-[18px] leading-none">{o.leading}</span> : null}
        <span className={cn("type-body min-w-0 flex-1 truncate text-[15px]", on ? "font-semibold text-text" : "text-text")}>{o.label}</span>
        {o.hint ? <span className="type-label shrink-0 text-[12px] text-muted">{o.hint}</span> : null}
        {on ? <Icon name="check" size={18} className="shrink-0 text-pink-soft" /> : null}
      </li>
    );
  };

  const body = (
    <>
      {searchable ? (
        <div className="shrink-0 p-2 pb-1">
          <label className="flex h-11 items-center gap-2 rounded-[14px] border border-line bg-surface2 px-3 focus-within:border-violet">
            <Icon name="search" variant="outlined" size={19} className="shrink-0 text-muted" />
            <input
              ref={search}
              type="search"
              role="combobox"
              aria-label={`Search ${label.toLowerCase()}`}
              aria-controls={`${id}-list`}
              aria-expanded
              aria-activedescendant={flat.length ? `${id}-o${activeIndex}` : undefined}
              autoComplete="off"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKey}
              placeholder={searchPlaceholder}
              className="type-body min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
            />
          </label>
        </div>
      ) : null}
      <ul
        ref={list}
        id={`${id}-list`}
        role="listbox"
        aria-label={label}
        tabIndex={searchable ? -1 : 0}
        aria-activedescendant={!searchable && flat.length ? `${id}-o${activeIndex}` : undefined}
        onKeyDown={searchable ? undefined : onKey}
        className="quiet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 outline-none"
      >
        {rows.top.length ? (
          <>
            <li role="presentation" className="type-overline px-3 pt-2 pb-1">
              {suggestedLabel}
            </li>
            {rows.top.map((o, i) => option(o, i))}
            <li role="presentation" className="type-overline px-3 pt-3 pb-1">
              All
            </li>
          </>
        ) : null}
        {rows.rest.map((o, i) => option(o, rows.top.length + i))}
        {!flat.length ? (
          <li role="presentation" className="type-body px-3 py-6 text-center text-[13.5px] text-muted">
            Nothing called “{q.trim()}”
          </li>
        ) : null}
      </ul>
    </>
  );

  if (typeof document === "undefined") return null;
  if (sheet)
    return createPortal(
      <div className="fixed inset-0 z-[70] flex items-end" role="presentation">
        <div className="absolute inset-0 bg-black/55" onClick={() => onClose(false)} aria-hidden />
        <div
          ref={panel}
          role="dialog"
          aria-label={label}
          className="relative flex max-h-[min(78dvh,640px)] w-full flex-col rounded-t-[28px] border-t border-line bg-bg2 pb-[env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto mt-2.5 mb-1 h-[5px] w-10 shrink-0 rounded-full bg-white/18" aria-hidden />
          <div className="flex shrink-0 items-center px-4 pt-1 pb-1">
            <h2 className="type-title flex-1 text-[17px]">{label}</h2>
            <button type="button" onClick={() => onClose()} aria-label="Close" className="flex size-9 items-center justify-center rounded-full text-text2 hover:bg-white/6">
              <Icon name="close" size={20} />
            </button>
          </div>
          {body}
        </div>
      </div>,
      document.body,
    );
  return createPortal(
    <div
      ref={panel}
      className="fixed z-[70] flex flex-col overflow-hidden rounded-[18px] border border-line bg-surface shadow-[0_18px_48px_rgb(0_0_0/.55)]"
      style={pos ? { left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight } : { visibility: "hidden" }}
    >
      {body}
    </div>,
    document.body,
  );
}
