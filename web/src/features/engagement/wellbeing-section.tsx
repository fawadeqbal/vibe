"use client";

import { useState } from "react";

import { ChoiceTile } from "@/components/ui/choice";
import { Icon } from "@/components/ui/icon";
import { GroupCard, GroupRow } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { SectionTitle } from "@/components/ui/typography";
import { alpha } from "@/lib/colors";
import { BREAK_CHOICES, DEFAULT_QUIET_HOURS, hhmmToMinutes, minutesToHHMM } from "@/lib/engagement";
import type { MePrefs } from "@/lib/models";
import { useSession } from "@/stores/session";
import { toast } from "@/stores/ui";

const TRUST = { iconColor: "trust" as const, iconBg: alpha("trust", 0.12) };

/**
 * Me → Notifications & wellbeing: quiet hours (no social or reminder pushes
 * in that window; messages and payments still come through) and the break
 * reminder. Teal: these look after you.
 */
/** `title`: false on its own page (the app bar already says it). */
export function WellbeingSection({ title = true }: { title?: boolean }) {
  const prefs = useSession((s) => s.prefs);
  const quietOn = prefs.quietHoursStart != null && prefs.quietHoursEnd != null && prefs.quietHoursStart !== prefs.quietHoursEnd;

  const save = async (patch: Partial<Omit<MePrefs, "xp">>) => {
    if (!(await useSession.getState().savePrefs(patch))) toast("Couldn't save that, try again", { error: true });
  };

  const setTime = (which: "quietHoursStart" | "quietHoursEnd", v: string) => {
    const m = hhmmToMinutes(v);
    if (m == null || m === prefs[which]) return;
    const other = which === "quietHoursStart" ? prefs.quietHoursEnd : prefs.quietHoursStart;
    if (m === other) return toast("Start and end can't be the same time", { error: true });
    void save({ [which]: m });
  };

  return (
    <>
      {title ? <SectionTitle text="Notifications & wellbeing" top={26} /> : null}
      <GroupCard className="border-trust/22">
        <GroupRow
          icon="bedtime"
          {...TRUST}
          title="Quiet hours"
          subtitle={quietOn ? "No social or reminder notifications. Messages still come through." : "Pause social and reminder notifications at night."}
          trailing={
            <Switch
              checked={quietOn}
              label="Quiet hours"
              onChange={(on) => void save(on ? { quietHoursStart: DEFAULT_QUIET_HOURS.start, quietHoursEnd: DEFAULT_QUIET_HOURS.end } : { quietHoursStart: null, quietHoursEnd: null })}
            />
          }
        />
        {quietOn ? (
          <div className="flex gap-2.5 px-4 py-3.5">
            <TimeField key={`s${prefs.quietHoursStart}`} label="From" value={minutesToHHMM(prefs.quietHoursStart!)} onCommit={(v) => setTime("quietHoursStart", v)} />
            <TimeField key={`e${prefs.quietHoursEnd}`} label="To" value={minutesToHHMM(prefs.quietHoursEnd!)} onCommit={(v) => setTime("quietHoursEnd", v)} />
          </div>
        ) : null}
        <div className="px-4 py-3.5">
          <div className="flex items-center">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px]" style={{ backgroundColor: TRUST.iconBg }}>
              <Icon name="self_improvement" size={22} className="text-trust" />
            </span>
            <span className="ml-3.5 min-w-0 flex-1">
              <span className="type-title block text-[15px] font-semibold">Break reminder</span>
              <span className="type-body mt-px block text-[12px] text-text2">A gentle nudge after this long in calls.</span>
            </span>
          </div>
          <div className="mt-3 flex gap-1.5" role="radiogroup" aria-label="Break reminder">
            {BREAK_CHOICES.map((c) => {
              const on = prefs.breakReminderMinutes === c;
              return (
                <ChoiceTile key={c ?? "off"} selected={on} tone="gem" onClick={() => void save({ breakReminderMinutes: c })} className="h-10 rounded-[14px]" ariaLabel={c ? `${c} minutes` : "Off"}>
                  <span className={`type-label text-[13px] ${on ? "text-trust" : "text-text2"}`}>{c ? `${c}m` : "Off"}</span>
                </ChoiceTile>
              );
            })}
          </div>
        </div>
      </GroupCard>
    </>
  );
}

/** A time picker that saves when you leave it (typing "07:30" passes through "07:3_"). */
function TimeField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <label className="flex flex-1 flex-col rounded-[16px] border border-line bg-surface2 px-3.5 py-2 focus-within:border-trust">
      <span className="type-label text-[11px] text-muted">{label}</span>
      <input
        type="time"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onCommit(v)}
        onKeyDown={(e) => e.key === "Enter" && onCommit(v)}
        aria-label={`Quiet hours ${label.toLowerCase()}`}
        className="type-number mt-0.5 bg-transparent text-[17px] text-text outline-none [color-scheme:dark]"
      />
    </label>
  );
}
