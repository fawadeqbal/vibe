import type { CSSProperties, ElementType } from "react";

import { color, type Tone } from "@/lib/colors";
import { cn } from "@/lib/cn";

/**
 * A headline with an Instrument Serif italic accent:
 * `<Headline text="Meet someone new, " accent="right now." />`.
 */
export function Headline({
  text,
  accent,
  size = 30,
  accentColor = "text",
  align = "start",
  accentFirst = false,
  as: Tag = "h1",
  className,
}: {
  text: string;
  accent?: string;
  size?: number;
  accentColor?: Tone;
  align?: "start" | "center";
  accentFirst?: boolean;
  as?: ElementType;
  className?: string;
}) {
  const serif = accent ? (
    <span className="type-serif" style={{ fontSize: size * 1.16, color: color(accentColor) }}>
      {accent}
    </span>
  ) : null;
  return (
    <Tag className={cn("type-display text-text", align === "center" && "text-center", className)} style={{ fontSize: size } as CSSProperties}>
      {accentFirst ? serif : null}
      <span className="whitespace-pre-wrap">{text}</span>
      {accentFirst ? null : serif}
    </Tag>
  );
}

/** Section label in caps ("COINS"), with an optional quiet note or action on the right. */
export function SectionTitle({
  text,
  note,
  action,
  onAction,
  top = 28,
  bottom = 12,
}: {
  text: string;
  note?: string;
  action?: string;
  onAction?: () => void;
  top?: number;
  bottom?: number;
}) {
  return (
    <div className="flex items-center px-0.5" style={{ paddingTop: top, paddingBottom: bottom }}>
      <h2 className="type-overline flex-1">{text}</h2>
      {note ? <span className="type-body text-[11.5px] leading-[1.2] text-muted">{note}</span> : null}
      {action ? (
        <button type="button" onClick={onAction} className="type-label py-1 text-[12.5px] text-pink-soft">
          {action}
        </button>
      ) : null}
    </div>
  );
}
