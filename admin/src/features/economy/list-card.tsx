"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { useConfirm } from "@/components/common/confirm";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import type { EconomySectionKey, EconomySectionMeta } from "@/lib/api/types";
import { cn } from "@/lib/utils";

import { useResetSection, useSaveSection } from "./api";
import { slugify } from "./format";
import { SectionCard } from "./section-card";

type Row = Record<string, unknown>;

export interface ListColumn {
  key: string;
  label: string;
  /** id: editable only on new rows · usd: dollars in the form, cents on the wire · flag: one row at most. */
  kind: "id" | "text" | "emoji" | "int" | "usd" | "flag";
  min?: number;
  max?: number;
  maxLength?: number;
  optional?: boolean;
  align?: "right";
  className?: string;
  /** Only a column while editing (read mode shows it some other way, e.g. a badge). */
  editOnly?: boolean;
  /** Read mode. */
  show?: (row: Row) => React.ReactNode;
}

interface EditRow {
  _key: string;
  _new: boolean;
  _idTouched: boolean;
  _touched: boolean;
  [field: string]: unknown;
}

const toEdit = (r: Row, cols: ListColumn[], isNew = false): EditRow => {
  const out: EditRow = { _key: isNew ? `new-${Math.random().toString(36).slice(2)}` : String(r.id), _new: isNew, _idTouched: !isNew, _touched: !isNew };
  for (const c of cols) {
    const v = r[c.key];
    out[c.key] = c.kind === "flag" ? !!v : c.kind === "usd" ? (typeof v === "number" ? (v / 100).toFixed(2) : "") : v === undefined || v === null ? "" : String(v);
  }
  return out;
};

/**
 * Packs, plans or gifts. Read-only table; the pencil turns every cell into
 * an input, with add / remove / reorder. Existing ids are fixed (they are
 * the store product ids and appear in purchase history).
 */
