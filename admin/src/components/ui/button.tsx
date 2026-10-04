import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary-solid text-primary-fg shadow-card hover:bg-primary-solid-hover",
        secondary: "border border-line bg-surface text-text shadow-card hover:bg-surface-2",
        ghost: "text-text-2 hover:bg-surface-2 hover:text-text",
        danger: "bg-bad-solid text-white shadow-card hover:opacity-90",
        "danger-ghost": "text-bad hover:bg-bad-soft",
        trust: "bg-trust text-white shadow-card hover:opacity-90 dark:text-bg",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-7 rounded-md px-2 text-xs [&_svg]:size-3.5",
        sm: "h-8 px-3",
        md: "h-9 px-3.5",
        lg: "h-10 px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-xs": "size-7 rounded-md [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, asChild, loading, disabled, children, type, ...props }, ref) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp ref={ref} type={asChild ? undefined : (type ?? "button")} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
});
