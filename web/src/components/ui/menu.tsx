"use client";

import { useEffect, useRef, useState } from "react";

import { color, type Tone } from "@/lib/colors";
import { cn } from "@/lib/cn";

import { Icon } from "./icon";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  tone?: Tone;
}

/** An icon button that opens a small popup menu (Flutter's PopupMenuButton). */
export function MenuButton({ icon = "more_horiz", label, items, className }: { icon?: string; label: string; items: MenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-10 items-center justify-center rounded-full text-text transition-colors hover:bg-white/6"
      >
        <Icon name={icon} size={24} />
      </button>
      {open ? (
        <div role="menu" className="absolute top-full right-0 z-30 mt-1 min-w-[180px] overflow-hidden rounded-[16px] border border-line bg-surface2 py-2 shadow-[0_8px_30px_rgb(0_0_0/.45)]" style={{ animation: "vibe-dialog-in 120ms ease-out" }}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className="type-body flex h-12 w-full items-center px-4 text-left text-[14px] transition-colors hover:bg-white/5"
              style={{ color: color(it.tone ?? "text") }}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
