"use client";

import { Icon } from "@/components/ui/icon";
import { color, type Tone } from "@/lib/colors";
import { openSheet } from "@/stores/ui";

export interface SheetAction<T> {
  value: T;
  label: string;
  icon: string;
  tone?: Tone;
}

/** A sheet of plain list rows (Flutter ListTiles); resolves with the chosen value. */
export const chooseAction = <T,>(actions: SheetAction<T>[]) =>
  openSheet<T>((close) => (
    <div className="pb-2">
      {actions.map((a) => (
        <button key={a.label} type="button" onClick={() => close(a.value)} className="flex h-14 w-full items-center gap-4 px-4 text-left transition-colors hover:bg-white/4 active:bg-white/8">
          <Icon name={a.icon} size={24} style={{ color: color(a.tone ?? "text") }} />
          <span className="type-body text-[15px]" style={{ color: color(a.tone ?? "text") }}>
            {a.label}
          </span>
        </button>
      ))}
    </div>
  ));
