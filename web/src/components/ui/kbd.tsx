import { cn } from "@/lib/cn";

/** A keyboard key, for the shortcut hints on desktop ("Space", "←", "Esc"). */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "type-label inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[6px] border border-b-2 border-white/16 bg-white/5 px-1.5 font-sans text-[11.5px] text-text2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** "[←] Pass": a key and what it does. */
export function KeyHint({ k, label }: { k: string; label: string }) {
  return (
    <span className="type-body inline-flex items-center gap-[7px] text-[12.5px] text-muted">
      <Kbd>{k}</Kbd>
      {label}
    </span>
  );
}

/** True when a key press is meant for a text field, not a shortcut. */
export const typingIn = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
};
