import type { CSSProperties } from "react";

import { cn } from "@/lib/cn";

import { SOLAR } from "./solar-glyphs";

/**
 * An icon by its Material name — the same names as Flutter's `Icons.*`.
 * Flutter's `Icons.x_rounded` is `<Icon name="x" />`, `Icons.x_outlined` is
 * `variant="outlined"`, plain `Icons.x` is `variant="filled"`.
 *
 * Most names draw a Solar glyph (see solar-glyphs.ts): round/filled → Bold,
 * outlined → Outline, matching the app. Names Solar has no counterpart for
 * (brand logos, the gem, mic on/off, bare + × ✓ −) keep the Material font.
 * `gradient` paints the glyph with the brand gradient (through a mask).
 */
export type IconVariant = "round" | "outlined" | "filled";

const FONT: Record<IconVariant, string> = {
  round: "material-icons-round",
  outlined: "material-icons-outlined",
  filled: "material-icons",
};

export function Icon({
  name,
  size = 24,
  variant = "round",
  className,
  style,
  label,
  gradient = false,
}: {
  name: string;
  size?: number;
  variant?: IconVariant;
  className?: string;
  style?: CSSProperties;
  /** Spoken name; icons are decorative without one. */
  label?: string;
  /** Paint with the brand gradient instead of the text colour. */
  gradient?: boolean;
}) {
  const a11y = { role: label ? "img" : undefined, "aria-label": label, "aria-hidden": label ? undefined : true } as const;
  if (Object.hasOwn(SOLAR, name)) {
    const pinned = SOLAR[name];
    const src = `/icons/solar/${name}-${pinned ?? (variant === "outlined" ? "o" : "b")}.svg`;
    if (gradient) {
      const mask = `url(${src}) center / contain no-repeat`;
      return <span className={cn("inline-block shrink-0 bg-brand", className)} style={{ width: size, height: size, mask, WebkitMask: mask, ...style }} {...a11y} />;
    }
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} focusable="false" className={cn("inline-block shrink-0", className)} style={style} {...a11y}>
        <use href={`${src}#i`} />
      </svg>
    );
  }
  return (
    <span className={cn(FONT[variant], "inline-block", gradient && "bg-brand bg-clip-text text-transparent", className)} style={{ fontSize: size, ...(gradient ? { WebkitBackgroundClip: "text" } : null), ...style }} {...a11y}>
      {name}
    </span>
  );
}
