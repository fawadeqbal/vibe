"use client";

import { Loader2, Monitor, Smartphone, Type } from "lucide-react";
import * as React from "react";

import { VibeLogo } from "@/components/common/vibe-logo";
import { Avatar, Segmented } from "@/components/ui/controls";
import type { InAppMessage, RenderedMail } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * The e-mail exactly as the server will send it: inbox row (sender, subject,
 * preview text) above the rendered HTML in a sandboxed frame, at desktop or
 * phone width, or the plain-text version.
 */
export function EmailPreview({ rendered, loading, preheader, className }: { rendered?: RenderedMail; loading?: boolean; preheader?: string; className?: string }) {
  const [mode, setMode] = React.useState<"desktop" | "mobile" | "text">("desktop");
  return (
    <div className={cn("overflow-hidden rounded-xl border border-line bg-surface shadow-card", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="flex items-center gap-2 text-xs font-medium text-muted">E-mail preview {loading && <Loader2 className="size-3.5 animate-spin" aria-label="Updating" />}</span>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            {
              value: "desktop",
              label: <Monitor className="size-3.5" aria-label="Desktop" />,
            },
            {
              value: "mobile",
              label: <Smartphone className="size-3.5" aria-label="Phone" />,
            },
            {
              value: "text",
              label: <Type className="size-3.5" aria-label="Plain text" />,
            },
          ]}
        />
      </div>
      <div className="flex items-center gap-3 border-b border-line bg-surface-2/50 px-4 py-3">
        <Avatar name="Vibe" size={32} className="[&>span]:bg-primary [&>span]:text-white" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">Vibe</p>
          <p className="truncate text-sm font-semibold text-text">{rendered?.subject || <span className="text-muted">No subject</span>}</p>
          {preheader !== undefined && <p className="truncate text-xs text-muted">{preheader || rendered?.text.split("\n").find((l) => l.trim()) || ""}</p>}
        </div>
      </div>
      <div className="flex justify-center bg-[#f4f3f7] p-3">
        {!rendered ? (
          <div className="h-[520px] w-full animate-pulse rounded-lg bg-white/60" />
        ) : mode === "text" ? (
          <pre className="h-[520px] w-full overflow-auto rounded-lg bg-white p-4 font-mono text-xs whitespace-pre-wrap text-[#16151c]">{rendered.text}</pre>
        ) : (
          <iframe title="E-mail preview" sandbox="" srcDoc={rendered.html} className={cn("h-[520px] rounded-lg border-0 bg-white transition-[width]", mode === "mobile" ? "w-[375px]" : "w-full")} />
        )}
      </div>
      {!!rendered?.missing.length && (
        <p className="border-t border-line bg-warn-soft px-4 py-2 text-xs text-warn">No value for {rendered.missing.map((m) => `{{${m}}}`).join(", ")} — it will be left empty.</p>
      )}
    </div>
  );
}

/** The in-app inbox message as it appears in the Vibe app (dark theme). */
export function InAppPreview({ message }: { message?: InAppMessage }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="border-b border-line px-3 py-2 text-xs font-medium text-muted">In-app preview</div>
      <div className="flex justify-center bg-surface-2/60 p-4">
        <div className="w-[300px] rounded-[28px] border border-white/10 bg-[#0b0a10] p-4 text-[#f1f0f5] shadow-pop">
          <p className="mb-3 text-[11px] font-medium tracking-wide text-[#8a889a] uppercase">Messages from Vibe</p>
          <div className="rounded-2xl bg-[#1a1922] p-4">
            <div className="mb-2 flex items-center gap-2">
              <VibeLogo className="size-7" />
              <span className="text-xs text-[#b9b7c6]">Vibe team · now</span>
              <span className="ml-auto size-2 rounded-full bg-pink" aria-label="Unread" />
            </div>
            <p className="text-[15px] font-semibold">{message?.title || "Subject"}</p>
            <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap text-[#b9b7c6]">
              {message?.body.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") || "Your message"}
            </p>
            {message?.buttonLabel && <div className="mt-3 rounded-full bg-gradient-to-r from-pink to-primary py-2 text-center text-[13px] font-semibold text-white">{message.buttonLabel}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