export function ListCard({
  section,
  title,
  description,
  noun,
  rows: rowsIn,
  defaults: defaultsIn,
  meta,
  columns,
  blank,
  derived,
  canEdit,
  onReload,
}: {
  section: Exclude<EconomySectionKey, "rules">;
  title: string;
  description: React.ReactNode;
  noun: string;
  rows: readonly object[];
  defaults: readonly object[];
  meta: EconomySectionMeta;
  columns: ListColumn[];
  blank: object;
  /** Live computed column while editing (e.g. total coins). */
  derived?: { label: string; value: (row: Row) => React.ReactNode };
  canEdit: boolean;
  onReload: () => void;
}) {
  const rows = rowsIn as Row[];
  const defaults = defaultsIn as Row[];
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<EditRow[]>([]);
  const [error, setError] = React.useState<unknown>(null);
  // New, untouched rows aren't flagged until someone tries to save.
  const [showAll, setShowAll] = React.useState(false);
  const save = useSaveSection();
  const reset = useResetSection();
  const confirm = useConfirm();

  const strip = (r: Row) => Object.fromEntries(columns.map((c) => [c.key, r[c.key]]).filter(([, v]) => v !== undefined));
  const base = React.useMemo(() => rows.map(strip), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const defaultsStripped = React.useMemo(() => defaults.map(strip), [defaults]); // eslint-disable-line react-hooks/exhaustive-deps
  const changedFromDefault = JSON.stringify(base) !== JSON.stringify(defaultsStripped);

  // Draft → values + per-cell errors.
  const { values, errors } = React.useMemo(() => {
    const errs: Record<string, string> = {};
    const vals: Row[] = [];
    const seen = new Map<string, number>();
    draft.forEach((r, i) => {
      const out: Row = {};
      for (const c of columns) {
        const raw = r[c.key];
        const cell = `${r._key}:${c.key}`;
        if (c.kind === "flag") {
          out[c.key] = !!raw;
          continue;
        }
        const t = String(raw ?? "").trim();
        if (!t) {
          if (!c.optional) errs[cell] = `${c.label} is required`;
          continue;
        }
        if (c.kind === "int" || c.kind === "usd") {
          const n = Number(t);
          const v = c.kind === "usd" ? Math.round(n * 100) : n;
          if (!Number.isFinite(n)) errs[cell] = `${c.label}: enter a number`;
          else if (c.kind === "int" && !Number.isInteger(n)) errs[cell] = `${c.label}: whole numbers only`;
          else if ((c.min !== undefined && v < c.min) || (c.max !== undefined && v > c.max)) errs[cell] = `${c.label}: ${c.kind === "usd" ? `$${(c.min ?? 0) / 100}–$${(c.max ?? 0) / 100}` : `${c.min}–${c.max}`}`;
          out[c.key] = v;
        } else {
          if (c.kind === "id" && !/^[a-z0-9_]{2,40}$/.test(t)) errs[cell] = "Id: 2–40 of a–z, 0–9, _";
          if (c.maxLength && t.length > c.maxLength) errs[cell] = `${c.label}: at most ${c.maxLength} characters`;
          out[c.key] = t;
        }
      }
      const id = String(out.id ?? "");
      if (id && seen.has(id)) errs[`${r._key}:id`] = `Id "${id}" is used twice`;
      seen.set(id, i);
      vals.push(out);
    });
    if (!draft.length) errs._list = `Keep at least one ${noun}`;
    return { values: vals, errors: errs };
  }, [draft, columns, noun]);
  const invalid = Object.keys(errors).length > 0;

  const start = () => {
    setDraft(rows.map((r) => toEdit(r, columns)));
    setError(null);
    setShowAll(false);
    setEditing(true);
  };
  const stop = () => {
    setEditing(false);
    setError(null);
  };

  const summary = () => {
    const before = new Map(base.map((r) => [String(r.id), r]));
    const after = new Map(values.map((r) => [String(r.id), r]));
    const lines: string[] = [];
    for (const [id, r] of after) {
      const old = before.get(id);
      if (!old) lines.push(`Add ${r.name ?? r.label ?? id}`);
      else if (JSON.stringify(old) !== JSON.stringify(r)) {
        const fields = columns.filter((c) => JSON.stringify(old[c.key] ?? "") !== JSON.stringify(r[c.key] ?? "")).map((c) => c.label.toLowerCase());
        lines.push(`Change ${r.name ?? r.label ?? id}: ${fields.join(", ")}`);
      }
    }
    for (const [id, r] of before) if (!after.has(id)) lines.push(`Remove ${r.name ?? r.label ?? id}`);
    if (!lines.length && [...before.keys()].join() !== [...after.keys()].join()) lines.push("New order");
    return lines;
  };

  const submit = () => {
    if (invalid) return setShowAll(true);
    const lines = summary();
    if (!lines.length) return stop();
    const removing = lines.some((l) => l.startsWith("Remove"));
    const backToDefaults = JSON.stringify(values) === JSON.stringify(defaultsStripped);
    void confirm({
      title: `Save ${title.toLowerCase()}?`,
      description: (
        <span className="block space-y-2">
          <span className="block rounded-lg bg-surface-2 px-3 py-2 text-xs">
            {lines.map((l) => (
              <span key={l} className="block py-0.5 text-text">
                {l}
              </span>
            ))}
          </span>
          <span className="block">The app store and new purchases use this at once. Purchases already started keep what they were sold{removing ? ", including removed items" : ""}.</span>
        </span>
      ),
      confirmLabel: "Save",
      action: async () => {
        try {
          if (backToDefaults) await reset.mutateAsync(section);
          else await save.mutateAsync({ section, value: values, base });
          stop();
        } catch (e) {
          setError(e);
        }
      },
    });
  };

  const update = (key: string, field: string, v: unknown) =>
    setDraft((d) =>
      d.map((r) => {
        if (r._key !== key) {
          // A flag (e.g. "Featured") belongs to one row at most.
          const col = columns.find((c) => c.key === field);
          return col?.kind === "flag" && v === true ? { ...r, [field]: false } : r;
        }
        const next: EditRow = { ...r, [field]: v, _touched: true };
        if (field === "id") next._idTouched = true;
        // New rows get an id from their name until someone types one.
        const nameCol = columns.find((c) => c.kind === "text");
        if (r._new && !r._idTouched && nameCol && field === nameCol.key) next.id = slugify(String(v));
        return next;
      }),
    );
  const move = (i: number, by: number) =>
    setDraft((d) => {
      const n = [...d];
      const [r] = n.splice(i, 1);
      n.splice(i + by, 0, r);
      return n;
    });

  return (
    <SectionCard
      title={title}
      description={description}
      meta={meta}
      changedFromDefault={changedFromDefault}
      canEdit={canEdit}
      editing={editing}
      onEdit={start}
      onCancel={stop}
      onSave={submit}
      saving={save.isPending || reset.isPending}
      className={editing ? "xl:col-span-2" : undefined}
      onReset={() => setDraft(defaults.map((r) => toEdit(r, columns)))}
      error={error}
      onReload={() => {
        onReload();
        stop();
      }}
    >
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              {columns.filter((c) => editing || !c.editOnly).map((c) => (
                <Th key={c.key} className={cn(c.align === "right" && "text-right", c.className)}>
                  {c.label}
                </Th>
              ))}
              {derived && <Th className="text-right">{derived.label}</Th>}
              {editing && <Th className="w-24"><span className="sr-only">Actions</span></Th>}
            </tr>
          </thead>
          <tbody>
            {!editing
              ? rows.map((r) => (
                  <Tr key={String(r.id)}>
                    {columns.filter((c) => !c.editOnly).map((c) => (
                      <Td key={c.key} className={cn(c.align === "right" && "text-right tabular", c.className)}>
                        {c.show ? c.show(r) : c.kind === "id" ? <code className="font-mono text-xs text-muted">{String(r.id)}</code> : String(r[c.key] ?? "—")}
                      </Td>
                    ))}
                    {derived && <Td className="text-right tabular">{derived.value(r)}</Td>}
                  </Tr>
                ))
              : draft.map((r, i) => (
                  <Tr key={r._key}>
                    {columns.map((c) => {
                      const err = r._touched || showAll ? errors[`${r._key}:${c.key}`] : undefined;
                      const label = `${c.label}, ${noun} ${i + 1}`;
                      return (
                        <Td key={c.key} className={cn("align-top", c.className)}>
                          {c.kind === "flag" ? (
                            <div className="flex h-8 items-center justify-center">
                              <Checkbox checked={!!r[c.key]} onCheckedChange={(v) => update(r._key, c.key, v === true)} aria-label={label} />
                            </div>
                          ) : c.kind === "id" && !r._new ? (
                            <code className="flex h-8 items-center font-mono text-xs text-muted">{String(r.id)}</code>
                          ) : (
                            <Input
                              aria-label={label}
                              title={err}
                              aria-invalid={!!err}
                              inputMode={c.kind === "int" ? "numeric" : c.kind === "usd" ? "decimal" : undefined}
                              value={String(r[c.key] ?? "")}
                              onChange={(e) => update(r._key, c.key, e.target.value)}
                              className={cn("h-8 min-w-20 px-2", c.kind === "text" && "min-w-32", (c.kind === "int" || c.kind === "usd") && "text-right tabular", c.kind === "id" && "font-mono text-xs", c.kind === "emoji" && "w-14 text-center")}
                              placeholder={c.kind === "usd" ? "0.00" : undefined}
                              maxLength={c.kind === "id" ? 40 : c.maxLength}
                            />
                          )}
                        </Td>
                      );
                    })}
                    {derived && (
                      <Td className="align-top">
                        <span className="flex h-8 items-center justify-end tabular text-muted">{derived.value(values[i] ?? {})}</span>
                      </Td>
                    )}
                    <Td className="align-top">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button size="icon-xs" variant="ghost" aria-label={`Move ${noun} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp />
                        </Button>
                        <Button size="icon-xs" variant="ghost" aria-label={`Move ${noun} ${i + 1} down`} disabled={i === draft.length - 1} onClick={() => move(i, 1)}>
                          <ArrowDown />
                        </Button>
                        <Button size="icon-xs" variant="danger-ghost" aria-label={`Remove ${noun} ${i + 1}`} onClick={() => setDraft((d) => d.filter((x) => x._key !== r._key))}>
                          <Trash2 />
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
          </tbody>
        </Table>
      </div>
      {editing && (
        <div className="space-y-2 px-4 py-3">
          {invalid && (showAll || draft.some((r) => r._touched && Object.keys(errors).some((k) => k.startsWith(`${r._key}:`)))) && (
            <ul className="space-y-0.5 text-xs text-bad">
              {[...new Set(Object.entries(errors).filter(([k]) => showAll || draft.some((r) => r._touched && k.startsWith(`${r._key}:`))).map(([, e]) => e))].slice(0, 4).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDraft((d) => [...d, toEdit(blank as Row, columns, true)])}>
            <Plus /> Add {noun}
          </Button>
        </div>
      )}
    </SectionCard>
  );
}
