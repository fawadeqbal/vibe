"use client";

import { useState } from "react";

import { GradientButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { RadioDot } from "@/components/ui/misc";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { TextArea } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { REPORT_REASONS, type ReportReason, reportReasonLabel } from "@/lib/models";
import { openSheet } from "@/stores/ui";

export interface ReportChoice {
  reason: ReportReason;
  block: boolean;
  note?: string;
}

const ICONS: Record<ReportReason, string> = {
  nudity: "no_adult_content",
  harassment: "record_voice_over",
  underage: "child_care",
  spam: "campaign",
  scam: "money_off",
  other: "more_horiz",
};

/**
 * Two taps to report: pick a reason, submit. Block is on by default — nobody
 * reports someone they want to meet again.
 */
export const pickReport = (name: string, context: boolean | "moment" = false) => openSheet<ReportChoice>((close) => <ReportSheet name={name} context={context === true ? "afterCall" : context || "call"} onDone={close} />);

const INTRO = { call: "The match ends now.", afterCall: "The call is over.", moment: "We'll look at this moment and their account." } as const;

function ReportSheet({ name, context, onDone }: { name: string; context: keyof typeof INTRO; onDone: (c?: ReportChoice) => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [block, setBlock] = useState(true);
  const [note, setNote] = useState("");

  return (
    <div className="px-5 pt-2.5 pb-5">
      <div className="flex items-center">
        <span className="flex size-11 items-center justify-center rounded-[14px] bg-bad/14">
          <Icon name="flag" className="text-bad" />
        </span>
        <h2 className="type-title-lg ml-3.5 flex-1 text-[22px]">Report {name}</h2>
      </div>
      <p className="type-body mt-2.5 text-[13px] leading-[1.45] text-text2">
        {INTRO[context]} Our team reviews every report; three in a day removes the account.
      </p>

      <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label="Reason">
        {REPORT_REASONS.map((r) => {
          const on = reason === r;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setReason(r)}
              className={cn("flex items-center rounded-[18px] border px-3.5 py-3 text-left transition-colors", on ? "border-bad/70 bg-bad/10" : "border-line-soft bg-surface2 hover:bg-surface3/70")}
            >
              <Icon name={ICONS[r]} size={20} className={on ? "text-bad" : "text-text2"} />
              <span className={cn("type-body ml-3 flex-1 text-[15px]", on && "font-semibold")}>{reportReasonLabel[r]}</span>
              <RadioDot on={on} tone="bad" />
            </button>
          );
        })}
      </div>

      {reason === "other" ? <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" className="mt-0.5 mb-2" /> : null}

      <div className="mt-1">
        <GroupCard>
          <GroupRow icon="block" title={`Also block ${name}`} subtitle="You will never be matched again." trailing={<Switch checked={block} onChange={setBlock} label={`Also block ${name}`} />} />
        </GroupCard>
      </div>

      <div className="mt-4">
        <GradientButton
          label={reason ? "Submit report" : "Pick a reason"}
          tone="bad"
          onClick={reason ? () => onDone({ reason, block, note: note.trim() || undefined }) : undefined}
        />
      </div>
    </div>
  );
}
