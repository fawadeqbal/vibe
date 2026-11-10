import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * A page: a fixed header and a scrolling body (Flutter's Scaffold + ListView).
 * On wide screens the body is a centred column so lines stay readable.
 */
export function Screen({
  header,
  pinned,
  children,
  footer,
  background,
  bodyClassName,
  width = "md",
}: {
  header?: ReactNode;
  /** Under the header and outside the scroll (a search box, tabs): stays put while the list under it scrolls. */
  pinned?: ReactNode;
  children: ReactNode;
  /** Pinned under the body (buttons, VIP's call to action): the body scrolls above it, so nothing hides behind it. */
  footer?: ReactNode;
  /** Decoration behind everything (glows). */
  background?: ReactNode;
  /** Padding of the scrolling column. Default: 20px sides, 32px bottom. */
  bodyClassName?: string;
  /** "wide": the phone column, then up to 1040px on a desktop (two columns inside). "xl": the same, up to 1180px. */
  width?: "sm" | "md" | "wide" | "xl";
}) {
  const max = width === "sm" ? "max-w-[560px]" : width === "wide" ? "max-w-[680px] lg:max-w-[1040px] lg:px-3" : width === "xl" ? "max-w-[680px] lg:max-w-[1180px] lg:px-5" : "max-w-[680px]";
  return (
    <div className="relative flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)]">
      {background}
      {header ? <div className={cn("relative mx-auto w-full shrink-0", max)}>{header}</div> : null}
      {pinned ? <div className={cn("relative mx-auto w-full shrink-0 px-5 pb-2", max)}>{pinned}</div> : null}
      <div className="quiet-scroll relative min-h-0 flex-1 overflow-y-auto">
        <div className={cn("mx-auto w-full px-5 pb-8", max, bodyClassName)}>{children}</div>
      </div>
      {footer ? <div className={cn("relative mx-auto w-full shrink-0", max)}>{footer}</div> : null}
    </div>
  );
}
