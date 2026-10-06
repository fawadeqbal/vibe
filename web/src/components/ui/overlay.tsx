"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The containers the overlay host draws: a bottom sheet (a centred card on
 * wide screens) and an alert dialog. Content components render inside them.
 */
export function SheetFrame({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6" role="presentation">
      <div className="absolute inset-0 bg-scrim" style={{ animation: "vibe-fade-in 200ms ease-out" }} onClick={onDismiss} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[32px] border-t border-line bg-surface sm:max-w-[560px] lg:max-w-[480px] lg:rounded-[32px] lg:border",
          "animate-[vibe-sheet-in_260ms_var(--ease-spring)] lg:animate-[vibe-dialog-in_200ms_ease-out]",
        )}
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-2">
          <span className="h-1 w-9 rounded-[2px] bg-white/16" />
        </div>
        <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">{children}</div>
      </div>
    </div>
  );
}

/** `bare`: the content brings its own surface and shape (Flutter `Dialog` with a 16px inset). */
export function DialogFrame({ children, onDismiss, bare }: { children: ReactNode; onDismiss?: () => void; bare?: boolean }) {
  return (
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center", bare ? "p-4" : "p-10")} role="presentation">
      <div className="absolute inset-0 bg-black/54" style={{ animation: "vibe-fade-in 150ms ease-out" }} onClick={onDismiss} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        className={cn("relative w-full", bare ? "max-w-[480px]" : "max-w-[min(560px,100%)] min-w-[280px] rounded-[28px] border border-line bg-surface shadow-2xl sm:w-auto")}
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
