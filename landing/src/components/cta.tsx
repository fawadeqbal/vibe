import type { ReactNode } from "react";

import { isExternal } from "@/lib/site";

const base =
  "inline-flex items-center justify-center gap-2.5 rounded-full font-semibold whitespace-nowrap transition-[transform,box-shadow,background-color,border-color,filter] duration-300 ease-(--ease-out-expo) active:scale-[0.97]";

const variants = {
  brand: "bg-brand text-white shadow-[0_10px_30px_rgb(255_61_143/0.32)] hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgb(255_61_143/0.42)] hover:brightness-110",
  outline: "border border-line-strong text-text hover:bg-tile hover:border-white/30",
  gold: "bg-gold-grad font-bold text-on-gold shadow-[0_10px_30px_rgb(240_160_32/0.26)] hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgb(240_160_32/0.36)]",
} as const;

const sizes = {
  sm: "h-[42px] px-5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-[54px] px-[26px] text-base",
  xl: "h-14 px-[30px] text-base",
} as const;

type Props = {
  href: string;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
  children: ReactNode;
};

export function Cta({ href, variant = "brand", size = "lg", className = "", children }: Props) {
  const external = isExternal(href);
  return (
    <a href={href} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...(external ? { target: "_blank", rel: "noopener" } : {})}>
      {children}
    </a>
  );
}
