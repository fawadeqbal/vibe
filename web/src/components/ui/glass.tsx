"use client";

import type { CSSProperties, ReactNode } from "react";

import { alpha, color, type Tone } from "@/lib/colors";
import { cn } from "@/lib/cn";

import { Icon } from "./icon";

/** Clear glass over video: light tint, blur + saturation, specular rim. */
export function Glass({
  children,
  radius = 16,
  blur = 16,
  className,
  style,
}: {
  children?: ReactNode;
  radius?: number;
  blur?: number;
  /** Padding, fill (`bg-…`), border colour (`border-…`), height. Defaults: px-3 py-2, glass fill, white/12 hairline. */
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn("glass-clear relative border border-transparent px-3 py-2", className)}
      style={{ borderRadius: radius, backdropFilter: `blur(${blur}px) saturate(160%)`, WebkitBackdropFilter: `blur(${blur}px) saturate(160%)`, ...style }}
    >
      {children}
    </div>
  );
}

/** A frosted pill with an icon and a label — filters, report, interests. */
export function GlassPill({
  label,
  icon,
  iconVariant,
  iconColor,
  tint,
  textColor,
  height = 32,
  fontSize = 12.5,
  trailing,
  onClick,
  className,
}: {
  label: string;
  icon?: string;
  iconVariant?: "round" | "outlined";
  iconColor?: Tone;
  /** Colours the fill and hairline (teal = trust, pink = like, red = report). */
  tint?: Tone;
  textColor?: Tone;
  height?: number;
  fontSize?: number;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const style: CSSProperties = {
    height,
    borderRadius: height / 2,
    paddingLeft: icon ? 10 : 12,
    paddingRight: trailing ? 8 : 12,
    backgroundColor: tint ? alpha(tint, 0.18) : undefined,
    borderColor: tint ? alpha(tint, 0.48) : "transparent",
  };
  const content = (
    <>
      {icon ? <Icon name={icon} variant={iconVariant} size={height * 0.5} className="mr-1.5" style={{ color: color(iconColor ?? tint ?? "white") }} /> : null}
      <span className="type-label truncate" style={{ fontSize, color: color(textColor ?? "white") }}>
        {label}
      </span>
      {trailing ? <span className="ml-0.5 flex shrink-0">{trailing}</span> : null}
    </>
  );
  const base = cn("glass-clear relative inline-flex min-w-0 max-w-full items-center border", className);
  if (!onClick) return <div className={base} style={style}>{content}</div>;
  return (
    <button type="button" onClick={onClick} className={cn(base, "transition-[filter,transform] duration-300 ease-(--ease-spring) hover:brightness-125 active:scale-95")} style={style}>
      {content}
    </button>
  );
}

/**
 * Round control for anything floating over video. Frosted by default;
 * `tint` turns it into an "on" state (e.g. Liked → pink).
 */
export function RoundControl({
  icon,
  label,
  onClick,
  size = 52,
  iconColor = "white",
  tint,
  badge,
  labelColor,
  ariaLabel,
}: {
  icon: string;
  label?: ReactNode;
  onClick?: () => void;
  size?: number;
  iconColor?: Tone;
  tint?: Tone;
  badge?: string;
  labelColor?: string;
  ariaLabel?: string;
}) {
  const disabled = !onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      className="group flex shrink-0 flex-col items-center"
      style={{ width: Math.max(size, 60) }}
    >
      <span className={cn("relative", disabled && "opacity-60")}>
        <span
          className="glass-clear relative flex items-center justify-center rounded-full border transition-[filter,transform] duration-300 ease-(--ease-spring) group-enabled:group-hover:brightness-125 group-enabled:group-active:scale-90"
          style={{
            width: size,
            height: size,
            backgroundColor: tint ? alpha(tint, 0.22) : undefined,
            borderColor: tint ? alpha(tint, 0.45) : "transparent",
          }}
        >
          <Icon name={icon} size={size * 0.46} style={{ color: color(iconColor) }} />
        </span>
        {badge ? <span className="type-label absolute -top-1 -right-1.5 rounded-[10px] bg-gold px-1.5 py-0.5 text-[10px] font-extrabold text-on-gold">{badge}</span> : null}
      </span>
      {label != null ? (
        <span className="type-label mt-1.5 max-w-full truncate text-[11px]" style={{ color: labelColor ?? "rgb(255 255 255 / .85)" }}>
          {label}
        </span>
      ) : null}
    </button>
  );
}
