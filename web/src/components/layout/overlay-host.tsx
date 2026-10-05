"use client";

import { useEffect } from "react";

import { DialogFrame, SheetFrame } from "@/components/ui/overlay";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useUi } from "@/stores/ui";

/** Draws open sheets and dialogs (stores/ui.ts) and closes the top one on Escape. */
export function OverlayHost() {
  const overlays = useUi((s) => s.overlays);

  useEffect(() => {
    if (!overlays.length) return;
    const top = overlays[overlays.length - 1];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && top.dismissible) top.resolve(undefined);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [overlays]);

  return (
    <>
      {overlays.map((o) => {
        const dismiss = o.dismissible ? () => o.resolve(undefined) : undefined;
        const content = o.render(o.resolve);
        return o.kind === "sheet" ? (
          <SheetFrame key={o.id} onDismiss={dismiss}>
            {content}
          </SheetFrame>
        ) : (
          <DialogFrame key={o.id} onDismiss={dismiss}>
            {content}
          </DialogFrame>
        );
      })}
    </>
  );
}

/** Flutter's floating SnackBar: one line, an icon, gone in two seconds. */
export function ToastHost() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 lg:bottom-8">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.error ? "alert" : "status"}
          className="pointer-events-auto flex w-full max-w-[480px] items-center gap-2.5 rounded-[16px] bg-surface3 px-4 py-3.5 shadow-[0_6px_24px_rgb(0_0_0/.4)]"
          style={{ animation: "vibe-toast-in 200ms ease-out" }}
        >
          <Icon name={t.error ? "error_outline" : "check_circle"} size={18} className={cn(t.error ? "text-bad" : "text-ok")} />
          <span className="type-body flex-1 text-[14px] text-text">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
