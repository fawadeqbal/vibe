"use client";

import type { CSSProperties, ReactNode } from "react";
import { Children, Fragment } from "react";

import { color, type Tone } from "@/lib/colors";
import { cn } from "@/lib/cn";
import type { GradientName } from "@/lib/gradients";

import { GradientFill } from "./gradient-fill";
import { Icon, type IconVariant } from "./icon";

/**
 * A card on a screen (not over video): glass with a specular rim, 22px radius.
 * Override padding / fill / border / radius with classes.
 */
export function Panel({
  children,
  gradient,
  onClick,
  className,
  style,
  ariaLabel,
}: {
  children?: ReactNode;
  gradient?: GradientName;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const cls = cn("relative isolate block w-full rounded-card p-4 text-left", gradient ? "glass-rim" : "glass", className);
  const fill = gradient ? <GradientFill gradient={gradient} className="-z-10" /> : null;
  if (!onClick)
    return (
      <div className={cls} style={style}>
        {fill}
        {children}
      </div>
    );
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={cn(cls, "transition-[filter,transform] duration-300 ease-(--ease-spring) hover:brightness-110 active:scale-[0.985] active:brightness-125")} style={style}>
      {fill}
      {children}
    </button>
  );
}

/** A grouped card of rows with inset hairlines — settings, earn, safety. */
export function GroupCard({ children, dividerInset = 70, className }: { children: ReactNode; dividerInset?: number; className?: string }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <div className={cn("glass relative overflow-hidden rounded-card", className)}>
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 ? <div className="h-px bg-line-soft" style={{ marginLeft: dividerInset }} /> : null}
          {row}
        </Fragment>
      ))}
    </div>
  );
}

/** One row inside a {@link GroupCard}: tinted icon tile, title, subtitle, trailing. */
export function GroupRow({
  icon,
  iconVariant,
  title,
  subtitle,
  trailing,
  onClick,
  iconColor = "text2",
  iconBg,
  titleColor,
  bare = false,
}: {
  icon: string;
  iconVariant?: IconVariant;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  iconColor?: Tone;
  /** Tile fill, e.g. "rgb(…)" or alpha("trust", .12). Default white 5%. */
  iconBg?: string;
  titleColor?: Tone;
  /** No icon tile — just the glyph (account rows). */
  bare?: boolean;
}) {
  const body = (
    <>
      {bare ? (
        <Icon name={icon} variant={iconVariant} size={22} style={{ color: color(iconColor) }} />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px]" style={{ backgroundColor: iconBg ?? "rgb(255 255 255 / .05)" }}>
          <Icon name={icon} variant={iconVariant} size={22} style={{ color: color(iconColor) }} />
        </span>
      )}
      <span className="ml-3.5 flex min-w-0 flex-1 flex-col">
        <span className={bare ? "type-body text-[15px]" : "type-title text-[15px] font-semibold"} style={{ color: color(titleColor ?? "text") }}>
          {title}
        </span>
        {subtitle != null ? <span className="type-body mt-px text-[12px] text-text2">{subtitle}</span> : null}
      </span>
      {trailing != null ? <span className="ml-2.5 flex shrink-0 items-center">{trailing}</span> : null}
    </>
  );
  const cls = cn("flex w-full items-center px-4 text-left", bare ? "py-4" : "py-3.5");
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={cn(cls, "transition-colors hover:bg-white/3 active:bg-white/6")}>
      {body}
    </button>
  );
}
