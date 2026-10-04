"use client";

import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

/** Centered modal: title, optional description, body, footer. */
export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
  size = "md",
  ...props
}: Omit<React.ComponentProps<typeof D.Content>, "title"> & { title: React.ReactNode; description?: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg" }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <D.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-surface shadow-pop data-[state=open]:animate-in",
          size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="min-w-0">
            <D.Title className="text-base font-semibold text-text">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="-mt-1 -mr-2 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </D.Content>
    </D.Portal>
  );
}

/** Right-hand panel for details and long forms; keeps the list visible behind it. */
export function SheetContent({
  title,
  description,
  children,
  footer,
  className,
  ...props
}: Omit<React.ComponentProps<typeof D.Content>, "title"> & { title: React.ReactNode; description?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in" />
      <D.Content className={cn("fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-line bg-surface shadow-pop data-[state=open]:animate-slide-in", className)} {...props}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <D.Title className="truncate text-base font-semibold text-text">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="-mr-2 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </D.Content>
    </D.Portal>
  );
}
