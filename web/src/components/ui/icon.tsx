import type { CSSProperties } from "react";

import { cn } from "@/lib/cn";

/**
 * A Material icon — the same glyphs as Flutter's `Icons.*`. Flutter's
 * `Icons.x_rounded` is `<Icon name="x" />`, `Icons.x_outlined` is
 * `variant="outlined"`, plain `Icons.x` is `variant="filled"`.
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
}: {
  name: string;
  size?: number;
  variant?: IconVariant;
  className?: string;
  style?: CSSProperties;
  /** Spoken name; icons are decorative without one. */
  label?: string;
}) {
  return (
    <span
      className={cn(FONT[variant], "inline-block", className)}
      style={{ fontSize: size, ...style }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {name}
    </span>
  );
}
