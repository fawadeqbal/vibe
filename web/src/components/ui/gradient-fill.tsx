"use client";

import { type CSSProperties, useRef } from "react";

import { useElementSize } from "@/hooks/use-element-size";
import { cn } from "@/lib/cn";
import { flutterGradientCss, GRADIENTS, type GradientName, type GradientSpec } from "@/lib/gradients";

/**
 * Paints one of the app's gradients exactly as Flutter does on a box of any
 * shape (see lib/gradients.ts). Place it inside a `relative` element with the
 * radius / overflow you need; it fills it.
 */
export function GradientFill({ gradient, className, style }: { gradient: GradientName | GradientSpec; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { width, height } = useElementSize(ref);
  const spec = typeof gradient === "string" ? GRADIENTS[gradient] : gradient;
  return <span ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", className)} style={{ backgroundImage: flutterGradientCss(spec, width, height), ...style }} />;
}
