import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex h-5.5 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3", {
  variants: {
    tone: {
      neutral: "bg-surface-3 text-text-2",
      primary: "bg-primary-soft text-primary",
      trust: "bg-trust-soft text-trust",
      money: "bg-money-soft text-money",
      ok: "bg-ok-soft text-ok",
      warn: "bg-warn-soft text-warn",
      bad: "bg-bad-soft text-bad",
      info: "bg-info-soft text-info",
      outline: "border border-line text-text-2",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export type Tone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({ className, tone, dot, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
