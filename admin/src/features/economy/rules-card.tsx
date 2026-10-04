"use client";

import * as React from "react";

import { Time } from "@/components/common/bits";
import { useConfirm } from "@/components/common/confirm";
import { Tooltip } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import type { Economy, RuleField, RuleGroup, RuleValue } from "@/lib/api/types";
import { cn } from "@/lib/utils";

import { useSaveSection } from "./api";
import { fromInput, showRule, toInput, UNIT } from "./format";
import { SectionCard } from "./section-card";

type Draft = Record<string, string | string[]>;

const same = (a: RuleValue | undefined, b: RuleValue | undefined) => JSON.stringify(a) === JSON.stringify(b);
const draftOf = (fields: RuleField[], values: Record<string, RuleValue>): Draft =>
  Object.fromEntries(fields.map((f) => [f.key, Array.isArray(values[f.key]) ? (values[f.key] as number[]).map((n) => toInput(f, n)) : toInput(f, values[f.key] as number)]));

/** One group of rules (e.g. "Matching"): read-only list, pencil → inline form. */
export function RulesCard({ group, economy, canEdit, onReload }: { group: RuleGroup; economy: Economy; canEdit: boolean; onReload: () => void }) {
  const current = economy.economy;
  const defaults = economy.defaults.economy;
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>({});
  const [error, setError] = React.useState<unknown>(null);
  const save = useSaveSection();
  const confirm = useConfirm();

  // Parse every field; collect errors and the values that actually changed.
  const parsed = React.useMemo(() => {
    const values: Record<string, RuleValue> = {};
    const errors: Record<string, string> = {};
    if (!editing) return { values, errors };
    for (const f of group.fields) {
      const d = draft[f.key];
      if (Array.isArray(d)) {
        const days = d.map((raw, i) => fromInput(f, raw, `Day ${i + 1}`));
        const bad = days.find((x) => x.error);
        if (bad) errors[f.key] = bad.error!;
        else values[f.key] = days.map((x) => x.value!);
      } else {
        const r = fromInput(f, d ?? "");
        if (r.error) errors[f.key] = r.error;
        else values[f.key] = r.value!;
      }
    }
    return { values, errors };
  }, [draft, editing, group.fields]);
  const changed = group.fields.filter((f) => f.key in parsed.values && !same(parsed.values[f.key], current[f.key]));
  const invalid = Object.keys(parsed.errors).length > 0;

  const start = () => {
    setDraft(draftOf(group.fields, current));
    setError(null);
    setEditing(true);
  };
  const stop = () => {
    setEditing(false);
    setError(null);
  };

  const submit = () => {
    if (invalid) return;
    if (!changed.length) return stop();
    void confirm({
      title: `Save ${changed.length} ${changed.length === 1 ? "change" : "changes"} to ${group.label.toLowerCase()}?`,
      description: (
        <span className="block space-y-2">
          <span className="block">Every app gets the new values right away, and the next charge or reward uses them.</span>
          <span className="block rounded-lg bg-surface-2 px-3 py-2 text-xs">
            {changed.map((f) => (
              <span key={f.key} className="flex justify-between gap-3 py-0.5">
                <span className="text-text-2">{f.label}</span>
                <span className="tabular text-text">
                  {showRule(f, current[f.key])} → <b>{showRule(f, parsed.values[f.key])}</b>
                </span>
              </span>
            ))}
          </span>
        </span>
      ),
      confirmLabel: "Save",
      action: async () => {
        try {
          await save.mutateAsync({
            section: "rules",
            value: Object.fromEntries(changed.map((f) => [f.key, parsed.values[f.key]])),
            base: Object.fromEntries(changed.map((f) => [f.key, current[f.key]])),
          });
          stop();
        } catch (e) {
          setError(e);
        }
      },
    });
  };

  const groupChanged = group.fields.some((f) => !same(current[f.key], defaults[f.key]));
  const set = (key: string, v: string | string[]) => setDraft((d) => ({ ...d, [key]: v }));

  return (
    <SectionCard
      title={group.label}
      description={group.description}
      footer={
        groupChanged ? (
          <>
            Differs from the defaults{economy.sections.rules.updatedAt && <> · rules last saved by {economy.sections.rules.updatedBy ?? "someone"} <Time iso={economy.sections.rules.updatedAt} /></>}
          </>
        ) : (
          "Vibe's default values"
        )
      }
      changedFromDefault={groupChanged}
      canEdit={canEdit}
      editing={editing}
      onEdit={start}
      onCancel={stop}
      onSave={submit}
      saving={save.isPending}
      saveDisabled={invalid}
      onReset={() => setDraft(draftOf(group.fields, defaults))}
      error={error}
      onReload={() => {
        onReload();
        stop();
      }}
    >
      <ul className="divide-y divide-line px-4">
        {group.fields.map((f) => {
          const value = current[f.key];
          const def = defaults[f.key];
          const isDefault = same(value, def);
          const err = parsed.errors[f.key];
          const inputId = `rule-${f.key}`;
          return (
            <li key={f.key} className={cn("py-2.5", editing ? "space-y-1.5" : "flex items-center justify-between gap-3")}>
              <div className={cn("min-w-0", editing && "flex items-baseline justify-between gap-3")}>
                <label htmlFor={editing ? inputId : undefined} className="text-sm text-text-2">
                  {f.label}
                </label>
                {editing && !isDefault && <span className="text-xs text-muted">Default {showRule(f, def)}</span>}
              </div>
              {!editing ? (
                <span className="flex items-center gap-2 text-sm font-medium text-text tabular">
                  {!isDefault && (
                    <Tooltip content={`Default: ${showRule(f, def)}`}>
                      <span className="size-1.5 rounded-full bg-warn" aria-label={`Changed from the default, ${showRule(f, def)}`} />
                    </Tooltip>
                  )}
                  {showRule(f, value)}
                </span>
              ) : f.kind === "days7" ? (
                <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={f.label}>
                  {((draft[f.key] as string[]) ?? []).map((v, i) => (
                    <label key={i} className="grid gap-1 text-center text-[11px] text-muted">
                      Day {i + 1}
                      <Input
                        inputMode="numeric"
                        value={v}
                        aria-invalid={!!err}
                        className="h-8 px-1 text-center tabular"
                        onChange={(e) => set(f.key, ((draft[f.key] as string[]) ?? []).map((x, j) => (j === i ? e.target.value : x)))}
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <UnitInput id={inputId} field={f} value={(draft[f.key] as string) ?? ""} invalid={!!err} onChange={(v) => set(f.key, v)} />
              )}
              {editing && (err || f.help) && <p className={cn("text-xs", err ? "text-bad" : "text-muted")}>{err ?? f.help}</p>}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

function UnitInput({ id, field, value, invalid, onChange }: { id: string; field: RuleField; value: string; invalid: boolean; onChange: (v: string) => void }) {
  const unit = UNIT[field.kind];
  return (
    <div className="relative">
      {unit.prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">{unit.prefix}</span>}
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
        className={cn("tabular", unit.prefix && "pl-7", unit.suffix && "pr-16")}
      />
      {unit.suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">{unit.suffix}</span>}
    </div>
  );
}
