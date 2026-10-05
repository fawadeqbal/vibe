import { ICONS, type IconName } from "@/lib/icons";

type Props = { name: IconName; size?: number; className?: string };

/** A Material Symbols Rounded glyph, inlined as SVG (no icon font to load). */
export function Icon({ name, size = 20, className }: Props) {
  return (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false" className={className} style={{ flexShrink: 0 }}>
      <path d={ICONS[name]} />
    </svg>
  );
}
