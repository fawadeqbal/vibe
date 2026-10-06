"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The containers the overlay host draws: a bottom sheet (a centred card on
 * wide screens) and an alert dialog. Content components render inside them.
 */
export function SheetFrame({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-2 pb-[calc(8px+env(safe-area-inset-bottom))] lg:items-center lg:p-6" role="presentation">
      <div className="absolute inset-0 bg-scrim backdrop-blur-[3px]" style={{ animation: "vibe-fade-in 200ms ease-out" }} onClick={onDismiss} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          // iOS 26 sheet: a floating slab of thick glass, inset from the edges, fully rounded.
          "glass-thick relative flex max-h-[calc(92dvh-8px)] w-full flex-col overflow-hidden rounded-[34px] sm:max-w-[560px] lg:max-w-[480px] lg:rounded-[32px]",
          "animate-[vibe-sheet-in_260ms_var(--ease-spring)] lg:animate-[vibe-dialog-in_200ms_ease-out]",
        )}
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-2">
          <span className="h-[5px] w-9 rounded-full bg-white/22" />
        </div>
        <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/** `bare`: the content brings its own surface and shape (Flutter `Dialog` with a 16px inset). */
export function DialogFrame({ children, onDismiss, bare }: { children: ReactNode; onDismiss?: () => void; bare?: boolean }) {
  return (
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center", bare ? "p-4" : "p-10")} role="presentation">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[3px]" style={{ animation: "vibe-fade-in 150ms ease-out" }} onClick={onDismiss} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        className={cn("relative w-full", bare ? "max-w-[480px]" : "glass-thick max-w-[min(560px,100%)] min-w-[280px] rounded-[30px] sm:w-auto")}
        style={{ animation: "vibe-dialog-in 150ms ease-out" }}
      >
        {children}
      </div>
    </div>
  );
}

/** Material alert dialog content: title, body, right-aligned text actions. */
export function AlertDialog({ title, children, actions }: { title: string; children?: ReactNode; actions: ReactNode }) {
  return (
    <div className="max-w-[400px] p-6 pb-6">
      <h2 className="type-title-lg text-[20px]">{title}</h2>
      {children ? <div className="type-body mt-4 text-[14px] leading-[1.5] whitespace-pre-line text-text2">{children}</div> : null}
      <div className="mt-6 -mr-2 flex flex-wrap justify-end gap-2">{actions}</div>
    </div>
  );
}
