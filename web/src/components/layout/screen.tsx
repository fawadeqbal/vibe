import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * A page: a fixed header and a scrolling body (Flutter's Scaffold + ListView).
 * On wide screens the body is a centred column so lines stay readable.
 */
export function Screen({
  header,
  children,
  footer,
  background,
  bodyClassName,
  width = "md",
}: {
  header?: ReactNode;
  children: ReactNode;
  /** Pinned under the body (e.g. VIP's sticky call to action). */
  footer?: ReactNode;
  /** Decoration behind everything (glows). */
  background?: ReactNode;
  /** Padding of the scrolling column. Default: 20px sides, 32px bottom. */
  bodyClassName?: string;
  width?: "sm" | "md";
}) {
  const max = width === "sm" ? "max-w-[560px]" : "max-w-[680px]";
  return (
    <div className="relative flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)]">
      {background}
      {header ? <div className={cn("relative mx-auto w-full shrink-0", max)}>{header}</div> : null}
      <div className="quiet-scroll relative min-h-0 flex-1 overflow-y-auto">
        <div className={cn("mx-auto w-full px-5 pb-8", max, bodyClassName)}>{children}</div>
      </div>
      {footer ? <div className={cn("absolute inset-x-0 bottom-0 mx-auto w-full", max)}>{footer}</div> : null}
    </div>
  );
}
