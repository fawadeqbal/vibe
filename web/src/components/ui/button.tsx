"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";
import type { GradientName } from "@/lib/gradients";

import { GradientFill } from "./gradient-fill";
import { Icon, type IconVariant } from "./icon";
import { Spinner } from "./spinner";

type NativeButton = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type">;

/** Fill, text colour and glow for each primary-button flavour. */
const TONES = {
  /** The one primary action per screen. */
  brand: { gradient: "brand", fg: "text-white", glow: "rgb(255 61 143 / .32)" },
  /** Money: buy, subscribe. */
  gold: { gradient: "gold", fg: "text-on-gold", glow: "rgb(255 200 87 / .32)" },
  /** VIP's subscribe button glows a deeper amber. */
  amber: { gradient: "gold", fg: "text-on-gold", glow: "rgb(240 160 32 / .32)" },
  /** Gems and trust: cash out, verify. */
  gem: { gradient: "gem", fg: "text-on-gem", glow: "rgb(94 234 212 / .32)" },
  /** Reporting. */
  bad: { gradient: "bad", fg: "text-white", glow: "rgb(251 113 133 / .32)" },
} as const satisfies Record<string, { gradient: GradientName; fg: string; glow: string }>;

export type ButtonTone = keyof typeof TONES;

/**
 * The primary action: a gradient pill with a soft glow. One per screen at
 * most — everything else is a {@link GhostButton}.
 */
export function GradientButton({
  label,
  icon,
  iconAfter = false,
  trailing,
  busy = false,
  height = 56,
  tone = "brand",
  expand = true,
  className,
  disabled,
  onClick,
  ...rest
}: NativeButton & {
  label: string;
  icon?: string;
  /** Put the icon after the label ("Get started →"). */
  iconAfter?: boolean;
  /** Extra content after the label, e.g. a price pill. */
  trailing?: ReactNode;
  busy?: boolean;
  height?: number;
  tone?: ButtonTone;
  expand?: boolean;
}) {
  const t = TONES[tone];
  const enabled = !!onClick && !disabled && !busy;
  const bold = tone === "gold" || tone === "amber" || tone === "gem";
  return (
    <button
      type="button"
      disabled={!enabled}
      aria-busy={busy || undefined}
      onClick={onClick}
      className={cn(
        "relative isolate flex min-w-0 items-center justify-center rounded-full px-6 transition-[opacity,filter] duration-150",
        expand ? "w-full" : "w-auto",
        t.fg,
        enabled ? "hover:brightness-110 active:brightness-95" : busy ? "" : "opacity-45",
        className,
      )}
      style={{ height, boxShadow: enabled ? `0 10px 35.6px ${t.glow}` : undefined }}
      {...rest}
    >
      <GradientFill gradient={t.gradient} className="-z-10" />
      {busy ? <Spinner size={18} stroke={2.2} className="mr-2.5 text-current" /> : icon && !iconAfter ? <Icon name={icon} size={20} className="mr-2.5" /> : null}
      <span className={cn("type-title truncate text-[16px]", bold ? "font-bold" : "font-semibold")}>{label}</span>
      {!busy && icon && iconAfter ? <Icon name={icon} size={20} className="ml-2.5" /> : null}
      {trailing ? <span className="ml-2.5 flex shrink-0 items-center">{trailing}</span> : null}
    </button>
  );
}

/** Secondary action: a quiet translucent pill with a hairline. */
export function GhostButton({
  label,
  icon,
  iconVariant,
  height = 52,
  expand = false,
  trailing,
  className,
  labelClassName,
  onClick,
  disabled,
  ...rest
}: NativeButton & {
  label: string;
  icon?: string;
  iconVariant?: IconVariant;
  height?: number;
  expand?: boolean;
  trailing?: ReactNode;
  /** Colour/weight of the label and icon, e.g. "text-text2". */
  labelClassName?: string;
}) {
  const enabled = !!onClick && !disabled;
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-center justify-center rounded-full border border-white/10 bg-white/6 px-[18px] text-text transition-colors",
        expand ? "w-full" : "w-auto",
        enabled ? "hover:bg-white/9 active:bg-white/12" : "opacity-50",
        labelClassName,
        className,
      )}
      style={{ height }}
      {...rest}
    >
      {icon ? <Icon name={icon} variant={iconVariant} size={18} className="mr-2" /> : null}
      <span className={cn("type-title truncate font-semibold", height >= 50 ? "text-[15px]" : "text-[14px]")}>{label}</span>
      {trailing ? <span className="ml-2 flex shrink-0 items-center">{trailing}</span> : null}
    </button>
  );
}

/** A plain text action (Flutter's TextButton): pink by default. */
export function TextButton({
  children,
  icon,
  className,
  onClick,
  disabled,
  ...rest
}: NativeButton & { children: ReactNode; icon?: string }) {
  const enabled = !!onClick && !disabled;
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className={cn(
        "type-label inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-3 py-2 text-[14px] text-pink-soft transition-colors",
        enabled ? "hover:bg-white/5 active:bg-white/10" : "opacity-60",
        className,
      )}
      {...rest}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

/** 40px round icon button on a soft fill (back, close, edit). */
export function CircleIconButton({
  icon,
  label,
  size = 40,
  iconSize = 22,
  type = "button",
  className,
  onClick,
  ...rest
}: NativeButton & { icon: string; label: string; size?: number; iconSize?: number; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-white/8 text-text transition-[filter] hover:brightness-125 active:brightness-150", className)}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  );
}
