"use client";

import { useState } from "react";

import { GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TextArea } from "@/components/ui/text-field";
import type { ReportReason } from "@/lib/models";
import { openSheet } from "@/stores/ui";

export interface ReportChoice {
  reason: ReportReason;
  block: boolean;
  note?: string;
}

/** The reasons, in the order the design lists them. "Something else" asks what happened. */
export const REPORT_ROWS: { reason: ReportReason; label: string }[] = [
  { reason: "nudity", label: "Nudity or sexual content" },
  { reason: "underage", label: "Looks under 18" },
  { reason: "harassment", label: "Harassment or hate" },
  { reason: "scam", label: "Scam or spam" },
  { reason: "other", label: "Something else" },
];

type Context = "call" | "afterCall" | "moment" | "person";

/**
 * One tap to report: pick a reason and it is sent. Reporting always blocks —
 * nobody reports someone they want to meet again.
 */
export const pickReport = (name: string, context: boolean | "moment" | "person" = false) =>
  openSheet<ReportChoice>((close) => <ReportSheet name={name} context={context === true ? "afterCall" : context || "call"} onDone={close} />);

function intro(name: string, context: Context) {
  const review = "Our team reviews every report.";
  if (context === "call") return `The call ends and you won't meet ${name} again. ${review}`;
  if (context === "moment") return `We'll look at this moment and ${name}'s account. ${review}`;
  return `You won't see or meet ${name} again. ${review}`;
}

function ReportSheet({ name, context, onDone }: { name: string; context: Context; onDone: (c?: ReportChoice) => void }) {
  const [other, setOther] = useState(false);
  const [note, setNote] = useState("");

  return (
    <div className="px-5 pt-2.5 pb-5">
      <h2 className="type-title text-[18px] font-bold tracking-[-0.012em]">Report {name}</h2>
      <p className="type-body mt-2 mb-1.5 text-[13px] leading-[1.45] text-text2">{intro(name, context)}</p>

      {other ? (
        <div className="mt-3 flex flex-col gap-3">
          <TextArea rows={3} value={note} autoFocus onChange={(e) => setNote(e.target.value)} placeholder="What happened?" aria-label="What happened?" />
          <GradientButton label="Send report" tone="bad" onClick={() => onDone({ reason: "other", block: true, note: note.trim() || undefined })} />
          <button type="button" onClick={() => setOther(false)} className="type-label self-center p-2 text-[13.5px] font-semibold text-text2">
            Back to reasons
          </button>
        </div>
      ) : (
        <ul aria-label="Reason">
          {REPORT_ROWS.map((r) => (
            <li key={r.reason} className="border-b border-line-soft last:border-b-0">
              <button
                type="button"
                onClick={() => (r.reason === "other" ? setOther(true) : onDone({ reason: r.reason, block: true }))}
                className="flex w-full items-center justify-between px-1 py-3.5 text-left text-[15px] font-semibold transition-colors hover:text-white"
              >
                {r.label}
                <Icon name="chevron_right" size={18} className="text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
